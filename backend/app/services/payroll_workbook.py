from copy import copy
from pathlib import Path
from tempfile import NamedTemporaryFile

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.services.block_detector import detect_employee_blocks
from app.services.payroll_store import PayrollEntry, get_payroll_entry
from app.services.workbook_processor import export_processed_workbook


PAYROLL_START_COL = 32
PAYROLL_END_COL = 43
MONEY_FORMAT = '#,##0'
NUMBER_FORMAT = '#,##0.##'

YELLOW = "FFFF00"
GREEN = "C4D79B"
WHITE = "FFFFFF"
RED = "C00000"


def preview_payroll(source_path: Path, review_overrides: list[dict] | None = None) -> dict:
    with NamedTemporaryFile(suffix=".xlsx", delete=False) as temp_file:
        temp_path = Path(temp_file.name)

    try:
        export_processed_workbook(source_path, temp_path, review_overrides=review_overrides)
        wb = load_workbook(temp_path, data_only=False)
        ws = _select_attendance_sheet(wb)
        blocks = detect_employee_blocks(ws)
        employees = [_build_employee_preview(ws, block) for block in blocks]
        return {"sheet_name": ws.title, "employees": employees}
    finally:
        temp_path.unlink(missing_ok=True)


def export_payroll_workbook(source_path: Path, output_path: Path, review_overrides: list[dict] | None = None) -> Path:
    with NamedTemporaryFile(suffix=".xlsx", delete=False) as temp_file:
        temp_output1 = Path(temp_file.name)

    try:
        export_processed_workbook(source_path, temp_output1, review_overrides=review_overrides)
        wb = load_workbook(temp_output1, data_only=False)
        ws = _select_attendance_sheet(wb)
        blocks = detect_employee_blocks(ws)

        for block in blocks:
            preview = _build_employee_preview(ws, block)
            _write_payroll_block(ws, block, preview)

        _set_payroll_column_widths(ws)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        wb.save(output_path)
        return output_path
    finally:
        temp_output1.unlink(missing_ok=True)


def _select_attendance_sheet(wb):
    best_sheet = None
    best_count = -1
    for ws in wb.worksheets:
        count = sum(1 for row in range(1, ws.max_row + 1) if ws.cell(row=row, column=1).value == "Att. Time")
        if count > best_count:
            best_sheet = ws
            best_count = count

    if best_sheet is None or best_count <= 0:
        raise ValueError("Không tìm thấy sheet chấm công có dòng Att. Time")

    return best_sheet


def _build_employee_preview(ws, block) -> dict:
    entry = get_payroll_entry(block.employee_code)
    total_hours = _sum_work_hours(ws, block.result_row)
    daily_salary = _calculate_daily_salary(entry)
    hourly_salary = daily_salary / 8 if daily_salary else 0
    work_days = total_hours / 8
    month_salary = total_hours * hourly_salary + entry.bonus - entry.advance_or_penalty

    return {
        "employee_code": block.employee_code,
        "name": entry.name,
        "note": entry.note,
        "header_row": block.header_row,
        "result_row": block.result_row,
        "note_row": block.header_row + 7,
        "total_hours": _round_number(total_hours),
        "monthly_salary": entry.monthly_salary,
        "daily_salary_input": entry.daily_salary,
        "daily_salary": _round_number(daily_salary),
        "hourly_salary": _round_number(hourly_salary),
        "standard_work_days": entry.standard_work_days,
        "work_days": _round_number(work_days),
        "bonus": entry.bonus,
        "advance_or_penalty": entry.advance_or_penalty,
        "final_salary": _round_number(month_salary),
    }


def _write_payroll_block(ws, block, preview: dict) -> None:
    h = block.header_row
    result_row = block.result_row
    note_row = h + 7
    month_label = _month_label(ws.cell(row=h, column=3).value)

    _copy_boundary_style(ws, h, note_row)

    headers = {
        32: "Tổng giờ công",
        33: "Mã",
        34: "Tên nhân viên / Ghi chú",
        37: "Mức Lương",
        38: "Lương 1 Ngày Công",
        39: "Lương 1 Giờ Công",
        40: "Số Ngày Đi Làm",
        41: "Thưởng",
        42: "Ứng Lương + Phạt",
        43: f"Lương Tháng {month_label}",
    }

    for col in range(PAYROLL_START_COL, PAYROLL_END_COL + 1):
        for row in range(h, note_row + 1):
            cell = ws.cell(row=row, column=col)
            cell.border = _thin_border()
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.fill = PatternFill("solid", fgColor=GREEN if col >= 37 else YELLOW)

    for col, title in headers.items():
        cell = ws.cell(row=h, column=col)
        cell.value = title
        cell.fill = PatternFill("solid", fgColor=YELLOW)
        cell.font = Font(bold=True, size=8, color=RED if col == 32 else "000000")

    values = {
        32: preview["total_hours"],
        33: block.employee_code,
        34: preview["name"],
        37: preview["monthly_salary"],
        38: preview["daily_salary"],
        39: preview["hourly_salary"],
        40: preview["work_days"],
        41: preview["bonus"],
        42: preview["advance_or_penalty"],
        43: preview["final_salary"],
    }

    for col, value in values.items():
        cell = ws.cell(row=result_row, column=col)
        cell.value = value
        cell.font = Font(bold=col in {34, 43}, color=RED if col == 32 else "000000")
        if col in {37, 38, 39, 41, 42, 43}:
            cell.number_format = MONEY_FORMAT
        elif col in {32, 40}:
            cell.number_format = NUMBER_FORMAT

    note_cell = ws.cell(row=note_row, column=34)
    note_cell.value = preview["note"]
    note_cell.font = Font(bold=True, color=RED)
    note_cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

    _safe_merge(ws, h, 34, h, 36)
    _safe_merge(ws, result_row, 34, result_row, 36)
    _safe_merge(ws, note_row, 34, note_row, 36)


def _sum_work_hours(ws, row: int) -> float:
    total = 0.0
    for col in range(1, 32):
        value = ws.cell(row=row, column=col).value
        if isinstance(value, (int, float)):
            total += float(value)
    return total


def _calculate_daily_salary(entry: PayrollEntry) -> float:
    if entry.daily_salary:
        return float(entry.daily_salary)
    if entry.monthly_salary:
        return float(entry.monthly_salary) / float(entry.standard_work_days)
    return 0


def _round_number(value: float) -> int | float:
    rounded = round(value, 2)
    return int(rounded) if rounded.is_integer() else rounded


def _month_label(value: object) -> str:
    text = str(value or "")
    if len(text) >= 7 and text[4] == "-":
        year = text[0:4]
        month = str(int(text[5:7]))
        return f"{month}/{year}"
    return ""


def _copy_boundary_style(ws, start_row: int, end_row: int) -> None:
    source_col = 31
    for row in range(start_row, end_row + 1):
        source = ws.cell(row=row, column=source_col)
        for col in range(PAYROLL_START_COL, PAYROLL_END_COL + 1):
            target = ws.cell(row=row, column=col)
            target._style = copy(source._style)
            if source.has_style:
                target.font = copy(source.font)
                target.fill = copy(source.fill)
                target.border = copy(source.border)
                target.alignment = copy(source.alignment)
                target.number_format = source.number_format
                target.protection = copy(source.protection)


def _safe_merge(ws, start_row: int, start_col: int, end_row: int, end_col: int) -> None:
    target = f"{get_column_letter(start_col)}{start_row}:{get_column_letter(end_col)}{end_row}"
    for merged_range in list(ws.merged_cells.ranges):
        if str(merged_range) == target:
            return
    ws.merge_cells(start_row=start_row, start_column=start_col, end_row=end_row, end_column=end_col)


def _thin_border() -> Border:
    side = Side(style="thin", color="000000")
    return Border(left=side, right=side, top=side, bottom=side)


def _set_payroll_column_widths(ws) -> None:
    widths = {
        "AF": 10,
        "AG": 8,
        "AH": 13,
        "AI": 13,
        "AJ": 13,
        "AK": 13,
        "AL": 16,
        "AM": 15,
        "AN": 14,
        "AO": 12,
        "AP": 16,
        "AQ": 18,
    }
    for column, width in widths.items():
        ws.column_dimensions[column].width = width
