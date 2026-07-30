from pathlib import Path
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.api.auth_dependencies import require_owner
from app.services.factory2_workbook import export_factory2_output2, preview_factory2_payroll
from app.services.payroll_store import (
    PayrollEntry,
    list_payroll_employees,
    load_payroll_data,
    normalize_employee_code,
    normalize_payroll_entry,
    save_payroll_entry,
)
from app.services.payroll_workbook import export_payroll_workbook, preview_payroll


router = APIRouter(prefix="/payroll", tags=["payroll"])

STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"


class PayrollSaveRequest(BaseModel):
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


@router.get("/employees")
def get_payroll_employees(
    session_id: str | None = Query(default=None),
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    if not session_id:
        return {"employees": list_payroll_employees(), "payroll_data": load_payroll_data()}

    source_path = _find_session_source(session_id)
    if _session_factory(session_id) == "factory2":
        return preview_factory2_payroll(source_path)
    return preview_payroll(source_path)


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
    save_payroll_entry(employee_code, normalized_entry)
    return {"status": "ok", "employee_code": employee_code, "entry": normalized_entry.model_dump()}


@router.post("/preview")
def preview_payroll_output(request: PayrollSessionRequest, user: dict = Depends(require_owner)) -> dict[str, Any]:
    source_path = _find_session_source(request.session_id)
    if _session_factory(request.session_id) == "factory2":
        return preview_factory2_payroll(source_path)
    return preview_payroll(source_path)


@router.post("/export-output-2")
def export_output_2(request: PayrollExportRequest, user: dict = Depends(require_owner)) -> FileResponse:
    source_path = _find_session_source(request.session_id)
    output_path = source_path.parent / "payroll_private_output.xlsx"
    review_overrides = [item.model_dump(include=item.model_fields_set) for item in request.review_overrides]
    if _session_factory(request.session_id) == "factory2":
        export_factory2_output2(
            source_path,
            output_path,
            review_overrides=review_overrides,
            include_saved_data=request.include_saved_data,
        )
    else:
        export_payroll_workbook(
            source_path,
            output_path,
            review_overrides=review_overrides,
            include_saved_data=request.include_saved_data,
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
