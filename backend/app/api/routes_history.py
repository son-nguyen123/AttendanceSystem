import json
from pathlib import Path
import hashlib
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.api.auth_dependencies import require_owner, require_staff_or_owner
from app.services.cloud_sync import (
    backup_enabled,
    delete_drive_final_copy,
    delete_drive_machine_backup,
    delete_drive_month,
    delete_period_from_cloud,
    list_drive_final_copies,
    record_backup_error,
    record_sync_error,
    resolve_drive_final_copy,
    run_drive_backup,
    run_period_excel_backup,
    sync_enabled,
    sync_period_detail,
)
from app.services.final_copy_export import export_final_copy_output1
from app.services.employee_cards import export_employee_screenshots_from_workbook
from app.services.factory2_workbook import write_factory2_standard_source
from app.services.history_store import (
    delete_period,
    get_attendance_overview,
    get_period_detail,
    get_period_file,
    get_latest_period_snapshot,
    get_review_memory,
    list_known_employee_codes,
    list_periods,
    save_session_to_history,
    search_employee_history,
    update_employee_monthly_record,
)
from app.services.session_overrides import merge_session_overrides


router = APIRouter(prefix="/history", tags=["history"])

STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"


class SaveHistoryRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    month: int | None = Field(default=None, ge=1, le=12)
    year: int | None = Field(default=None, ge=2000, le=2100)
    label: str = ""
    review_overrides: list[dict[str, Any]] = Field(default_factory=list)


class HistoryDailyUpdateRequest(BaseModel):
    day: int = Field(..., ge=1, le=31)
    work_value: int | float | str | None = None
    missing_count: int | str | None = None
    late_minutes: int | None = None
    review_notes: list[str] = Field(default_factory=list)


class HistoryEmployeeUpdateRequest(BaseModel):
    employee_name: str = ""
    total_hours: float = 0
    work_days: float = 0
    monthly_salary: float | None = None
    daily_salary: float = 0
    hourly_salary: float = 0
    standard_work_days: float = 26
    bonus: float = 0
    advance_or_penalty: float = 0
    final_salary: float = 0
    note: str = ""
    daily_records: list[HistoryDailyUpdateRequest] = Field(default_factory=list)


@router.get("/periods")
def get_periods(
    employee_code: str | None = Query(default=None),
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    factory: str | None = Query(default=None),
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    return {"periods": list_periods(employee_code=employee_code, month=month, year=year, factory=factory)}


@router.get("/final-copies")
def get_final_copies(
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    factory: str | None = Query(default=None),
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    return {"final_copies": list_drive_final_copies(month=month, year=year, factory=factory)}


@router.delete("/final-copies/{copy_id}")
def delete_history_final_copy(copy_id: str, user: dict = Depends(require_owner)) -> dict[str, Any]:
    try:
        return delete_drive_final_copy(copy_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"Khong xoa duoc ban sao cuoi cung: {exc}") from exc


@router.get("/employee-codes")
def get_employee_codes(factory: str | None = Query(default=None), user: dict = Depends(require_staff_or_owner)) -> dict[str, Any]:
    return {"employee_codes": list_known_employee_codes(factory=factory)}


@router.get("/latest-period")
def get_latest_period(factory: str | None = Query(default=None), user: dict = Depends(require_staff_or_owner)) -> dict[str, Any]:
    return get_latest_period_snapshot(factory=factory)


@router.get("/review-memory")
def get_review_memory_route(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    factory: str | None = Query(default=None),
    user: dict = Depends(require_staff_or_owner),
) -> dict[str, Any]:
    return get_review_memory(month, year, factory=factory)


@router.get("/attendance-overview")
def get_attendance_overview_route(
    year: int | None = Query(default=None, ge=2000, le=2100),
    factory: str | None = Query(default=None),
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    return get_attendance_overview(year, factory=factory)


@router.post("/save")
def save_history(request: SaveHistoryRequest, user: dict = Depends(require_owner)) -> dict[str, Any]:
    factory = _session_factory(request.session_id)
    source_path = _find_session_source(request.session_id)
    source_path = _history_source_for_session(request.session_id, source_path)
    try:
        detail = save_session_to_history(
            source_path=source_path,
            source_filename=_read_source_filename(request.session_id),
            month=request.month,
            year=request.year,
            label=request.label,
            review_overrides=merge_session_overrides(
                STORAGE_DIR / request.session_id,
                request.review_overrides,
            ),
            factory=factory,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không lưu được lịch sử: {exc}") from exc
    detail["cloud_sync"] = _try_sync_period(detail)
    detail["drive_backup"] = _try_period_drive_backup(detail, "save_history")
    return detail


@router.get("/periods/{period_id}")
def get_history_detail(period_id: str, user: dict = Depends(require_owner)) -> dict[str, Any]:
    try:
        return get_period_detail(period_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy kỳ chấm công") from exc


@router.patch("/periods/{period_id}/employees/{employee_code}")
def update_history_employee(
    period_id: str,
    employee_code: str,
    request: HistoryEmployeeUpdateRequest,
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    try:
        detail = update_employee_monthly_record(period_id, employee_code, request.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="KhÃ´ng tÃ¬m tháº¥y nhÃ¢n viÃªn trong ká»³") from exc


    detail["cloud_sync"] = _try_sync_period(detail)
    detail["drive_backup"] = _try_period_drive_backup(detail, "update_history")
    return detail


@router.delete("/periods/{period_id}")
def delete_history_period(
    period_id: str,
    delete_cloud: bool = Query(default=False),
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    try:
        period_detail = get_period_detail(period_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Khong tim thay ky cham cong") from exc

    cloud_result: dict[str, Any] | None = None
    if delete_cloud:
        try:
            cloud_result = delete_period_from_cloud(period_id)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Khong xoa duoc tren cloud: {exc}") from exc

    try:
        drive_result = delete_drive_machine_backup(
            month=int(period_detail["period"].get("month") or 0),
            year=int(period_detail["period"].get("year") or 0),
            factory=str(period_detail["period"].get("factory") or "factory1"),
        )
    except Exception as exc:
        drive_result = {"status": "error", "error_count": 1, "errors": [{"error": str(exc)}]}

    try:
        delete_period(period_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy kỳ chấm công") from exc
    return {
        "status": "ok" if drive_result.get("status") == "ok" else "partial",
        "period_id": period_id,
        "cloud_sync": cloud_result,
        "drive": drive_result,
        "drive_backup": _try_drive_backup("delete_history"),
    }


@router.delete("/months/{year}/{month}")
def delete_history_month(
    year: int,
    month: int,
    factory: str = Query(default="factory1"),
    delete_cloud: bool = Query(default=False),
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    normalized_factory = "factory2" if factory == "factory2" else "factory1"
    periods = list_periods(month=month, year=year, factory=normalized_factory)
    period_ids = [str(period["id"]) for period in periods]

    cloud_results: list[dict[str, Any]] = []
    if delete_cloud:
        for period_id in period_ids:
            try:
                cloud_results.append(delete_period_from_cloud(period_id))
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Khong xoa duoc ky {period_id} tren Supabase: {exc}") from exc

    try:
        drive_result = delete_drive_month(month=month, year=year, factory=normalized_factory)
    except Exception as exc:
        # Drive is an external, optionally offline copy.  Do not let a
        # Google Drive permission/sync problem block deletion of the local
        # attendance history requested by the user.
        drive_result = {
            "status": "error",
            "error_count": 1,
            "errors": [{"error": str(exc)}],
        }

    for period_id in period_ids:
        delete_period(period_id)

    return {
        "status": "ok" if drive_result.get("status") == "ok" else "partial",
        "factory": normalized_factory,
        "month": month,
        "year": year,
        "deleted_period_ids": period_ids,
        "deleted_local_count": len(period_ids),
        "cloud_sync": cloud_results,
        "drive": drive_result,
        "drive_backup": _try_drive_backup("delete_history_month"),
    }


@router.get("/search")
def search_history(
    employee_code: str = Query(..., min_length=1),
    month: int | None = Query(default=None, ge=1, le=12),
    year: int | None = Query(default=None, ge=2000, le=2100),
    factory: str | None = Query(default=None),
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    return {"results": search_employee_history(employee_code=employee_code, month=month, year=year, factory=factory)}


@router.get("/periods/{period_id}/download/{kind}")
def download_history_file(period_id: str, kind: str, user: dict = Depends(require_owner)) -> FileResponse:
    try:
        path = get_period_file(period_id, kind)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy kỳ chấm công") from exc
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    filename_by_kind = {
        "original": path.name,
        "output1": "Output1.xlsx",
        "output2": "Output2.xlsx",
    }
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename_by_kind.get(kind, path.name),
    )


@router.get("/periods/{period_id}/employee-images/{kind}")
def download_history_employee_images(period_id: str, kind: str, user: dict = Depends(require_owner)) -> FileResponse:
    if kind not in {"output1", "output2"}:
        raise HTTPException(status_code=400, detail="Loại ảnh bảng công không hợp lệ")
    try:
        source_path = get_period_file(period_id, kind)
        detail = get_period_detail(period_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy kỳ chấm công") from exc
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    output_dir = STORAGE_DIR / "exports" / "history_employee_images"
    output_path = output_dir / f"{period_id}_{kind}.zip"
    try:
        if not _is_fresh_export(output_path, source_path):
            export_employee_screenshots_from_workbook(source_path, output_path, kind)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không xuất được ảnh bảng công từ lịch sử: {exc}") from exc

    period = detail.get("period") or {}
    factory_label = "Xuong2" if period.get("factory") == "factory2" else "Xuong1"
    month = int(period.get("month") or 0)
    year = int(period.get("year") or 0)
    return FileResponse(
        output_path,
        media_type="application/zip",
        filename=f"{factory_label}_{year}-{month:02d}_AnhBangCongNhanVien_{kind}.zip",
    )


@router.get("/final-copies/{copy_id}/download/{kind}")
def download_final_copy_file(copy_id: str, kind: str, user: dict = Depends(require_owner)) -> FileResponse:
    if kind not in {"output1", "output2"}:
        raise HTTPException(status_code=400, detail="Loại file không hợp lệ")
    try:
        source_path = resolve_drive_final_copy(copy_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if kind == "output2":
        return FileResponse(
            source_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=f"Output2{source_path.suffix}",
        )

    output_dir = STORAGE_DIR / "exports" / "final_copies"
    output_path = output_dir / f"{copy_id[:16]}_output1.xlsx"
    try:
        export_final_copy_output1(source_path, output_path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không tạo được Output 1 từ bản sao cuối cùng: {exc}") from exc
    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="Output1.xlsx",
    )


@router.get("/final-copies/{copy_id}/employee-images")
def download_final_copy_employee_images(copy_id: str, user: dict = Depends(require_owner)) -> FileResponse:
    return _download_final_copy_employee_images(copy_id, "output2")


@router.get("/final-copies/{copy_id}/employee-images/{kind}")
def download_final_copy_employee_images_kind(copy_id: str, kind: str, user: dict = Depends(require_owner)) -> FileResponse:
    if kind not in {"output1", "output2"}:
        raise HTTPException(status_code=400, detail="Loại ảnh bảng công không hợp lệ")
    return _download_final_copy_employee_images(copy_id, kind)


def _download_final_copy_employee_images(copy_id: str, kind: str) -> FileResponse:
    try:
        source_path = resolve_drive_final_copy(copy_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    output_dir = STORAGE_DIR / "exports" / "history_employee_images"
    safe_id = hashlib.sha256(copy_id.encode("utf-8")).hexdigest()[:20]
    capture_source = source_path
    if kind == "output1":
        capture_source = STORAGE_DIR / "exports" / "final_copies" / f"{safe_id}_output1.xlsx"
        try:
            if not _is_fresh_export(capture_source, source_path):
                export_final_copy_output1(source_path, capture_source)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Không tạo được Output 1 từ bản sao cuối cùng: {exc}") from exc
    output_path = output_dir / f"final_{safe_id}_{kind}.zip"
    try:
        if not _is_fresh_export(output_path, capture_source):
            export_employee_screenshots_from_workbook(capture_source, output_path, kind)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không xuất được ảnh bảng công từ bản sao cuối cùng: {exc}") from exc
    return FileResponse(
        output_path,
        media_type="application/zip",
        filename=f"AnhBangCongNhanVien_{kind}_{source_path.stem}.zip",
    )


def _is_fresh_export(output_path: Path, source_path: Path) -> bool:
    try:
        return output_path.stat().st_size > 0 and output_path.stat().st_mtime_ns >= source_path.stat().st_mtime_ns
    except FileNotFoundError:
        return False


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


def _history_source_for_session(session_id: str, source_path: Path) -> Path:
    if _session_factory(session_id) != "factory2":
        return source_path
    output_path = STORAGE_DIR / session_id / "history_standard_source.xlsx"
    write_factory2_standard_source(source_path, output_path)
    return output_path


def _session_factory(session_id: str) -> str:
    metadata_path = STORAGE_DIR / session_id / "metadata.json"
    if not metadata_path.exists():
        return "factory1"
    try:
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception:
        return "factory1"
    return str(data.get("factory") or "factory1")


def _try_sync_period(detail: dict[str, Any]) -> dict[str, Any] | None:
    if not sync_enabled():
        return None
    try:
        return sync_period_detail(detail)
    except Exception as exc:
        record_sync_error(exc)
        return {"status": "error", "error": str(exc)}


def _try_drive_backup(reason: str) -> dict[str, Any] | None:
    if not backup_enabled():
        return None
    try:
        return run_drive_backup(reason=reason)
    except Exception as exc:
        record_backup_error(exc)
        return {"status": "error", "error": str(exc)}


def _try_period_drive_backup(detail: dict[str, Any], reason: str) -> dict[str, Any] | None:
    if not backup_enabled():
        return None
    try:
        return run_period_excel_backup(detail, reason=reason)
    except Exception as exc:
        record_backup_error(exc)
        return {"status": "error", "error": str(exc)}
