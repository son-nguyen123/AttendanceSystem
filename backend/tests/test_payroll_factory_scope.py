import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app.services import payroll_store


class PayrollFactoryScopeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.data_path = Path(self.temp_dir.name) / "payroll_data.json"
        self.sources_path = Path(self.temp_dir.name) / "payroll_profile_sources.json"
        self.original_data_path = payroll_store.PAYROLL_DATA_PATH
        self.original_sources_path = payroll_store.PAYROLL_PROFILE_SOURCES_PATH
        payroll_store.PAYROLL_DATA_PATH = self.data_path
        payroll_store.PAYROLL_PROFILE_SOURCES_PATH = self.sources_path

    def tearDown(self) -> None:
        payroll_store.PAYROLL_DATA_PATH = self.original_data_path
        payroll_store.PAYROLL_PROFILE_SOURCES_PATH = self.original_sources_path
        self.temp_dir.cleanup()

    def test_legacy_profiles_belong_to_factory1_and_factory2_starts_empty(self) -> None:
        self.data_path.write_text(
            json.dumps({"1001": {"name": "Nhan vien Xuong 1", "hourly_salary": 10}}),
            encoding="utf-8",
        )

        self.assertEqual([item["employee_code"] for item in payroll_store.list_payroll_employees("factory1")], ["1001"])
        self.assertEqual(payroll_store.list_payroll_employees("factory2"), [])

    def test_same_code_can_have_independent_profiles_in_each_factory(self) -> None:
        self.data_path.write_text(
            json.dumps({"1001": {"name": "Nhan vien Xuong 1", "hourly_salary": 10}}),
            encoding="utf-8",
        )

        payroll_store.save_payroll_entry(
            "1001",
            payroll_store.PayrollEntry(name="Nhan vien Xuong 2", hourly_salary=20),
            factory="factory2",
        )

        self.assertEqual(payroll_store.get_payroll_entry("1001", "factory1").name, "Nhan vien Xuong 1")
        self.assertEqual(payroll_store.get_payroll_entry("1001", "factory1").hourly_salary, 10)
        self.assertEqual(payroll_store.get_payroll_entry("1001", "factory2").name, "Nhan vien Xuong 2")
        self.assertEqual(payroll_store.get_payroll_entry("1001", "factory2").hourly_salary, 20)

        saved = json.loads(self.data_path.read_text(encoding="utf-8"))
        self.assertEqual(set(saved), {"factory1", "factory2"})


if __name__ == "__main__":
    unittest.main()
