from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from app.services import cloud_sync


class LocalDriveDualSaveTests(unittest.TestCase):
    def test_final_copy_is_saved_to_drive_and_local_factory_folder(self) -> None:
        with TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            source = root / "source.xlsx"
            source.write_bytes(b"source-workbook")
            drive_target = root / "drive" / "Xuong2_2026-07_BanChot_source.xlsx"
            drive_target.parent.mkdir(parents=True)
            drive_target.write_bytes(source.read_bytes())
            config = {
                "drive_backup_dir": str(root / "drive"),
                "local_export_dir": str(root / "local"),
            }
            drive_result = {
                "status": "ok",
                "path": str(drive_target),
                "folder": str(drive_target.parent),
                "factory": "factory2",
            }

            with (
                patch.object(cloud_sync, "_read_config", return_value=config),
                patch.object(cloud_sync, "create_final_excel_copy", return_value=drive_result),
                patch.object(cloud_sync, "_update_config"),
            ):
                result = cloud_sync.run_final_excel_copy(
                    source,
                    source.name,
                    7,
                    2026,
                    factory="factory2",
                )

            local_path = Path(result["local_path"])
            self.assertEqual(local_path.parent, root / "local" / "Xuong2" / "08_BanChot_LichSu")
            self.assertEqual(local_path.read_bytes(), source.read_bytes())
            self.assertEqual(result["path"], str(drive_target))


if __name__ == "__main__":
    unittest.main()
