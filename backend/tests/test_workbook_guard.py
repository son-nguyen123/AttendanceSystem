from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest

from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.workbook_guard import (
    inspect_workbook_for_role,
    profile_workbook,
    validate_mapping_pair,
)


class WorkbookGuardTests(unittest.TestCase):
    def test_classifies_output_roles_and_accepts_valid_mapping_pair(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            current = root / "current.xlsx"
            previous = root / "previous.xlsx"
            _write_workbook(current, month=7, private=False, codes=["1006", "1194"])
            _write_workbook(previous, month=6, private=True, codes=["1006", "1194"])

            current_profile, previous_profile = validate_mapping_pair(current, previous)

            self.assertEqual(current_profile.detected_kind, "output1")
            self.assertEqual(previous_profile.detected_kind, "output2")
            self.assertEqual(current_profile.period_label, "07/2026")
            self.assertEqual(previous_profile.period_label, "06/2026")

    def test_rejects_swapped_mapping_files(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            official = root / "official.xlsx"
            output1 = root / "output1.xlsx"
            _write_workbook(official, month=6, private=True, codes=["1006"])
            _write_workbook(output1, month=7, private=False, codes=["1006"])

            with self.assertRaisesRegex(ValueError, "chọn ngược"):
                validate_mapping_pair(official, output1)

    def test_rejects_missing_separator_row(self) -> None:
        with TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "shifted.xlsx"
            _write_workbook(path, month=7, private=False, codes=["1006", "1194"], spacing=7)

            profile = profile_workbook(path)

            self.assertTrue(profile.structural_errors)
            with self.assertRaisesRegex(ValueError, "thiếu hoặc thừa dòng"):
                inspect_workbook_for_role(path, "mapping_current")

    def test_accepts_old_official_layout_with_missing_separator_row(self) -> None:
        with TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "old_official_shifted.xlsx"
            _write_workbook(path, month=6, private=True, codes=["1006", "1194"], spacing=7)

            profile = inspect_workbook_for_role(path, "mapping_previous")

            self.assertEqual(profile.detected_kind, "output2")
            self.assertEqual(set(profile.employee_codes), {"1006", "1194"})
            self.assertFalse(profile.structural_errors)

    def test_analysis_rejects_already_processed_output(self) -> None:
        with TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "output1.xlsx"
            _write_workbook(path, month=7, private=False, codes=["1006"])

            with self.assertRaisesRegex(ValueError, "Output 1 đã tính"):
                inspect_workbook_for_role(path, "analysis")


def _write_workbook(
    path: Path,
    *,
    month: int,
    private: bool,
    codes: list[str],
    spacing: int = 8,
) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Attendance"
    for index, code in enumerate(codes):
        header_row = 3 + index * spacing
        day_row = header_row + 1
        employee_row = header_row + 2
        result_row = header_row + 6
        sheet.cell(header_row, 1).value = "Att. Time"
        sheet.cell(header_row, 3).value = f"2026-{month:02d}-01 ~ 2026-{month:02d}-30"
        sheet.cell(day_row, 32).value = "Tổng giờ công"
        sheet.cell(day_row, 34).value = "Mã"
        sheet.cell(employee_row, 1).value = "Mã:"
        sheet.cell(employee_row, 3).value = code
        sheet.cell(result_row, 34).value = code
        sheet.cell(result_row, 35).value = f"Nhân viên {code}"
        if private:
            sheet.cell(day_row, 36).value = "Mức Lương"
            sheet.cell(day_row, 41).value = "Thưởng"
            sheet.cell(day_row, 43).value = "Ứng Lương"
            sheet.cell(day_row, 44).value = f"Lương Tháng {month}/2026"
            sheet.cell(result_row, 36).value = 3_000_000
    workbook.save(path)
    workbook.close()


if __name__ == "__main__":
    unittest.main()
