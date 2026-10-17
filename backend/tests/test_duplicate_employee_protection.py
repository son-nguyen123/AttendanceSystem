from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

from fastapi import HTTPException
from openpyxl import Workbook

from app.api import routes_payroll
from app.services import bank_payroll


class DuplicateEmployeeProtectionTests(TestCase):
    def test_duplicate_bank_account_cannot_be_saved_or_exported(self):
        with TemporaryDirectory() as temp:
            registry_path = Path(temp) / "accounts.json"
            registry_path.write_text("{}", encoding="utf-8")
            rows = [
                {"employee_code": "1412", "name": "A", "account_number": "0012345678"},
                {"employee_code": "1413", "name": "B", "account_number": "0012345678"},
            ]
            with patch.object(bank_payroll, "REGISTRY_PATH", registry_path):
                with self.assertRaisesRegex(ValueError, "trùng"):
                    bank_payroll.save_accounts("factory2", rows)
                self.assertEqual(registry_path.read_text(encoding="utf-8"), "{}")
                snapshot = {"factory": "factory2", "employees": rows}
                with self.assertRaisesRegex(ValueError, "trùng"):
                    bank_payroll._prepare_bank_export_rows(snapshot, rows, "leave_blank")

    def test_profile_creation_cannot_overwrite_existing_code(self):
        for original_code in ("", "2000"):
            with self.subTest(original_code=original_code):
                request = routes_payroll.PayrollSaveRequest(
                    employee_code=" 1412 ", original_employee_code=original_code, name="New person",
                )
                with patch.object(routes_payroll, "load_payroll_data", return_value={"1412": {"name": "Existing person"}}), \
                     patch.object(routes_payroll, "save_payroll_entry") as save:
                    with self.assertRaises(HTTPException) as caught:
                        routes_payroll.save_payroll(request, user={})
                    self.assertEqual(caught.exception.status_code, 409)
                    self.assertIn("Existing person", caught.exception.detail)
                    save.assert_not_called()

    def test_editing_selected_profile_and_creating_unique_code_are_allowed(self):
        for code, original_code in (("1412", "1412"), ("2000", "")):
            with self.subTest(code=code):
                request = routes_payroll.PayrollSaveRequest(employee_code=code, original_employee_code=original_code)
                with patch.object(routes_payroll, "load_payroll_data", return_value={"1412": {"name": "Existing person"}}), \
                     patch.object(routes_payroll, "save_payroll_entry") as save:
                    result = routes_payroll.save_payroll(request, user={})
                    self.assertEqual(result["status"], "ok")
                    save.assert_called_once()

    def test_scanner_rejects_duplicate_codes_with_both_locations(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Luong"
        for header_row, name in ((1, "Person A"), (4, "Person B")):
            for col, value in enumerate(["Ma", "Ten nhan vien", "So Ngay Di Lam", "Luong Thang 7/2026"], 1):
                sheet.cell(header_row, col, value)
            for col, value in enumerate(["1412", name, 10, 1000000], 1):
                sheet.cell(header_row + 1, col, value)
        with TemporaryDirectory() as temp, \
             patch.object(bank_payroll, "load_workbook", return_value=workbook), \
             patch.object(bank_payroll, "SESSION_DIR", Path(temp)), \
             patch.object(bank_payroll, "_load_registry_with_drive_fallback", return_value={}):
            with self.assertRaises(ValueError) as caught:
                bank_payroll.scan_official_workbook(Path("test.xlsx"), "factory2")
            message = str(caught.exception)
            for expected in ("1412", "Luong", "dòng 2", "dòng 5", "PERSON A", "PERSON B"):
                self.assertIn(expected, message)
            self.assertEqual(list(Path(temp).iterdir()), [])

    def test_scanner_rejects_duplicate_codes_across_sheets(self):
        workbook = Workbook()
        for sheet in (workbook.active, workbook.create_sheet("Other")):
            for col, value in enumerate(["Ma", "Ten nhan vien", "So Ngay Di Lam", "Luong Thang 7/2026"], 1):
                sheet.cell(1, col, value)
            for col, value in enumerate(["1412", "A", 10, 1000000], 1):
                sheet.cell(2, col, value)
        with patch.object(bank_payroll, "load_workbook", return_value=workbook):
            with self.assertRaisesRegex(ValueError, "Trùng mã nhân viên"):
                bank_payroll.scan_official_workbook(Path("test.xlsx"), "factory2")
