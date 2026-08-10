from __future__ import annotations

import shutil
import zipfile
import filecmp
from pathlib import Path


EXPORT_FOLDERS = {
    "output1": "01_Output1",
    "output2": "02_Output2_BangLuong",
    "employee_cards": "03_AnhChamCong",
    "bank": "04_NganHang",
    "conversion": "05_ChuyenKhung",
    "mapping": "06_GanDuLieu",
    "recalculated": "07_TinhLai",
    "history": "08_BanChot_LichSu",
}


def ensure_local_export_folders(
    root: Path | str | None = None,
    factory: str = "factory1",
) -> dict[str, Path]:
    if root is None:
        from app.services.cloud_sync import get_cloud_config

        root = get_cloud_config().get("local_export_dir")
    base = Path(str(root or "")).expanduser()
    if not base.is_absolute():
        storage = Path(__file__).resolve().parents[2] / "storage"
        base = (storage / base).resolve()
    base.mkdir(parents=True, exist_ok=True)
    trees: dict[str, dict[str, Path]] = {}
    for factory_key, factory_folder in (("factory1", "Xuong1"), ("factory2", "Xuong2")):
        factory_root = base / factory_folder
        trees[factory_key] = {key: factory_root / name for key, name in EXPORT_FOLDERS.items()}
        for folder in trees[factory_key].values():
            folder.mkdir(parents=True, exist_ok=True)
    migrate_legacy_local_export_folders(base)
    return trees["factory2" if factory == "factory2" else "factory1"]


def migrate_legacy_local_export_folders(root: Path | str) -> dict[str, object]:
    """Move files from the former shared category folders into factory trees.

    Existing files are never overwritten. Files whose factory cannot be
    determined remain untouched so setup cannot silently misfile user data.
    Empty legacy folders are removed only after every contained file has been
    classified and moved.
    """

    base = Path(root).expanduser().resolve()
    moved: list[dict[str, str]] = []
    copied_pending_cleanup: list[dict[str, str]] = []
    failed: list[dict[str, str]] = []
    unresolved: list[str] = []
    removed_folders: list[str] = []
    for category, folder_name in EXPORT_FOLDERS.items():
        legacy_dir = base / folder_name
        if not legacy_dir.is_dir():
            continue
        files = sorted(
            (path for path in legacy_dir.rglob("*") if path.is_file() and not path.name.startswith("~$")),
            key=lambda path: str(path).casefold(),
        )
        for source in files:
            factory = _infer_legacy_export_factory(source, legacy_dir)
            if factory is None:
                unresolved.append(str(source))
                continue
            factory_folder = "Xuong2" if factory == "factory2" else "Xuong1"
            target_dir = base / factory_folder / folder_name
            target_dir.mkdir(parents=True, exist_ok=True)
            desired = target_dir / source.name
            if desired.exists() and _same_file_contents(source, desired):
                try:
                    source.unlink()
                    moved.append({"source": str(source), "target": str(desired), "category": category, "factory": factory})
                except OSError as exc:
                    copied_pending_cleanup.append({"source": str(source), "target": str(desired), "error": str(exc)})
                continue
            target = _available_path(desired)
            try:
                shutil.move(str(source), str(target))
                moved.append({"source": str(source), "target": str(target), "category": category, "factory": factory})
            except PermissionError as exc:
                try:
                    shutil.copy2(source, target)
                    copied_pending_cleanup.append({"source": str(source), "target": str(target), "error": str(exc)})
                except OSError as copy_exc:
                    failed.append({"source": str(source), "target": str(target), "error": str(copy_exc)})
            except OSError as exc:
                failed.append({"source": str(source), "target": str(target), "error": str(exc)})

        for directory in sorted((path for path in legacy_dir.rglob("*") if path.is_dir()), key=lambda path: len(path.parts), reverse=True):
            try:
                directory.rmdir()
            except OSError:
                pass
        try:
            legacy_dir.rmdir()
            removed_folders.append(str(legacy_dir))
        except OSError:
            pass
    return {
        "moved": moved,
        "copied_pending_cleanup": copied_pending_cleanup,
        "failed": failed,
        "unresolved": unresolved,
        "removed_folders": removed_folders,
    }


def save_local_export_copy(
    source: Path,
    category: str,
    filename: str | None = None,
    factory: str | None = None,
) -> Path:
    folders = ensure_local_export_folders(factory=factory or "factory1")
    target_dir = folders.get(category, Path(next(iter(folders.values()))).parent)
    desired = target_dir / (filename or source.name)
    target = _available_path(desired)
    shutil.copy2(source, target)
    return target


def try_save_local_export_copy(
    source: Path,
    category: str,
    filename: str | None = None,
    factory: str | None = None,
) -> Path | None:
    try:
        return save_local_export_copy(source, category, filename, factory=factory)
    except OSError:
        return None


def _available_path(path: Path) -> Path:
    if not path.exists():
        return path
    for index in range(2, 10000):
        candidate = path.with_name(f"{path.stem} ({index}){path.suffix}")
        if not candidate.exists():
            return candidate
    raise ValueError(f"Không tạo được tên file mới trong thư mục: {path.parent}")


def _infer_legacy_export_factory(path: Path, legacy_dir: Path) -> str | None:
    relative_parts = [part.replace(" ", "").casefold() for part in path.relative_to(legacy_dir).parts[:-1]]
    normalized_name = path.name.replace(" ", "").casefold()
    if "xuong2" in relative_parts or "xuong2" in normalized_name:
        return "factory2"
    if "xuong1" in relative_parts or "xuong1" in normalized_name:
        return "factory1"

    if path.suffix.lower() == ".zip":
        try:
            with zipfile.ZipFile(path) as archive:
                roots = {name.split("/", 1)[0].replace(" ", "").casefold() for name in archive.namelist() if name}
            if "xuong2" in roots:
                return "factory2"
            if "xuong1" in roots:
                return "factory1"
        except (OSError, zipfile.BadZipFile):
            return None

    if path.suffix.lower() in {".xlsx", ".xlsm"}:
        try:
            from openpyxl import load_workbook

            workbook = load_workbook(path, read_only=True, data_only=False, keep_vba=path.suffix.lower() == ".xlsm")
            try:
                worksheet = workbook.active
                sample = " ".join(
                    str(worksheet.cell(row=row, column=column).value or "")
                    for row in range(1, min(worksheet.max_row, 14) + 1)
                    for column in range(1, min(worksheet.max_column, 14) + 1)
                ).replace(" ", "").casefold()
            finally:
                workbook.close()
            if "xuong2" in sample:
                return "factory2"
            if "xuong1" in sample:
                return "factory1"
        except Exception:
            return None
    return None


def _same_file_contents(left: Path, right: Path) -> bool:
    try:
        return left.stat().st_size == right.stat().st_size and filecmp.cmp(left, right, shallow=False)
    except OSError:
        return False
