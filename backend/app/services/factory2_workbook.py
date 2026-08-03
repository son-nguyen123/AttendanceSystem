from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import date, datetime
from calendar import monthrange
from pathlib import Path
from tempfile import NamedTemporaryFile
import re
import unicodedata

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.models.attendance import DayComputation
from app.services.attendance_calculator import calculate_day
from app.services.payroll_workbook import export_payroll_workbook
from app.services.payroll_store import PayrollEntry, calculate_daily_salary, calculate_hourly_salary, calculate_monthly_salary, get_payroll_entry
from app.services.punch_parser import parse_punches
from app.services.workbook_processor import export_processed_workbook


YELLOW = "FFFF00"
GRAY = "D9D9D9"
RED = "C00000"
WHITE = "FFFFFF"
FONT_NAME = "Arial"
MONEY_FORMAT = "#,##0"
INTEGER_NUMBER_FORMAT = "#,##0"
NUMBER_FORMAT = "#,##0.##"


@dataclass
class Factory2Day:
    day: date
    punches: list[str]
    computation: DayComputation | None = None


@dataclass
class Factory2Employee:
    employee_code: str
    source_name: str = ""
    days: list[Factory2Day] = field(default_factory=list)


def analyze_factory2_workbook(path: Path) -> dict:
    employees, sheet_name, period, employee_counts = _read_active_employees(path)
    rows: list[dict] = []
    manual_checks: list[dict] = []
    result_cells = 0
    missing_cells = 0
    late_cells = 0

    for employee in employees:
        block_results = []
        for day in employee.days:
            if day.computation is None:
                block_results.append(_empty_day_result(day.day))
                continue

            item = day.computation
            if item.work_value is not None:
                result_cells += 1
            if item.missing_count is not None:
                missing_cells += 1
            if item.late_minutes is not None:
                late_cells += 1
            if item.manual_checks:
                manual_checks.append(
                    {
                        "employee_code": employee.employee_code,
                        "day": item.day,
                        "cell": "",
                        "punches": item.punches,
                        "messages": item.manual_checks,
                    }
                )
            block_results.append(
                {
                    "day": item.day,
                    "column": str(item.day),
                    "punches": item.punches,
                    "work_value": item.work_value,
                    "missing_count": item.missing_count,
                    "late_minutes": item.late_minutes,
                }
            )

        rows.append(
            {
                "employee_code": employee.employee_code,
                "header_row": 0,
                "punch_row": 0,
                "missing_row": 0,
                "late_row": 0,
                "result_row": 0,
                "results": block_results,
            }
        )

    return {
        "sheet_name": sheet_name,
        "period": period,
        "summary": {
            "blocks": len(employees),
            "source_employee_count": employee_counts["source_employee_count"],
            "empty_employee_count": employee_counts["empty_employee_count"],
            "result_cells": result_cells,
            "missing_cells": missing_cells,
            "late_cells": late_cells,
            "manual_check_count": len(manual_checks),
        },
        "blocks": rows,
        "manual_checks": manual_checks,
    }


def preview_factory2_payroll(
    source_path: Path,
    review_overrides: list[dict] | None = None,
    profile_codes: set[str] | None = None,
) -> dict:
    employees, sheet_name, _period, _employee_counts = _read_active_employees(
        source_path,
        review_overrides=review_overrides,
    )
    return {
        "sheet_name": sheet_name,
        "employees": [_build_employee_preview(employee, profile_codes=profile_codes) for employee in employees],
    }


def export_factory2_output1(
    source_path: Path,
    output_path: Path,
    review_overrides: list[dict] | None = None,
) -> Path:
    with NamedTemporaryFile(suffix=".xlsx", delete=False) as temp_file:
        temp_source = Path(temp_file.name)

    try:
        _write_factory1_shaped_source(source_path, temp_source)
        return export_processed_workbook(temp_source, output_path, review_overrides=review_overrides)
    finally:
        temp_source.unlink(missing_ok=True)


def export_factory2_output2(
    source_path: Path,
    output_path: Path,
    review_overrides: list[dict] | None = None,
    include_saved_data: bool = True,
    profile_codes: set[str] | None = None,
) -> Path:
    with NamedTemporaryFile(suffix=".xlsx", delete=False) as temp_file:
        temp_source = Path(temp_file.name)

    try:
        _write_factory1_shaped_source(source_path, temp_source)
        return export_payroll_workbook(
            temp_source,
            output_path,
            review_overrides=review_overrides,
            include_saved_data=include_saved_data,
            profile_codes=profile_codes,
        )
    finally:
        temp_source.unlink(missing_ok=True)


def write_factory2_standard_source(source_path: Path, output_path: Path) -> Path:
    return _write_factory1_shaped_source(source_path, output_path)


def _export_factory2_output2_vertical(
    source_path: Path,
    output_path: Path,
    review_overrides: list[dict] | None = None,
) -> Path:
    employees, sheet_name, period, _employee_counts = _read_active_employees(
        source_path,
        review_overrides=review_overrides,
    )
    wb = Workbook()
    ws = wb.active
    ws.title = _safe_sheet_title(sheet_name)
    ws.sheet_view.showGridLines = True

    _setup_output_sheet(ws, period)
    row = 3
    for employee in employees:
        row = _write_employee_block(ws, row, employee, period)
        row += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(output_path)
    wb.close()
    return output_path


def _write_factory1_shaped_source(source_path: Path, output_path: Path) -> Path:
    employees, sheet_name, period, _employee_counts = _read_active_employees(source_path)
    wb = Workbook()
    ws = wb.active
    ws.title = _safe_sheet_title(sheet_name)
    ws.sheet_view.showGridLines = True

    _write_factory1_shaped_title(ws, period)
    start_row = 3
    for index, employee in enumerate(employees):
        block_row = start_row + index * 8
        _write_factory1_shaped_block(ws, block_row, employee, period)

    _set_factory1_shaped_widths(ws)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(output_path)
    wb.close()
    return output_path


def _write_factory1_shaped_title(ws, period: dict[str, int | str | None]) -> None:
    _safe_merge(ws, 1, 1, 2, 31)
    title = f"Bang cong Xuong 2 {period.get('label') or ''}".strip()
    cell = ws.cell(row=1, column=1)
    cell.value = title
    cell.font = Font(name=FONT_NAME, bold=True, size=20)
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 28
    ws.row_dimensions[2].height = 28


def _write_factory1_shaped_block(ws, header_row: int, employee: Factory2Employee, period: dict[str, int | str | None]) -> None:
    day_row = header_row + 1
    employee_row = header_row + 2
    punch_row = header_row + 3
    missing_row = header_row + 4
    late_row = header_row + 5
    result_row = header_row + 6
    note_row = header_row + 7
    days_by_number = {item.day.day: item for item in employee.days}
    month = period.get("month")
    year = period.get("year")
    period_start = f"{year}-{int(month):02d}-01" if isinstance(month, int) and isinstance(year, int) else ""
    period_end = (
        f"{year}-{int(month):02d}-{monthrange(year, month)[1]:02d}"
        if isinstance(month, int) and isinstance(year, int)
        else ""
    )
    period_range = f"{period_start} ~ {period_end}" if period_start and period_end else period_start

    ws.cell(row=header_row, column=1).value = "Att. Time"
    ws.cell(row=header_row, column=3).value = period_range
    ws.cell(row=header_row, column=10).value = f"Tabulation {date.today().isoformat()}"
    _safe_merge(ws, header_row, 1, header_row, 2)
    _safe_merge(ws, header_row, 3, header_row, 8)
    _safe_merge(ws, header_row, 10, header_row, 15)
    _safe_merge(ws, header_row, 16, header_row, 31)

    for col in range(1, 32):
        day_cell = ws.cell(row=day_row, column=col)
        day_cell.value = col
        day_cell.font = Font(name=FONT_NAME, bold=True, size=9)
        day_cell.alignment = Alignment(horizontal="center", vertical="center")

    ws.cell(row=employee_row, column=1).value = "Mã:"
    ws.cell(row=employee_row, column=3).value = employee.employee_code
    ws.cell(row=employee_row, column=9).value = f"Tên: {employee.source_name if employee.source_name != employee.employee_code else ''}".strip()
    ws.cell(row=employee_row, column=19).value = "Phòng Ban: Công ty"
    _safe_merge(ws, employee_row, 1, employee_row, 2)
    _safe_merge(ws, employee_row, 3, employee_row, 8)
    _safe_merge(ws, employee_row, 9, employee_row, 15)
    _safe_merge(ws, employee_row, 19, employee_row, 22)

    for col in range(1, 32):
        day = days_by_number.get(col)
        computation = day.computation if day else None
        ws.cell(row=punch_row, column=col).value = "\n".join(day.punches) if day and day.punches else None
        ws.cell(row=missing_row, column=col).value = computation.missing_count if computation else None
        ws.cell(row=late_row, column=col).value = computation.late_minutes if computation else None
        ws.cell(row=result_row, column=col).value = computation.work_value if computation else None

    row_heights = {
        header_row: 14.5,
        day_row: 28,
        employee_row: 18,
        punch_row: 100,
        missing_row: 14.5,
        late_row: 14.5,
        result_row: 14.5,
        note_row: 14.5,
    }
    for row in range(header_row, note_row + 1):
        ws.row_dimensions[row].height = row_heights.get(row, 14.5)
        for col in range(1, 32):
            cell = ws.cell(row=row, column=col)
            cell.border = _thin_border()
            cell.font = Font(name=FONT_NAME, size=9)
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True, shrink_to_fit=True)
            cell.fill = PatternFill("solid", fgColor=WHITE)
            if row in {missing_row, late_row, result_row}:
                cell.number_format = _number_format_for(cell.value)

    for col in range(1, 32):
        if _is_sunday(period, col):
            for row in range(day_row, note_row + 1):
                ws.cell(row=row, column=col).fill = PatternFill("solid", fgColor=YELLOW)

    for row in (header_row, employee_row):
        for col in range(1, 32):
            ws.cell(row=row, column=col).alignment = Alignment(horizontal="left", vertical="center", wrap_text=False)


def _set_factory1_shaped_widths(ws) -> None:
    for col in range(1, 32):
        ws.column_dimensions[get_column_letter(col)].width = 6.2


def _is_sunday(period: dict[str, int | str | None], day: int) -> bool:
    month = period.get("month")
    year = period.get("year")
    if not isinstance(month, int) or not isinstance(year, int):
        return False
    try:
        return date(year, month, day).weekday() == 6
    except ValueError:
        return False


def _read_active_employees(
    path: Path,
    review_overrides: list[dict] | None = None,
) -> tuple[
    list[Factory2Employee],
    str,
    dict[str, int | str | None],
    dict[str, int],
]:
    wb = load_workbook(path, data_only=True)
    try:
        ws, header_row, columns = _select_factory2_sheet(wb)
        overrides = _review_overrides_by_employee_day(review_overrides or [])
        employees_by_code: OrderedDict[str, Factory2Employee] = OrderedDict()
        period_month = None
        period_year = None

        for row in range(header_row + 1, ws.max_row + 1):
            code = _clean_code(ws.cell(row=row, column=columns["code"]).value)
            if not code:
                continue

            day_value = ws.cell(row=row, column=columns["date"]).value
            current_date = _coerce_date(day_value)
            if current_date is None:
                continue

            period_month = period_month or current_date.month
            period_year = period_year or current_date.year
            employee = employees_by_code.setdefault(
                code,
                Factory2Employee(
                    employee_code=code,
                    source_name=_clean_text(ws.cell(row=row, column=columns.get("name", columns["code"])).value),
                ),
            )

            punches = _row_punches(ws, row, columns["punches"])
            computation = _compute_day(current_date, punches)
            if computation is not None:
                override = overrides.get((code, current_date.day), {})
                computation = _apply_override(computation, override)
            employee.days.append(Factory2Day(day=current_date, punches=punches, computation=computation))

        active_employees = [employee for employee in employees_by_code.values() if any(day.punches for day in employee.days)]
        period = {
            "month": period_month,
            "year": period_year,
            "label": f"{period_month:02d}/{period_year}" if period_month and period_year else "",
        }
        employee_counts = {
            "source_employee_count": len(employees_by_code),
            "empty_employee_count": len(employees_by_code) - len(active_employees),
        }
        return active_employees, ws.title, period, employee_counts
    finally:
        wb.close()


def _select_factory2_sheet(wb):
    for ws in wb.worksheets:
        for row in range(1, min(ws.max_row, 20) + 1):
            headers = [_plain_text(ws.cell(row=row, column=col).value) for col in range(1, min(ws.max_column, 20) + 1)]
            if not any("ma" in value and "nv" in value for value in headers):
                continue
            if not any(value.startswith("ngay") or value.startswith("nga") for value in headers):
                continue

            columns = _factory2_columns(ws, row)
            if columns:
                return ws, row, columns
    raise ValueError("Khong tim thay sheet raw xuong 2 co cot Ma NV / Ngay / Lan")


def _factory2_columns(ws, header_row: int) -> dict | None:
    columns: dict[str, object] = {"punches": []}
    for col in range(1, ws.max_column + 1):
        text = _plain_text(ws.cell(row=header_row, column=col).value)
        if not text:
            continue
        if "ma" in text and "nv" in text and "code" not in columns:
            columns["code"] = col
        elif ("ten" in text or text.startswith("te") or "name" in text) and "name" not in columns:
            columns["name"] = col
        elif text.startswith("ngay") or text.startswith("nga") or text == "date":
            columns["date"] = col
        elif text.startswith("lan") or text.startswith("la"):
            columns["punches"].append(col)

    if "code" not in columns or "date" not in columns or not columns["punches"]:
        return None
    return columns


def _row_punches(ws, row: int, punch_columns: list[int]) -> list[str]:
    punches: list[str] = []
    for col in punch_columns:
        for punch in parse_punches(ws.cell(row=row, column=col).value):
            if punch not in punches:
                punches.append(punch)
    return sorted(punches)


def _compute_day(current_date: date, punches: list[str]) -> DayComputation | None:
    if not punches:
        return None

    calculated = calculate_day(punches)
    return DayComputation(
        day=current_date.day,
        column=current_date.day,
        column_letter=str(current_date.day),
        raw_value=", ".join(punches),
        punches=punches,
        work_value=calculated.work_value,
        missing_count=calculated.missing_count,
        late_minutes=calculated.late_minutes,
        manual_checks=calculated.manual_checks,
    )


def _apply_override(item: DayComputation, override: dict) -> DayComputation:
    if not override:
        return item
    return DayComputation(
        day=item.day,
        column=item.column,
        column_letter=item.column_letter,
        raw_value=item.raw_value,
        punches=item.punches,
        work_value=override.get("work_value", item.work_value),
        missing_count=override.get("missing_count", item.missing_count),
        late_minutes=override.get("late_minutes", item.late_minutes),
        manual_checks=item.manual_checks,
    )


def _empty_day_result(value: date) -> dict:
    return {
        "day": value.day,
        "column": str(value.day),
        "punches": [],
        "work_value": None,
        "missing_count": None,
        "late_minutes": None,
    }


def _build_employee_preview(employee: Factory2Employee, profile_codes: set[str] | None = None) -> dict:
    entry = get_payroll_entry(employee.employee_code)
    if profile_codes is not None and employee.employee_code not in profile_codes:
        entry = PayrollEntry()
    total_hours = _employee_total_hours(employee)
    monthly_salary = calculate_monthly_salary(entry)
    daily_salary = calculate_daily_salary(entry)
    hourly_salary = calculate_hourly_salary(entry)
    work_days = total_hours / 8
    final_salary = total_hours * hourly_salary + entry.bonus - entry.advance_or_penalty
    fallback_name = employee.source_name if employee.source_name != employee.employee_code else ""

    return {
        "employee_code": employee.employee_code,
        "name": entry.name or fallback_name,
        "start_work_note": entry.start_work_note,
        "note": entry.note,
        "header_row": None,
        "result_row": None,
        "note_row": None,
        "total_hours": _round_number(total_hours),
        "monthly_salary": _round_optional_number(monthly_salary),
        "daily_salary_input": entry.daily_salary,
        "daily_salary": _round_number(daily_salary),
        "hourly_salary": _round_number(hourly_salary),
        "standard_work_days": entry.standard_work_days,
        "work_days": _round_number(work_days),
        "bonus": entry.bonus,
        "advance_or_penalty": entry.advance_or_penalty,
        "final_salary": _round_number(final_salary),
    }


def _write_employee_block(ws, start_row: int, employee: Factory2Employee, period: dict) -> int:
    title_row = start_row
    header_row = start_row + 1
    first_day_row = start_row + 2
    summary_name_row = first_day_row + len(employee.days)
    summary_header_row = summary_name_row + 1
    summary_value_row = summary_name_row + 2

    preview = _build_employee_preview(employee)
    month_label = period.get("label") or ""
    title = preview["name"] or employee.source_name or employee.employee_code
    _safe_merge(ws, title_row, 1, title_row, 13)
    ws.cell(row=title_row, column=1).value = title
    ws.cell(row=title_row, column=1).fill = PatternFill("solid", fgColor=YELLOW)
    ws.cell(row=title_row, column=1).font = Font(name=FONT_NAME, bold=True, size=10)
    ws.cell(row=title_row, column=1).alignment = Alignment(horizontal="left", vertical="center")

    headers = [
        "Mã",
        "Họ Và Tên",
        "Ngày",
        "Công",
        "Quên bấm",
        "Đi trễ",
        "Lần 1",
        "Lần 2",
        "Lần 3",
        "Lần 4",
        "Lần 5",
        "Lần 6",
        "Lần 7",
    ]
    for index, header in enumerate(headers, start=1):
        cell = ws.cell(row=header_row, column=index)
        cell.value = header
        cell.fill = PatternFill("solid", fgColor=YELLOW if 4 <= index <= 6 else WHITE)
        cell.font = Font(name=FONT_NAME, bold=True, size=9)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = _thin_border()

    for offset, day in enumerate(employee.days):
        row = first_day_row + offset
        is_sunday = day.day.weekday() == 6
        fill = PatternFill("solid", fgColor=GRAY if is_sunday else WHITE)
        output_fill = PatternFill("solid", fgColor=YELLOW if day.punches else GRAY if is_sunday else WHITE)
        values = [
            employee.employee_code,
            preview["name"] or employee.source_name,
            day.day,
            day.computation.work_value if day.computation else None,
            day.computation.missing_count if day.computation else None,
            day.computation.late_minutes if day.computation else None,
            *day.punches[:7],
        ]
        values += [None] * (13 - len(values))
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col)
            cell.value = value
            cell.border = _thin_border()
            cell.fill = output_fill if 4 <= col <= 6 else fill
            cell.font = Font(name=FONT_NAME, size=9)
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            if col == 3:
                cell.number_format = "m/d/yyyy"
            elif col in {4, 5, 6}:
                cell.number_format = _number_format_for(value)

    _write_summary_rows(ws, summary_name_row, summary_header_row, summary_value_row, employee, preview, month_label)
    for row in range(start_row, summary_value_row + 1):
        ws.row_dimensions[row].height = 18
    ws.row_dimensions[summary_header_row].height = 27
    return summary_value_row


def _write_summary_rows(ws, name_row: int, header_row: int, value_row: int, employee: Factory2Employee, preview: dict, month_label: str) -> None:
    _safe_merge(ws, name_row, 1, name_row, 13)
    name_cell = ws.cell(row=name_row, column=1)
    name_cell.value = preview["name"] or employee.source_name or employee.employee_code
    name_cell.fill = PatternFill("solid", fgColor=YELLOW)
    name_cell.font = Font(name=FONT_NAME, bold=True, size=10)
    name_cell.alignment = Alignment(horizontal="left", vertical="center")
    name_cell.border = _thin_border()

    labels = [
        "Mã",
        "Họ Và Tên",
        "Tổng h làm",
        "Số Ngày đi làm",
        "Mức Lương",
        "Lương 1 Ngày",
        "Lương 1 Giờ",
        "H tăng",
        "Thưởng",
        "Ứng lương",
        f"Lương Tháng {month_label}",
        "",
        "",
    ]
    values = [
        employee.employee_code,
        preview["name"] or employee.source_name,
        preview["total_hours"],
        preview["work_days"],
        preview["monthly_salary"],
        preview["daily_salary"],
        preview["hourly_salary"],
        "",
        preview["bonus"],
        preview["advance_or_penalty"],
        preview["final_salary"],
        preview["start_work_note"],
        preview["note"],
    ]
    for col in range(1, 14):
        for row, value, bold in ((header_row, labels[col - 1], True), (value_row, values[col - 1], False)):
            cell = ws.cell(row=row, column=col)
            cell.value = value
            cell.fill = PatternFill("solid", fgColor=YELLOW)
            cell.font = Font(name=FONT_NAME, bold=bold or col in {2, 11}, size=8 if bold else 9, color=RED if col == 3 else "000000")
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True, shrink_to_fit=True)
            cell.border = _thin_border()
            if row == value_row and col in {5, 6, 7, 9, 10, 11}:
                cell.number_format = MONEY_FORMAT
            elif row == value_row and col in {3, 4}:
                cell.number_format = _number_format_for(value)


def _setup_output_sheet(ws, period: dict) -> None:
    title = f"Bảng công Xưởng 2 {period.get('label') or ''}".strip()
    _safe_merge(ws, 1, 1, 1, 13)
    ws.cell(row=1, column=1).value = title
    ws.cell(row=1, column=1).font = Font(name=FONT_NAME, bold=True, size=16)
    ws.cell(row=1, column=1).alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 28
    widths = {
        1: 8,
        2: 24,
        3: 12,
        4: 8,
        5: 9,
        6: 8,
        7: 9,
        8: 9,
        9: 9,
        10: 9,
        11: 9,
        12: 9,
        13: 9,
    }
    for col, width in widths.items():
        ws.column_dimensions[get_column_letter(col)].width = width


def _employee_total_hours(employee: Factory2Employee) -> float:
    total = 0.0
    for day in employee.days:
        value = day.computation.work_value if day.computation else None
        if isinstance(value, (int, float)):
            total += float(value)
    return total


def _review_overrides_by_employee_day(items: list[dict]) -> dict[tuple[str, int], dict]:
    result: dict[tuple[str, int], dict] = {}
    for item in items:
        employee_code = str(item.get("employee_code", "")).strip()
        day = item.get("day")
        if not employee_code or not isinstance(day, int):
            continue

        target = result.setdefault((employee_code, day), {})
        if "missing_count" in item:
            target["missing_count"] = item.get("missing_count")
        if "late_minutes" in item:
            target["late_minutes"] = item.get("late_minutes")
        if "work_value" in item:
            target["work_value"] = item.get("work_value")
    return result


def _plain_text(value: object) -> str:
    text = _clean_text(value).lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _clean_code(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _coerce_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _safe_sheet_title(value: str) -> str:
    title = re.sub(r"[\[\]:*?/\\]", " ", value or "Xuong 2")
    return title[:31] or "Xuong 2"


def _safe_merge(ws, start_row: int, start_col: int, end_row: int, end_col: int) -> None:
    for merged_range in list(ws.merged_cells.ranges):
        if not (
            merged_range.max_row < start_row
            or merged_range.min_row > end_row
            or merged_range.max_col < start_col
            or merged_range.min_col > end_col
        ):
            ws.unmerge_cells(str(merged_range))
    ws.merge_cells(start_row=start_row, start_column=start_col, end_row=end_row, end_column=end_col)


def _thin_border() -> Border:
    side = Side(style="thin", color="000000")
    return Border(left=side, right=side, top=side, bottom=side)


def _number_format_for(value: object) -> str:
    if isinstance(value, (int, float)) and float(value).is_integer():
        return INTEGER_NUMBER_FORMAT
    return NUMBER_FORMAT


def _round_optional_number(value: float | None) -> int | float | None:
    if value is None:
        return None
    return _round_number(value)


def _round_number(value: float) -> int | float:
    rounded = round(value, 2)
    return int(rounded) if rounded.is_integer() else rounded
