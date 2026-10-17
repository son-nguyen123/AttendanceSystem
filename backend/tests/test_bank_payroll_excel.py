from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest

from openpyxl import load_workbook

from app.services import bank_payroll
from app.services.bank_payroll import _build_bank_workbook, export_bank_excel, export_bank_excel_files


class BankPayrollExcelTests(unittest.TestCase):
    def test_workbook_matches_bank_six_column_layout(self) -> None:
        employees = [
            {
                "employee_code": "1006",
                "name": "Hồ Thị Tú Uyên",
                "account_number": "5601884980",
                "salary": 3330000,
            },
            {
                "employee_code": "0012",
                "name": "Nguyễn Văn A",
                "account_number": "0012345678",
                "salary": 2000000,
            },
        ]
        with TemporaryDirectory() as temporary_dir:
            output = Path(temporary_dir) / "bank-payroll.xlsx"
            _build_bank_workbook(output, employees, 6, 2026)
            workbook = load_workbook(output, data_only=False)

        worksheet = workbook["BangLuongNganHang"]
        self.assertEqual(worksheet["A2"].value, " THIỆN TRÍ THÁNG 6/2026")
        self.assertEqual(
            [worksheet.cell(3, column).value for column in range(1, 7)],
            ["STT", "Mã Nhân Viên", "HỌ TÊN", "SỐ TK", "SỐ TIỀN", "NỘI DUNG"],
        )
        self.assertEqual(
            [worksheet.cell(4, column).value for column in range(1, 7)],
            [1, "1006", "HO THI TU UYEN", "5601884980", 3330000, "T6/2026"],
        )
        self.assertEqual(worksheet["B5"].value, "0012")
        self.assertEqual(worksheet["D5"].value, "0012345678")
        self.assertEqual(worksheet["A6"].value, "TỔNG")
        self.assertEqual(worksheet["E6"].value, "=SUM(E4:E5)")
        self.assertEqual(workbook.calculation.calcMode, "auto")
        self.assertTrue(workbook.calculation.fullCalcOnLoad)
        self.assertTrue(workbook.calculation.forceFullCalc)
        workbook.close()

    def test_empty_export_total_does_not_reference_itself(self) -> None:
        with TemporaryDirectory() as temporary_dir:
            output = Path(temporary_dir) / "empty.xlsx"
            _build_bank_workbook(output, [], 7, 2026)
            workbook = load_workbook(output, data_only=False)
            self.assertEqual(workbook.active["E4"].value, "=0")
            workbook.close()

    def test_duplicate_codes_block_export_even_with_blank_accounts(self) -> None:
        snapshot = {"factory": "factory2", "employees": [
            {"employee_code": "1412", "name": "A", "salary": 100},
            {"employee_code": " 1412 ", "name": "B", "salary": 200},
        ]}
        with self.assertRaisesRegex(ValueError, "Trùng mã nhân viên.*1412"):
            bank_payroll._prepare_bank_export_rows(snapshot, [], "leave_blank")

    def test_duplicate_override_codes_block_export(self) -> None:
        snapshot = {"factory": "factory2", "employees": []}
        with self.assertRaisesRegex(ValueError, "Trùng mã nhân viên.*1412"):
            bank_payroll._prepare_bank_export_rows(snapshot, [
                {"employee_code": "1412"}, {"employee_code": "1412"},
            ], "leave_blank")

    def test_duplicate_account_rows_are_rejected_before_saving(self) -> None:
        with self.assertRaisesRegex(ValueError, "Trùng mã nhân viên.*1412"):
            bank_payroll.save_accounts("factory2", [
                {"employee_code": "1412"}, {"employee_code": "1412"},
            ])

    def test_missing_accounts_can_be_omitted_or_left_blank(self) -> None:
        with TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            original_session_dir = bank_payroll.SESSION_DIR
            original_registry_path = bank_payroll.REGISTRY_PATH
            bank_payroll.SESSION_DIR = root / "sessions"
            bank_payroll.REGISTRY_PATH = root / "accounts.json"
            bank_payroll.SESSION_DIR.mkdir(parents=True)
            bank_payroll.REGISTRY_PATH.write_text("{}", encoding="utf-8")
            snapshot = {
                "factory": "factory1",
                "month": 7,
                "year": 2026,
                "employees": [
                    {"employee_code": "1001", "name": "A", "salary": 1000000},
                    {"employee_code": "1002", "name": "B", "salary": 2000000},
                ],
            }
            (bank_payroll.SESSION_DIR / "scan.json").write_text(json.dumps(snapshot), encoding="utf-8")
            try:
                path, _ = export_bank_excel(
                    "scan",
                    [{"employee_code": "1001", "account_number": "1234567890"}],
                    "with_account_only",
                )
                workbook = load_workbook(path, data_only=True)
                self.assertEqual(workbook.active["B4"].value, "1001")
                self.assertEqual(workbook.active["A5"].value, "TỔNG")
                workbook.close()

                path, _ = export_bank_excel(
                    "scan",
                    [{"employee_code": "1001", "account_number": "1234567890"}],
                    "leave_blank",
                )
                workbook = load_workbook(path, data_only=True)
                self.assertEqual(workbook.active["B5"].value, "1002")
                self.assertIsNone(workbook.active["D5"].value)
                workbook.close()
            finally:
                bank_payroll.SESSION_DIR = original_session_dir
                bank_payroll.REGISTRY_PATH = original_registry_path

    def test_export_creates_review_workbook_and_only_fixed_salary_is_overridden(self) -> None:
        with TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            original_session_dir = bank_payroll.SESSION_DIR
            original_registry_path = bank_payroll.REGISTRY_PATH
            bank_payroll.SESSION_DIR = root / "sessions"
            bank_payroll.REGISTRY_PATH = root / "accounts.json"
            bank_payroll.SESSION_DIR.mkdir(parents=True)
            bank_payroll.REGISTRY_PATH.write_text("{}", encoding="utf-8")
            snapshot = {
                "factory": "factory1",
                "month": 7,
                "year": 2026,
                "employees": [
                    {**bank_payroll.FIXED_BANK_EMPLOYEE},
                    {"employee_code": "1412", "name": "Nguoi do", "salary": 1_000_000, "salary_eligible": True},
                    {"employee_code": "1416", "name": "Nguoi xanh", "salary": 2_000_000, "salary_eligible": False},
                    {"employee_code": "1500", "name": "", "salary": 3_000_000, "salary_eligible": True},
                ],
            }
            (bank_payroll.SESSION_DIR / "scan.json").write_text(json.dumps(snapshot), encoding="utf-8")
            try:
                files = export_bank_excel_files(
                    "scan",
                    [
                        {"employee_code": "1", "salary": 456_000},
                        {"employee_code": "1412", "account_number": "1234567890", "salary": 999_000_000},
                    ],
                    "with_account_only",
                )
                salary_book = load_workbook(files["salary_path"], data_only=True)
                review_book = load_workbook(files["review_path"], data_only=True)
                try:
                    salary_sheet = salary_book.active
                    self.assertEqual(salary_sheet["B4"].value, "1")
                    self.assertEqual(salary_sheet["E4"].value, 456_000)
                    self.assertEqual(salary_sheet["B5"].value, "1412")
                    self.assertEqual(salary_sheet["E5"].value, 1_000_000)
                    review_sheet = review_book.active
                    self.assertEqual(review_sheet["A3"].value, "1416")
                    self.assertEqual(review_sheet["D3"].value, "Chưa đủ điều kiện nhận lương")
                    self.assertEqual(review_sheet["A4"].value, "1500")
                    self.assertEqual(review_sheet["D4"].value, "Thiếu họ tên; Thiếu số tài khoản")
                    self.assertEqual(review_sheet.max_column, 4)
                    formula_book = load_workbook(files["salary_path"], data_only=False)
                    self.assertEqual(formula_book.active["E6"].value, "=SUM(E4:E5)")
                    formula_book.close()
                finally:
                    salary_book.close()
                    review_book.close()
            finally:
                bank_payroll.SESSION_DIR = original_session_dir
                bank_payroll.REGISTRY_PATH = original_registry_path


if __name__ == "__main__":
    unittest.main()
