from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import drive_backup
from backend.tests.test_workbook_guard import _write_output2


class FinalCopyStorageTests(unittest.TestCase):
    def test_listing_ignores_legacy_copy_and_keeps_valid_copy_for_same_month(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            final_dir = root / "ExcelDaLuu" / "Xuong1" / "2026-06 - Thang 06 nam 2026" / "BanSaoCuoiCung"
            final_dir.mkdir(parents=True)
            legacy = final_dir / "legacy.xlsx"
            current = final_dir / "current.xlsx"
            _write_output2(legacy, month=6, reformed=False)
            _write_output2(current, month=6, reformed=True)

            # Make the invalid file look newer. The valid file must still be
            # the one exposed for the month after role filtering.
            current.touch()
            legacy.touch()

            copies = drive_backup.list_final_excel_copies(
                {"drive_backup_dir": str(root)},
                factory="factory1",
            )

            self.assertEqual(len(copies), 1)
            self.assertEqual(copies[0]["filename"], current.name)

    def test_drive_delete_reports_partial_failure_instead_of_raising(self) -> None:
        with TemporaryDirectory() as temp_dir:
            config = {"drive_backup_dir": temp_dir}

            with patch.object(drive_backup.shutil, "rmtree", side_effect=PermissionError("Drive offline")):
                result = drive_backup.delete_drive_period_files(config, month=6, year=2026)

            self.assertEqual(result["status"], "partial")
            self.assertEqual(result["error_count"], 2)
            self.assertTrue(all("Drive offline" in item["error"] for item in result["errors"]))

    def test_replacing_final_copy_keeps_only_newest_and_delete_is_individual(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source.xlsx"
            _write_output2(source, month=6, reformed=True)
            config = {"drive_backup_dir": str(root / "drive")}

            first = drive_backup.create_final_excel_copy(
                config,
                source,
                "first.xlsx",
                month=6,
                year=2026,
                profile_sync_mode="keep_manual",
            )
            second = drive_backup.create_final_excel_copy(
                config,
                source,
                "second.xlsx",
                month=6,
                year=2026,
                profile_sync_mode="keep_manual",
                replace_existing=True,
            )

            self.assertFalse(Path(first["path"]).exists())
            copies = drive_backup.list_final_excel_copies(config, month=6, year=2026, factory="factory1")
            self.assertEqual(len(copies), 1)
            self.assertEqual(copies[0]["filename"], Path(second["path"]).name)

            drive_backup.delete_final_excel_copy(config, copies[0]["id"])
            self.assertFalse(Path(second["path"]).exists())

    def test_machine_delete_preserves_final_copy_folder(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            period_dir = root / "ExcelDaLuu" / "Xuong1" / "2026-06 - Thang 06 nam 2026"
            final_dir = period_dir / "BanSaoCuoiCung"
            final_dir.mkdir(parents=True)
            (period_dir / "01_output_1_cham_cong.xlsx").write_bytes(b"machine")
            final_file = final_dir / "final.xlsx"
            final_file.write_bytes(b"final")

            result = drive_backup.delete_drive_machine_files(
                {"drive_backup_dir": str(root)}, month=6, year=2026, factory="factory1"
            )

            self.assertEqual(result["status"], "ok")
            self.assertFalse((period_dir / "01_output_1_cham_cong.xlsx").exists())
            self.assertTrue(final_file.exists())


if __name__ == "__main__":
    unittest.main()
