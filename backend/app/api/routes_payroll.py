from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.services.payroll_store import PayrollEntry, load_payroll_data, save_payroll_entry
from app.services.payroll_workbook import export_payroll_workbook, preview_payroll


router = APIRouter(prefix="/payroll", tags=["payroll"])

STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"


class PayrollSaveRequest(BaseModel):
    employee_code: str
    name: str = ""
    monthly_salary: float | None = None
    daily_salary: float | None = None
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


@router.get("/employees")
def get_payroll_employees(session_id: str | None = Query(default=None)) -> dict[str, Any]:
    if not session_id:
        return {"employees": [], "payroll_data": load_payroll_data()}

    source_path = _find_session_source(session_id)
    return preview_payroll(source_path)


@router.post("/save")
def save_payroll(request: PayrollSaveRequest) -> dict[str, Any]:
    entry = PayrollEntry(
        name=request.name.strip(),
        monthly_salary=request.monthly_salary,
        daily_salary=request.daily_salary,
        standard_work_days=request.standard_work_days,
        bonus=request.bonus,
        advance_or_penalty=request.advance_or_penalty,
        note=request.note.strip(),
    )
    save_payroll_entry(request.employee_code.strip(), entry)
    return {"status": "ok", "employee_code": request.employee_code.strip(), "entry": entry.model_dump()}


@router.post("/preview")
def preview_payroll_output(request: PayrollSessionRequest) -> dict[str, Any]:
    source_path = _find_session_source(request.session_id)
    return preview_payroll(source_path)


@router.post("/export-output-2")
def export_output_2(request: PayrollExportRequest) -> FileResponse:
    source_path = _find_session_source(request.session_id)
    output_path = source_path.parent / "payroll_private_output.xlsx"
    export_payroll_workbook(
        source_path,
        output_path,
        review_overrides=[item.model_dump(include=item.model_fields_set) for item in request.review_overrides],
    )
    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="payroll_private_output.xlsx",
    )


def _find_session_source(session_id: str) -> Path:
    session_dir = STORAGE_DIR / session_id
    originals = list(session_dir.glob("original.xlsx")) + list(session_dir.glob("original.xlsm"))
    if not originals:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên xử lý")
    return originals[0]
