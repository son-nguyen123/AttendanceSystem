from pathlib import Path
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.api.auth_dependencies import require_owner
from app.services.factory2_workbook import export_factory2_output2, preview_factory2_payroll
from app.services.owner_profile_sync import sync_latest_final_copy_profile
from app.services.payroll_store import (
    PayrollEntry,
    list_payroll_employees,
    load_payroll_data,
    count_manual_profile_changes,
    normalize_employee_code,
    normalize_payroll_entry,
    save_payroll_entry,
)
from app.services.payroll_workbook import export_payroll_workbook, preview_payroll
from app.services.session_overrides import merge_session_overrides


router = APIRouter(prefix="/payroll", tags=["payroll"])

STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"


class PayrollSaveRequest(BaseModel):
    factory: str = "factory1"
    employee_code: str
    name: str = ""
    start_work_note: str = ""
    monthly_salary: float | None = None
    daily_salary: float | None = None
    hourly_salary: float | None = None
    standard_work_days: float = 26
    bonus: float = 0
    advance_or_penalty: float = 0
    note: str = ""


class PayrollSessionRequest(BaseModel):
    session_id: str = Field(..., min_length=1)


class PayrollReviewOverride(BaseModel):
    employee_code: str
    day: int = Field(..., ge=1, le=31)
    missing_count: int | str | None = None
    late_minutes: int | None = None
    work_value: int | float | str | None = None


class PayrollExportRequest(PayrollSessionRequest):
    review_overrides: list[PayrollReviewOverride] = Field(default_factory=list)
    include_saved_data: bool = True


@router.get("/profile-sync-status")
def get_profile_sync_status(
    factory: str = Query(default="factory1"),
    user: dict = Depends(require_owner),
) -> dict[str, int]:
    return {"manual_profile_count": count_manual_profile_changes(factory)}


@router.get("/employees")
def get_payroll_employees(
    session_id: str | None = Query(default=None),
    factory: str = Query(default="factory1"),
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    if not session_id:
        return {
            "employees": list_payroll_employees(factory),
            "payroll_data": load_payroll_data(factory),
        }

    source_path = _find_session_source(session_id)
    session_factory = _session_factory(session_id)
    profile_sync = _sync_latest_final_copy_profile(source_path, session_factory)
    profile_codes = _profile_codes_from_sync(profile_sync)
    review_overrides = merge_session_overrides(source_path.parent)
    if session_factory == "factory2":
        return preview_factory2_payroll(
            source_path, review_overrides=review_overrides, profile_codes=profile_codes, factory=session_factory,
        )
    return preview_payroll(source_path, review_overrides=review_overrides, profile_codes=profile_codes, factory=session_factory)


@router.post("/save")
def save_payroll(request: PayrollSaveRequest, user: dict = Depends(require_owner)) -> dict[str, Any]:
    employee_code = normalize_employee_code(request.employee_code)
    if not employee_code:
        raise HTTPException(status_code=400, detail="Mã nhân viên không được để trống")

    entry = PayrollEntry(
        name=request.name.strip(),
        start_work_note=request.start_work_note.strip(),
        monthly_salary=request.monthly_salary,
        daily_salary=request.daily_salary,
        hourly_salary=request.hourly_salary,
        standard_work_days=request.standard_work_days,
        bonus=request.bonus,
        advance_or_penalty=request.advance_or_penalty,
        note=request.note.strip(),
    )
    normalized_entry = normalize_payroll_entry(entry)
    save_payroll_entry(employee_code, normalized_entry, request.factory)
    return {"status": "ok", "employee_code": employee_code, "entry": normalized_entry.model_dump()}


@router.post("/preview")
def preview_payroll_output(request: PayrollSessionRequest, user: dict = Depends(require_owner)) -> dict[str, Any]:
    source_path = _find_session_source(request.session_id)
    factory = _session_factory(request.session_id)
    profile_sync = _sync_latest_final_copy_profile(source_path, factory)
    profile_codes = _profile_codes_from_sync(profile_sync)
    review_overrides = merge_session_overrides(source_path.parent)
    if factory == "factory2":
        return preview_factory2_payroll(source_path, review_overrides=review_overrides, profile_codes=profile_codes, factory=factory)
    return preview_payroll(source_path, review_overrides=review_overrides, profile_codes=profile_codes, factory=factory)


@router.post("/export-output-2")
def export_output_2(request: PayrollExportRequest, user: dict = Depends(require_owner)) -> FileResponse:
    source_path = _find_session_source(request.session_id)
    factory = _session_factory(request.session_id)
    profile_sync = _sync_latest_final_copy_profile(source_path, factory)
    profile_codes = _profile_codes_from_sync(profile_sync)
    output_path = source_path.parent / "payroll_private_output.xlsx"
    review_overrides = merge_session_overrides(
        source_path.parent,
        [item.model_dump(include=item.model_fields_set) for item in request.review_overrides],
    )
    if factory == "factory2":
        export_factory2_output2(
            source_path,
            output_path,
            review_overrides=review_overrides,
            include_saved_data=request.include_saved_data,
            profile_codes=profile_codes,
            factory=factory,
        )
    else:
        export_payroll_workbook(
            source_path,
            output_path,
            review_overrides=review_overrides,
            include_saved_data=request.include_saved_data,
            profile_codes=profile_codes,
            factory=factory,
        )
    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="Output2.xlsx",
    )


def _find_session_source(session_id: str) -> Path:
    session_dir = STORAGE_DIR / session_id
    originals = list(session_dir.glob("original.xlsx")) + list(session_dir.glob("original.xlsm"))
    if not originals:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên xử lý")
    return originals[0]


def _session_factory(session_id: str) -> str:
    metadata_path = STORAGE_DIR / session_id / "metadata.json"
    if not metadata_path.exists():
        return "factory1"
    try:
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception:
        return "factory1"
    return str(data.get("factory") or "factory1")


def _sync_latest_final_copy_profile(source_path: Path, factory: str) -> dict[str, Any]:
    return sync_latest_final_copy_profile(source_path, factory)


def _profile_codes_from_sync(profile_sync: dict[str, Any]) -> set[str]:
    if profile_sync.get("status") != "ok":
        # Local data is a cache only. If no final copy is available, do not let
        # a stale manual/history value silently re-enter Output 2.
        return set()
    codes = {
        str(code).strip()
        for code in profile_sync.get("profile_codes", [])
        if str(code).strip()
    }
    return codes
