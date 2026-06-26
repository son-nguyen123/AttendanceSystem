import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.services.history_store import (
    delete_period,
    get_period_detail,
    get_period_file,
    get_latest_period_snapshot,
    list_known_employee_codes,
    list_periods,
    save_session_to_history,
    search_employee_history,
)


router = APIRouter(prefix="/history", tags=["history"])

STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"


class SaveHistoryRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    month: int | None = Field(default=None, ge=1, le=12)
    year: int | None = Field(default=None, ge=2000, le=2100)
    label: str = ""
    review_overrides: list[dict[str, Any]] = Field(default_factory=list)


@router.get("/periods")
def get_periods(
    employee_code: str | None = Query(default=None),
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
) -> dict[str, Any]:
    return {"periods": list_periods(employee_code=employee_code, month=month, year=year)}


@router.get("/employee-codes")
def get_employee_codes() -> dict[str, Any]:
    return {"employee_codes": list_known_employee_codes()}


@router.get("/latest-period")
def get_latest_period() -> dict[str, Any]:
    return get_latest_period_snapshot()


@router.post("/save")
def save_history(request: SaveHistoryRequest) -> dict[str, Any]:
    source_path = _find_session_source(request.session_id)
    try:
        detail = save_session_to_history(
            source_path=source_path,
            source_filename=_read_source_filename(request.session_id),
            month=request.month,
            year=request.year,
            label=request.label,
            review_overrides=request.review_overrides,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không lưu được lịch sử: {exc}") from exc
    return detail


@router.get("/periods/{period_id}")
def get_history_detail(period_id: str) -> dict[str, Any]:
    try:
        return get_period_detail(period_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy kỳ chấm công") from exc


@router.delete("/periods/{period_id}")
def delete_history_period(period_id: str) -> dict[str, str]:
    try:
        delete_period(period_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy kỳ chấm công") from exc
    return {"status": "ok", "period_id": period_id}


@router.get("/search")
def search_history(
    employee_code: str = Query(..., min_length=1),
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
) -> dict[str, Any]:
    return {"results": search_employee_history(employee_code=employee_code, month=month, year=year)}


@router.get("/periods/{period_id}/download/{kind}")
def download_history_file(period_id: str, kind: str) -> FileResponse:
    try:
        path = get_period_file(period_id, kind)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy kỳ chấm công") from exc
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    filename_by_kind = {
        "original": path.name,
        "output1": "attendance_output.xlsx",
        "output2": "payroll_private_output.xlsx",
    }
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename_by_kind.get(kind, path.name),
    )


def _find_session_source(session_id: str) -> Path:
    session_dir = STORAGE_DIR / session_id
    originals = list(session_dir.glob("original.xlsx")) + list(session_dir.glob("original.xlsm"))
    if not originals:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên xử lý")
    return originals[0]


def _read_source_filename(session_id: str) -> str:
    session_dir = STORAGE_DIR / session_id
    metadata_path = session_dir / "metadata.json"
    if metadata_path.exists():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            filename = str(metadata.get("filename") or "").strip()
            if filename:
                return filename
        except json.JSONDecodeError:
            pass

    source_path = _find_session_source(session_id)
    return source_path.name
