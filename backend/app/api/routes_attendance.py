import json
import shutil
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.api.auth_dependencies import ROLE_LOGIN_ENABLED, LOCAL_OWNER_USER, require_staff_or_owner
from app.services.cloud_sync import submit_attendance_to_owner
from app.services.data_mapper import map_owner_data_to_current_workbook
from app.services.auth_service import AuthError, get_user_by_token
from app.services.employee_cards import export_employee_cards_zip
from app.services.factory2_workbook import analyze_factory2_workbook, export_factory2_output1, write_factory2_standard_source
from app.services.payroll_workbook import apply_payroll_to_workbook
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
def get_temporary_workspace(user: dict = Depends(require_staff_or_owner)) -> dict:
    if not TEMPORARY_WORKSPACE_PATH.exists():
        raise HTTPException(status_code=404, detail="Không có phiên tạm")
    try:
        workspace = json.loads(TEMPORARY_WORKSPACE_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Phiên tạm bị lỗi định dạng") from exc

    session_id = str((workspace.get("data") or {}).get("session_id") or "")
    if not session_id or not (STORAGE_DIR / session_id).exists():
        TEMPORARY_WORKSPACE_PATH.unlink(missing_ok=True)
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

    temporary_path = TEMPORARY_WORKSPACE_PATH.with_suffix(".tmp")
    temporary_path.write_text(json.dumps(workspace, ensure_ascii=False), encoding="utf-8")
    temporary_path.replace(TEMPORARY_WORKSPACE_PATH)
    return {"status": "ok"}


@router.delete("/attendance/temporary-workspace")
def delete_temporary_workspace(user: dict = Depends(require_staff_or_owner)) -> dict[str, str]:
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


@router.post("/attendance/analyze")
async def analyze_attendance(
    file: UploadFile = File(...),
    normalize_raw: bool = Form(False),
    factory: Literal["factory1", "factory2"] = Form("factory1"),
    smart_scan: bool = Form(True),
    newcomer_benefit: bool = Form(True),
    user: dict = Depends(require_staff_or_owner),
) -> dict:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .xlsx hoặc .xlsm")

    session_id = uuid4().hex
    session_dir = STORAGE_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    uploaded_path = session_dir / f"uploaded{suffix}"
    original_path = session_dir / f"original{suffix}"
    uploaded_path.write_bytes(await file.read())
    (session_dir / "metadata.json").write_text(
        json.dumps({"filename": file.filename, "normalized_raw": False, "factory": factory}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    try:
        if smart_scan:
            inspect_workbook_for_role(uploaded_path, "analysis", factory=factory)
        if factory == "factory2":
            shutil.copy2(uploaded_path, original_path)
            result = analyze_factory2_workbook(original_path)
            source_employee_count = result["summary"].get(
                "source_employee_count",
                result["summary"]["blocks"],
            )
            retained_employee_count = result["summary"]["blocks"]
            result["session_id"] = session_id
            result["filename"] = file.filename
            result["factory"] = factory
            result["normalized_raw"] = False
            result["missing_output1_summary"] = False
            result["normalization_summary"] = {
                "raw_employee_count": source_employee_count,
                "retained_employee_count": retained_employee_count,
                "discarded_empty_employee_count": source_employee_count - retained_employee_count,
            }
            save_automatic_overrides(
                session_dir,
                apply_newcomer_first_day_benefits(result, factory) if newcomer_benefit else [],
            )
            return result

        layout = inspect_workbook_layout(uploaded_path)
        if layout.requires_normalization and not normalize_raw:
            shutil.rmtree(session_dir, ignore_errors=True)
            return {
                "requires_normalization": True,
                "message": "File raw tu may cham cong chua co khung nhap phan tich.",
                "sheet_name": layout.sheet_name,
                "raw_employee_count": layout.raw_employee_count,
                "retained_employee_count": layout.retained_employee_count,
                "discarded_empty_employee_count": layout.discarded_empty_employee_count,
                "detected_block_count": layout.detected_block_count,
                "missing_output1_summary": layout.missing_output1_summary,
            }

        if layout.requires_normalization:
            normalize_raw_attendance_workbook(uploaded_path, original_path)
            (session_dir / "metadata.json").write_text(
                json.dumps({"filename": file.filename, "normalized_raw": True, "factory": factory}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        else:
            shutil.copy2(uploaded_path, original_path)

        result = analyze_workbook(original_path)
    except Exception as exc:
        shutil.rmtree(session_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Không đọc được file Excel: {exc}") from exc

    result["session_id"] = session_id
    result["filename"] = file.filename
    result["factory"] = factory
    result["normalized_raw"] = layout.requires_normalization
    result["missing_output1_summary"] = layout.missing_output1_summary
    result["normalization_summary"] = {
        "raw_employee_count": layout.raw_employee_count,
        "retained_employee_count": layout.retained_employee_count,
        "discarded_empty_employee_count": layout.discarded_empty_employee_count,
    }
    save_automatic_overrides(
        session_dir,
        apply_newcomer_first_day_benefits(result, factory) if newcomer_benefit else [],
    )
    return result


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
    if TEMPORARY_WORKSPACE_PATH.exists():
        try:
            workspace = json.loads(TEMPORARY_WORKSPACE_PATH.read_text(encoding="utf-8"))
            if str((workspace.get("data") or {}).get("session_id") or "") == session_id:
                TEMPORARY_WORKSPACE_PATH.unlink(missing_ok=True)
        except Exception:
            TEMPORARY_WORKSPACE_PATH.unlink(missing_ok=True)
    return {"status": "ok"}


@router.post("/attendance/recalculate-totals")
async def recalculate_attendance_totals(
    file: UploadFile = File(...),
    output_kind: Literal["output1", "output2"] = Form("output1"),
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
            apply_payroll_to_workbook(recalc_path, output_path)
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
        summary = map_owner_data_to_current_workbook(
            current_path,
            previous_path,
            output2_path,
            mode="output2",
            smart_mapping=smart_mapping,
        )
        map_owner_data_to_current_workbook(
            current_path,
            previous_path,
            output1_path,
            mode="output1",
            smart_mapping=smart_mapping,
        )
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
