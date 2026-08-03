from __future__ import annotations

import unicodedata
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

from app.services.payroll_store import merge_payroll_profile_updates, normalize_employee_code


SUMMARY_MIN_COL = 32


def sync_owner_profiles_from_workbook(
    path: Path,
    *,
    month: int | None = None,
    year: int | None = None,
    source_kind: str = "workbook",
) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
        return _empty_result(str(path), "file_not_found")

    keep_vba = path.suffix.lower() == ".xlsm"
    workbook = load_workbook(path, data_only=True, keep_vba=keep_vba)
    try:
        updates: dict[str, dict[str, Any]] = {}
        for worksheet in workbook.worksheets:
            updates.update(_extract_profiles_from_sheet(worksheet))

        result = merge_payroll_profile_updates(
            updates,
            source_month=month,
            source_year=year,
            source_kind=source_kind,
            source_name=path.name,
        )
        result.update(
            {
                "status": "ok",
                "source_path": str(path),
                "source_month": month,
                "source_year": year,
                "source_kind": source_kind,
                "profile_count": len(updates),
                "profile_codes": sorted(updates),
                "fields": ["name", "start_work_note", "monthly_salary", "daily_salary", "hourly_salary"],
            }
        )
        return result
    finally:
        workbook.close()


def _extract_profiles_from_sheet(ws) -> dict[str, dict[str, Any]]:
    profiles: dict[str, dict[str, Any]] = {}
    for header_row in range(1, ws.max_row + 1):
        total_col = _find_label_col(ws, header_row, SUMMARY_MIN_COL, ws.max_column, {"tong gio cong"})
        if not total_col:
            continue
        code_col = _find_label_col(ws, header_row, total_col + 1, min(total_col + 4, ws.max_column), {"ma"})
        if not code_col:
            continue

        result_row = header_row + 5
        note_row = header_row + 6
        code = _employee_code(ws.cell(result_row, code_col).value)
        if not code:
            continue

        name_col = code_col + 1
        salary_cols = _salary_columns(ws, header_row, name_col + 1)
        profile = {
            "name": _text(ws.cell(result_row, name_col).value),
            "start_work_note": _clean_start_note(ws.cell(note_row, name_col).value),
        }
        for key, col in salary_cols.items():
            profile[key] = _number(ws.cell(result_row, col).value)

        if any(value not in (None, "") for value in profile.values()):
            profiles[code] = profile
    return profiles


def _salary_columns(ws, header_row: int, start_col: int) -> dict[str, int]:
    columns: dict[str, int] = {}
    for col in range(start_col, ws.max_column + 1):
        label = _normalize_label(ws.cell(header_row, col).value)
        if label == "muc luong":
            columns["monthly_salary"] = col
        elif label == "luong 1 ngay cong":
            columns["daily_salary"] = col
        elif label == "luong 1 gio cong":
            columns["hourly_salary"] = col
    return columns


def _find_label_col(ws, row: int, start_col: int, end_col: int, labels: set[str]) -> int | None:
    for col in range(start_col, end_col + 1):
        if _normalize_label(ws.cell(row, col).value) in labels:
            return col
    return None


def _normalize_label(value: object) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return " ".join(text.split())


def _text(value: object) -> str:
    return str(value or "").strip()


def _employee_code(value: object) -> str:
    if isinstance(value, bool):
        return ""
    if isinstance(value, (int, float)) and float(value).is_integer():
        return str(int(value))
    return normalize_employee_code(value)


def _clean_start_note(value: object) -> str:
    text = _text(value)
    lower = _normalize_label(text)
    if lower.startswith("bat dau lam "):
        return text.split(" ", maxsplit=3)[-1].strip()
    return text


def _number(value: object) -> float | None:
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


def _empty_result(source_path: str, reason: str) -> dict[str, Any]:
    return {
        "status": "skipped",
        "reason": reason,
        "source_path": source_path,
        "profile_count": 0,
        "updated_count": 0,
        "skipped_count": 0,
        "updated_codes": [],
        "skipped_codes": [],
        "conflict_count": 0,
        "conflict_codes": [],
        "fields": [],
    }
