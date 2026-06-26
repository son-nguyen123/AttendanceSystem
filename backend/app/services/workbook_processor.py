import shutil
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

from app.models.attendance import DayComputation
from app.services.attendance_calculator import calculate_day
from app.services.block_detector import detect_employee_blocks
from app.services.period_detector import detect_period_from_sheet
from app.services.punch_parser import parse_punches


def analyze_workbook(path: Path) -> dict:
    wb = load_workbook(path, data_only=False)
    ws = _select_attendance_sheet(wb)
    blocks = detect_employee_blocks(ws)

    rows: list[dict] = []
    manual_checks: list[dict] = []
    result_cells = 0
    missing_cells = 0
    late_cells = 0

    for block in blocks:
        computations = _compute_block(ws, block)
        block_results = []
        for item in computations:
            if item.work_value is not None:
                result_cells += 1
            if item.missing_count is not None:
                missing_cells += 1
            if item.late_minutes is not None:
                late_cells += 1

            if item.manual_checks:
                manual_checks.append(
                    {
                        "employee_code": block.employee_code,
                        "day": item.day,
                        "cell": f"{item.column_letter}{block.punch_row}",
                        "punches": item.punches,
                        "messages": item.manual_checks,
                    }
                )

            block_results.append(
                {
                    "day": item.day,
                    "column": item.column_letter,
                    "punches": item.punches,
                    "work_value": item.work_value,
                    "missing_count": item.missing_count,
                    "late_minutes": item.late_minutes,
                }
            )

        rows.append(
            {
                "employee_code": block.employee_code,
                "header_row": block.header_row,
                "punch_row": block.punch_row,
                "missing_row": block.missing_row,
                "late_row": block.late_row,
                "result_row": block.result_row,
                "results": block_results,
            }
        )

    return {
        "sheet_name": ws.title,
        "period": detect_period_from_sheet(ws),
        "summary": {
            "blocks": len(blocks),
            "result_cells": result_cells,
            "missing_cells": missing_cells,
            "late_cells": late_cells,
            "manual_check_count": len(manual_checks),
        },
        "blocks": rows,
        "manual_checks": manual_checks,
    }


def export_processed_workbook(source_path: Path, output_path: Path, review_overrides: list[dict] | None = None) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, output_path)

    wb = load_workbook(output_path, data_only=False)
    ws = _select_attendance_sheet(wb)
    blocks = detect_employee_blocks(ws)
    overrides = _review_overrides_by_employee_day(review_overrides or [])

    for block in blocks:
        for item in _compute_block(ws, block):
            override = overrides.get((block.employee_code, item.day), {})
            missing_count = override.get("missing_count", item.missing_count)
            late_minutes = override.get("late_minutes", item.late_minutes)
            work_value = override.get("work_value", item.work_value)

            if missing_count is not None and missing_count != "":
                ws.cell(row=block.missing_row, column=item.column).value = missing_count
            if late_minutes is not None and late_minutes != "":
                ws.cell(row=block.late_row, column=item.column).value = late_minutes
            if work_value is not None and work_value != "":
                ws.cell(row=block.result_row, column=item.column).value = work_value

    wb.save(output_path)
    return output_path


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


def _compute_block(ws, block) -> list[DayComputation]:
    computations: list[DayComputation] = []

    for column in range(1, 32):
        day_value = ws.cell(row=block.day_row, column=column).value
        if not isinstance(day_value, int):
            continue

        raw_value = ws.cell(row=block.punch_row, column=column).value
        punches = parse_punches(raw_value)
        if not punches:
            continue

        calculated = calculate_day(punches)
        computations.append(
            DayComputation(
                day=day_value,
                column=column,
                column_letter=get_column_letter(column),
                raw_value=raw_value,
                punches=punches,
                work_value=calculated.work_value,
                missing_count=calculated.missing_count,
                late_minutes=calculated.late_minutes,
                manual_checks=calculated.manual_checks,
            )
        )

    return computations
