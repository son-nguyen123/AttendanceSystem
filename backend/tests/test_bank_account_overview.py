import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app.services import bank_account_store, payroll_store


class BankAccountOverviewTests(unittest.TestCase):
    def test_directory_is_code_sorted_and_factory_data_is_partitioned(self) -> None:
        with TemporaryDirectory() as temporary_dir:
            root = Path(temporary_dir)
            old_bank_path = bank_account_store.REGISTRY_PATH
            old_payroll_path = payroll_store.PAYROLL_DATA_PATH
            old_sources_path = payroll_store.PAYROLL_PROFILE_SOURCES_PATH
            bank_account_store.REGISTRY_PATH = root / "bank_accounts.json"
            payroll_store.PAYROLL_DATA_PATH = root / "payroll_data.json"
            payroll_store.PAYROLL_PROFILE_SOURCES_PATH = root / "profile_sources.json"
            try:
                payroll_store.PAYROLL_DATA_PATH.write_text(
                    json.dumps({
                        "factory1": {
                            "1006": {"name": "Ho Thi Tu Uyen"},
                            "1229": {"name": "Truong Ngoc Vu"},
                        },
                        "factory2": {"1006": {"name": "Xuong 2"}},
                    }),
                    encoding="utf-8",
                )
                bank_account_store.REGISTRY_PATH.write_text(
                    json.dumps({
                        "factory1:1006": {
                            "factory": "factory1",
                            "employee_code": "1006",
                            "name": "Ho Thi Tu Uyen",
                            "account_number": "5601884980",
                        },
                        "factory2:1006": {
                            "factory": "factory2",
                            "employee_code": "1006",
                            "name": "Xuong 2",
                            "account_number": "8829125020",
                        },
                    }),
                    encoding="utf-8",
                )

                factory1 = bank_account_store.list_account_overview("factory1")
                factory2 = bank_account_store.list_account_overview("factory2")
                self.assertEqual([row["employee_code"] for row in factory1["accounts"]], ["1006", "1229"])
                self.assertEqual(factory1["accounts"][0]["account_number"], "5601884980")
                self.assertEqual(factory2["with_account"], 1)
                self.assertEqual(factory2["accounts"][0]["account_number"], "8829125020")
            finally:
                bank_account_store.REGISTRY_PATH = old_bank_path
                payroll_store.PAYROLL_DATA_PATH = old_payroll_path
                payroll_store.PAYROLL_PROFILE_SOURCES_PATH = old_sources_path


if __name__ == "__main__":
    unittest.main()
