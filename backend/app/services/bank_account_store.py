from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"
REGISTRY_PATH = STORAGE_DIR / "bank_accounts.json"


def get_saved_account_number(factory: str, employee_code: object) -> str:
    code = _employee_code(employee_code)
    if not code:
        return ""
    saved = _load_registry().get(_key(factory, code), {})
    return normalize_account_number(saved.get("account_number"))


def sync_accounts_from_final_copy(factory: str, profiles: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Persist non-empty accounts from an explicitly uploaded final copy.

    The final copy is authoritative for values it contains. Empty cells never
    erase an account that was already saved for the same factory and employee.
    """
    normalized_factory = _factory(factory)
    registry = _load_registry()
    updated_codes: list[str] = []
    for raw_code, profile in profiles.items():
        code = _employee_code(raw_code)
        if not code or not isinstance(profile, dict):
            continue
        account = normalize_account_number(profile.get("bank_account"))
        if not account:
            continue
        key = _key(normalized_factory, code)
        current = registry.get(key, {}) if isinstance(registry.get(key), dict) else {}
        next_value = {
            **current,
            "factory": normalized_factory,
            "employee_code": code,
            "name": str(profile.get("name") or current.get("name") or "").strip(),
            "account_number": account,
            "conflict_accounts": [],
        }
        if current.get("account_number") == account and current.get("name") == next_value["name"] and not current.get("conflict_accounts"):
            continue
        next_value["updated_at"] = datetime.now().isoformat(timespec="seconds")
        registry[key] = next_value
        updated_codes.append(code)
    if updated_codes:
        _atomic_json(REGISTRY_PATH, registry)
    return {"status": "ok", "updated": len(updated_codes), "updated_codes": updated_codes}


def list_account_overview(factory: str) -> dict[str, Any]:
    """Return every known employee for one factory with bank status attached.

    Payroll profiles provide the employee roster; the bank registry remains the
    only source of account numbers. Bank-only records are retained so an
    imported Word list is never hidden just because a profile is incomplete.
    """
    normalized_factory = _factory(factory)
    registry = _load_registry()
    rows: dict[str, dict[str, Any]] = {}
    try:
        from app.services.payroll_store import list_payroll_employees

        for employee in list_payroll_employees(normalized_factory):
            code = _employee_code(employee.get("employee_code"))
            if code:
                rows[code] = {
                    "factory": normalized_factory,
                    "employee_code": code,
                    "name": str(employee.get("name") or "").strip(),
                }
    except Exception:
        # The bank screen must still be usable if a legacy profile file is
        # temporarily malformed; registry records can populate the table.
        pass

    for key, value in registry.items():
        if not isinstance(value, dict) or value.get("factory") != normalized_factory:
            continue
        code = _employee_code(value.get("employee_code") or key.rsplit(":", 1)[-1])
        if not code:
            continue
        rows.setdefault(code, {"factory": normalized_factory, "employee_code": code})
        rows[code]["name"] = rows[code].get("name") or str(value.get("name") or "").strip()

    accounts: list[dict[str, Any]] = []
    for code, base in rows.items():
        saved = registry.get(_key(normalized_factory, code), {})
        account = normalize_account_number(saved.get("account_number"))
        accounts.append({
            **base,
            "account_number": account,
            "conflict_accounts": list(saved.get("conflict_accounts") or []),
            "updated_at": saved.get("updated_at"),
        })

    # The directory is a warehouse before a payroll scan. Sorting by code
    # keeps it neutral; the UI applies the yellow/missing-first order only
    # after it knows which employees actually worked this month.
    accounts.sort(key=lambda row: _employee_sort_key(row["employee_code"]))
    return {
        "factory": normalized_factory,
        "accounts": accounts,
        "total": len(accounts),
        "with_account": sum(bool(row["account_number"]) for row in accounts),
        "without_account": sum(not row["account_number"] for row in accounts),
    }


def _load_registry() -> dict[str, dict[str, Any]]:
    if not REGISTRY_PATH.exists():
        return {}
    try:
        value = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def _factory(value: object) -> str:
    return "factory2" if str(value or "").strip() == "factory2" else "factory1"


def _key(factory: object, code: str) -> str:
    return f"{_factory(factory)}:{code}"


def _employee_code(value: object) -> str:
    if isinstance(value, bool):
        return ""
    if isinstance(value, (int, float)) and float(value).is_integer():
        return str(int(value))
    return str(value or "").strip().replace(",", "")


def _employee_sort_key(value: object) -> tuple[int, str]:
    text = _employee_code(value)
    try:
        return int(text), text
    except ValueError:
        return 10**12, text


def normalize_account_number(value: object) -> str:
    """Return only plausible bank account numbers.

    Short values such as ``534534`` are test/mock remnants, not valid bank
    accounts. They remain in the raw registry for auditability but are not
    allowed to auto-fill payroll or count as a completed account.
    """
    account = re.sub(r"\s+", "", str(value or ""))
    return account if account.isdigit() and 8 <= len(account) <= 20 else ""
