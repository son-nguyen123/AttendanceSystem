import json
from pathlib import Path

from pydantic import BaseModel, Field


CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"
PAYROLL_DATA_PATH = CONFIG_DIR / "payroll_data.json"
STANDARD_WORK_DAYS = 26


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


def load_payroll_data() -> dict[str, dict]:
    if not PAYROLL_DATA_PATH.exists():
        return {}

    with PAYROLL_DATA_PATH.open("r", encoding="utf-8") as file:
        raw_data = json.load(file)

    if not isinstance(raw_data, dict):
        return {}

    return raw_data


def save_payroll_data(data: dict[str, dict]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with PAYROLL_DATA_PATH.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def get_payroll_entry(employee_code: str) -> PayrollEntry:
    raw_entry = load_payroll_data().get(normalize_employee_code(employee_code), {})
    if not isinstance(raw_entry, dict):
        raw_entry = {}
    return PayrollEntry(**raw_entry)


def save_payroll_entry(employee_code: str, entry: PayrollEntry) -> None:
    normalized_code = normalize_employee_code(employee_code)
    if not normalized_code:
        raise ValueError("Mã nhân viên không được để trống")

    data = load_payroll_data()
    data[normalized_code] = normalize_payroll_entry(entry).model_dump()
    save_payroll_data(data)


def list_payroll_employees() -> list[dict]:
    return [
        _entry_to_employee(code, PayrollEntry(**(entry if isinstance(entry, dict) else {})))
        for code, entry in sorted(load_payroll_data().items(), key=lambda item: _employee_sort_key(item[0]))
    ]


def merge_missing_payroll_entries(defaults_by_code: dict[str, dict]) -> None:
    if not defaults_by_code:
        return

    data = load_payroll_data()
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
        save_payroll_data(data)


def merge_payroll_profile_updates(updates_by_code: dict[str, dict]) -> dict:
    if not updates_by_code:
        return {"updated_count": 0, "skipped_count": 0, "updated_codes": [], "skipped_codes": []}

    data = load_payroll_data()
    updated_codes: list[str] = []
    skipped_codes: list[str] = []
    stable_fields = {"name", "start_work_note", "monthly_salary", "daily_salary", "hourly_salary"}

    for raw_code, raw_updates in updates_by_code.items():
        code = normalize_employee_code(raw_code)
        if not code or not isinstance(raw_updates, dict):
            skipped_codes.append(code or str(raw_code or ""))
            continue

        existing = data.get(code)
        if not isinstance(existing, dict):
            existing = {}

        next_entry = PayrollEntry(**existing).model_dump()
        changed = False
        for field in stable_fields:
            value = raw_updates.get(field)
            if value in (None, ""):
                continue
            if field in {"monthly_salary", "daily_salary", "hourly_salary"}:
                value = _number_or_none(value)
                if value is None:
                    continue
            if next_entry.get(field) != value:
                next_entry[field] = value
                changed = True

        if changed:
            data[code] = normalize_payroll_entry(PayrollEntry(**next_entry)).model_dump()
            updated_codes.append(code)
        else:
            skipped_codes.append(code)

    if updated_codes:
        save_payroll_data(data)

    return {
        "updated_count": len(updated_codes),
        "skipped_count": len(skipped_codes),
        "updated_codes": updated_codes,
        "skipped_codes": skipped_codes,
    }


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
