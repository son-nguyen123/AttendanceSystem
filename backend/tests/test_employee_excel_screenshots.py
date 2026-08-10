import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import zipfile

from openpyxl import Workbook

from app.services.employee_cards import export_employee_screenshots_from_workbook
from app.services.local_exports import ensure_local_export_folders, save_local_export_copy


class EmployeeExcelScreenshotTests(unittest.TestCase):
    def test_legacy_shared_folders_are_migrated_without_overwrite(self) -> None:
        with TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            old_output2 = root / "02_Output2_BangLuong"
            old_bank = root / "04_NganHang"
            old_output2.mkdir(parents=True)
            old_bank.mkdir(parents=True)
            workbook = Workbook()
            workbook.active["A1"] = "Bang cong Xuong 2 07/2026"
            workbook.save(old_output2 / "Output2.xlsx")
            (old_bank / "Xuong1_2026-07_BangLuongNganHang.xlsx").write_bytes(b"bank-placeholder")

            ensure_local_export_folders(root, factory="factory1")

            self.assertTrue((root / "Xuong2" / "02_Output2_BangLuong" / "Output2.xlsx").exists())
            self.assertTrue((root / "Xuong1" / "04_NganHang" / "Xuong1_2026-07_BangLuongNganHang.xlsx").exists())
            self.assertFalse(old_output2.exists())
            self.assertFalse(old_bank.exists())

    def test_local_employee_image_exports_are_split_by_factory(self) -> None:
        with TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            source = root / "cards.zip"
            source.write_bytes(b"zip-placeholder")
            export_root = root / "exports"
            with patch("app.services.cloud_sync.get_cloud_config", return_value={"local_export_dir": str(export_root)}):
                factory1_target = save_local_export_copy(source, "employee_cards", "factory1.zip", factory="factory1")
                factory2_target = save_local_export_copy(source, "employee_cards", "factory2.zip", factory="factory2")
                factory1_output = save_local_export_copy(source, "output1", "output1.zip", factory="factory1")
                factory2_output = save_local_export_copy(source, "output1", "output1.zip", factory="factory2")

            self.assertEqual(factory1_target.parent, export_root / "Xuong1" / "03_AnhChamCong")
            self.assertEqual(factory2_target.parent, export_root / "Xuong2" / "03_AnhChamCong")
            self.assertEqual(factory1_output.parent, export_root / "Xuong1" / "01_Output1")
            self.assertEqual(factory2_output.parent, export_root / "Xuong2" / "01_Output1")

    def test_exports_one_exact_excel_range_per_employee(self) -> None:
        with TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            workbook_path = root / "attendance.xlsx"
            output_path = root / "employee-images.zip"
            workbook = Workbook()
            worksheet = workbook.active
            worksheet.title = "Bang cong"
            for header_row, code, name in ((3, "1006", "Ho Thi Tu Uyen"), (11, "1229", "Truong Ngoc Vu")):
                worksheet.cell(header_row, 1, "Att. Time")
                worksheet.cell(header_row + 2, 1, "M\u00e3:")
                worksheet.cell(header_row + 2, 3, code)
                worksheet.cell(header_row + 6, 34, name)
            workbook.save(workbook_path)

            captured_jobs: list[dict[str, str]] = []

            def fake_excel_export(_workbook_path, jobs_path, output_dir, job_count):
                jobs = json.loads(jobs_path.read_text(encoding="utf-8"))
                self.assertEqual(job_count, 2)
                captured_jobs.extend(jobs)
                for job in jobs:
                    (output_dir / job["filename"]).write_bytes(b"valid-png-placeholder")

            with patch("app.services.employee_cards._run_excel_range_export", side_effect=fake_excel_export):
                export_employee_screenshots_from_workbook(workbook_path, output_path, "output1")

            self.assertEqual([job["range"] for job in captured_jobs], ["A3:AI10", "A11:AI18"])
            with zipfile.ZipFile(output_path) as archive:
                self.assertEqual(len(archive.namelist()), 2)
                self.assertTrue(all(name.endswith(".png") for name in archive.namelist()))
                self.assertTrue(all(name.startswith("Xuong1/") for name in archive.namelist()))

            output2_path = root / "employee-images-output2.zip"
            captured_jobs.clear()
            with patch("app.services.employee_cards._run_excel_range_export", side_effect=fake_excel_export):
                export_employee_screenshots_from_workbook(workbook_path, output2_path, "output2", factory="factory2")
            self.assertEqual([job["range"] for job in captured_jobs], ["A3:AR10", "A11:AR18"])
            with zipfile.ZipFile(output2_path) as archive:
                self.assertTrue(all(name.startswith("Xuong2/") for name in archive.namelist()))


if __name__ == "__main__":
    unittest.main()
