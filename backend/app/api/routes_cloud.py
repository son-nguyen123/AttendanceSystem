import json
import os
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel

from app.api.auth_dependencies import require_owner
from app.services.cloud_sync import (
    download_submission_file,
    get_owner_submission,
    get_cloud_config,
    list_drive_final_copies,
    list_drive_analysis_copies,
    list_owner_submissions,
    run_drive_backup,
    run_analysis_excel_copy,
    run_final_excel_copy,
    run_period_excel_backup,
    save_cloud_config,
    sync_period_detail,
    test_cloud_connection,
)
from app.services.factory2_workbook import analyze_factory2_workbook
from app.services.history_store import get_period_detail, list_periods
from app.services.workbook_processor import analyze_workbook
from app.services.workbook_guard import (
    ensure_period_matches,
    inspect_workbook_for_role,
    profile_workbook,
)


router = APIRouter(prefix="/cloud", tags=["cloud"])
STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"


class CloudConfigRequest(BaseModel):
    enabled: bool = False
    supabase_url: str = ""
    service_role_key: str = ""
    sync_on_save: bool = False
    drive_backup_enabled: bool = False
    drive_backup_dir: str = ""
    local_export_dir: str = ""
    backup_on_history_change: bool = True


class SessionCopyRequest(BaseModel):
    session_id: str
    month: int
    year: int
    replace_existing: bool = False


class OpenDriveFolderRequest(BaseModel):
    kind: Literal["root", "excel", "zip", "last"] = "excel"


@router.get("/config")
def get_config(user: dict = Depends(require_owner)) -> dict[str, Any]:
    return get_cloud_config()


@router.post("/config")
def save_config(request: CloudConfigRequest, user: dict = Depends(require_owner)) -> dict[str, Any]:
    return save_cloud_config(request.model_dump())


@router.post("/test")
def test_config(user: dict = Depends(require_owner)) -> dict[str, Any]:
    try:
        return test_cloud_connection()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/sync-all")
def sync_all_periods(user: dict = Depends(require_owner)) -> dict[str, Any]:
    synced = []
    failed = []
    for period in list_periods():
        period_id = period["id"]
        try:
            result = sync_period_detail(get_period_detail(period_id))
            synced.append(result)
        except Exception as exc:
            failed.append({"period_id": period_id, "error": str(exc)})

    if failed:
        raise HTTPException(status_code=400, detail={"synced": synced, "failed": failed})
    return {"status": "ok", "synced": synced}


@router.post("/backup")
def create_backup(user: dict = Depends(require_owner)) -> dict[str, Any]:
    try:
        return run_drive_backup(reason="manual")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/backup-excel-all")
def backup_all_excel_files(user: dict = Depends(require_owner)) -> dict[str, Any]:
    backed_up = []
    failed = []
    for period in list_periods():
        period_id = period["id"]
        try:
            backed_up.append(run_period_excel_backup(get_period_detail(period_id), reason="manual_excel_all"))
        except Exception as exc:
            failed.append({"period_id": period_id, "error": str(exc)})

    if failed:
        raise HTTPException(status_code=400, detail={"backed_up": backed_up, "failed": failed})
    return {"status": "ok", "backed_up": backed_up}


@router.post("/open-folder")
def open_drive_folder(request: OpenDriveFolderRequest, user: dict = Depends(require_owner)) -> dict[str, Any]:
    config = get_cloud_config()
    path = _drive_folder_for_kind(config, request.kind)
    path.mkdir(parents=True, exist_ok=True)
    try:
        _open_folder(path)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không mở được thư mục: {exc}") from exc
    return {"status": "ok", "path": str(path)}


@router.post("/session-copy")
def save_session_excel_copy(request: SessionCopyRequest, user: dict = Depends(require_owner)) -> dict[str, Any]:
    if request.month < 1 or request.month > 12 or request.year < 2000:
        raise HTTPException(status_code=400, detail="Tháng/năm lưu không hợp lệ")

    session_dir = STORAGE_DIR / request.session_id
    originals = list(session_dir.glob("original.xlsx")) + list(session_dir.glob("original.xlsm"))
    if not originals:
        raise HTTPException(status_code=404, detail="Không tìm thấy file đang phân tích")

    try:
        factory = _session_factory(session_dir)
        profile = profile_workbook(originals[0], factory=factory)
        ensure_period_matches(profile, request.month, request.year, "Bản đang phân tích")
        return run_analysis_excel_copy(
            originals[0],
            _session_filename(session_dir),
            request.month,
            request.year,
            factory=factory,
            replace_existing=request.replace_existing,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không lưu được bản đang phân tích: {exc}") from exc


@router.get("/session-copy/existing")
def get_existing_session_copies(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    factory: str = Query("factory1"),
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    return {"copies": list_drive_analysis_copies(month=month, year=year, factory=factory)}


@router.post("/final-copy")
async def save_final_excel_copy(
    file: UploadFile = File(...),
    month: int = Form(...),
    year: int = Form(...),
    factory: str = Form("factory1"),
    smart_scan: bool = Form(True),
    replace_existing: bool = Form(False),
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .xlsx hoặc .xlsm")
    if month < 1 or month > 12 or year < 2000:
        raise HTTPException(status_code=400, detail="Tháng/năm lưu không hợp lệ")

    session_dir = STORAGE_DIR / uuid4().hex
    session_dir.mkdir(parents=True, exist_ok=True)
    uploaded_path = session_dir / f"final_copy{suffix}"
    uploaded_path.write_bytes(await file.read())

    try:
        # Final copies are the long-lived payroll source.  They must always
        # pass the strict new-Output-2 guard; the general smart-scan toggle
        # must not provide a way to store a legacy/wrong frame.
        profile = inspect_workbook_for_role(uploaded_path, "final_copy", factory=factory)
        ensure_period_matches(profile, month, year, "Bản sao cuối cùng")
        existing_copies = list_drive_final_copies(month=month, year=year, factory=factory)
        if existing_copies and not replace_existing:
            raise HTTPException(
                status_code=409,
                detail=f"Đã có bản chốt cuối cùng cho tháng {month:02d}/{year}. Hãy xác nhận thay thế bằng file mới.",
            )
        return run_final_excel_copy(
            uploaded_path,
            file.filename or f"ban_sao_cuoi_cung{suffix}",
            month,
            year,
            factory=factory,
            profile_sync_mode="replace_manual",
            replace_existing=replace_existing,
        )
    except HTTPException:
        shutil.rmtree(session_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(session_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Không lưu được bản sao cuối cùng: {exc}") from exc


@router.post("/final-copy/period")
async def detect_final_copy_period(
    file: UploadFile = File(...),
    factory: str = Form("factory1"),
    smart_scan: bool = Form(True),
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .xlsx hoặc .xlsm")

    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        with TemporaryDirectory(dir=STORAGE_DIR) as temp_dir:
            uploaded_path = Path(temp_dir) / f"final_copy{suffix}"
            uploaded_path.write_bytes(await file.read())
            # Always inspect final copies with the strict new-frame guard so
            # the preview and the save endpoint enforce the same contract.
            profile = inspect_workbook_for_role(uploaded_path, "final_copy", factory=factory)
            return profile.to_dict()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không đọc được tháng/năm từ file chốt: {exc}") from exc


@router.get("/submissions")
def get_owner_submissions(
    factory: str | None = Query(default=None),
    user: dict = Depends(require_owner),
) -> dict[str, Any]:
    try:
        return list_owner_submissions(factory=factory)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/submissions/{period_id}/process")
def process_owner_submission(period_id: str, user: dict = Depends(require_owner)) -> dict[str, Any]:
    session_id = uuid4().hex
    session_dir = STORAGE_DIR / session_id
    try:
        submission = get_owner_submission(period_id)
        original_path = download_submission_file(period_id, session_dir)
        factory = _submission_factory(submission)
        (session_dir / "metadata.json").write_text(
            json.dumps(
                {
                    "filename": _submission_filename(submission),
                    "normalized_raw": False,
                    "factory": factory,
                    "source": "cloud_submission",
                    "submission_period_id": period_id,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        if factory == "factory2":
            result = analyze_factory2_workbook(original_path)
        else:
            result = analyze_workbook(original_path)
        result["session_id"] = session_id
        result["filename"] = _submission_filename(submission)
        result["factory"] = factory
        result["normalized_raw"] = False
        result["cloud_submission"] = submission
        return result
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ hòm thư") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không nạp được hồ sơ: {exc}") from exc


def _submission_factory(submission: dict[str, Any]) -> str:
    source = str(submission.get("source_filename") or "")
    if "factory2" in source:
        return "factory2"
    return "factory1"


def _submission_filename(submission: dict[str, Any]) -> str:
    source = str(submission.get("source_filename") or "")
    parts = [part.strip() for part in source.replace("[STAFF_SUBMISSION]", "").split("|")]
    return parts[-1] if parts else "attendance.xlsx"


def _session_filename(session_dir: Path) -> str:
    metadata_path = session_dir / "metadata.json"
    if not metadata_path.exists():
        return "attendance.xlsx"
    try:
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception:
        return "attendance.xlsx"
    return str(data.get("filename") or "attendance.xlsx")


def _session_factory(session_dir: Path) -> str:
    metadata_path = session_dir / "metadata.json"
    if not metadata_path.exists():
        return "factory1"
    try:
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception:
        return "factory1"
    return "factory2" if str(data.get("factory") or "").strip() == "factory2" else "factory1"


def _drive_folder_for_kind(config: dict[str, Any], kind: str) -> Path:
    if kind == "root":
        return Path(str(config.get("drive_root_path") or config.get("drive_backup_dir") or "")).expanduser()
    if kind == "zip":
        return Path(str(config.get("drive_zip_path") or "")).expanduser()
    if kind == "last":
        raw_last_path = str(config.get("last_backup_path") or "").strip()
        if raw_last_path:
            last_path = Path(raw_last_path).expanduser()
            if last_path.suffix:
                return last_path.parent
            return last_path
    return Path(str(config.get("drive_excel_path") or "")).expanduser()


def _open_folder(path: Path) -> None:
    if os.name == "nt":
        os.startfile(str(path))  # type: ignore[attr-defined]
        return
    if os.name == "posix":
        subprocess.Popen(["xdg-open", str(path)])
        return
    raise RuntimeError("Hệ điều hành chưa hỗ trợ mở thư mục tự động")
