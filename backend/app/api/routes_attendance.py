import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.services.workbook_processor import analyze_workbook, export_processed_workbook


router = APIRouter(tags=["attendance"])

STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class AttendanceReviewOverride(BaseModel):
    employee_code: str
    day: int = Field(..., ge=1, le=31)
    missing_count: int | str | None = None
    late_minutes: int | None = None
    work_value: int | float | str | None = None


class AttendanceExportRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    review_overrides: list[AttendanceReviewOverride] = Field(default_factory=list)


@router.post("/attendance/analyze")
async def analyze_attendance(file: UploadFile = File(...)) -> dict:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .xlsx hoặc .xlsm")

    session_id = uuid4().hex
    session_dir = STORAGE_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    original_path = session_dir / f"original{suffix}"
    original_path.write_bytes(await file.read())
    (session_dir / "metadata.json").write_text(
        json.dumps({"filename": file.filename}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    try:
        result = analyze_workbook(original_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không đọc được file Excel: {exc}") from exc

    result["session_id"] = session_id
    result["filename"] = file.filename
    return result


@router.get("/attendance/export/{session_id}")
def export_attendance(session_id: str) -> FileResponse:
    session_dir = STORAGE_DIR / session_id
    originals = list(session_dir.glob("original.xlsx")) + list(session_dir.glob("original.xlsm"))
    if not originals:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên xử lý")

    output_path = session_dir / "attendance_processed.xlsx"
    try:
        export_processed_workbook(originals[0], output_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không xuất được file Excel: {exc}") from exc

    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="attendance_processed.xlsx",
    )


@router.post("/attendance/export")
def export_attendance_with_overrides(request: AttendanceExportRequest) -> FileResponse:
    session_dir = STORAGE_DIR / request.session_id
    originals = list(session_dir.glob("original.xlsx")) + list(session_dir.glob("original.xlsm"))
    if not originals:
        raise HTTPException(status_code=404, detail="KhÃ´ng tÃ¬m tháº¥y phiÃªn xá»­ lÃ½")

    output_path = session_dir / "attendance_processed.xlsx"
    try:
        export_processed_workbook(
            originals[0],
            output_path,
            review_overrides=[item.model_dump(include=item.model_fields_set) for item in request.review_overrides],
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"KhÃ´ng xuáº¥t Ä‘Æ°á»£c file Excel: {exc}") from exc

    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="attendance_processed.xlsx",
    )
