"""Small compatibility helpers for legacy BIFF8 ``.xls`` uploads.

The application works with ``openpyxl`` internally, while a number of older
workbooks are still distributed as ``.xls``.  Convert those files once at the
upload boundary so the rest of the workbook code can keep one implementation.
"""

from __future__ import annotations

from pathlib import Path

import xlrd
from openpyxl import Workbook


SUPPORTED_EXCEL_SUFFIXES = {".xls", ".xlsx", ".xlsm"}


def is_supported_excel_suffix(suffix: str) -> bool:
    return str(suffix or "").lower() in SUPPORTED_EXCEL_SUFFIXES


def prepare_excel_for_openpyxl(source_path: Path, target_dir: Path | None = None) -> Path:
    """Return an ``openpyxl``-readable path for an uploaded workbook.

    ``.xlsx`` and ``.xlsm`` are returned unchanged.  A legacy ``.xls`` file
    is copied as values into a temporary ``.xlsx`` beside the upload.
    """

    if source_path.suffix.lower() != ".xls":
        return source_path
    destination_dir = target_dir or source_path.parent
    destination_dir.mkdir(parents=True, exist_ok=True)
    target_path = destination_dir / f"{source_path.stem}_converted.xlsx"
    convert_xls_to_xlsx(source_path, target_path)
    return target_path


def convert_xls_to_xlsx(source_path: Path, output_path: Path) -> None:
    """Convert values from BIFF8 ``.xls`` while dropping style-only tail rows."""

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
    title = "".join(char for char in str(value or "Sheet") if char not in "[]:*?/\\")[:31]
    return title or f"Sheet{index + 1}"
