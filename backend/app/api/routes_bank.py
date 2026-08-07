from pathlib import Path
import shutil
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.api.auth_dependencies import require_owner
from app.services.bank_payroll import (
    backup_registry_to_drive,
    bank_status,
    detect_excel_salary_period,
    detect_word_period,
    export_bank_excel,
    export_bank_excel_local,
    import_accounts_from_excel_salary,
    import_accounts_from_word,
    list_accounts,
    restore_registry_from_drive,
    save_accounts,
    scan_official_workbook,
)
from app.services.bank_account_store import list_account_overview


router = APIRouter(prefix="/bank", tags=["bank"])
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "storage" / "bank_uploads"


class AccountRow(BaseModel):
    employee_code: str
    name: str = ""
    account_number: str = ""
    conflict_accounts: list[str] = Field(default_factory=list)
    conflict_codes: list[str] = Field(default_factory=list)


class AccountSaveRequest(BaseModel):
    factory: str
    accounts: list[AccountRow] = Field(default_factory=list)


class ExportRequest(BaseModel):
    scan_id: str
    accounts: list[AccountRow] = Field(default_factory=list)


@router.get("/accounts")
def accounts(factory: str = "factory1", user: dict = Depends(require_owner)):
    return list_accounts(factory)


@router.get("/accounts/overview")
def accounts_overview(factory: str = "factory1", user: dict = Depends(require_owner)):
    return list_account_overview(factory)


@router.post("/accounts")
def update_accounts(request: AccountSaveRequest, user: dict = Depends(require_owner)):
    try:
        return save_accounts(request.factory, [row.model_dump() for row in request.accounts])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/scan")
def scan(
    factory: str = Form("factory1"),
    file: UploadFile = File(...),
    user: dict = Depends(require_owner),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ nhận file Excel .xlsx hoặc .xlsm.")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    with target.open("wb") as output:
        shutil.copyfileobj(file.file, output)
    try:
        return scan_official_workbook(target, factory)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không đọc được bảng lương: {exc}") from exc
    finally:
        target.unlink(missing_ok=True)


@router.post("/import-word")
def import_word(
    factory: str = Form("factory1"),
    month: int = Form(...),
    year: int = Form(...),
    mode: str = Form("fill_missing"),
    file: UploadFile = File(...),
    user: dict = Depends(require_owner),
):
    if Path(file.filename or "").suffix.lower() != ".docx":
        raise HTTPException(status_code=400, detail="Chỉ nhận file Word .docx.")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target = UPLOAD_DIR / f"{uuid.uuid4().hex}.docx"
    with target.open("wb") as output:
        shutil.copyfileobj(file.file, output)
    try:
        return import_accounts_from_word(target, factory, month, year, mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không nhập được file Word: {exc}") from exc
    finally:
        target.unlink(missing_ok=True)


@router.post("/inspect-word")
def inspect_word(
    file: UploadFile = File(...),
    user: dict = Depends(require_owner),
):
    if Path(file.filename or "").suffix.lower() != ".docx":
        raise HTTPException(status_code=400, detail="Chỉ nhận file Word .docx.")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target = UPLOAD_DIR / f"{uuid.uuid4().hex}.docx"
    with target.open("wb") as output:
        shutil.copyfileobj(file.file, output)
    try:
        month, year = detect_word_period(target)
        return {"month": month, "year": year}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không đọc được tháng/năm trong Word: {exc}") from exc
    finally:
        target.unlink(missing_ok=True)


@router.post("/import-excel-salary")
def import_excel_salary(
    factory: str = Form("factory1"),
    month: int = Form(...),
    year: int = Form(...),
    mode: str = Form("fill_missing"),
    file: UploadFile = File(...),
    user: dict = Depends(require_owner),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ nhận file Excel lương .xlsx hoặc .xlsm.")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    with target.open("wb") as output:
        shutil.copyfileobj(file.file, output)
    try:
        # The old salary file is a supplementary account source.  It never
        # performs a blanket replacement; conflicts are returned for an
        # explicit user choice in the UI.
        return import_accounts_from_excel_salary(target, factory, month, year, "fill_missing")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không nhập được file Excel lương: {exc}") from exc
    finally:
        target.unlink(missing_ok=True)


@router.post("/inspect-excel-salary")
def inspect_excel_salary(
    file: UploadFile = File(...),
    user: dict = Depends(require_owner),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail="Chỉ nhận file Excel lương .xlsx hoặc .xlsm.")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    with target.open("wb") as output:
        shutil.copyfileobj(file.file, output)
    try:
        month, year = detect_excel_salary_period(target)
        return {"month": month, "year": year}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Không đọc được tháng/năm trong Excel lương: {exc}") from exc
    finally:
        target.unlink(missing_ok=True)


@router.post("/export")
def export(request: ExportRequest, user: dict = Depends(require_owner)):
    try:
        path, filename = export_bank_excel(
            request.scan_id,
            [row.model_dump() for row in request.accounts],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return FileResponse(
        path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.post("/export-local")
def export_local(request: ExportRequest, user: dict = Depends(require_owner)):
    try:
        path, filename = export_bank_excel_local(
            request.scan_id,
            [row.model_dump() for row in request.accounts],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "path": str(path), "filename": filename}


@router.get("/status")
def status(factory: str = "factory1", user: dict = Depends(require_owner)):
    return bank_status(factory)


@router.post("/backup-drive")
def backup(factory: str = "factory1", user: dict = Depends(require_owner)):
    try:
        return backup_registry_to_drive(factory)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/restore-drive")
def restore(factory: str = "factory1", user: dict = Depends(require_owner)):
    try:
        return restore_registry_from_drive(factory)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
