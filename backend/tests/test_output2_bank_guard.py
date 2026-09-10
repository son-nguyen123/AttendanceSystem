import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi import HTTPException

from app.api import routes_payroll


class Output2BankGuardTests(unittest.TestCase):
    def test_missing_bank_accounts_are_detected_for_both_factory_shapes(self) -> None:
        factory1_preview = {
            "employees": [
                {"employee_code": "1001", "total_hours": 8, "bank_account": ""},
                {"employee_code": "1002", "total_hours": 8, "bank_account": "12345678"},
                {"employee_code": "1003", "total_hours": 0, "bank_account": ""},
            ]
        }
        factory2_preview = {
            "employees": [
                {"employee_code": "10", "total_hours": 176, "bank_account": None},
                {"employee_code": "11", "total_hours": 176, "bank_account": "87654321"},
            ]
        }

        self.assertEqual(routes_payroll._missing_bank_account_codes(factory1_preview), ["1001"])
        self.assertEqual(routes_payroll._missing_bank_account_codes(factory2_preview), ["10"])

    def test_export_request_requires_explicit_override_for_blank_accounts(self) -> None:
        blocked = routes_payroll.PayrollExportRequest(session_id="factory1-session")
        allowed = routes_payroll.PayrollExportRequest(
            session_id="factory1-session",
            allow_missing_bank_accounts=True,
        )

        self.assertFalse(blocked.allow_missing_bank_accounts)
        self.assertTrue(allowed.allow_missing_bank_accounts)

    def test_export_is_blocked_before_file_creation_for_both_factories(self) -> None:
        for factory, preview_name, export_name in (
            ("factory1", "preview_payroll", "export_payroll_workbook"),
            ("factory2", "preview_factory2_payroll", "export_factory2_output2"),
        ):
            with self.subTest(factory=factory), TemporaryDirectory() as temporary_dir:
                source_path = Path(temporary_dir) / "original.xlsx"
                preview = {"employees": [{"employee_code": "missing-1", "total_hours": 1, "bank_account": ""}]}
                request = routes_payroll.PayrollExportRequest(session_id=f"{factory}-session")
                with (
                    patch.object(routes_payroll, "_find_session_source", return_value=source_path),
                    patch.object(routes_payroll, "_session_factory", return_value=factory),
                    patch.object(routes_payroll, "_sync_latest_final_copy_profile", return_value={"status": "ok"}),
                    patch.object(routes_payroll, "merge_session_overrides", return_value={}),
                    patch.object(routes_payroll, preview_name, return_value=preview),
                    patch.object(routes_payroll, export_name) as export_mock,
                ):
                    with self.assertRaises(HTTPException) as raised:
                        routes_payroll.export_output_2(request, user={})

                self.assertEqual(raised.exception.status_code, 409)
                self.assertEqual(raised.exception.detail["missing_codes"], ["missing-1"])
                export_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
