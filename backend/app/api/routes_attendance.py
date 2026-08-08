import asyncio
import json
import shutil
from threading import Lock
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field

from app.api.auth_dependencies import ROLE_LOGIN_ENABLED, LOCAL_OWNER_USER, require_staff_or_owner
from app.services.cloud_sync import submit_attendance_to_owner
from app.services.data_mapper import inspect_bank_accounts_for_mapping, map_owner_data_to_current_workbook
from app.services.bank_payroll import backup_registry_to_drive
from app.services.bank_payroll import save_accounts
from app.services.auth_service import AuthError, get_user_by_token
from app.services.employee_cards import export_employee_cards_zip
from app.services.factory2_workbook import analyze_factory2_workbook, export_factory2_output1, export_factory2_output2, write_factory2_standard_source
from app.services.factory1_workbook import export_factory1_legacy_output2
from app.services.owner_profile_sync import sync_latest_final_copy_profile
from app.services.payroll_workbook import apply_payroll_to_workbook
from app.services.period_detector import detect_period_from_workbook
from app.services.workbook_processor import analyze_workbook, export_processed_workbook
from app.services.workbook_recalculator import recalculate_workbook_totals
from app.services.workbook_normalizer import inspect_workbook_layout, normalize_raw_attendance_workbook
from app.services.workbook_guard import (
    WorkbookRole,
    inspect_workbook_for_role,
    validate_mapping_pair,
)
from app.services.newcomer_benefit import apply_newcomer_first_day_benefits
from app.services.session_overrides import merge_session_overrides, save_automatic_overrides


router = APIRouter(tags=["attendance"])

STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
TEMPORARY_WORKSPACE_PATH = STORAGE_DIR / "temporary_workspace.json"
TEMPORARY_WORKSPACE_DIR = STORAGE_DIR / "temporary_workspaces"
TEMPORARY_WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
PENDING_ANALYSIS_DIR = STORAGE_DIR / "pending_analyses"
PENDING_ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
_CANCELLED_ANALYSES: set[str] = set()
_CANCELLED_ANALYSES_LOCK = Lock()


class AnalysisCancelled(Exception):
    pass


def _mark_analysis_cancelled(request_id: str) -> None:
    if not request_id:
        return
    with _CANCELLED_ANALYSES_LOCK:
        _CANCELLED_ANALYSES.add(request_id)


def _is_analysis_cancelled(request_id: str) -> bool:
    if not request_id:
        return False
    with _CANCELLED_ANALYSES_LOCK:
        return request_id in _CANCELLED_ANALYSES


def _clear_analysis_cancelled(request_id: str) -> None:
    if not request_id:
        return
    with _CANCELLED_ANALYSES_LOCK:
        _CANCELLED_ANALYSES.discard(request_id)


def _raise_if_analysis_cancelled(request_id: str) -> None:
    if _is_analysis_cancelled(request_id):
        raise AnalysisCancelled()


def _pending_analysis_path(resume_token: str) -> Path:
    normalized = resume_token.strip().lower()
    if len(normalized) != 32 or any(character not in "0123456789abcdef" for character in normalized):
        raise HTTPException(status_code=400, detail="Mã tiếp tục phân tích không hợp lệ")
    return PENDING_ANALYSIS_DIR / normalized


def _temporary_workspace_path(factory: str) -> Path:
    return TEMPORARY_WORKSPACE_DIR / f"{factory}.json"


def _temporary_workspace_candidates(factory: str | None = None) -> list[Path]:
    if factory in {"factory1", "factory2"}:
        return [_temporary_workspace_path(factory)]
    return [TEMPORARY_WORKSPACE_PATH, _temporary_workspace_path("factory1"), _temporary_workspace_path("factory2")]


def _delete_workspace_for_session(session_id: str) -> None:
    for workspace_path in _temporary_workspace_candidates():
        if not workspace_path.exists():
            continue
        try:
            workspace = json.loads(workspace_path.read_text(encoding="utf-8"))
        except Exception:
            workspace_path.unlink(missing_ok=True)
            continue
        if str((workspace.get("data") or {}).get("session_id") or "") == session_id:
            workspace_path.unlink(missing_ok=True)


class AttendanceReviewOverride(BaseModel):
    employee_code: str
    day: int = Field(..., ge=1, le=31)
    missing_count: int | str | None = None
    late_minutes: int | None = None
    work_value: int | float | str | None = None


class AttendanceExportRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    review_overrides: list[AttendanceReviewOverride] = Field(default_factory=list)


class EmployeeCardsExportRequest(AttendanceExportRequest):
    kind: Literal["output1", "output2"] = "output1"


class EmployeeCardsPrepareResponse(BaseModel):
    download_url: str
    filename: str


class AttendanceSubmitResponse(BaseModel):
    status: str
    period_id: str
    employees: int
    daily_rows: int


@router.get("/attendance/temporary-workspace")
async def get_temporary_workspace(
    factory: Literal["factory1", "factory2"] = Query("factory1"),
    user: dict = Depends(require_staff_or_owner),
) -> dict:
    workspace_path = _temporary_workspace_path(factory)
    # Read the old single-slot file once for backward compatibility, but only
    # return it when it belongs to the requested factory.
    if not workspace_path.exists() and TEMPORARY_WORKSPACE_PATH.exists():
        workspace_path = TEMPORARY_WORKSPACE_PATH
    if not workspace_path.exists():
        raise HTTPException(status_code=404, detail="Không có phiên tạm")
    try:
        workspace = json.loads(workspace_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Phiên tạm bị lỗi định dạng") from exc

    if str(workspace.get("factory") or (workspace.get("data") or {}).get("factory") or "") != factory:
        raise HTTPException(status_code=404, detail="Không có phiên tạm cho xưởng này")
    session_id = str((workspace.get("data") or {}).get("session_id") or "")
    if not session_id or not (STORAGE_DIR / session_id).exists():
        workspace_path.unlink(missing_ok=True)
        raise HTTPException(status_code=404, detail="Nguồn của phiên tạm không còn tồn tại")
    return workspace


@router.put("/attendance/temporary-workspace")
def save_temporary_workspace(
    workspace: dict,
    user: dict = Depends(require_staff_or_owner),
) -> dict[str, str]:
    data = workspace.get("data") or {}
    session_id = str(data.get("session_id") or "")
    factory = str(workspace.get("factory") or "")
    if len(session_id) != 32 or any(character not in "0123456789abcdef" for character in session_id.lower()):
        raise HTTPException(status_code=400, detail="Mã phiên tạm không hợp lệ")
    if factory not in {"factory1", "factory2"} or factory != str(data.get("factory") or ""):
        raise HTTPException(status_code=400, detail="Xưởng của phiên tạm không khớp")
    if not (STORAGE_DIR / session_id).exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy dữ liệu nguồn của phiên tạm")

    temporary_path = _temporary_workspace_path(factory)
    temporary_path_tmp = temporary_path.with_suffix(".tmp")
    temporary_path_tmp.write_text(json.dumps(workspace, ensure_ascii=False), encoding="utf-8")
    temporary_path_tmp.replace(temporary_path)
    return {"status": "ok"}


@router.delete("/attendance/temporary-workspace")
def delete_temporary_workspace(
    factory: Literal["factory1", "factory2"] = Query("factory1"),
    user: dict = Depends(require_staff_or_owner),
) -> dict[str, str]:
    _temporary_workspace_path(factory).unlink(missing_ok=True)
    if TEMPORARY_WORKSPACE_PATH.exists():
        try:
            legacy = json.loads(TEMPORARY_WORKSPACE_PATH.read_text(encoding="utf-8"))
            legacy_factory = str(legacy.get("factory") or (legacy.get("data") or {}).get("factory") or "")
            if legacy_factory == factory:
                TEMPORARY_WORKSPACE_PATH.unlink(missing_ok=True)
        except Exception:
            TEMPORARY_WORKSPACE_PATH.unlink(missing_ok=True)
    return {"status": "ok"}


@router.post("/attendance/inspect-file")
async def inspect_attendance_file(
    file: UploadFile = File(...),
    role: WorkbookRole = Form(...),
    factory: Literal["factory1", "factory2"] = Form("factory1"),
    user: dict = Depends(require_staff_or_owner),
) -> dict:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .xlsx hoặc .xlsm")

    try:
        with TemporaryDirectory(dir=STORAGE_DIR) as temp_dir:
            uploaded_path = Path(temp_dir) / f"inspect{suffix}"
            uploaded_path.write_bytes(await file.read())
            profile = inspect_workbook_for_role(uploaded_path, role, factory=factory)
            return profile.to_dict()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/attendance/analyze/cancel")
def cancel_attendance_analysis(
    request_id: str = Query(..., min_length=8, max_length=128),
    user: dict = Depends(require_staff_or_owner),
) -> dict[str, str]:
    _mark_analysis_cancelled(request_id)
    return {"status": "cancel_requested"}


@router.post("/attendance/analyze")
async def analyze_attendance(
    file: UploadFile = File(...),
    normalize_raw: bool = Form(False),
    factory: Literal["factory1", "factory2"] = Form("factory1"),
    smart_scan: bool = Form(True),
    newcomer_benefit: bool = Form(True),
    request_id: str = Form(""),
    user: dict = Depends(require_staff_or_owner),
) -> dict:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .xlsx hoặc .xlsm")

    session_id = uuid4().hex
    session_dir = STORAGE_DIR / session_id
    normalized_raw = False
    missing_output1_summary = False
    normalization_summary: dict[str, int] = {}

    staging_manager = TemporaryDirectory(dir=STORAGE_DIR, prefix=f".attendance-analyze-{session_id}-")
    staging_dir = Path(staging_manager.name)
    uploaded_path = staging_dir / f"uploaded{suffix}"
    original_path = staging_dir / f"original{suffix}"

    try:
        # Keep uploads in a staging directory until validation and analysis
        # finish. Failed workbooks must never become restorable sessions.
        uploaded_path.write_bytes(await file.read())
        (staging_dir / "metadata.json").write_text(
            json.dumps({"filename": file.filename, "normalized_raw": False, "factory": factory}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        _raise_if_analysis_cancelled(request_id)

        if smart_scan:
            await asyncio.to_thread(inspect_workbook_for_role, uploaded_path, "analysis", factory=factory)
        _raise_if_analysis_cancelled(request_id)
        if factory == "factory2":
            shutil.copy2(uploaded_path, original_path)
            result = await asyncio.to_thread(analyze_factory2_workbook, original_path)
            _raise_if_analysis_cancelled(request_id)
            summary = result.get("summary") or {}
            if not summary.get("blocks"):
                raise ValueError("Khong tim thay nhan vien co gio cham trong bang Xuong 2")
            source_employee_count = summary.get(
                "source_employee_count",
                summary["blocks"],
            )
            retained_employee_count = summary["blocks"]
            normalization_summary = {
                "raw_employee_count": source_employee_count,
                "retained_employee_count": retained_employee_count,
                "discarded_empty_employee_count": source_employee_count - retained_employee_count,
            }

        if factory != "factory2":
            layout = await asyncio.to_thread(inspect_workbook_layout, uploaded_path)
            _raise_if_analysis_cancelled(request_id)
            if layout.requires_normalization and not normalize_raw:
                pending_dir = _pending_analysis_path(session_id)
                metadata = {
                    "filename": file.filename,
                    "normalized_raw": False,
                    "factory": factory,
                    "layout": {
                        "sheet_name": layout.sheet_name,
                        "raw_employee_count": layout.raw_employee_count,
                        "retained_employee_count": layout.retained_employee_count,
                        "discarded_empty_employee_count": layout.discarded_empty_employee_count,
                        "detected_block_count": layout.detected_block_count,
                        "missing_output1_summary": layout.missing_output1_summary,
                    },
                }
                (staging_dir / "metadata.json").write_text(
                    json.dumps(metadata, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                pending_dir.mkdir(parents=True, exist_ok=False)
                for staged_path in staging_dir.iterdir():
                    shutil.move(str(staged_path), str(pending_dir / staged_path.name))
                staging_manager.cleanup()
                return {
                    "requires_normalization": True,
                    "resume_token": session_id,
                    "message": "File raw tu may cham cong chua co khung nhap phan tich.",
                    "sheet_name": layout.sheet_name,
                    "raw_employee_count": layout.raw_employee_count,
                    "retained_employee_count": layout.retained_employee_count,
                    "discarded_empty_employee_count": layout.discarded_empty_employee_count,
                    "detected_block_count": layout.detected_block_count,
                    "missing_output1_summary": layout.missing_output1_summary,
                }

            if layout.requires_normalization:
                await asyncio.to_thread(normalize_raw_attendance_workbook, uploaded_path, original_path)
                _raise_if_analysis_cancelled(request_id)
                normalized_raw = True
                (staging_dir / "metadata.json").write_text(
                    json.dumps({"filename": file.filename, "normalized_raw": True, "factory": factory}, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            else:
                shutil.copy2(uploaded_path, original_path)

            result = await asyncio.to_thread(analyze_workbook, original_path)
            _raise_if_analysis_cancelled(request_id)
            summary = result.get("summary") or {}
            if not summary.get("blocks"):
                raise ValueError("Khong tim thay dong nhan vien co du lieu cham cong trong file Excel")
            missing_output1_summary = layout.missing_output1_summary
            normalization_summary = {
                "raw_employee_count": layout.raw_employee_count,
                "retained_employee_count": layout.retained_employee_count,
                "discarded_empty_employee_count": layout.discarded_empty_employee_count,
            }

        _raise_if_analysis_cancelled(request_id)
        session_dir.mkdir(parents=True, exist_ok=False)
        for staged_path in staging_dir.iterdir():
            shutil.move(str(staged_path), str(session_dir / staged_path.name))
        staging_manager.cleanup()
    except AnalysisCancelled:
        staging_manager.cleanup()
        shutil.rmtree(session_dir, ignore_errors=True)
        raise HTTPException(status_code=409, detail="Đã hủy phân tích; file chưa được lưu")
    except Exception as exc:
        staging_manager.cleanup()
        shutil.rmtree(session_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Không đọc được file Excel: {exc}") from exc
    finally:
        _clear_analysis_cancelled(request_id)

    result["session_id"] = session_id
    result["filename"] = file.filename
    result["factory"] = factory
    result["normalized_raw"] = normalized_raw
    result["missing_output1_summary"] = missing_output1_summary
    result["normalization_summary"] = normalization_summary
    save_automatic_overrides(
        session_dir,
        apply_newcomer_first_day_benefits(result, factory) if newcomer_benefit else [],
    )
    return result


@router.post("/attendance/analyze/continue")
async def continue_attendance_analysis(
    resume_token: str = Form(...),
    newcomer_benefit: bool = Form(True),
    request_id: str = Form(""),
    user: dict = Depends(require_staff_or_owner),
) -> dict:
    pending_dir = _pending_analysis_path(resume_token)
    if not pending_dir.exists():
        raise HTTPException(status_code=404, detail="Phiên bổ sung khung đã hết hạn hoặc không còn tồn tại")

    session_dir = STORAGE_DIR / resume_token
    try:
        metadata = json.loads((pending_dir / "metadata.json").read_text(encoding="utf-8"))
        if metadata.get("factory") != "factory1":
            raise ValueError("Phiên tiếp tục không thuộc Xưởng 1")
        uploaded_paths = list(pending_dir.glob("uploaded.*"))
        if len(uploaded_paths) != 1:
            raise ValueError("Không tìm thấy file đã tải lên")
        uploaded_path = uploaded_paths[0]
        original_path = pending_dir / f"original{uploaded_path.suffix.lower()}"
        layout = metadata.get("layout") or {}

        _raise_if_analysis_cancelled(request_id)
        await asyncio.to_thread(normalize_raw_attendance_workbook, uploaded_path, original_path)
        _raise_if_analysis_cancelled(request_id)
        result = await asyncio.to_thread(analyze_workbook, original_path)
        _raise_if_analysis_cancelled(request_id)
        summary = result.get("summary") or {}
        if not summary.get("blocks"):
            raise ValueError("Không tìm thấy dòng nhân viên có dữ liệu chấm công trong file Excel")

        metadata["normalized_raw"] = True
        (pending_dir / "metadata.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        if session_dir.exists():
            raise ValueError("Phiên phân tích đã tồn tại")
        pending_dir.replace(session_dir)
    except AnalysisCancelled:
        shutil.rmtree(pending_dir, ignore_errors=True)
        raise HTTPException(status_code=409, detail="Đã hủy phân tích; file chưa được lưu")
    except HTTPException:
        raise
    except Exception as exc:
        shutil.rmtree(pending_dir, ignore_errors=True)
        shutil.rmtree(session_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Không đọc được file Excel: {exc}") from exc
    finally:
        _clear_analysis_cancelled(request_id)

    result["session_id"] = resume_token
    result["filename"] = metadata.get("filename") or uploaded_path.name
    result["factory"] = "factory1"
    result["normalized_raw"] = True
    result["missing_output1_summary"] = bool(layout.get("missing_output1_summary"))
    result["normalization_summary"] = {
        "raw_employee_count": int(layout.get("raw_employee_count") or summary["blocks"]),
        "retained_employee_count": int(layout.get("retained_employee_count") or summary["blocks"]),
        "discarded_empty_employee_count": int(layout.get("discarded_empty_employee_count") or 0),
    }
    save_automatic_overrides(
        session_dir,
        apply_newcomer_first_day_benefits(result, "factory1") if newcomer_benefit else [],
    )
    return result


@router.delete("/attendance/analyze/pending/{resume_token}")
def discard_pending_attendance_analysis(
    resume_token: str,
    user: dict = Depends(require_staff_or_owner),
) -> dict[str, str]:
    shutil.rmtree(_pending_analysis_path(resume_token), ignore_errors=True)
    return {"status": "deleted"}


@router.post("/attendance/factory2/convert-legacy")
async def convert_factory2_legacy_workbook(
    file: UploadFile = File(...),
    output_kind: Literal["output1", "output2"] = Form("output1"),
    user: dict = Depends(require_staff_or_owner),
) -> FileResponse:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .xlsx hoặc .xlsm")

    conversion_dir = STORAGE_DIR / f"factory2-convert-{uuid4().hex}"
    conversion_dir.mkdir(parents=True, exist_ok=True)
    source_path = conversion_dir / f"legacy{suffix}"
    output_path = conversion_dir / f"Xuong2_{output_kind.upper()}_KhungMoi.xlsx"
    source_path.write_bytes(await file.read())

    try:
        analysis = analyze_factory2_workbook(source_path)
        if not analysis.get("summary", {}).get("blocks"):
            raise ValueError("Không tìm thấy nhân viên có giờ chấm trong bảng dọc Xưởng 2")
        if output_kind == "output2":
            export_factory2_output2(
                source_path,
                output_path,
                include_saved_data=True,
                factory="factory2",
                carry_source_payroll_data=True,
            )
        else:
            export_factory2_output1(source_path, output_path, factory="factory2")
    except Exception as exc:
        shutil.rmtree(conversion_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Không chuyển được bảng Xưởng 2: {exc}") from exc

    period = analysis.get("period") or {}
    month = int(period.get("month") or 0)
    year = int(period.get("year") or 0)
    period_label = f"{year}-{month:02d}" if month and year else "KhongRoKy"
    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"Xuong2_{period_label}_{'Output2_KhungMoi' if output_kind == 'output2' else 'Output1'}.xlsx",
        background=BackgroundTask(shutil.rmtree, conversion_dir, ignore_errors=True),
    )


@router.post("/attendance/factory1/convert-legacy")
async def convert_factory1_legacy_workbook(
    file: UploadFile = File(...),
    user: dict = Depends(require_staff_or_owner),
) -> FileResponse:
    """Convert an older Factory 1 workbook into the current formula frame."""

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xls", ".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chá»‰ há»— trá»£ file .xls, .xlsx hoáº·c .xlsm")

    conversion_dir = STORAGE_DIR / f"factory1-convert-{uuid4().hex}"
    conversion_dir.mkdir(parents=True, exist_ok=True)
    source_path = conversion_dir / f"legacy{suffix}"
    output_path = conversion_dir / "Xuong1_Output2_KhungMoi.xlsx"
    source_path.write_bytes(await file.read())

    try:
        export_factory1_legacy_output2(source_path, output_path)
        period = detect_period_from_workbook(output_path)
    except Exception as exc:
        shutil.rmtree(conversion_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"KhÃ´ng chuyá»ƒn Ä‘Æ°á»£c báº£ng cÅ© XÆ°á»Ÿng 1: {exc}") from exc

    headers = {}
    if period.get("month"):
        headers["X-Period-Month"] = str(period["month"])
    if period.get("year"):
        headers["X-Period-Year"] = str(period["year"])
    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="Xuong1_Output2_KhungMoi.xlsx",
        headers=headers,
        background=BackgroundTask(shutil.rmtree, conversion_dir, ignore_errors=True),
    )


@router.get("/attendance/export/{session_id}")
def export_attendance(session_id: str, user: dict = Depends(require_staff_or_owner)) -> FileResponse:
    session_dir = STORAGE_DIR / session_id
    originals = list(session_dir.glob("original.xlsx")) + list(session_dir.glob("original.xlsm"))
    if not originals:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên xử lý")

    output_path = session_dir / "attendance_processed.xlsx"
    try:
        review_overrides = merge_session_overrides(session_dir)
        if _session_factory(session_id) == "factory2":
            export_factory2_output1(originals[0], output_path, review_overrides=review_overrides)
        else:
            export_processed_workbook(originals[0], output_path, review_overrides=review_overrides)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không xuất được file Excel: {exc}") from exc

    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="Output1.xlsx",
    )


@router.post("/attendance/session/{session_id}/reanalyze")
def reanalyze_temporary_attendance_session(
    session_id: str,
    newcomer_benefit: bool = True,
    user: dict = Depends(require_staff_or_owner),
) -> dict:
    if len(session_id) != 32 or any(character not in "0123456789abcdef" for character in session_id.lower()):
        raise HTTPException(status_code=400, detail="Mã phiên tạm không hợp lệ")

    session_dir = STORAGE_DIR / session_id
    originals = list(session_dir.glob("original.xlsx")) + list(session_dir.glob("original.xlsm"))
    if not originals:
        raise HTTPException(status_code=404, detail="Không tìm thấy dữ liệu nguồn của phiên tạm")

    metadata: dict = {}
    metadata_path = session_dir / "metadata.json"
    if metadata_path.exists():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except Exception:
            metadata = {}

    factory = _session_factory(session_id)
    try:
        result = (
            analyze_factory2_workbook(originals[0])
            if factory == "factory2"
            else analyze_workbook(originals[0])
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không thể tính lại phiên tạm: {exc}") from exc

    result["session_id"] = session_id
    result["filename"] = metadata.get("filename") or originals[0].name
    result["factory"] = factory
    result["normalized_raw"] = bool(metadata.get("normalized_raw", False))
    save_automatic_overrides(
        session_dir,
        apply_newcomer_first_day_benefits(result, factory) if newcomer_benefit else [],
    )
    return result


@router.delete("/attendance/session/{session_id}")
def delete_temporary_attendance_session(
    session_id: str,
    user: dict = Depends(require_staff_or_owner),
) -> dict[str, str]:
    if len(session_id) != 32 or any(character not in "0123456789abcdef" for character in session_id.lower()):
        raise HTTPException(status_code=400, detail="Mã phiên tạm không hợp lệ")

    session_dir = STORAGE_DIR / session_id
    if session_dir.exists():
        shutil.rmtree(session_dir)
    _delete_workspace_for_session(session_id)
    return {"status": "ok"}


@router.post("/attendance/recalculate-totals")
async def recalculate_attendance_totals(
    file: UploadFile = File(...),
    output_kind: Literal["output1", "output2"] = Form("output1"),
    factory: Literal["factory1", "factory2"] = Form("factory1"),
    smart_scan: bool = Form(True),
    user: dict = Depends(require_staff_or_owner),
) -> FileResponse:
    if user.get("role") != "owner" and output_kind == "output2":
        raise HTTPException(status_code=403, detail="Tài khoản nhân viên không được xuất Output 2")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .xlsx hoặc .xlsm")

    session_id = uuid4().hex
    session_dir = STORAGE_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    uploaded_path = session_dir / f"edited{suffix}"
    recalc_path = session_dir / f"attendance_recalculated_output1{suffix}"
    output_path = session_dir / f"attendance_recalculated_{output_kind}{suffix}"
    uploaded_path.write_bytes(await file.read())

    try:
        if smart_scan:
            guard_role: WorkbookRole = "recalculate_output2" if output_kind == "output2" else "recalculate_output1"
            inspect_workbook_for_role(uploaded_path, guard_role)
        recalculate_workbook_totals(uploaded_path, recalc_path)
        if output_kind == "output2":
            profile_sync = sync_latest_final_copy_profile(recalc_path, factory)
            profile_codes = {
                str(code).strip()
                for code in profile_sync.get("profile_codes", [])
                if str(code).strip()
            } if profile_sync.get("status") == "ok" else set()
            apply_payroll_to_workbook(
                recalc_path, output_path, profile_codes=profile_codes, factory=factory,
            )
        elif recalc_path != output_path:
            shutil.copy2(recalc_path, output_path)
    except Exception as exc:
        shutil.rmtree(session_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Không tính lại tổng công được: {exc}") from exc

    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"attendance_recalculated_{output_kind}{suffix}",
    )


@router.post("/attendance/map-owner-data")
async def map_owner_data(
    current_file: UploadFile = File(...),
    previous_file: UploadFile = File(...),
    factory: Literal["factory1", "factory2"] = Form("factory1"),
    smart_scan: bool = Form(True),
    smart_mapping: bool = Form(True),
    bank_updates: str = Form("[]"),
    allow_missing_bank_accounts: bool = Form(False),
    user: dict = Depends(require_staff_or_owner),
) -> FileResponse:
    current_suffix = Path(current_file.filename or "").suffix.lower()
    previous_suffix = Path(previous_file.filename or "").suffix.lower()
    if current_suffix not in {".xlsx", ".xlsm"} or previous_suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .xlsx hoặc .xlsm")

    session_id = uuid4().hex
    session_dir = STORAGE_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    current_path = session_dir / f"current{current_suffix}"
    previous_path = session_dir / f"previous{previous_suffix}"
    output1_path = session_dir / f"attendance_mapped_output1{current_suffix}"
    output2_path = session_dir / f"attendance_mapped_output2{current_suffix}"
    zip_path = session_dir / "attendance_mapped_outputs.zip"
    current_path.write_bytes(await current_file.read())
    previous_path.write_bytes(await previous_file.read())

    try:
        if smart_scan:
            validate_mapping_pair(current_path, previous_path, factory=factory)
        try:
            requested_bank_updates = json.loads(bank_updates or "[]")
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Dữ liệu cập nhật tài khoản không hợp lệ") from exc
        if not isinstance(requested_bank_updates, list):
            raise HTTPException(status_code=400, detail="Dữ liệu cập nhật tài khoản phải là danh sách")

        bank_preflight = inspect_bank_accounts_for_mapping(
            current_path,
            previous_path,
            factory=factory,
            smart_mapping=smart_mapping,
        )
        current_codes = {
            item["employee_code"]
            for item in bank_preflight.get("missing_bank_accounts", []) + bank_preflight.get("changed_bank_accounts", [])
        }
        bank_rows = []
        for item in requested_bank_updates:
            if not isinstance(item, dict):
                continue
            code = str(item.get("employee_code") or "").strip()
            account = str(item.get("account_number") or "").strip()
            if code not in current_codes or not account:
                continue
            bank_rows.append({
                "employee_code": code,
                "account_number": account,
                "name": str(item.get("name") or "").strip(),
            })
        updated_codes = {row["employee_code"] for row in bank_rows}
        unresolved_missing = [
            item["employee_code"]
            for item in bank_preflight.get("missing_bank_accounts", [])
            if item["employee_code"] not in updated_codes
        ]
        if unresolved_missing and not allow_missing_bank_accounts:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Còn mã thiếu số tài khoản ngân hàng",
                    "missing_codes": unresolved_missing,
                },
            )
        bank_saved = 0
        bank_backup_status = "not_requested"
        if bank_rows:
            bank_saved = int(save_accounts(factory, bank_rows).get("updated") or 0)
            try:
                backup_registry_to_drive(factory)
                bank_backup_status = "saved_to_drive"
            except Exception:
                bank_backup_status = "local_only"
        summary = map_owner_data_to_current_workbook(
            current_path,
            previous_path,
            output2_path,
            mode="output2",
            smart_mapping=smart_mapping,
            factory=factory,
        )
        summary.update({
            "bank_missing_count": bank_preflight.get("missing_count", 0),
            "bank_changed_count": bank_preflight.get("changed_count", 0),
            "bank_accounts_saved": bank_saved,
            "bank_backup_status": bank_backup_status,
            "allow_missing_bank_accounts": allow_missing_bank_accounts,
        })
        map_owner_data_to_current_workbook(
            current_path,
            previous_path,
            output1_path,
            mode="output1",
            smart_mapping=smart_mapping,
            factory=factory,
        )
    except HTTPException:
        shutil.rmtree(session_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(session_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Không gán được dữ liệu: {exc}") from exc

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(output1_path, arcname=f"Output1{current_suffix}")
        archive.write(output2_path, arcname=f"Output2{current_suffix}")

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename="Output1_Output2.zip",
        headers={"X-Mapping-Summary": json.dumps(summary, ensure_ascii=False)},
    )


@router.post("/attendance/map-owner-data/inspect")
async def inspect_map_owner_data(
    current_file: UploadFile = File(...),
    previous_file: UploadFile = File(...),
    factory: Literal["factory1", "factory2"] = Form("factory1"),
    smart_scan: bool = Form(True),
    smart_mapping: bool = Form(True),
    user: dict = Depends(require_staff_or_owner),
) -> dict:
    """Preview mapping and bank-account gaps before generating Output files."""
    current_suffix = Path(current_file.filename or "").suffix.lower()
    previous_suffix = Path(previous_file.filename or "").suffix.lower()
    if current_suffix not in {".xlsx", ".xlsm"} or previous_suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .xlsx hoặc .xlsm")

    session_id = uuid4().hex
    session_dir = STORAGE_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    current_path = session_dir / f"current{current_suffix}"
    previous_path = session_dir / f"previous{previous_suffix}"
    current_path.write_bytes(await current_file.read())
    previous_path.write_bytes(await previous_file.read())
    try:
        if smart_scan:
            validate_mapping_pair(current_path, previous_path, factory=factory)
        result = inspect_bank_accounts_for_mapping(
            current_path,
            previous_path,
            factory=factory,
            smart_mapping=smart_mapping,
        )
        result["smart_mapping"] = smart_mapping
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không kiểm tra được dữ liệu gán: {exc}") from exc
    finally:
        shutil.rmtree(session_dir, ignore_errors=True)


@router.post("/attendance/export")
def export_attendance_with_overrides(
    request: AttendanceExportRequest,
    user: dict = Depends(require_staff_or_owner),
) -> FileResponse:
    session_dir = STORAGE_DIR / request.session_id
    originals = list(session_dir.glob("original.xlsx")) + list(session_dir.glob("original.xlsm"))
    if not originals:
        raise HTTPException(status_code=404, detail="KhÃ´ng tÃ¬m tháº¥y phiÃªn xá»­ lÃ½")

    output_path = session_dir / "attendance_processed.xlsx"
    try:
        review_overrides = merge_session_overrides(
            session_dir,
            [item.model_dump(include=item.model_fields_set) for item in request.review_overrides],
        )
        if _session_factory(request.session_id) == "factory2":
            export_factory2_output1(originals[0], output_path, review_overrides=review_overrides)
        else:
            export_processed_workbook(
                originals[0],
                output_path,
                review_overrides=review_overrides,
            )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"KhÃ´ng xuáº¥t Ä‘Æ°á»£c file Excel: {exc}") from exc

    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="attendance_processed.xlsx",
    )


@router.post("/attendance/export-employee-cards")
def export_employee_cards(
    request: EmployeeCardsExportRequest,
    user: dict = Depends(require_staff_or_owner),
) -> FileResponse:
    _ensure_card_kind_allowed(request.kind, user)
    output_path = _prepare_employee_cards_zip(request)
    return FileResponse(
        output_path,
        media_type="application/zip",
        filename=_employee_cards_download_filename(request.session_id, request.kind),
    )


@router.post("/attendance/prepare-employee-cards")
def prepare_employee_cards(
    request: EmployeeCardsExportRequest,
    user: dict = Depends(require_staff_or_owner),
) -> EmployeeCardsPrepareResponse:
    _ensure_card_kind_allowed(request.kind, user)
    _prepare_employee_cards_zip(request)
    filename = _employee_cards_download_filename(request.session_id, request.kind)
    return EmployeeCardsPrepareResponse(
        download_url=f"/attendance/download-employee-cards/{request.session_id}/{request.kind}",
        filename=filename,
    )


@router.post("/attendance/submit-to-owner")
def submit_to_owner(
    request: AttendanceExportRequest,
    user: dict = Depends(require_staff_or_owner),
) -> AttendanceSubmitResponse:
    session_dir = STORAGE_DIR / request.session_id
    originals = list(session_dir.glob("original.xlsx")) + list(session_dir.glob("original.xlsm"))
    if not originals:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên xử lý")

    try:
        if _session_factory(request.session_id) == "factory2":
            analysis = analyze_factory2_workbook(originals[0])
            factory = "factory2"
        else:
            analysis = analyze_workbook(originals[0])
            factory = "factory1"
        _apply_review_overrides_to_analysis(
            analysis,
            merge_session_overrides(
                session_dir,
                [item.model_dump(include=item.model_fields_set) for item in request.review_overrides],
            ),
        )
        result = submit_attendance_to_owner(
            analysis,
            source_path=originals[0],
            source_filename=_read_uploaded_filename(request.session_id),
            submitted_by=str(user.get("email") or ""),
            factory=factory,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không gửi được cho chủ: {exc}") from exc

    return AttendanceSubmitResponse(**result)


@router.get("/attendance/download-employee-cards/{session_id}/{kind}")
def download_employee_cards(
    session_id: str,
    kind: Literal["output1", "output2"],
    token: str | None = Query(default=None),
) -> FileResponse:
    user = _user_from_download_token(token)
    _ensure_card_kind_allowed(kind, user)
    session_dir = STORAGE_DIR / session_id
    output_path = session_dir / f"employee_attendance_images_{kind}.zip"
    if not output_path.exists():
        request = EmployeeCardsExportRequest(session_id=session_id, kind=kind)
        output_path = _prepare_employee_cards_zip(request)

    return FileResponse(
        output_path,
        media_type="application/zip",
        filename=_employee_cards_download_filename(session_id, kind),
    )


def _ensure_card_kind_allowed(kind: str, user: dict) -> None:
    if user.get("role") != "owner" and kind == "output2":
        raise HTTPException(status_code=403, detail="Tài khoản nhân viên không được xuất ảnh Output 2")


def _user_from_download_token(token: str | None) -> dict:
    if not ROLE_LOGIN_ENABLED:
        return LOCAL_OWNER_USER
    if not token:
        raise HTTPException(status_code=401, detail="Link tải không hợp lệ hoặc đã hết phiên")
    try:
        return get_user_by_token(token)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail="Link tải không hợp lệ hoặc đã hết phiên") from exc


def _apply_review_overrides_to_analysis(analysis: dict, review_overrides: list[dict]) -> None:
    overrides: dict[tuple[str, int], dict] = {}
    for item in review_overrides:
        employee_code = str(item.get("employee_code") or "").strip()
        day = item.get("day")
        if employee_code and isinstance(day, int):
            overrides[(employee_code, day)] = item

    for block in analysis.get("blocks", []):
        employee_code = str(block.get("employee_code") or "")
        for result in block.get("results", []):
            override = overrides.get((employee_code, result.get("day")))
            if not override:
                continue
            if "missing_count" in override:
                result["missing_count"] = override.get("missing_count")
            if "late_minutes" in override:
                result["late_minutes"] = override.get("late_minutes")
            if "work_value" in override:
                result["work_value"] = override.get("work_value")


def _read_uploaded_filename(session_id: str) -> str:
    metadata_path = STORAGE_DIR / session_id / "metadata.json"
    if not metadata_path.exists():
        return "attendance.xlsx"
    try:
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception:
        return "attendance.xlsx"
    return str(data.get("filename") or "attendance.xlsx")


def _prepare_employee_cards_zip(request: EmployeeCardsExportRequest) -> Path:
    session_dir = STORAGE_DIR / request.session_id
    originals = list(session_dir.glob("original.xlsx")) + list(session_dir.glob("original.xlsm"))
    if not originals:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên xử lý")

    output_path = session_dir / f"employee_attendance_images_{request.kind}.zip"
    card_source = originals[0]
    if _session_factory(request.session_id) == "factory2":
        card_source = session_dir / "employee_cards_standard_source.xlsx"
        write_factory2_standard_source(originals[0], card_source)

    try:
        export_employee_cards_zip(
            card_source,
            output_path,
            request.kind,
            review_overrides=merge_session_overrides(
                session_dir,
                [item.model_dump(include=item.model_fields_set) for item in request.review_overrides],
            ),
            factory=_session_factory(request.session_id),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không xuất được phiếu nhân viên: {exc}") from exc

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


def _employee_cards_download_filename(session_id: str, kind: str) -> str:
    factory = _session_factory(session_id)
    factory_label = "Xuong2" if factory == "factory2" else "Xuong1"
    content = "PhieuNhanVien_BangLuong" if kind == "output2" else "PhieuNhanVien_BangChamCong"
    period_label = "KhongRoKy"
    session_dir = STORAGE_DIR / session_id
    originals = list(session_dir.glob("original.xlsx")) + list(session_dir.glob("original.xlsm"))
    if originals:
        try:
            analysis = analyze_factory2_workbook(originals[0]) if factory == "factory2" else analyze_workbook(originals[0])
            period = analysis.get("period") or {}
            month = int(period.get("month") or 0)
            year = int(period.get("year") or 0)
            if month and year:
                period_label = f"{year}-{month:02d}"
        except Exception:
            pass
    return f"{factory_label}_{period_label}_{content}.zip"
