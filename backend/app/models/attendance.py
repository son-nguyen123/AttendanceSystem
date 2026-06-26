from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class EmployeeBlock:
    sheet_name: str
    header_row: int
    day_row: int
    employee_row: int
    punch_row: int
    missing_row: int
    late_row: int
    result_row: int
    employee_code: str


@dataclass(frozen=True)
class DayComputation:
    day: int
    column: int
    column_letter: str
    raw_value: Any
    punches: list[str]
    work_value: float | str | None
    missing_count: int | str | None = None
    late_minutes: int | None = None
    manual_checks: list[str] = field(default_factory=list)
