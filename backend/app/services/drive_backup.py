import json
import os
import re
import shutil
import zipfile
import base64
from datetime import datetime
from pathlib import Path
from typing import Any

from app.services.owner_profile_sync import sync_owner_profiles_from_workbook


ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT_DIR / "backend"
STORAGE_DIR = BACKEND_DIR / "storage"
CONFIG_DIR = BACKEND_DIR / "config"
DB_PATH = STORAGE_DIR / "attendance_history.db"
HISTORY_DIR = STORAGE_DIR / "history"
PAYROLL_DATA_PATH = CONFIG_DIR / "payroll_data.json"
FINAL_COPY_EXTENSIONS = {".xlsx", ".xlsm"}


def default_backup_dir() -> str:
    home = Path(os.environ.get("USERPROFILE") or str(Path.home()))
    candidates = [
        home / "Google Drive" / "AttendanceSystem_Backup",
        home / "My Drive" / "AttendanceSystem_Backup",
    ]
    for candidate in candidates:
        if candidate.parent.exists():
            return str(candidate)
    return str(STORAGE_DIR / "drive_backups")


def drive_backup_paths(config: dict[str, Any]) -> dict[str, str]:
    base_dir = Path(str(config.get("drive_backup_dir") or default_backup_dir())).expanduser()
    return {
        "root": str(base_dir),
        "excel": str(base_dir / "ExcelDaLuu"),
        "zip": str(base_dir / "_System_Backup_Zip"),
    }


def create_drive_backup(config: dict[str, Any], reason: str = "manual") -> dict[str, Any]:
    base_dir = Path(str(config.get("drive_backup_dir") or default_backup_dir())).expanduser()
    backup_dir = base_dir / "_System_Backup_Zip"
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    backup_path = backup_dir / f"SaoLuuHeThong_{timestamp}_{_safe_reason(reason)}.zip"
    manifest = {
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "reason": reason,
        "root": str(ROOT_DIR),
        "included": [],
        "excluded": ["backend/storage/cloud_config.json"],
    }

    with zipfile.ZipFile(backup_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        _write_file(archive, DB_PATH, "backend/storage/attendance_history.db", manifest)
        _write_file(archive, PAYROLL_DATA_PATH, "backend/config/payroll_data.json", manifest)
        _write_tree(archive, HISTORY_DIR, "backend/storage/history", manifest)
        archive.writestr("backup_manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    return {
        "status": "ok",
        "path": str(backup_path),
        "size_bytes": backup_path.stat().st_size,
        "reason": reason,
    }


def create_period_excel_backup(config: dict[str, Any], detail: dict[str, Any], reason: str = "save_history") -> dict[str, Any]:
    period = detail.get("period") or {}
    factory = _normalize_factory(period.get("factory"))
    base_dir = Path(str(config.get("drive_backup_dir") or default_backup_dir())).expanduser()
    target_dir = _excel_factory_dir(base_dir, factory) / _period_folder_name(period)
    target_dir.mkdir(parents=True, exist_ok=True)
    final_dir = _ensure_final_copy_folder(
        target_dir,
        _period_month_int(period),
        _period_year_int(period),
    )

    copied = []
    profile_sync = None
    for key, filename in (
        ("source_path", "00_file_goc.xlsx"),
        ("output1_path", "01_output_1_cham_cong.xlsx"),
        ("output2_path", "02_output_2_luong_rieng.xlsx"),
    ):
        source = Path(str(period.get(key) or ""))
        if not source.exists() or not source.is_file():
            continue
        target = target_dir / filename
        shutil.copy2(source, target)
        copied.append(str(target))
        if key == "output2_path":
            profile_sync = sync_owner_profiles_from_workbook(target)

    readme = target_dir / "README.txt"
    readme.write_text(
        "\n".join(
            [
                f"Ky cham cong: {period.get('label') or ''}",
                f"Thang/Nam: {period.get('month') or ''}/{period.get('year') or ''}",
                f"Ly do backup: {reason}",
                f"Tao luc: {datetime.now().isoformat(timespec='seconds')}",
                "",
                "00_file_goc.xlsx: file Excel goc da upload.",
                "01_output_1_cham_cong.xlsx: bang cham cong da tinh.",
                "02_output_2_luong_rieng.xlsx: bang luong/thong tin rieng.",
            ]
        ),
        encoding="utf-8",
    )
    copied.append(str(readme))

    return {
        "status": "ok",
        "path": str(target_dir),
        "final_folder": str(final_dir),
        "file_count": len(copied),
        "files": copied,
        "reason": reason,
        "factory": factory,
        "profile_sync": profile_sync,
    }


def create_analysis_excel_copy(
    config: dict[str, Any],
    source_path: Path,
    original_filename: str,
    month: int,
    year: int,
    factory: str = "factory1",
) -> dict[str, Any]:
    factory = _normalize_factory(factory)
    base_dir = Path(str(config.get("drive_backup_dir") or default_backup_dir())).expanduser()
    target_dir = _excel_factory_dir(base_dir, factory) / _period_month_folder_name(month, year)
    target_dir.mkdir(parents=True, exist_ok=True)
    final_dir = _ensure_final_copy_folder(target_dir, month, year)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    safe_name = _safe_filename(original_filename or source_path.name)
    target = target_dir / f"Xuong{2 if factory == 'factory2' else 1}_{year}-{month:02d}_BanDangPhanTich_{timestamp}_{safe_name}"
    shutil.copy2(source_path, target)
    profile_sync = sync_owner_profiles_from_workbook(target)

    readme = target_dir / "README.txt"
    readme.write_text(
        "\n".join(
            [
                f"Ky cham cong: {month:02d}/{year}",
                "Thu muc nay luu cac file Excel theo thang.",
                "Xuong*_BanDangPhanTich_*: file user dang phan tich tam trong app.",
                "BanSaoCuoiCung: file Excel chot cuoi cung do user tu chon.",
                f"Cap nhat luc: {datetime.now().isoformat(timespec='seconds')}",
            ]
        ),
        encoding="utf-8",
    )

    return {
        "status": "ok",
        "path": str(target),
        "folder": str(target_dir),
        "final_folder": str(final_dir),
        "month": month,
        "year": year,
        "factory": factory,
        "size_bytes": target.stat().st_size,
        "profile_sync": profile_sync,
    }


def create_final_excel_copy(
    config: dict[str, Any],
    source_path: Path,
    original_filename: str,
    month: int,
    year: int,
    factory: str = "factory1",
) -> dict[str, Any]:
    factory = _normalize_factory(factory)
    base_dir = Path(str(config.get("drive_backup_dir") or default_backup_dir())).expanduser()
    period_dir = _excel_factory_dir(base_dir, factory) / _period_month_folder_name(month, year)
    period_dir.mkdir(parents=True, exist_ok=True)
    target_dir = _ensure_final_copy_folder(period_dir, month, year)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    safe_name = _safe_filename(original_filename or source_path.name)
    target = target_dir / f"Xuong{2 if factory == 'factory2' else 1}_{year}-{month:02d}_BanChot_{timestamp}_{safe_name}"
    shutil.copy2(source_path, target)
    profile_sync = sync_owner_profiles_from_workbook(target)

    readme = target_dir / "README.txt"
    readme.write_text(
        "\n".join(
            [
                f"Ky cham cong: {month:02d}/{year}",
                "Thu muc nay dung de luu file Excel chot cuoi cung do nguoi dung tu chon.",
                "File trong thu muc nay khong nhat thiet phai di qua buoc Luu vao lich su cua app.",
                f"Cap nhat luc: {datetime.now().isoformat(timespec='seconds')}",
            ]
        ),
        encoding="utf-8",
    )

    return {
        "status": "ok",
        "path": str(target),
        "folder": str(target_dir),
        "month": month,
        "year": year,
        "factory": factory,
        "size_bytes": target.stat().st_size,
        "profile_sync": profile_sync,
    }


def list_final_excel_copies(
    config: dict[str, Any],
    month: int | None = None,
    year: int | None = None,
    factory: str | None = None,
) -> list[dict[str, Any]]:
    excel_dir = Path(drive_backup_paths(config)["excel"]).expanduser()
    if not excel_dir.exists():
        return []

    factory_filter = _normalize_factory(factory) if factory else None
    latest_by_period: dict[tuple[str, int, int], dict[str, Any]] = {}
    for final_dir in _iter_final_copy_dirs(excel_dir, factory_filter):
        period = _period_from_month_folder(final_dir.parent.name)
        if not period:
            continue
        item_factory = _factory_from_final_dir(excel_dir, final_dir)
        if factory_filter and item_factory != factory_filter:
            continue
        item_year, item_month = period
        if month and item_month != month:
            continue
        if year and item_year != year:
            continue

        files = [
            path
            for path in final_dir.iterdir()
            if path.is_file() and path.suffix.lower() in FINAL_COPY_EXTENSIONS
        ]
        if not files:
            continue
        latest_file = max(files, key=lambda path: path.stat().st_mtime)
        stat = latest_file.stat()
        item = {
            "id": _encode_final_copy_id(latest_file),
            "month": item_month,
            "year": item_year,
            "factory": item_factory,
            "label": f"Thang {item_month:02d}/{item_year} - ban sao cuoi cung",
            "filename": latest_file.name,
            "path": str(latest_file),
            "folder": str(final_dir),
            "size_bytes": stat.st_size,
            "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
        }
        key = (item_factory, item_year, item_month)
        current = latest_by_period.get(key)
        if not current or str(item["modified_at"]) > str(current["modified_at"]):
            latest_by_period[key] = item

    return sorted(latest_by_period.values(), key=lambda item: (item["year"], item["month"], item["modified_at"]), reverse=True)


def resolve_final_excel_copy(config: dict[str, Any], copy_id: str) -> Path:
    path = _decode_final_copy_id(copy_id)
    excel_dir = Path(drive_backup_paths(config)["excel"]).expanduser().resolve()
    resolved = path.resolve()
    if not resolved.exists() or not resolved.is_file():
        raise FileNotFoundError("Khong tim thay ban sao cuoi cung")
    if resolved.suffix.lower() not in FINAL_COPY_EXTENSIONS:
        raise ValueError("File khong phai Excel")
    if excel_dir not in resolved.parents:
        raise ValueError("File khong nam trong thu muc Drive cua AttendanceSystem")
    if resolved.parent.name != "BanSaoCuoiCung":
        raise ValueError("File khong nam trong thu muc BanSaoCuoiCung")
    return resolved


def delete_drive_period_files(
    config: dict[str, Any],
    month: int,
    year: int,
    factory: str = "factory1",
) -> dict[str, Any]:
    if month < 1 or month > 12 or year < 2000:
        raise ValueError("Thang/nam khong hop le")

    base_dir = Path(str(config.get("drive_backup_dir") or default_backup_dir())).expanduser()
    excel_dir = (base_dir / "ExcelDaLuu").resolve()
    period_name = _period_month_folder_name(month, year)
    normalized_factory = _normalize_factory(factory)
    candidates = [excel_dir / _factory_folder_name(normalized_factory) / period_name]
    if normalized_factory == "factory1":
        candidates.append(excel_dir / period_name)

    deleted_paths: list[str] = []
    for candidate in candidates:
        resolved = candidate.resolve()
        if excel_dir not in resolved.parents or resolved.name != period_name:
            raise ValueError("Thu muc thang khong nam trong vung Drive cua AttendanceSystem")
        if not resolved.exists():
            continue
        if not resolved.is_dir():
            raise ValueError("Duong dan thang tren Drive khong phai thu muc")
        shutil.rmtree(resolved)
        deleted_paths.append(str(resolved))

    return {
        "status": "ok",
        "factory": normalized_factory,
        "month": month,
        "year": year,
        "deleted_count": len(deleted_paths),
        "deleted_paths": deleted_paths,
    }


def _write_file(archive: zipfile.ZipFile, path: Path, arcname: str, manifest: dict[str, Any]) -> None:
    if not path.exists() or not path.is_file():
        return
    archive.write(path, arcname)
    manifest["included"].append(arcname)


def _write_tree(archive: zipfile.ZipFile, root: Path, arc_root: str, manifest: dict[str, Any]) -> None:
    if not root.exists():
        return
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        arcname = f"{arc_root}/{path.relative_to(root).as_posix()}"
        archive.write(path, arcname)
        manifest["included"].append(arcname)


def _safe_reason(value: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in "-_" else "_" for char in value.strip().lower())
    return cleaned.strip("_") or "manual"


def _period_folder_name(period: dict[str, Any]) -> str:
    year = _period_year_int(period)
    month = _period_month_int(period)
    return _period_month_folder_name(month, year)


def _period_month_folder_name(month: int, year: int) -> str:
    return f"{year}-{month:02d} - Thang {month:02d} nam {year}"


def _normalize_factory(value: object) -> str:
    return "factory2" if str(value or "").strip() == "factory2" else "factory1"


def _factory_folder_name(factory: str) -> str:
    return "Xuong2" if _normalize_factory(factory) == "factory2" else "Xuong1"


def _excel_factory_dir(base_dir: Path, factory: str) -> Path:
    return base_dir / "ExcelDaLuu" / _factory_folder_name(factory)


def _iter_final_copy_dirs(excel_dir: Path, factory: str | None):
    if factory:
        yield from (excel_dir / _factory_folder_name(factory)).glob("*/BanSaoCuoiCung")
        if factory == "factory1":
            yield from excel_dir.glob("*/BanSaoCuoiCung")
        return

    yield from excel_dir.glob("Xuong1/*/BanSaoCuoiCung")
    yield from excel_dir.glob("Xuong2/*/BanSaoCuoiCung")
    yield from excel_dir.glob("*/BanSaoCuoiCung")


def _factory_from_final_dir(excel_dir: Path, final_dir: Path) -> str:
    try:
        relative = final_dir.relative_to(excel_dir)
    except ValueError:
        return "factory1"
    first = relative.parts[0] if relative.parts else ""
    if first == "Xuong2":
        return "factory2"
    return "factory1"


def _period_from_month_folder(value: str) -> tuple[int, int] | None:
    match = re.match(r"^(\d{4})-(\d{2})\b", value)
    if not match:
        return None
    year = int(match.group(1))
    month = int(match.group(2))
    if month < 1 or month > 12:
        return None
    return year, month


def _encode_final_copy_id(path: Path) -> str:
    raw = str(path.resolve()).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_final_copy_id(value: str) -> Path:
    padding = "=" * (-len(value) % 4)
    try:
        raw = base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii")).decode("utf-8")
    except Exception as exc:
        raise ValueError("Ma ban sao cuoi cung khong hop le") from exc
    return Path(raw)


def _period_month_int(period: dict[str, Any]) -> int:
    try:
        month = int(period.get("month") or 0)
    except (TypeError, ValueError):
        month = 0
    return month if 1 <= month <= 12 else 0


def _period_year_int(period: dict[str, Any]) -> int:
    try:
        year = int(period.get("year") or 0)
    except (TypeError, ValueError):
        year = 0
    return year if year > 0 else datetime.now().year


def _ensure_final_copy_folder(period_dir: Path, month: int, year: int) -> Path:
    target_dir = period_dir / "BanSaoCuoiCung"
    target_dir.mkdir(parents=True, exist_ok=True)
    readme = target_dir / "README.txt"
    if not readme.exists():
        readme.write_text(
            "\n".join(
                [
                    f"Ky cham cong: {month:02d}/{year}",
                    "Thu muc nay dung de luu file Excel chot cuoi cung do nguoi dung tu chon.",
                    "Co the co thu muc nay truoc khi co file chot de tranh luu nham thang.",
                ]
            ),
            encoding="utf-8",
        )
    return target_dir


def _created_time_label(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        parsed = datetime.now()
    return parsed.strftime("%Hh%M ngay %d-%m-%Y")


def _safe_filename(value: str) -> str:
    path = Path(value).name
    cleaned = "".join(char if char.isalnum() or char in " ._-" else "_" for char in path).strip()
    return cleaned or "file_chot.xlsx"
