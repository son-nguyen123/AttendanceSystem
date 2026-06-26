import json
from pathlib import Path

from pydantic import BaseModel, Field


CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"
PAYROLL_DATA_PATH = CONFIG_DIR / "payroll_data.json"


class PayrollEntry(BaseModel):
    name: str = ""
    monthly_salary: float | None = None
    daily_salary: float | None = None
    standard_work_days: float = Field(default=26, gt=0)
    bonus: float = 0
    advance_or_penalty: float = 0
    note: str = ""


def load_payroll_data() -> dict[str, dict]:
    if not PAYROLL_DATA_PATH.exists():
        return {}

    with PAYROLL_DATA_PATH.open("r", encoding="utf-8") as file:
        raw_data = json.load(file)

    if not isinstance(raw_data, dict):
        return {}

    return raw_data


def get_payroll_entry(employee_code: str) -> PayrollEntry:
    raw_entry = load_payroll_data().get(employee_code, {})
    if not isinstance(raw_entry, dict):
        raw_entry = {}
    return PayrollEntry(**raw_entry)


def save_payroll_entry(employee_code: str, entry: PayrollEntry) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    data = load_payroll_data()
    data[employee_code] = entry.model_dump()
    with PAYROLL_DATA_PATH.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
