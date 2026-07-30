import json
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.services.drive_backup import (
    create_analysis_excel_copy,
    create_drive_backup,
    create_final_excel_copy,
    create_period_excel_backup,
    delete_drive_period_files,
    default_backup_dir,
    drive_backup_paths,
    list_final_excel_copies,
    resolve_final_excel_copy,
)


STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"
CONFIG_PATH = STORAGE_DIR / "cloud_config.json"
REQUEST_TIMEOUT_SECONDS = 20
SUBMISSION_BUCKET = "attendance-submissions"


def get_cloud_config(include_secret: bool = False) -> dict[str, Any]:
    config = _read_config()
    key = str(config.get("service_role_key") or "")
    result = {
        "enabled": bool(config.get("enabled")),
        "configured": bool(config.get("supabase_url") and key),
        "supabase_url": str(config.get("supabase_url") or ""),
        "sync_on_save": bool(config.get("sync_on_save", False)),
        "last_test_at": config.get("last_test_at"),
        "last_sync_at": config.get("last_sync_at"),
        "last_error": config.get("last_error"),
        "key_hint": _key_hint(key),
        "drive_backup_enabled": bool(config.get("drive_backup_enabled")),
        "drive_backup_dir": str(config.get("drive_backup_dir") or default_backup_dir()),
        "backup_on_history_change": bool(config.get("backup_on_history_change", True)),
        "last_backup_at": config.get("last_backup_at"),
        "last_backup_path": config.get("last_backup_path"),
        "last_backup_error": config.get("last_backup_error"),
    }
    result.update(
        {
            "drive_root_path": drive_backup_paths(config)["root"],
            "drive_excel_path": drive_backup_paths(config)["excel"],
            "drive_zip_path": drive_backup_paths(config)["zip"],
        }
    )
    if include_secret:
        result["service_role_key"] = key
    return result


def save_cloud_config(data: dict[str, Any]) -> dict[str, Any]:
    current = _read_config()
    service_key = str(data.get("service_role_key") or "").strip()
    if not service_key:
        service_key = str(current.get("service_role_key") or "")

    next_config = {
        "enabled": bool(data.get("enabled")),
        "supabase_url": _normalize_supabase_url(data.get("supabase_url") or current.get("supabase_url")),
        "service_role_key": service_key,
        "sync_on_save": bool(data.get("sync_on_save", False)),
        "drive_backup_enabled": bool(data.get("drive_backup_enabled")),
        "drive_backup_dir": str(data.get("drive_backup_dir") or current.get("drive_backup_dir") or default_backup_dir()).strip(),
        "backup_on_history_change": bool(data.get("backup_on_history_change", True)),
        "last_test_at": current.get("last_test_at"),
        "last_sync_at": current.get("last_sync_at"),
        "last_backup_at": current.get("last_backup_at"),
        "last_backup_path": current.get("last_backup_path"),
        "last_backup_error": current.get("last_backup_error"),
        "last_error": None,
    }
    _write_config(next_config)
    return get_cloud_config()


def test_cloud_connection() -> dict[str, Any]:
    config = _active_config(require_enabled=False)
    _request(config, "GET", "attendance_periods", query="select=id&limit=1")
    _update_config(last_test_at=_now(), last_error=None)
    return get_cloud_config()


def sync_period_detail(detail: dict[str, Any]) -> dict[str, Any]:
    config = _active_config(require_enabled=True)
    period = detail.get("period") or {}
    period_id = str(period.get("id") or "")
    if not period_id:
        raise ValueError("Missing period id")

    _upsert(config, "attendance_periods", [_period_payload(period)], "id")

    employees = detail.get("employees") or []
    monthly_rows = [_monthly_payload(period_id, employee) for employee in employees]
    if monthly_rows:
        _upsert(config, "employee_monthly_records", monthly_rows, "period_id,employee_code")

    daily_rows = []
    for employee in employees:
        employee_code = str(employee.get("employee_code") or "")
        for record in employee.get("daily_records") or []:
            daily_rows.append(_daily_payload(period_id, employee_code, record))
    if daily_rows:
        _upsert(config, "employee_daily_records", daily_rows, "period_id,employee_code,day")

    _update_config(last_sync_at=_now(), last_error=None)
    return {"status": "ok", "period_id": period_id, "monthly_rows": len(monthly_rows), "daily_rows": len(daily_rows)}


def delete_period_from_cloud(period_id: str) -> dict[str, Any]:
    config = _active_config(require_enabled=True)
    safe_id = quote(period_id, safe="")
    _request(config, "DELETE", "employee_daily_records", query=f"period_id=eq.{safe_id}")
    _request(config, "DELETE", "employee_monthly_records", query=f"period_id=eq.{safe_id}")
    _request(config, "DELETE", "attendance_periods", query=f"id=eq.{safe_id}")
    _update_config(last_sync_at=_now(), last_error=None)
    return {"status": "ok", "period_id": period_id}


def submit_attendance_to_owner(
    analysis: dict[str, Any],
    source_path: Path,
    source_filename: str,
    submitted_by: str,
    factory: str,
) -> dict[str, Any]:
    config = _active_config(require_enabled=True)
    period = analysis.get("period") or {}
    month = period.get("month")
    year = period.get("year")
    if not isinstance(month, int) or not isinstance(year, int):
        raise RuntimeError("Không xác định được tháng/năm để gửi cho chủ")

    now = _now()
    period_id = f"submission_{factory}_{year}_{month:02d}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    storage_path = f"{factory}/{year}/{month:02d}/{period_id}/{_safe_storage_filename(source_filename)}"
    _upload_submission_file(config, source_path, storage_path)
    blocks = analysis.get("blocks") or []
    period_row = {
        "id": period_id,
        "factory": factory,
        "month": month,
        "year": year,
        "label": f"{period.get('label') or f'{month:02d}/{year}'} - chờ chủ duyệt",
        "source_filename": f"[STAFF_SUBMISSION] {factory} | {submitted_by} | {source_filename}",
        "source_path": storage_path,
        "output1_path": "",
        "output2_path": "",
        "sheet_name": analysis.get("sheet_name") or "",
        "block_count": len(blocks),
        "result_cells": (analysis.get("summary") or {}).get("result_cells") or 0,
        "missing_cells": (analysis.get("summary") or {}).get("missing_cells") or 0,
        "late_cells": (analysis.get("summary") or {}).get("late_cells") or 0,
        "manual_check_count": len(analysis.get("manual_checks") or []),
        "created_at": now,
        "updated_at": now,
    }
    _upsert(config, "attendance_periods", [period_row], "id")

    monthly_rows = []
    daily_rows = []
    for block in blocks:
        employee_code = str(block.get("employee_code") or "")
        total_hours = _sum_work_value(block.get("results") or [])
        monthly_rows.append(
            {
                "period_id": period_id,
                "employee_code": employee_code,
                "employee_name": "",
                "total_hours": total_hours,
                "work_days": round(total_hours / 8, 3) if total_hours else 0,
                "monthly_salary": None,
                "daily_salary": 0,
                "hourly_salary": 0,
                "standard_work_days": 26,
                "bonus": 0,
                "advance_or_penalty": 0,
                "final_salary": 0,
                "note": "Nhân viên gửi chờ chủ duyệt",
            }
        )
        for record in block.get("results") or []:
            daily_rows.append(_daily_payload(period_id, employee_code, record))

    if monthly_rows:
        _upsert(config, "employee_monthly_records", monthly_rows, "period_id,employee_code")
    if daily_rows:
        _upsert(config, "employee_daily_records", daily_rows, "period_id,employee_code,day")

    _update_config(last_sync_at=now, last_error=None)
    return {"status": "ok", "period_id": period_id, "employees": len(monthly_rows), "daily_rows": len(daily_rows)}


def list_owner_submissions(factory: str | None = None) -> dict[str, Any]:
    config = _active_config(require_enabled=True)
    factory_filter = ""
    if factory in {"factory1", "factory2"}:
        factory_filter = f"&source_filename=like.%25{factory}%25"
    rows = _request(
        config,
        "GET",
        "attendance_periods",
        query="select=id,month,year,label,source_filename,source_path,sheet_name,block_count,manual_check_count,created_at,updated_at"
        "&source_filename=like.%5BSTAFF_SUBMISSION%5D%25"
        f"{factory_filter}"
        "&order=created_at.desc",
    )
    return {"submissions": rows or []}


def get_owner_submission(period_id: str) -> dict[str, Any]:
    config = _active_config(require_enabled=True)
    rows = _request(
        config,
        "GET",
        "attendance_periods",
        query=f"select=*&id=eq.{quote(period_id, safe='')}&source_filename=like.%5BSTAFF_SUBMISSION%5D%25&limit=1",
    )
    if not rows:
        raise KeyError(period_id)
    return rows[0]


def download_submission_file(period_id: str, target_dir: Path) -> Path:
    config = _active_config(require_enabled=True)
    submission = get_owner_submission(period_id)
    storage_path = str(submission.get("source_path") or "")
    if not storage_path:
        raise RuntimeError("Hồ sơ cũ chưa có file Excel trên Supabase Storage; cần nhân viên gửi lại sau bản cập nhật này")

    filename = _filename_from_submission(submission)
    suffix = Path(filename).suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        suffix = ".xlsx"
    output_path = target_dir / f"original{suffix}"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(_storage_request(config, "GET", f"/storage/v1/object/{SUBMISSION_BUCKET}/{_quote_storage_path(storage_path)}"))
    return output_path


def sync_enabled() -> bool:
    config = get_cloud_config()
    return bool(config["enabled"] and config["configured"] and config["sync_on_save"])


def record_sync_error(exc: Exception) -> None:
    _update_config(last_error=str(exc))


def _upload_submission_file(config: dict[str, str], source_path: Path, storage_path: str) -> None:
    _ensure_submission_bucket(config)
    content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    _storage_request(
        config,
        "POST",
        f"/storage/v1/object/{SUBMISSION_BUCKET}/{_quote_storage_path(storage_path)}",
        body=source_path.read_bytes(),
        content_type=content_type,
        extra_headers={"x-upsert": "true"},
    )


def _ensure_submission_bucket(config: dict[str, str]) -> None:
    try:
        _storage_request(
            config,
            "POST",
            "/storage/v1/bucket",
            body=json.dumps({"id": SUBMISSION_BUCKET, "name": SUBMISSION_BUCKET, "public": False}).encode("utf-8"),
            content_type="application/json",
        )
    except RuntimeError as exc:
        if "HTTP 409" not in str(exc) and "already" not in str(exc).lower():
            raise


def _storage_request(
    config: dict[str, str],
    method: str,
    path: str,
    body: bytes | None = None,
    content_type: str = "application/octet-stream",
    extra_headers: dict[str, str] | None = None,
) -> bytes:
    headers = _admin_api_headers(config["service_role_key"])
    headers["Content-Type"] = content_type
    headers.update(extra_headers or {})
    request = Request(f"{config['supabase_url']}{path}", data=body, method=method, headers=headers)
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            return response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase Storage {method} failed: HTTP {exc.code} {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Supabase Storage connection failed: {exc.reason}") from exc


def _sum_work_value(records: list[dict[str, Any]]) -> float:
    total = 0.0
    for record in records:
        value = record.get("work_value")
        if isinstance(value, (int, float)):
            total += float(value)
    return round(total, 2)


def _safe_storage_filename(value: str) -> str:
    filename = Path(value or "attendance.xlsx").name
    safe = "".join(char if char.isalnum() or char in ".-_" else "_" for char in filename).strip("._")
    return safe or "attendance.xlsx"


def _quote_storage_path(value: str) -> str:
    return "/".join(quote(part, safe="") for part in value.split("/"))


def _filename_from_submission(submission: dict[str, Any]) -> str:
    source = str(submission.get("source_filename") or "")
    parts = [part.strip() for part in source.replace("[STAFF_SUBMISSION]", "").split("|")]
    return parts[-1] if parts else "attendance.xlsx"


def backup_enabled() -> bool:
    config = get_cloud_config()
    return bool(config["drive_backup_enabled"] and config["backup_on_history_change"])


def run_drive_backup(reason: str = "manual") -> dict[str, Any]:
    config = _read_config()
    result = create_drive_backup(config, reason=reason)
    _update_config(last_backup_at=_now(), last_backup_path=result["path"], last_backup_error=None)
    return result


def run_period_excel_backup(detail: dict[str, Any], reason: str = "save_history") -> dict[str, Any]:
    config = _read_config()
    result = create_period_excel_backup(config, detail, reason=reason)
    _update_config(last_backup_at=_now(), last_backup_path=result["path"], last_backup_error=None)
    return result


def run_analysis_excel_copy(
    source_path: Path,
    original_filename: str,
    month: int,
    year: int,
    factory: str = "factory1",
) -> dict[str, Any]:
    config = _read_config()
    result = create_analysis_excel_copy(config, source_path, original_filename, month, year, factory=factory)
    _update_config(last_backup_at=_now(), last_backup_path=result["path"], last_backup_error=None)
    return result


def run_final_excel_copy(
    source_path: Path,
    original_filename: str,
    month: int,
    year: int,
    factory: str = "factory1",
) -> dict[str, Any]:
    config = _read_config()
    result = create_final_excel_copy(config, source_path, original_filename, month, year, factory=factory)
    _update_config(last_backup_at=_now(), last_backup_path=result["path"], last_backup_error=None)
    return result


def list_drive_final_copies(
    month: int | None = None,
    year: int | None = None,
    factory: str | None = None,
) -> list[dict[str, Any]]:
    return list_final_excel_copies(_read_config(), month=month, year=year, factory=factory)


def resolve_drive_final_copy(copy_id: str) -> Path:
    return resolve_final_excel_copy(_read_config(), copy_id)


def delete_drive_month(month: int, year: int, factory: str) -> dict[str, Any]:
    return delete_drive_period_files(_read_config(), month=month, year=year, factory=factory)


def record_backup_error(exc: Exception) -> None:
    _update_config(last_backup_error=str(exc))


def _period_payload(period: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "id",
        "month",
        "year",
        "label",
        "source_filename",
        "source_path",
        "output1_path",
        "output2_path",
        "sheet_name",
        "block_count",
        "result_cells",
        "missing_cells",
        "late_cells",
        "manual_check_count",
        "created_at",
        "updated_at",
        "factory",
    ]
    return {key: period.get(key) for key in keys}


def _monthly_payload(period_id: str, employee: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "employee_code",
        "employee_name",
        "total_hours",
        "work_days",
        "monthly_salary",
        "daily_salary",
        "hourly_salary",
        "standard_work_days",
        "bonus",
        "advance_or_penalty",
        "final_salary",
        "note",
    ]
    payload = {key: employee.get(key) for key in keys}
    payload["period_id"] = period_id
    return payload


def _daily_payload(period_id: str, employee_code: str, record: dict[str, Any]) -> dict[str, Any]:
    return {
        "period_id": period_id,
        "employee_code": employee_code,
        "day": record.get("day"),
        "punches": record.get("punches") or [],
        "work_value": None if record.get("work_value") is None else str(record.get("work_value")),
        "missing_count": None if record.get("missing_count") is None else str(record.get("missing_count")),
        "late_minutes": record.get("late_minutes"),
        "manual_checks": record.get("manual_checks") or [],
        "review_notes": record.get("review_notes") or [],
    }


def _upsert(config: dict[str, str], table: str, rows: list[dict[str, Any]], on_conflict: str) -> None:
    query = f"on_conflict={quote(on_conflict, safe=',')}"
    try:
        _request(
            config,
            "POST",
            table,
            query=query,
            body=rows,
            extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )
    except RuntimeError as exc:
        if table != "attendance_periods" or "factory" not in str(exc):
            raise
        legacy_rows = [{key: value for key, value in row.items() if key != "factory"} for row in rows]
        _request(
            config,
            "POST",
            table,
            query=query,
            body=legacy_rows,
            extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )


def _request(
    config: dict[str, str],
    method: str,
    table: str,
    query: str = "",
    body: Any | None = None,
    extra_headers: dict[str, str] | None = None,
) -> Any:
    url = f"{config['supabase_url']}/rest/v1/{table}"
    if query:
        url = f"{url}?{query}"

    headers = _admin_api_headers(config["service_role_key"])
    headers["Content-Type"] = "application/json"
    headers.update(extra_headers or {})
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = Request(url, data=data, method=method, headers=headers)
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            text = response.read().decode("utf-8")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase {method} {table} failed: HTTP {exc.code} {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Supabase connection failed: {exc.reason}") from exc

    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def _active_config(require_enabled: bool) -> dict[str, str]:
    config = _read_config()
    if require_enabled and not config.get("enabled"):
        raise RuntimeError("Cloud sync is disabled")
    url = _normalize_supabase_url(config.get("supabase_url"))
    key = str(config.get("service_role_key") or "").strip()
    if not url or not key:
        raise RuntimeError("Supabase URL/key is not configured")
    return {"supabase_url": url, "service_role_key": key}


def _admin_api_headers(key: str) -> dict[str, str]:
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _read_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return {"enabled": False, "sync_on_save": False, "backup_on_history_change": True}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {
            "enabled": False,
            "sync_on_save": False,
            "backup_on_history_change": True,
            "last_error": "Cannot read cloud_config.json",
        }


def _write_config(config: dict[str, Any]) -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def _update_config(**updates: Any) -> None:
    config = _read_config()
    config.update(updates)
    _write_config(config)


def _normalize_supabase_url(value: Any) -> str:
    text = str(value or "").strip().rstrip("/")
    return text


def _key_hint(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 10:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")
