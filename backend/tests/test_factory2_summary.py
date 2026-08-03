from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest

from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.factory2_workbook import analyze_factory2_workbook


class Factory2SummaryTests(unittest.TestCase):
    def test_counts_active_and_empty_employee_codes_separately(self) -> None:
        with TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "factory2.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.append(["Mã NV", "Tên NV", "Ngày", "Lần 1", "Lần 2"])
            sheet.append(["1001", "Nguyễn A", date(2026, 7, 1), "07:30", "17:00"])
            sheet.append(["1001", "Nguyễn A", date(2026, 7, 2), None, None])
            sheet.append(["1002", "Nguyễn B", date(2026, 7, 1), None, None])
            workbook.save(path)
            workbook.close()

            result = analyze_factory2_workbook(path)

            self.assertEqual(result["summary"]["blocks"], 1)
            self.assertEqual(result["summary"]["source_employee_count"], 2)
            self.assertEqual(result["summary"]["empty_employee_count"], 1)


if __name__ == "__main__":
    unittest.main()
