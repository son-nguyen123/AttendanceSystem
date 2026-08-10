"""Convert the older Factory 1 attendance workbook into the current frame.

The legacy Factory 1 files are usually old ``.xls`` Output 1 workbooks.  We
read their semantic payroll summary first, then let the normal payroll writer
create the current formula-driven summary. The conversion preserves all
owner-entered values from that historical month, including bank accounts and
notes, while rebuilding calculated columns in the current formula frame.
"""

from __future__ import annotations

import math
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill

from app.services.block_detector import detect_employee_blocks
from app.services.data_mapper import (
    _normalize_employee_code,
    _normalize_label,
    _owner_records_by_code,
    _prepare_mapping_source_workbook,
)
from app.services.excel_compat import convert_xls_to_xlsx
from app.services.payroll_store import normalize_employee_name
from app.services.payroll_workbook import export_payroll_workbook
from app.services.workbook_processor import export_processed_workbook


_OVERTIME_LABELS = {
    "so h tang ca",
    "so gio tang ca",
    "gio lam them",
    "h tang",
}


def export_factory1_legacy_output2(source_path: Path, output_path: Path) -> Path:
    """Convert one old Factory 1 workbook to the current formula frame."""

    with TemporaryDirectory(prefix="factory1-legacy-") as temp_dir:
        prepared_path = Path(temp_dir) / "legacy.xlsx"
        if source_path.suffix.lower() == ".xls":
            convert_xls_to_xlsx(source_path, prepared_path)
        else:
            shutil.copy2(source_path, prepared_path)

        # Some old .xlsx files contain tens of thousands of style-only rows
        # below the actual payroll table. Compact the XML before openpyxl sees
        # it; otherwise it allocates a cell object for every blank row twice.
        if source_path.suffix.lower() == ".xls":
            readable_path = prepared_path
        else:
            readable_path, _ = _prepare_mapping_source_workbook(source_path, Path(temp_dir))

        workbook = load_workbook(readable_path, data_only=False)
        values_workbook = load_workbook(readable_path, data_only=True)
        source_sheet = _select_sheet(workbook)
        values_sheet = values_workbook[source_sheet.title]
        records = _owner_records_by_code(source_sheet, values_sheet)
        if not records:
            raise ValueError("KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u nhÃ¢n viÃªn trong báº£ng cÅ© XÆ°á»Ÿng 1")

        # Reuse the semantic summary reader for period-specific inputs such as
        # bonus, penalty and advance.  Calculated daily/hourly/final values are
        # intentionally not copied below because the new frame writes formulas.
        # In particular, the old combined "Ứng Lương + Phạt" field is read by
        # that helper as ``advance_or_penalty`` so its full amount is entered in
        # the new "Ứng Lương" cell.  The formula itself is unchanged: the new
        # frame simply receives the same monthly input value.
        from app.services.factory2_workbook import _read_legacy_payroll_values

        summary_values = _read_legacy_payroll_values(
            readable_path,
            formula_workbook=workbook,
            values_workbook=values_workbook,
        )
        positional_values = _legacy_positional_payroll_values(source_sheet, values_sheet, records)
        historical_work_overrides = _legacy_work_overrides(source_sheet, values_sheet)
        daily_overtime = _daily_overtime_totals(historical_work_overrides)
        overtime = _legacy_overtime_by_code(source_sheet, values_sheet, records)
        workbook.close()
        values_workbook.close()
        source_values: dict[str, dict] = {}
        for code, record in records.items():
            old_values = {**positional_values.get(code, {}), **summary_values.get(code, {})}
            # Keep identity/profile values from the old month.  Do not pass
            # old daily/hourly/final totals: the new frame must write formulas
            # for the new month's calculations.
            item = {
                "name": normalize_employee_name(record.name or ""),
                "start_work_note": record.start_work_note or "",
                "note": record.note or "",
                "monthly_salary": _number(record.salary),
                "bonus": _number(old_values.get("bonus")) if "bonus" in old_values else _number(record.bonus),
                "overtime_hours": daily_overtime.get(
                    code,
                    _number(old_values.get("overtime_hours")) if old_values.get("overtime_hours") is not None else overtime.get(code, 0),
                ),
                "bank_account": record.bank_account or "",
            }
            legacy_final_salary = _number(old_values.get("final_salary"))
            if legacy_final_salary is not None:
                item["_legacy_final_salary"] = legacy_final_salary
            for key in ("penalty_rate", "nq_penalty", "advance_or_penalty"):
                value = _number(old_values.get(key))
                if value is not None:
                    item[key] = value
            source_values[code] = item

        # The normal payroll export first creates Output 1 and then reads it
        # again to write Output 2.  Reuse that processed intermediate here so
        # a legacy conversion does not load the same large workbook twice.
        processed_path = Path(temp_dir) / "processed.xlsx"
        export_processed_workbook(
            readable_path,
            processed_path,
            review_overrides=historical_work_overrides,
            factory="factory1",
        )
        converted_path = export_payroll_workbook(
            processed_path,
            output_path,
            include_saved_data=True,
            factory="factory1",
            source_payroll_values=source_values,
            source_is_processed=True,
        )
        _verify_converted_output(converted_path, source_values, historical_work_overrides)
        return converted_path


def _legacy_positional_payroll_values(source_sheet, values_sheet, records: dict[str, object]) -> dict[str, dict]:
    """Recover old inputs whose yellow overtime or bonus header is blank."""

    result: dict[str, dict] = {}
    max_col = source_sheet.max_column
    for row in range(1, source_sheet.max_row + 1):
        codes = {
            code
            for col in range(1, max_col + 1)
            if (code := _normalize_employee_code(values_sheet.cell(row, col).value)) and code in records
        }
        if not codes:
            continue

        deduction_col = None
        for header_row in range(max(1, row - 8), row):
            for col in range(3, max_col + 1):
                if _normalize_label(source_sheet.cell(header_row, col).value) in {
                    "ung luong + phat",
                    "ung luong va phat",
                }:
                    deduction_col = col
                    break
            if deduction_col is not None:
                break
        if deduction_col is None:
            continue

        for code in codes:
            item = result.setdefault(code, {})
            for key, col in (
                ("overtime_hours", deduction_col - 2),
                ("bonus", deduction_col - 1),
                ("advance_or_penalty", deduction_col),
            ):
                raw_value = values_sheet.cell(row, col).value
                if raw_value in (None, ""):
                    raw_value = source_sheet.cell(row, col).value
                # Keep a blank key explicit so a saved value from another
                # payroll month is never inserted into this historical file.
                item[key] = raw_value if raw_value not in (None, "") else None
    return result


def _verify_converted_output(
    output_path: Path,
    source_values: dict[str, dict],
    historical_work_overrides: list[dict],
) -> None:
    """Fail the conversion if owner inputs or archived attendance were lost."""

    workbook = load_workbook(output_path, data_only=False)
    try:
        sheet = _select_sheet(workbook)
        blocks = {block.employee_code: block for block in detect_employee_blocks(sheet)}
        errors: list[str] = []
        final_mismatches: list[tuple[str, float, float, float]] = []

        def same_value(expected: object, actual: object) -> bool:
            expected_number = _number(expected)
            actual_number = _number(actual)
            if expected_number is not None or actual_number is not None:
                return expected_number is not None and actual_number is not None and abs(float(expected_number) - float(actual_number)) < 0.0001
            return str(expected or "").strip() == str(actual or "").strip()

        for code, expected in source_values.items():
            block = blocks.get(code)
            if block is None:
                errors.append(f"mất mã {code}")
                continue
            row = block.result_row
            checks = {
                "tên": (expected.get("name"), sheet.cell(row, 35).value),
                "tài khoản": (expected.get("bank_account"), sheet.cell(row - 1, 35).value),
                "mức lương": (expected.get("monthly_salary"), sheet.cell(row, 36).value),
                "thưởng": (expected.get("bonus"), sheet.cell(row, 41).value),
            }
            if "overtime_hours" in expected and expected.get("overtime_hours") is not None:
                checks["giờ làm thêm"] = (expected.get("overtime_hours"), sheet.cell(row, 40).value)
            if "nq_penalty" in expected:
                checks["phạt NQ"] = (expected.get("nq_penalty"), sheet.cell(row, 42).value)
            if "advance_or_penalty" in expected:
                checks["ứng/phạt"] = (expected.get("advance_or_penalty"), sheet.cell(row, 43).value)
            for label, (wanted, actual) in checks.items():
                if not same_value(wanted, actual):
                    errors.append(f"mã {code} lệch {label}")

            note_text = str(sheet.cell(block.header_row + 7, 36).value or "")
            for label in ("start_work_note", "note"):
                wanted_text = str(expected.get(label) or "").strip()
                if wanted_text and label == "note" and wanted_text not in note_text:
                    errors.append(f"mã {code} thiếu ghi chú")
            for col in (37, 38, 39, 44):
                if not str(sheet.cell(row, col).value or "").startswith("="):
                    errors.append(f"mã {code} thiếu công thức cột {col}")

            old_final_salary = _number(expected.get("_legacy_final_salary"))
            salary = _number(sheet.cell(row, 36).value)
            if old_final_salary is not None and salary is not None:
                total_hours = sum(
                    float(value)
                    for col in range(1, 32)
                    if (value := _number(sheet.cell(row, col).value)) is not None
                )
                overtime_hours = _number(sheet.cell(row, 40).value) or 0
                bonus = _number(sheet.cell(row, 41).value) or 0
                advance = _number(sheet.cell(row, 43).value) or 0
                nq_penalty = _number(expected.get("nq_penalty"))
                if nq_penalty is None:
                    penalty_rate = _number(expected.get("penalty_rate")) or 0
                    nq_penalty = penalty_rate * total_hours
                calculated_final = (
                    salary / 26 * (total_hours / 8)
                    + overtime_hours * (salary / 208) * 1.5
                    + bonus
                    - nq_penalty
                    - advance
                )
                if abs(float(old_final_salary) - calculated_final) > 0.02:
                    final_mismatches.append(
                        (code, float(old_final_salary), calculated_final, calculated_final - float(old_final_salary))
                    )

        for override in historical_work_overrides:
            code = str(override.get("employee_code") or "").strip()
            block = blocks.get(code)
            if block is None:
                continue
            day = override.get("day")
            day_col = override.get("source_column")
            if not isinstance(day_col, int) or not 1 <= day_col <= 31:
                day_col = next(
                    (
                        col
                        for col in range(1, 32)
                        if _number(sheet.cell(block.day_row, col).value) == _number(day)
                    ),
                    None,
                )
            if "work_value" in override and (day_col is None or not same_value(
                override.get("work_value"),
                sheet.cell(block.result_row, day_col).value if day_col else None,
            )):
                errors.append(f"mã {code} lệch công ngày {day}")
            if "overtime_value" in override and day_col is not None and not same_value(
                override.get("overtime_value"),
                sheet.cell(block.result_row + 1, day_col).value,
            ):
                errors.append(f"mã {code} lệch tăng ca ngày {day}")

        if errors:
            preview = "; ".join(errors[:12])
            suffix = f"; và {len(errors) - 12} lỗi khác" if len(errors) > 12 else ""
            raise ValueError(f"Đối chiếu bảng khung mới không đạt: {preview}{suffix}")
        if final_mismatches:
            _write_reconciliation_report(workbook, final_mismatches)
            workbook.save(output_path)
    finally:
        workbook.close()


def _write_reconciliation_report(workbook, mismatches: list[tuple[str, float, float, float]]) -> None:
    """Add a visible review sheet when the old total conflicts with its inputs."""

    title = "Đối chiếu chuyển khung"
    if title in workbook.sheetnames:
        del workbook[title]
    sheet = workbook.create_sheet(title)
    sheet["A1"] = "CẢNH BÁO ĐỐI CHIẾU LƯƠNG CŨ"
    sheet["A2"] = (
        "Các dòng dưới đây có Lương Tháng cũ không khớp với chính dữ liệu lương/thưởng/ứng-phạt cũ. "
        "Khung mới đã giữ nguyên các dữ liệu đầu vào và dùng công thức chuẩn, vì vậy kết quả tính lại có chênh lệch."
    )
    sheet.merge_cells("A2:E2")
    headers = ["Mã", "Lương Tháng cũ", "Khung mới tính lại", "Chênh lệch", "Cần kiểm tra"]
    for col, value in enumerate(headers, start=1):
        cell = sheet.cell(4, col, value)
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="FFFF00")
    for row, (code, old_value, new_value, difference) in enumerate(mismatches, start=5):
        sheet.cell(row, 1, code)
        sheet.cell(row, 2, old_value)
        sheet.cell(row, 3, new_value)
        sheet.cell(row, 4, difference)
        sheet.cell(row, 5, "Kiểm tra lại cách bảng cũ dùng cột Ứng Lương + Phạt")
        for col in range(2, 5):
            sheet.cell(row, col).number_format = "#,##0.##"
    sheet.freeze_panes = "A5"
    for column, width in {"A": 14, "B": 20, "C": 20, "D": 18, "E": 58}.items():
        sheet.column_dimensions[column].width = width


def reconciliation_warning_count(output_path: Path) -> int:
    """Return the number of review rows attached to a converted workbook."""

    workbook = load_workbook(output_path, read_only=True, data_only=False)
    try:
        title = "Đối chiếu chuyển khung"
        return max(0, workbook[title].max_row - 4) if title in workbook.sheetnames else 0
    finally:
        workbook.close()


def _legacy_work_overrides(source_sheet, values_sheet) -> list[dict]:
    """Keep archived daily work and overtime values when rebuilding a month."""
    overrides: list[dict] = []
    for block in detect_employee_blocks(source_sheet):
        for column in range(1, 32):
            day = source_sheet.cell(block.day_row, column).value
            if isinstance(day, bool):
                continue
            if not isinstance(day, int) or not 1 <= day <= 31:
                continue

            work_value = values_sheet.cell(block.result_row, column).value
            if work_value in (None, ""):
                work_value = source_sheet.cell(block.result_row, column).value
            overtime_value = values_sheet.cell(block.result_row + 1, column).value
            if overtime_value in (None, ""):
                overtime_value = source_sheet.cell(block.result_row + 1, column).value
            if work_value in (None, "") and overtime_value in (None, ""):
                continue
            item = {"employee_code": block.employee_code, "day": day, "source_column": column}
            if work_value not in (None, ""):
                item["work_value"] = work_value
            if overtime_value not in (None, ""):
                item["overtime_value"] = overtime_value
            overrides.append(item)
    return overrides


def _daily_overtime_totals(overrides: list[dict]) -> dict[str, int | float]:
    totals: dict[str, float] = {}
    for item in overrides:
        if "overtime_value" not in item:
            continue
        code = str(item.get("employee_code") or "").strip()
        value = _number(item.get("overtime_value"))
        if code and value is not None:
            totals[code] = totals.get(code, 0) + float(value)
    return {code: int(total) if total.is_integer() else total for code, total in totals.items()}


def _select_sheet(workbook):
    best = None
    best_score = (-1, -1, -1)
    for worksheet in workbook.worksheets:
        blocks = detect_employee_blocks(worksheet)
        codes = [block.employee_code for block in blocks]
        unique_count = len(set(codes))
        duplicate_count = len(codes) - unique_count
        # Prefer the sheet containing the most distinct employees. This is
        # essential for workbooks that retain an older draft sheet with the
        # same block count but duplicated employee codes.
        score = (unique_count, -duplicate_count, len(blocks))
        if score > best_score:
            best = worksheet
            best_score = score
    if best is None or best_score[0] <= 0:
        raise ValueError("KhÃ´ng tÃ¬m tháº¥y sheet cháº¥m cÃ´ng cÅ© XÆ°á»Ÿng 1")
    return best


def _legacy_overtime_by_code(source_sheet, values_sheet, records: dict[str, object]) -> dict[str, int | float]:
    """Read ``Sá»‘ H táº±ng ca``/``Giá» lÃ m thÃªm`` from old summary rows."""

    result: dict[str, int | float] = {}
    for row in range(1, source_sheet.max_row + 1):
        overtime_columns = [
            col
            for col in range(1, source_sheet.max_column + 1)
            if _normalize_label(source_sheet.cell(row, col).value) in _OVERTIME_LABELS
        ]
        if not overtime_columns:
            continue
        code_columns = [
            col
            for col in range(1, source_sheet.max_column + 1)
            if _normalize_label(source_sheet.cell(row, col).value) in {"ma", "mÃ£"}
        ]
        if not code_columns:
            continue
        code_col = code_columns[0]
        for candidate_row in range(row + 1, min(source_sheet.max_row, row + 24) + 1):
            code = _normalize_employee_code(values_sheet.cell(candidate_row, code_col).value)
            if not code or code not in records:
                continue
            for overtime_col in overtime_columns:
                value = _number(values_sheet.cell(candidate_row, overtime_col).value)
                if value is not None:
                    result.setdefault(code, value)
                    break
    return result


def _number(value: object) -> int | float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        if not math.isfinite(float(value)):
            return None
        return int(value) if float(value).is_integer() else float(value)
    text = str(value).strip().replace(" ", "")
    if not text or text in {"-", "?"}:
        return None
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".") if text.rfind(",") > text.rfind(".") else text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        number = float(text)
    except ValueError:
        return None
    return int(number) if number.is_integer() else number
