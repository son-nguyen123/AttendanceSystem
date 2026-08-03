from app.services.attendance_calculator import calculate_day


def test_day_without_any_punch_remains_empty() -> None:
    result = calculate_day([])

    assert result.work_value is None
    assert result.manual_checks == []


def test_uncomputable_day_with_punch_defaults_work_to_zero() -> None:
    result = calculate_day(["11:30"])

    assert result.work_value == 0
    assert result.missing_count == 1
    assert "Không đủ cặp giờ để tính công" in result.manual_checks
    assert "Chỉ có một lần bấm công" in result.manual_checks


def test_early_afternoon_checkout_is_not_reported_as_missing_punch() -> None:
    result = calculate_day(["07:22", "11:31", "12:54", "16:01"])

    assert result.work_value == 7
    assert result.missing_count is None
    assert not any("quên bấm công" in message for message in result.manual_checks)


def test_duplicate_afternoon_entry_does_not_count_as_checkout() -> None:
    result = calculate_day(["07:22", "11:31", "12:54", "12:55"])

    assert result.missing_count == 1
    assert any("quên bấm công" in message for message in result.manual_checks)


def test_early_morning_checkout_is_not_reported_as_missing_punch() -> None:
    result = calculate_day(["07:22", "09:03", "12:48", "18:35"])

    assert result.work_value == 7
    assert result.missing_count is None
    assert result.late_minutes is None


def test_late_arrival_with_early_checkout_keeps_late_minutes_without_missing_punch() -> None:
    result = calculate_day(["07:40", "09:30"])

    assert result.missing_count is None
    assert result.late_minutes == 10


def test_duplicate_morning_entry_is_not_treated_as_checkout() -> None:
    result = calculate_day(["07:22", "07:23"])

    assert result.missing_count == 1


def test_clear_direct_evening_pair_does_not_require_remainder_review() -> None:
    result = calculate_day(["17:52", "19:38"])

    assert result.work_value == 1.5
    assert result.missing_count is None
    assert result.manual_checks == []


def test_clear_evening_pair_after_morning_shift_is_not_ambiguous() -> None:
    result = calculate_day(["07:23", "11:31", "17:39", "22:01"])

    assert result.work_value == 8
    assert result.missing_count is None
    assert result.manual_checks == []


def test_lone_evening_mark_after_completed_morning_is_one_missing_punch() -> None:
    result = calculate_day(["07:26", "11:30", "22:00"])

    assert result.work_value == 4
    assert result.missing_count == 1
    assert result.late_minutes is None
    assert result.manual_checks == ["Có dấu hiệu quên bấm ca tối: 1 lần"]


def test_afternoon_checkout_cluster_uses_last_punch_without_false_late() -> None:
    result = calculate_day(["07:24", "11:31", "12:44", "17:02", "17:15", "17:33"])

    assert result.work_value == 8.5
    assert result.missing_count is None
    assert result.late_minutes is None
    assert result.manual_checks == []


def test_afternoon_checkout_cluster_keeps_real_evening_shift() -> None:
    result = calculate_day(["13:00", "17:02", "17:15", "17:33", "18:00", "22:00"])

    assert result.work_value == 8.5
    assert result.missing_count is None
    assert result.late_minutes is None
    assert result.manual_checks == []


def test_clear_afternoon_checkout_and_early_evening_restart_count_as_two_shifts() -> None:
    result = calculate_day(["12:58", "17:01", "17:24", "22:01"])

    assert result.work_value == 8
    assert result.missing_count is None
    assert result.late_minutes is None
    assert result.manual_checks == []


def test_end_of_shift_cluster_without_afternoon_context_is_not_collapsed() -> None:
    result = calculate_day(["17:02", "17:15", "17:33"])

    assert result.late_minutes == 2


def test_real_mid_shift_gap_is_still_reviewed_and_deducted() -> None:
    result = calculate_day(["13:00", "15:00", "15:20", "17:02"])

    assert result.work_value == 3.5
    assert result.missing_count == "?"
    assert any("ra/vào giữa giờ công" in message for message in result.manual_checks)


def test_newcomer_partial_pair_gets_provisional_work_instead_of_zero() -> None:
    result = calculate_day(["16:07", "17:01"])

    assert result.work_value == 1
    assert result.missing_count == "?"
    assert any("ngoài khung ca chuẩn" in message for message in result.manual_checks)


def test_short_newcomer_partial_pair_uses_normal_rounding() -> None:
    assert calculate_day(["16:21", "17:01"]).work_value == 0.5
    assert calculate_day(["16:48", "17:01"]).work_value == 0


def test_partial_shift_plus_evening_pair_gets_provisional_total() -> None:
    result = calculate_day(["15:50", "17:05", "17:53", "22:01"])

    assert result.work_value == 5.25
    assert result.missing_count == "?"
    assert result.late_minutes is None
    assert any("ngoài khung ca chuẩn" in message for message in result.manual_checks)


def test_unpaired_single_punch_still_defaults_to_zero() -> None:
    result = calculate_day(["16:07"])

    assert result.work_value == 0
    assert result.missing_count == "?"


def test_morning_checkout_and_afternoon_entry_are_not_paid_lunch_work() -> None:
    result = calculate_day(["11:32", "12:53"])

    assert result.work_value == 0
    assert result.missing_count == 2
    assert result.late_minutes is None
    assert not any("ngoài khung ca chuẩn" in message for message in result.manual_checks)


def test_unusual_morning_pair_inside_same_shift_still_calculates() -> None:
    result = calculate_day(["10:23", "11:38"])

    assert result.work_value == 1.25
    assert result.missing_count == "?"
