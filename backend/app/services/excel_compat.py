from __future__ import annotations

from pathlib import Path

import xlrd
from openpyxl import Workbook


EXCEL_UPLOAD_SUFFIXES = {".xls", ".xlsx", ".xlsm"}


def ensure_openpyxl_workbook(source_path: Path, output_path: Path | None = None) -> Path:
    if source_path.suffix.lower() != ".xls":
        return source_path
    target = output_path or source_path.with_suffix(".xlsx")
    convert_xls_to_xlsx(source_path, target)
    return target


def convert_xls_to_xlsx(source_path: Path, output_path: Path) -> None:
    """Convert meaningful BIFF values to an OOXML workbook."""
    book = xlrd.open_workbook(str(source_path), formatting_info=False)
    workbook = Workbook()
    workbook.remove(workbook.active)
    for sheet_index, sheet_name in enumerate(book.sheet_names()):
        source_sheet = book.sheet_by_index(sheet_index)
        target = workbook.create_sheet(_safe_sheet_title(sheet_name, sheet_index))
        last_row = source_sheet.nrows
        while last_row > 0 and not any(value not in (None, "") for value in source_sheet.row_values(last_row - 1)):
            last_row -= 1
        for row_index in range(last_row):
            for col_index, raw_value in enumerate(source_sheet.row_values(row_index)):
                if raw_value in (None, ""):
                    continue
                cell = source_sheet.cell(row_index, col_index)
                value = cell.value
                if cell.ctype == xlrd.XL_CELL_DATE:
                    value = xlrd.xldate_as_datetime(value, book.datemode)
                elif cell.ctype in {xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK, xlrd.XL_CELL_ERROR}:
                    value = None
                if value not in (None, ""):
                    target.cell(row=row_index + 1, column=col_index + 1).value = value
    output_path.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(output_path)


def _safe_sheet_title(value: str, index: int) -> str:
    return "".join(char for char in str(value or "Sheet") if char not in "[]:*?/\\")[:31] or f"Sheet{index + 1}"
