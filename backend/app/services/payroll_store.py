import json
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"
PAYROLL_DATA_PATH = CONFIG_DIR / "payroll_data.json"
PAYROLL_PROFILE_SOURCES_PATH = CONFIG_DIR / "payroll_profile_sources.json"
STANDARD_WORK_DAYS = 26
FACTORIES = {"factory1", "factory2"}
PROFILE_FIELDS = {"name", "start_work_note", "note", "monthly_salary", "daily_salary", "hourly_salary", "bonus"}


class PayrollEntry(BaseModel):
    name: str = ""
    start_work_note: str = ""
    monthly_salary: float | None = None
    daily_salary: float | None = None
    hourly_salary: float | None = None
    standard_work_days: float = Field(default=26, gt=0)
    bonus: float = 0
    advance_or_penalty: float = 0
    note: str = ""


def normalize_employee_code(employee_code: object) -> str:
    return str(employee_code or "").strip()


def normalize_factory(factory: object) -> str:
    return "factory2" if str(factory or "").strip() == "factory2" else "factory1"


def load_payroll_data(factory: str = "factory1") -> dict[str, dict]:
    """Load profiles for one factory, treating legacy data as Factory 1."""
    if not PAYROLL_DATA_PATH.exists():
        return {}

    with PAYROLL_DATA_PATH.open("r", encoding="utf-8") as file:
        raw_data = json.load(file)

    if not isinstance(raw_data, dict):
        return {}

    selected_factory = normalize_factory(factory)
    if _is_factory_partitioned(raw_data):
        bucket = raw_data.get(selected_factory, {})
        return bucket if isinstance(bucket, dict) else {}
    return raw_data if selected_factory == "factory1" else {}


def save_payroll_data(data: dict[str, dict], factory: str = "factory1") -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    existing = _read_json_dict(PAYROLL_DATA_PATH)
    partitioned = _partitioned_data(existing)
    partitioned[normalize_factory(factory)] = data
    with PAYROLL_DATA_PATH.open("w", encoding="utf-8") as file:
        json.dump(partitioned, file, ensure_ascii=False, indent=2)


def get_payroll_entry(employee_code: str, factory: str = "factory1") -> PayrollEntry:
    raw_entry = load_payroll_data(factory).get(normalize_employee_code(employee_code), {})
    if not isinstance(raw_entry, dict):
        raw_entry = {}
    return PayrollEntry(**raw_entry)


def save_payroll_entry(employee_code: str, entry: PayrollEntry, factory: str = "factory1") -> None:
    normalized_code = normalize_employee_code(employee_code)
    if not normalized_code:
        raise ValueError("Mã nhân viên không được để trống")

    normalized_entry = normalize_payroll_entry(entry)
    data = load_payroll_data(factory)
    data[normalized_code] = normalized_entry.model_dump()
    save_payroll_data(data, factory)

    # A save from the Nhân viên / Bảng lương screens is a deliberate local
    # change. Remember its provenance so merely viewing or exporting Output 2
    # cannot silently overwrite it from the newest final copy.
    sources = _load_profile_sources(factory)
    entry_sources = sources.get(normalized_code, {}) if isinstance(sources.get(normalized_code), dict) else {}
    manual_source = _profile_source(None, None, "manual", "manual_entry")
    for field in PROFILE_FIELDS:
        entry_sources[field] = manual_source
    sources[normalized_code] = entry_sources
    _save_profile_sources(sources, factory)


def list_payroll_employees(factory: str = "factory1") -> list[dict]:
    return [
        _entry_to_employee(code, PayrollEntry(**(entry if isinstance(entry, dict) else {})))
        for code, entry in sorted(load_payroll_data(factory).items(), key=lambda item: _employee_sort_key(item[0]))
    ]


def merge_missing_payroll_entries(defaults_by_code: dict[str, dict], factory: str = "factory1") -> None:
    if not defaults_by_code:
        return

    data = load_payroll_data(factory)
    changed = False
    for raw_code, defaults in defaults_by_code.items():
        code = normalize_employee_code(raw_code)
        if not code or code in data:
            continue

        entry = PayrollEntry(
            name=str(defaults.get("name") or "").strip(),
            note=str(defaults.get("note") or "").strip(),
        )
        data[code] = entry.model_dump()
        changed = True

    if changed:
        save_payroll_data(data, factory)


def merge_payroll_profile_updates(
    updates_by_code: dict[str, dict],
    *,
    factory: str = "factory1",
    source_month: int | None = None,
    source_year: int | None = None,
    source_kind: str = "workbook",
    source_name: str = "",
    overwrite_manual: bool = False,
) -> dict:
    if not updates_by_code:
        return {
            "updated_count": 0,
            "skipped_count": 0,
            "updated_codes": [],
            "skipped_codes": [],
            "conflict_count": 0,
            "conflict_codes": [],
        }

    data = load_payroll_data(factory)
    sources = _load_profile_sources(factory)
    updated_codes: list[str] = []
    skipped_codes: list[str] = []
    conflict_codes: list[str] = []
    sources_changed = False
    # These are persistent employee-profile fields. Monthly penalties and
    # advances deliberately do not appear here: they must never carry over.
    incoming_source = _profile_source(source_month, source_year, source_kind, source_name)

    for raw_code, raw_updates in updates_by_code.items():
        code = normalize_employee_code(raw_code)
        if not code or not isinstance(raw_updates, dict):
            skipped_codes.append(code or str(raw_code or ""))
            continue

        existing = data.get(code)
        if not isinstance(existing, dict):
            existing = {}

        next_entry = PayrollEntry(**existing).model_dump()
        existing_sources = sources.get(code, {}) if isinstance(sources.get(code), dict) else {}
        changed = False
        blocked = False
        for field in PROFILE_FIELDS:
            value = raw_updates.get(field)
            if value in (None, ""):
                continue
            if field in {"monthly_salary", "daily_salary", "hourly_salary", "bonus"}:
                value = _number_or_none(value)
                if value is None:
                    continue
            previous_source = existing_sources.get(field)
            if (
                source_kind == "final_copy"
                and _source_kind(previous_source) == "manual"
                and not overwrite_manual
            ):
                # Final copies remain available as the current source, but a
                # manual profile change stays in effect until the user
                # explicitly chooses to replace it during final-copy upload.
                blocked = True
                continue
            # A deliberately uploaded final copy is authoritative even if old
            # local/history data claims a newer period. This prevents stale
            # machine data from resurrecting itself after the owner corrects
            # the Excel final copy.
            if source_kind != "final_copy" and _source_is_older(incoming_source, previous_source):
                blocked = True
                continue
            if next_entry.get(field) != value:
                next_entry[field] = value
                changed = True
            if existing_sources.get(field) != incoming_source:
                sources_changed = True
            existing_sources[field] = incoming_source

        if changed:
            data[code] = normalize_payroll_entry(PayrollEntry(**next_entry)).model_dump()
            sources[code] = existing_sources
            updated_codes.append(code)
        else:
            skipped_codes.append(code)
            if blocked:
                conflict_codes.append(code)

    if updated_codes:
        save_payroll_data(data, factory)
    if sources_changed:
        _save_profile_sources(sources, factory)

    return {
        "updated_count": len(updated_codes),
        "skipped_count": len(skipped_codes),
        "updated_codes": updated_codes,
        "skipped_codes": skipped_codes,
        "conflict_count": len(conflict_codes),
        "conflict_codes": conflict_codes,
    }


def _load_profile_sources(factory: str = "factory1") -> dict[str, dict[str, dict[str, Any]]]:
    if not PAYROLL_PROFILE_SOURCES_PATH.exists():
        return {}
    try:
        with PAYROLL_PROFILE_SOURCES_PATH.open("r", encoding="utf-8") as file:
            raw = json.load(file)
        if not isinstance(raw, dict):
            return {}
        if _is_factory_partitioned(raw):
            bucket = raw.get(normalize_factory(factory), {})
            return bucket if isinstance(bucket, dict) else {}
        return raw if normalize_factory(factory) == "factory1" else {}
    except (OSError, ValueError):
        return {}


def _save_profile_sources(sources: dict[str, dict[str, dict[str, Any]]], factory: str = "factory1") -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    partitioned = _partitioned_data(_read_json_dict(PAYROLL_PROFILE_SOURCES_PATH))
    partitioned[normalize_factory(factory)] = sources
    with PAYROLL_PROFILE_SOURCES_PATH.open("w", encoding="utf-8") as file:
        json.dump(partitioned, file, ensure_ascii=False, indent=2)


def _read_json_dict(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as file:
            raw = json.load(file)
        return raw if isinstance(raw, dict) else {}
    except (OSError, ValueError):
        return {}


def _is_factory_partitioned(data: dict[str, Any]) -> bool:
    return any(key in FACTORIES for key in data)


def _partitioned_data(data: dict[str, Any]) -> dict[str, dict]:
    if _is_factory_partitioned(data):
        return {
            factory: value if isinstance(value, dict) else {}
            for factory, value in (("factory1", data.get("factory1", {})), ("factory2", data.get("factory2", {})))
        }
    return {"factory1": data, "factory2": {}}


def _profile_source(
    month: int | None,
    year: int | None,
    source_kind: str,
    source_name: str,
) -> dict[str, Any]:
    return {
        "month": int(month) if month else None,
        "year": int(year) if year else None,
        "kind": source_kind or "workbook",
        "name": source_name or "",
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }


def _source_is_older(incoming: dict[str, Any], previous: object) -> bool:
    if not isinstance(previous, dict):
        return False
    incoming_period = _period_key(incoming)
    previous_period = _period_key(previous)
    if incoming_period is None or previous_period is None:
        return False
    if incoming_period < previous_period:
        return True
    if incoming_period > previous_period:
        return False
    return _source_kind_rank(incoming.get("kind")) < _source_kind_rank(previous.get("kind"))


def _source_kind_rank(kind: object) -> int:
    return {
        "manual": 4,
        "final_copy": 3,
        "history_output2": 2,
        "analysis_copy": 1,
        "workbook": 0,
    }.get(str(kind or ""), 0)


def count_manual_profile_changes(factory: str = "factory1") -> int:
    """Return employee profiles currently protected by a manual save."""
    sources = _load_profile_sources(factory)
    return sum(
        1
        for field_sources in sources.values()
        if isinstance(field_sources, dict) and any(_source_kind(source) == "manual" for source in field_sources.values())
    )


def _source_kind(source: object) -> str:
    return str(source.get("kind") or "") if isinstance(source, dict) else ""


def _period_key(source: dict[str, Any]) -> tuple[int, int] | None:
    try:
        year = int(source.get("year") or 0)
        month = int(source.get("month") or 0)
    except (TypeError, ValueError):
        return None
    if year < 2000 or month < 1 or month > 12:
        return None
    return year, month


def _entry_to_employee(employee_code: str, entry: PayrollEntry) -> dict:
    monthly_salary = calculate_monthly_salary(entry)
    daily_salary = calculate_daily_salary(entry)
    hourly_salary = calculate_hourly_salary(entry)
    return {
        "employee_code": employee_code,
        "name": entry.name,
        "start_work_note": entry.start_work_note,
        "note": entry.note,
        "header_row": None,
        "result_row": None,
        "note_row": None,
        "total_hours": 0,
        "monthly_salary": _round_optional_number(monthly_salary),
        "daily_salary_input": entry.daily_salary,
        "daily_salary": _round_number(daily_salary),
        "hourly_salary": _round_number(hourly_salary),
        "standard_work_days": STANDARD_WORK_DAYS,
        "work_days": 0,
        "bonus": entry.bonus,
        "advance_or_penalty": entry.advance_or_penalty,
        "final_salary": _round_number(entry.bonus - entry.advance_or_penalty),
    }


def normalize_payroll_entry(entry: PayrollEntry) -> PayrollEntry:
    data = entry.model_dump()
    data["hourly_salary"] = calculate_hourly_salary(entry) or None
    data["daily_salary"] = calculate_daily_salary(entry) or None
    data["monthly_salary"] = calculate_monthly_salary(entry)
    data["standard_work_days"] = STANDARD_WORK_DAYS
    return PayrollEntry(**data)


def calculate_monthly_salary(entry: PayrollEntry) -> float | None:
    daily_salary = calculate_daily_salary(entry)
    if daily_salary:
        return float(daily_salary) * STANDARD_WORK_DAYS
    return entry.monthly_salary


def calculate_daily_salary(entry: PayrollEntry) -> float:
    hourly_salary = calculate_hourly_salary(entry)
    if hourly_salary:
        return float(hourly_salary) * 8
    return 0


def calculate_hourly_salary(entry: PayrollEntry) -> float:
    if entry.hourly_salary is not None:
        return float(entry.hourly_salary)
    if entry.daily_salary is not None:
        return float(entry.daily_salary) / 8
    if entry.monthly_salary is not None:
        return float(entry.monthly_salary) / STANDARD_WORK_DAYS / 8
    return 0


def _round_optional_number(value: float | None) -> int | float | None:
    if value is None:
        return None
    return _round_number(value)


def _round_number(value: float) -> int | float:
    rounded = round(value, 2)
    return int(rounded) if rounded.is_integer() else rounded


def _number_or_none(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if not text:
        return None
    cleaned = text.replace(",", "").replace(" ", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _employee_sort_key(value: str) -> tuple[int, object]:
    try:
        return (0, int(value))
    except ValueError:
        return (1, value)
