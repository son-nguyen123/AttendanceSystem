from pathlib import Path
import unittest

from openpyxl import Workbook, load_workbook

from app.services.factory1_workbook import _select_sheet, export_factory1_legacy_output2, reconciliation_warning_count


def _legacy_workbook(path: Path) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "May"
    sheet["A1"] = "Att. Time"
    sheet["C1"] = "2026-05-01 ~ 2026-05-31"
    sheet["D2"] = 1
    sheet["A3"] = "Mã:"
    sheet["C3"] = "1001"
    sheet["D4"] = "07:2707:2711:3512:5817:01"
    sheet["D7"] = 8

    sheet.cell(3, 32).value = "Tổng giờ công"
    sheet.cell(3, 33).value = "Mã"
    sheet.cell(3, 34).value = "Tên nhân viên"
    sheet.cell(3, 35).value = "Mức lương"
    sheet.cell(3, 36).value = "Lương 1 Ngày Công"
    sheet.cell(3, 37).value = "Lương 1 Giờ Công"
    sheet.cell(3, 38).value = "Số Ngày Đi Làm"
    sheet.cell(3, 39).value = "Giờ làm thêm"
    sheet.cell(3, 40).value = "Thưởng"
    sheet.cell(3, 41).value = "Ứng Lương + Phạt"
    sheet.cell(3, 42).value = "Lương Tháng 05/2026"
    sheet.cell(8, 33).value = "1001"
    sheet.cell(8, 34).value = "Nguyễn Thị Mẫu"
    sheet.cell(8, 35).value = 3120000
    sheet.cell(8, 39).value = 2.5
    sheet.cell(8, 40).value = 100000
    sheet.cell(8, 41).value = 500000
    sheet.cell(8, 42).value = -223750
    sheet.cell(7, 34).value = "012345678901"
    sheet.cell(7, 35).value = "Ghi chú hàng vàng"
    sheet.cell(9, 34).value = "T3/2023"
    sheet.cell(9, 35).value = "Ghi chú cũ"
    workbook.save(path)


class Factory1LegacyConversionTests(unittest.TestCase):
    def test_selects_complete_sheet_instead_of_a_duplicate_code_draft(self):
        workbook = Workbook()
        draft = workbook.active
        draft.title = "Draft"
        complete = workbook.create_sheet("Complete")
        for sheet, codes in ((draft, ("1001", "1001")), (complete, ("1001", "1002"))):
            for index, code in enumerate(codes):
                top = index * 8 + 1
                sheet.cell(top, 1).value = "Att. Time"
                sheet.cell(top + 2, 1).value = "Mã:"
                sheet.cell(top + 2, 3).value = code
        self.assertEqual(_select_sheet(workbook).title, "Complete")

    def test_keeps_notes_and_writes_formulas(self):
        import tempfile

        temp_dir = Path(tempfile.mkdtemp(prefix="factory1-test-"))
        try:
            source = temp_dir / "legacy.xlsx"
            output = temp_dir / "converted.xlsx"
            _legacy_workbook(source)

            export_factory1_legacy_output2(source, output)
            sheet = load_workbook(output, data_only=False).active

            self.assertEqual(sheet["D4"].value, "07:27\n11:35\n12:58\n17:01")
            self.assertEqual(sheet["D7"].value, 8)
            self.assertEqual(sheet["D7"].alignment.horizontal, "center")
            self.assertEqual(sheet.column_dimensions["A"].width, 6.2)
            self.assertEqual(sheet.column_dimensions["AE"].width, 6.2)
            self.assertEqual(sheet["AH7"].value, "1001")
            self.assertEqual(sheet["AI7"].value, "NGUYEN THI MAU")
            self.assertEqual(sheet["AJ7"].value, 3120000)
            self.assertTrue(sheet["AK7"].value.startswith("=IF("))
            self.assertTrue(sheet["AL7"].value.startswith("=IF("))
            self.assertTrue(sheet["AM7"].value.startswith("=SUM("))
            self.assertEqual(sheet["AN7"].value, 2.5)
            self.assertEqual(sheet["AO7"].value, 100000)
            self.assertEqual(sheet["AQ7"].value, 500000)
            self.assertTrue(sheet["AP7"].value.startswith("=IF("))
            self.assertTrue(str(sheet["AI8"].value).startswith("Bắt đầu làm"))
            self.assertIn("Ghi chú hàng vàng", sheet["AJ8"].value)
            self.assertIn("Ghi chú cũ", sheet["AJ8"].value)
            self.assertEqual(sheet["AI6"].value, "012345678901")
            self.assertIn(sheet["AH6"].value, (None, ""))
            self.assertTrue(sheet["AR7"].value.startswith("=IF("))
            self.assertEqual(sheet.parent.calculation.calcMode, "auto")
            self.assertTrue(sheet.parent.calculation.fullCalcOnLoad)
            self.assertTrue(sheet.parent.calculation.forceFullCalc)
        finally:
            import shutil

            shutil.rmtree(temp_dir, ignore_errors=True)

    def test_preserves_historical_work_and_forces_formula_recalculation(self):
        import tempfile

        temp_dir = Path(tempfile.mkdtemp(prefix="factory1-history-work-test-"))
        try:
            source = temp_dir / "legacy.xlsx"
            output = temp_dir / "converted.xlsx"
            _legacy_workbook(source)

            workbook = load_workbook(source)
            sheet = workbook.active
            sheet["D7"] = 9.75
            sheet["D8"] = 8
            sheet.cell(8, 42).value = -197500
            workbook.calculation.calcMode = "manual"
            workbook.calculation.fullCalcOnLoad = False
            workbook.calculation.forceFullCalc = False
            workbook.save(source)
            workbook.close()

            export_factory1_legacy_output2(source, output)
            converted = load_workbook(output, data_only=False)
            sheet = converted.active
            self.assertEqual(sheet["D7"].value, 9.75)
            self.assertEqual(sheet["D8"].value, 8)
            self.assertEqual(sheet["AN7"].value, 8)
            self.assertEqual(converted.calculation.calcMode, "auto")
            self.assertTrue(converted.calculation.fullCalcOnLoad)
            self.assertTrue(converted.calculation.forceFullCalc)
            converted.close()
        finally:
            import shutil

            shutil.rmtree(temp_dir, ignore_errors=True)

    def test_keeps_separate_penalty_and_advance_inputs_when_old_file_has_both(self):
        import tempfile

        temp_dir = Path(tempfile.mkdtemp(prefix="factory1-separate-deductions-test-"))
        try:
            source = temp_dir / "legacy.xlsx"
            output = temp_dir / "converted.xlsx"
            _legacy_workbook(source)

            workbook = load_workbook(source)
            sheet = workbook.active
            sheet.cell(3, 41).value = "Phạt NQ"
            sheet.cell(8, 41).value = 100000
            sheet.cell(3, 42).value = "Ứng Lương"
            sheet.cell(8, 42).value = 500000
            sheet.cell(3, 43).value = "Lương Tháng 05/2026"
            sheet.cell(8, 43).value = -323750
            workbook.save(source)
            workbook.close()

            export_factory1_legacy_output2(source, output)
            converted = load_workbook(output, data_only=False)
            sheet = converted.active
            self.assertEqual(sheet["AO7"].value, 100000)
            self.assertEqual(sheet["AP7"].value, 100000)
            self.assertEqual(sheet["AQ7"].value, 500000)
            self.assertTrue(sheet["AR7"].value.startswith("=IF("))
            converted.close()
        finally:
            import shutil

            shutil.rmtree(temp_dir, ignore_errors=True)

    def test_recovers_overtime_and_bonus_when_old_headers_are_blank(self):
        import tempfile

        temp_dir = Path(tempfile.mkdtemp(prefix="factory1-blank-headers-test-"))
        try:
            source = temp_dir / "legacy.xlsx"
            output = temp_dir / "converted.xlsx"
            _legacy_workbook(source)
            workbook = load_workbook(source)
            sheet = workbook.active
            sheet.cell(3, 39).value = None
            sheet.cell(3, 40).value = None
            workbook.save(source)
            workbook.close()

            export_factory1_legacy_output2(source, output)
            converted = load_workbook(output, data_only=False)
            sheet = converted.active
            self.assertEqual(sheet["AN7"].value, 2.5)
            self.assertEqual(sheet["AO7"].value, 100000)
            self.assertEqual(sheet["AQ7"].value, 500000)
            converted.close()
        finally:
            import shutil

            shutil.rmtree(temp_dir, ignore_errors=True)

    def test_keeps_an_explicitly_blank_old_bonus_blank(self):
        import tempfile

        temp_dir = Path(tempfile.mkdtemp(prefix="factory1-blank-bonus-test-"))
        try:
            source = temp_dir / "legacy.xlsx"
            output = temp_dir / "converted.xlsx"
            _legacy_workbook(source)
            workbook = load_workbook(source)
            sheet = workbook.active
            sheet.cell(8, 40).value = None
            sheet.cell(8, 42).value = -323750
            workbook.save(source)
            workbook.close()

            export_factory1_legacy_output2(source, output)
            converted = load_workbook(output, data_only=False)
            self.assertIsNone(converted.active["AO7"].value)
            converted.close()
        finally:
            import shutil

            shutil.rmtree(temp_dir, ignore_errors=True)

    def test_adds_a_review_sheet_when_old_final_conflicts_with_old_inputs(self):
        import tempfile

        temp_dir = Path(tempfile.mkdtemp(prefix="factory1-reconciliation-test-"))
        try:
            source = temp_dir / "legacy.xlsx"
            output = temp_dir / "converted.xlsx"
            _legacy_workbook(source)
            workbook = load_workbook(source)
            workbook.active.cell(8, 42).value = 999999
            workbook.save(source)
            workbook.close()

            export_factory1_legacy_output2(source, output)
            converted = load_workbook(output, data_only=False)
            self.assertIn("Đối chiếu chuyển khung", converted.sheetnames)
            self.assertEqual(converted["Đối chiếu chuyển khung"]["A5"].value, "1001")
            converted.close()
            self.assertEqual(reconciliation_warning_count(output), 1)
        finally:
            import shutil

            shutil.rmtree(temp_dir, ignore_errors=True)
