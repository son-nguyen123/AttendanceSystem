from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from app.services.local_exports import organize_existing_local_exports, save_local_export_copy


class PeriodExportFolderTests(unittest.TestCase):
    def test_explicit_period_creates_year_and_month_folders(self) -> None:
        with TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            source = root / "Output2.xlsx"
            source.write_bytes(b"workbook")
            config = {"local_export_dir": str(root / "exports")}

            with patch("app.services.cloud_sync.get_cloud_config", return_value=config):
                target = save_local_export_copy(
                    source,
                    "output2",
                    factory="factory2",
                    month=7,
                    year=2026,
                )

            self.assertEqual(
                target.parent,
                root / "exports" / "Xuong2" / "02_Output2_BangLuong" / "2026" / "Thang_07",
            )

    def test_filename_period_is_used_for_zip_exports(self) -> None:
        with TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            source = root / "cards.zip"
            source.write_bytes(b"zip")
            config = {"local_export_dir": str(root / "exports")}

            with patch("app.services.cloud_sync.get_cloud_config", return_value=config):
                target = save_local_export_copy(
                    source,
                    "employee_cards",
                    "Xuong1_2027-01_AnhBangLuong.zip",
                    factory="factory1",
                )

            self.assertEqual(
                target.parent,
                root / "exports" / "Xuong1" / "03_AnhChamCong" / "2027" / "Thang_01",
            )

    def test_unknown_period_is_isolated(self) -> None:
        with TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            source = root / "unknown.zip"
            source.write_bytes(b"zip")
            config = {"local_export_dir": str(root / "exports")}

            with patch("app.services.cloud_sync.get_cloud_config", return_value=config):
                target = save_local_export_copy(source, "mapping", factory="factory1")

            self.assertEqual(target.parent.name, "ChuaXacDinh")

    def test_existing_direct_file_is_organized_without_overwrite(self) -> None:
        with TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            category = root / "Xuong2" / "03_AnhChamCong"
            category.mkdir(parents=True)
            source = category / "Xuong2_2026-07_AnhBangLuong.zip"
            source.write_bytes(b"existing")

            result = organize_existing_local_exports(root)

            target = category / "2026" / "Thang_07" / source.name
            self.assertTrue(target.exists())
            self.assertFalse(source.exists())
            self.assertEqual(len(result["moved"]), 1)


if __name__ == "__main__":
    unittest.main()
