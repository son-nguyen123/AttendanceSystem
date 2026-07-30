import unittest

from openpyxl import Workbook

from app.services.period_detector import detect_period_from_sheet, detect_period_from_text


class PeriodDetectorTests(unittest.TestCase):
    def test_detects_period_when_attendance_label_is_missing_or_shifted(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet["C3"] = "2026-06-01 ~ 2026-06-30"

        result = detect_period_from_sheet(sheet)

        self.assertEqual(result["month"], 6)
        self.assertEqual(result["year"], 2026)

    def test_detects_month_year_text_from_output_header(self):
        result = detect_period_from_text("Lương Tháng 6/2026")

        self.assertEqual(result["month"], 6)
        self.assertEqual(result["year"], 2026)


if __name__ == "__main__":
    unittest.main()
