from dataclasses import dataclass
from math import floor

from app.services.punch_parser import minutes_to_time, time_to_minutes


MORNING_START = 7 * 60 + 30
MORNING_END = 11 * 60 + 30
AFTERNOON_START = 13 * 60
AFTERNOON_END = 17 * 60
EARLY_EVENING_START = 17 * 60
EARLY_EVENING_START_MIN = 16 * 60 + 40
LEGACY_EARLY_EVENING_START_MIN = 16 * 60 + 45
EARLY_EVENING_START_MAX = 17 * 60 + 7
SHORT_EVENING_DUTY_START_MIN = 16 * 60 + 45
SHORT_EVENING_DUTY_START_MAX = 17 * 60 + 24
SHORT_EVENING_DUTY_OUT_MIN = 17 * 60 + 25
SHORT_EVENING_DUTY_OUT_MAX = 17 * 60 + 45
AMBIGUOUS_EARLY_EVENING_START_MIN = 17 * 60 + 8
AMBIGUOUS_EARLY_EVENING_START_MAX = 17 * 60 + 15
EVENING_START = 18 * 60
EVENING_END = 22 * 60
NOON_OUT_START = 12 * 60
NOON_OUT_END = 12 * 60 + 10
DUPLICATE_PUNCH_WINDOW = 5
MID_SHIFT_GAP_MINUTES = 15
LATE_DETECTION_WINDOW = 120
AFTERNOON_EXTRA_END_NORMAL = 17 * 60 + 39
AFTERNOON_EXTRA_SUSPICIOUS_START = 17 * 60 + 40
AFTERNOON_CHECKOUT_CLUSTER_START = 16 * 60 + 55
AFTERNOON_CHECKOUT_CLUSTER_END = 17 * 60 + 39
EVENING_RESTART_MIN = 17 * 60 + 40
EVENING_RESTART_MAX = 18 * 60 + 15
EVENING_OUT_MIN = 21 * 60 + 30
EVENING_OUT_MAX = 22 * 60 + 30
EVENING_REVIEW_REMAINDER_MINUTES = 32
EVENING_ROUND_UP_MINUTE = 53
AFTERNOON_ROUND_UP_MINUTE = 53
DIRECT_EVENING_MIN_DURATION = 60


@dataclass(frozen=True)
class CalculationResult:
    work_value: float | str | None
    missing_count: int | str | None
    late_minutes: int | None
    manual_checks: list[str]


@dataclass(frozen=True)
class MidShiftGap:
    start: int
    end: int
    minutes: int
    rounded_minutes: int


def calculate_day(punches: list[str]) -> CalculationResult:
    if not punches:
        return CalculationResult(None, None, None, [])

    times = sorted({time_to_minutes(punch) for punch in punches})
    # Two distinct marks around the end of the afternoon, followed by a clear
    # evening checkout, mean "afternoon checkout + evening restart".  Preserve
    # that pair before applying the broader habitual-punch cluster rule.
    if _clear_afternoon_evening_restart_pair(times) is None:
        times = _normalize_end_of_afternoon_cluster(times)
    manual_checks: list[str] = []
    original_missing_count = _detect_missing_count(times)
    missing_count = original_missing_count
    has_unpaired_evening_mark = _has_unpaired_evening_mark(times)
    late_events = _detect_late_events(times, suppress_unpaired_evening=has_unpaired_evening_mark)
    early_evening_late = _early_evening_overtime_late_minutes(times)
    if early_evening_late is not None:
        late_events.append(early_evening_late)
    chargeable_late_events = [
        value
        for value in late_events
        if value <= LATE_DETECTION_WINDOW and _rounded_penalty_minutes(value) > 0
    ]
    late_minutes = sum(late_events) if late_events else None
    mid_shift_gaps = _detect_mid_shift_gaps(times)
    unusual_morning_pair = _unusual_morning_work_pair(times)
    ambiguous_new_early_evening = _has_ambiguous_new_early_evening_sequence(times)
    invalid_pre_evening_sequence = _has_invalid_pre_evening_sequence(times)

    if mid_shift_gaps:
        missing_count = "?"
        for gap in mid_shift_gaps:
            manual_checks.append(
                "Có dấu hiệu ra/vào giữa giờ công "
                f"{minutes_to_time(gap.start)}-{minutes_to_time(gap.end)}: "
                f"{gap.minutes} phút, trừ {gap.rounded_minutes} phút"
            )

    if unusual_morning_pair is not None:
        start, end, _hours = unusual_morning_pair
        missing_count = "?"
        manual_checks.append(
            "Có cặp giờ làm ngoài khung ca chuẩn "
            f"{minutes_to_time(start)}-{minutes_to_time(end)}, cần kiểm tra"
        )

    if _has_suspicious_afternoon_evening(times):
        missing_count = "?"
        manual_checks.append("Có dấu hiệu ra chiều sát ca tối, cần kiểm tra")

    if ambiguous_new_early_evening:
        missing_count = "?"
        manual_checks.append("Giờ vào 16:40-16:44 có thêm mốc chưa rõ, không tự tính công")

    if invalid_pre_evening_sequence:
        missing_count = "?"
        manual_checks.append("Có chuỗi giờ trước ca tối không tạo thành cặp rõ ràng, không tự tính công")

    if _has_ambiguous_early_evening_start(times):
        missing_count = "?"
        manual_checks.append("Giờ vào 17:08-17:15 chưa rõ là ca thêm hay bấm sớm ca tối, cần kiểm tra")
    elif _has_pre_evening_mark_without_afternoon_in(times):
        missing_count = "?"
        manual_checks.append("Có dấu hiệu bấm giờ sát ca tối khi chưa có giờ vào chiều, cần kiểm tra")

    if has_unpaired_evening_mark:
        if missing_count != "?":
            missing_count = max(int(missing_count or 0), 1)
        else:
            missing_count = "?"
        manual_checks.append(
            "Có dấu hiệu quên bấm ca tối: 1 lần"
            if missing_count != "?"
            else "Có một mốc tối nhưng thiếu cặp vào/ra, cần kiểm tra"
        )

    evening_remainder_warning = _evening_remainder_warning(times)
    if evening_remainder_warning is not None:
        missing_count = "?"
        manual_checks.append(evening_remainder_warning)

    work_value = _calculate_work_value(times)
    if ambiguous_new_early_evening or invalid_pre_evening_sequence:
        work_value = None
    if work_value is None:
        provisional_work = _calculate_unclassified_pair_work(times)
        if provisional_work is not None:
            work_value = provisional_work
            missing_count = "?"
            manual_checks.append("Đã tính tạm từ cặp giờ ngoài khung ca chuẩn, cần kiểm tra")
    if work_value is None:
        if missing_count is None:
            missing_count = "?"
        manual_checks.append("Không đủ cặp giờ để tính công")
        # The day contains punches, but they are insufficient or ambiguous.
        # Keep the manual-review warning while using 0 as the safe payroll
        # default instead of exporting an empty work cell.
        work_value = 0
    elif isinstance(work_value, (int, float)):
        deduction_minutes = sum(gap.rounded_minutes for gap in mid_shift_gaps)
        deduction_minutes += sum(_rounded_penalty_minutes(value) for value in chargeable_late_events)
        if deduction_minutes > 0:
            work_value = _clean(max(0, float(work_value) - deduction_minutes / 60))

    if len(times) == 1:
        manual_checks.append("Chỉ có một lần bấm công")
    if missing_count == "?" and original_missing_count == "?":
        manual_checks.append("Dữ liệu ca mập mờ, cần kiểm tra")
    elif missing_count and missing_count != "?" and not any("quên bấm" in message for message in manual_checks):
        manual_checks.append(f"Có dấu hiệu quên bấm công: {missing_count} lần")

    return CalculationResult(work_value, missing_count, late_minutes, manual_checks)


def _calculate_work_value(times: list[int]) -> float | None:
    first = times[0]
    last = times[-1]

    morning = _morning_hours(times)
    afternoon = _afternoon_hours(times)
    unusual_morning = 0 if morning > 0 else _unusual_morning_work_hours(times)
    afternoon_evening_restart = _afternoon_evening_restart_hours(times)
    early_evening = _early_evening_overtime_hours(times) if _is_early_evening_overtime(times) else 0
    early_evening_direct = _early_evening_direct_hours(times)
    evening = 0 if _has_unpaired_evening_mark(times) else _evening_hours(times)
    suspicious_afternoon_evening_split = _suspicious_afternoon_evening_split_pair(times)

    if early_evening > 0:
        return _clean(morning + afternoon + early_evening)

    if morning > 0 and afternoon > 0:
        if afternoon_evening_restart is not None:
            return _clean(morning + afternoon_evening_restart)
        if _has_afternoon_checkout_before_evening(times):
            afternoon_value = _afternoon_before_evening_value(times, afternoon)
            return _clean(morning + afternoon_value + evening)
        if suspicious_afternoon_evening_split is not None and evening > 0:
            return _clean(morning + 4.5 + evening)
        return _clean(morning + afternoon)

    if morning > 0 and evening > 0:
        return _clean(morning + early_evening_direct + evening)

    if afternoon > 0:
        if afternoon_evening_restart is not None:
            return _clean(unusual_morning + afternoon_evening_restart)
        if _has_afternoon_checkout_before_evening(times) and evening > 0:
            afternoon_value = _afternoon_before_evening_value(times, afternoon)
            return _clean(unusual_morning + afternoon_value + evening)
        if suspicious_afternoon_evening_split is not None and evening > 0:
            return _clean(unusual_morning + 4.5 + evening)
        return _clean(unusual_morning + afternoon)

    if evening > 0:
        return _clean(unusual_morning + early_evening_direct + evening)

    if morning > 0:
        return _clean(morning)

    if unusual_morning > 0:
        return _clean(unusual_morning)

    if first < MORNING_END and last > first:
        return _clean(min(4, _round_half((last - max(first, MORNING_START)) / 60)))

    return None


def _calculate_unclassified_pair_work(times: list[int]) -> float | None:
    """Calculate a reviewable provisional value from otherwise clear pairs.

    This is intentionally a fallback: established shift rules always run
    first. An odd number of significant punches remains uncomputable.
    """
    significant_times = _collapse_duplicate_punches(times)
    if not significant_times or len(significant_times) % 2 != 0:
        return None

    total = 0.0
    for index in range(0, len(significant_times), 2):
        start = significant_times[index]
        end = significant_times[index + 1]
        if end <= start:
            return None
        if _is_lunch_boundary_pair(start, end):
            return None
        total += _unclassified_pair_hours(start, end)
    return _clean(total)


def _unclassified_pair_hours(start: int, end: int) -> float:
    if (
        EARLY_EVENING_START_MIN <= start <= EVENING_START + LATE_DETECTION_WINDOW
        and EVENING_OUT_MIN <= end <= EVENING_OUT_MAX
    ):
        return _round_work_minutes(max(0, end - EVENING_START))
    return _round_work_minutes(end - start)


def _is_lunch_boundary_pair(start: int, end: int) -> bool:
    """Prevent a morning checkout and afternoon entry becoming paid work."""
    return 11 * 60 <= start <= NOON_OUT_END and end > NOON_OUT_END


def _morning_hours(times: list[int]) -> float:
    starts = [value for value in times if value <= MORNING_START + LATE_DETECTION_WINDOW]
    if not starts:
        return 0

    morning_outs = [value for value in times if MORNING_START < value <= 12 * 60 + 10]
    if not morning_outs:
        if _has_afternoon_in(times):
            return 0
        if any(value > MORNING_END for value in times):
            return 4
        return 0

    out_time = max(morning_outs)
    if out_time >= MORNING_END:
        return 4

    return _round_half(max(0, out_time - MORNING_START) / 60)


def _unusual_morning_work_hours(times: list[int]) -> float:
    pair = _unusual_morning_work_pair(times)
    return pair[2] if pair is not None else 0


def _unusual_morning_work_pair(times: list[int]) -> tuple[int, int, float] | None:
    if _morning_hours(times) > 0:
        return None

    clusters = _duplicate_punch_clusters(times)
    for index in range(0, len(clusters) - 1, 2):
        start = clusters[index][0]
        end = clusters[index + 1][-1]
        if not (MORNING_START + LATE_DETECTION_WINDOW < start < MORNING_END):
            continue
        if not (MORNING_START < end <= NOON_OUT_END):
            continue
        if end <= start:
            continue

        hours = _round_work_minutes(end - start)
        if hours > 0:
            return start, end, hours

    return None


def _duplicate_punch_clusters(times: list[int]) -> list[list[int]]:
    clusters: list[list[int]] = []
    for value in times:
        if clusters and value - clusters[-1][-1] <= DUPLICATE_PUNCH_WINDOW:
            clusters[-1].append(value)
        else:
            clusters.append([value])
    return clusters


def _afternoon_hours(times: list[int]) -> float:
    last = times[-1]
    afternoon_starts = _afternoon_in_times(times)
    if not afternoon_starts:
        return 0

    if last < AFTERNOON_START:
        return 0

    if _is_continuous_afternoon_evening(times):
        return _clean(4 + _round_evening_tail_hours(AFTERNOON_END, last))

    return _round_afternoon_hours(max(0, last - AFTERNOON_START))


def _evening_hours(times: list[int]) -> float:
    evening_window = _evening_work_window(times)
    if evening_window is None:
        return 0

    effective_start, last = evening_window
    return _round_evening_tail_hours(effective_start, last)


def _afternoon_evening_restart_hours(times: list[int]) -> float | None:
    pair = _afternoon_evening_restart_pair(times)
    if pair is None:
        return None

    checkout, _restart = pair
    afternoon = _round_afternoon_hours(max(0, checkout - AFTERNOON_START))
    evening = _round_evening_tail_hours(EVENING_START, times[-1])
    return _clean(afternoon + evening)


def _afternoon_evening_restart_pair(times: list[int]) -> tuple[int, int] | None:
    if not _has_afternoon_in(times) or times[-1] <= EVENING_START:
        return None

    clear_pair = _clear_afternoon_evening_restart_pair(times)
    if clear_pair is not None:
        return clear_pair

    significant_times = _collapse_duplicate_punches(times)
    checkouts = [
        value
        for value in significant_times
        if 17 * 60 + 15 <= value <= 17 * 60 + 45
    ]
    restarts = [
        value
        for value in significant_times
        if EVENING_RESTART_MIN <= value <= EVENING_RESTART_MAX
    ]

    for checkout in checkouts:
        restart_after_checkout = [value for value in restarts if value - checkout >= 10]
        if restart_after_checkout:
            return checkout, min(restart_after_checkout)

    return None


def _evening_work_window(times: list[int]) -> tuple[int, int] | None:
    if len(times) < 2:
        return None

    first = times[0]
    last = times[-1]
    short_duty_pair = _short_evening_duty_pair(times)
    if short_duty_pair is not None and not _has_evening_out(times):
        _start, checkout = short_duty_pair
        return EARLY_EVENING_START, checkout

    has_afternoon_in = _has_afternoon_in(times)
    split_pair = _afternoon_evening_split_pair(times) if has_afternoon_in else None
    suspicious_split_pair = _suspicious_afternoon_evening_split_pair(times) if has_afternoon_in else None
    if (split_pair is not None or suspicious_split_pair is not None) and last > EVENING_START:
        return EVENING_START, last
    if _early_evening_direct_split_pair(times) is not None and last > EVENING_START:
        return EVENING_START, last

    evening_starts = [value for value in times if 16 * 60 + 30 <= value <= EVENING_END]
    if not evening_starts or last <= 17 * 60:
        return None

    start = evening_starts[0]
    if start <= 17 * 60:
        effective_start = 17 * 60
    elif start <= EVENING_START + LATE_DETECTION_WINDOW:
        effective_start = EVENING_START
    else:
        effective_start = start

    if first < MORNING_END and start >= 16 * 60 + 30 and has_afternoon_in:
        effective_start = 17 * 60

    return effective_start, last


def _evening_remainder_warning(times: list[int]) -> str | None:
    evening_window = _evening_work_window(times)
    if evening_window is None:
        return None
    if _has_direct_evening_shift(times):
        return None

    effective_start, last = evening_window
    if _is_continuous_afternoon_evening(times) and (last >= EVENING_START or not _has_evening_out(times)):
        return None

    rounded_last = _rounded_evening_end(last)
    remainder = max(0, rounded_last - effective_start) % 60
    if remainder <= EVENING_REVIEW_REMAINDER_MINUTES:
        return None

    return (
        "Ca tối dư "
        f"{remainder} phút sau mốc {minutes_to_time(effective_start)}-"
        f"{minutes_to_time(rounded_last)}, cần kiểm tra"
    )


def _is_early_evening_overtime(times: list[int]) -> bool:
    significant_times = _collapse_duplicate_punches(times)
    if len(significant_times) <= 2:
        return False

    first = significant_times[0]
    if not (EARLY_EVENING_START_MIN <= first <= EARLY_EVENING_START_MAX):
        return False

    if any(value < 16 * 60 + 30 for value in significant_times):
        return False

    return any(EVENING_OUT_MIN <= value <= EVENING_OUT_MAX for value in significant_times)


def _early_evening_overtime_late_minutes(times: list[int]) -> int | None:
    if not _is_early_evening_overtime(times):
        return None
    if _early_evening_direct_split_pair(times) is not None:
        return None

    first = _collapse_duplicate_punches(times)[0]
    late_minutes = first - EARLY_EVENING_START
    return late_minutes if late_minutes > 0 else None


def _early_evening_overtime_hours(times: list[int]) -> float:
    significant_times = _collapse_duplicate_punches(times)
    last = significant_times[-1]
    split_pair = _early_evening_split_pair(significant_times)
    if split_pair is not None:
        checkout, _restart = split_pair
        early_hours = _round_half(max(0, checkout - EARLY_EVENING_START) / 60)
        evening_hours = _round_half(max(0, last - EVENING_START) / 60)
        return _clean(early_hours + evening_hours)

    return _clean(_round_half(max(0, last - EARLY_EVENING_START) / 60))


def _early_evening_split_pair(times: list[int]) -> tuple[int, int] | None:
    checkouts = [value for value in times if 17 * 60 + 25 <= value <= 17 * 60 + 45]
    restarts = [value for value in times if EVENING_RESTART_MIN <= value <= EVENING_RESTART_MAX]

    for checkout in checkouts:
        restart_after_checkout = [value for value in restarts if value - checkout >= 10]
        if restart_after_checkout:
            return checkout, min(restart_after_checkout)

    return None


def _early_evening_direct_split_pair(times: list[int]) -> tuple[int, int, int] | None:
    if _has_afternoon_in(times) or not _has_evening_out(times):
        return None

    significant_times = _collapse_duplicate_punches(times)
    starts = [
        value
        for value in significant_times
        if SHORT_EVENING_DUTY_START_MIN <= value <= SHORT_EVENING_DUTY_START_MAX
    ]
    if not starts:
        return None

    checkouts = [
        value
        for value in significant_times
        if SHORT_EVENING_DUTY_OUT_MIN <= value <= SHORT_EVENING_DUTY_OUT_MAX
    ]
    restarts = [value for value in significant_times if EVENING_RESTART_MIN <= value <= EVENING_RESTART_MAX]

    for start in starts:
        checkouts_after_start = [value for value in checkouts if value > start]
        for checkout in checkouts_after_start:
            restart_after_checkout = [value for value in restarts if value - checkout >= 10]
            if restart_after_checkout:
                return start, checkout, min(restart_after_checkout)

    return None


def _short_evening_duty_pair(times: list[int]) -> tuple[int, int] | None:
    significant_times = _collapse_duplicate_punches(times)
    starts = [
        value
        for value in significant_times
        if SHORT_EVENING_DUTY_START_MIN <= value <= SHORT_EVENING_DUTY_START_MAX
    ]
    checkouts = [
        value
        for value in significant_times
        if SHORT_EVENING_DUTY_OUT_MIN <= value <= SHORT_EVENING_DUTY_OUT_MAX
    ]

    for start in starts:
        checkouts_after_start = [value for value in checkouts if value - start >= 10]
        if checkouts_after_start:
            return start, min(checkouts_after_start)

    return None


def _early_evening_direct_hours(times: list[int]) -> float:
    split_pair = _early_evening_direct_split_pair(times)
    if split_pair is None:
        return 0

    _start, checkout, _restart = split_pair
    return _round_half(max(0, checkout - EARLY_EVENING_START) / 60)


def _is_continuous_afternoon_evening(times: list[int]) -> bool:
    if not _has_afternoon_in(times) or times[-1] <= AFTERNOON_END:
        return False
    if _afternoon_evening_split_pair(times) is not None:
        return False
    if _suspicious_afternoon_evening_split_pair(times) is not None:
        return False
    return True


def _round_evening_tail_hours(start: int, end: int) -> float:
    return _round_work_minutes(max(0, _rounded_evening_end(end) - start))


def _rounded_evening_end(value: int) -> int:
    remainder = value % 60
    if remainder >= EVENING_ROUND_UP_MINUTE:
        return value + (60 - remainder)
    return value


def _has_afternoon_checkout_before_evening(times: list[int]) -> bool:
    return _has_afternoon_in(times) and _afternoon_evening_split_pair(times) is not None


def _has_afternoon_extra_before_evening(times: list[int]) -> bool:
    return _has_afternoon_in(times) and _extra_afternoon_evening_split_pair(times) is not None


def _afternoon_before_evening_value(times: list[int], afternoon: float) -> float:
    if _has_suspicious_afternoon_evening(times):
        return 4.5

    split_pair = _extra_afternoon_evening_split_pair(times)
    if split_pair is None:
        return min(afternoon, 4)

    checkout, _restart = split_pair
    if checkout < 17 * 60 + 15:
        return min(afternoon, 4)
    if checkout <= 17 * 60 + 24:
        return 4.25
    return 4.5


def _afternoon_evening_split_pair(times: list[int]) -> tuple[int, int] | None:
    clear_pair = _clear_afternoon_evening_restart_pair(times)
    if clear_pair is not None:
        return clear_pair

    extra_split = _extra_afternoon_evening_split_pair(times)
    if extra_split is not None:
        return extra_split

    checkouts = [value for value in times if 16 * 60 + 30 <= value <= 17 * 60 + 30]
    restarts = [value for value in times if 17 * 60 + 30 < value <= 18 * 60 + 15]

    for checkout in checkouts:
        restart_after_checkout = [value for value in restarts if value - checkout >= 20]
        if restart_after_checkout:
            return checkout, min(restart_after_checkout)

    return None


def _clear_afternoon_evening_restart_pair(times: list[int]) -> tuple[int, int] | None:
    """Recognize a clean afternoon checkout and early evening restart.

    Exactly two raw marks must exist in the end-of-afternoon cluster.  Three
    or more marks remain under the habitual repeated-punch rule because they
    are inherently ambiguous.  Evening work is only inferred when a clear
    final checkout is also present.
    """
    if not _has_afternoon_in(times) or not _has_evening_out(times):
        return None

    cluster = [
        value
        for value in times
        if AFTERNOON_CHECKOUT_CLUSTER_START <= value <= AFTERNOON_CHECKOUT_CLUSTER_END
    ]
    if len(cluster) != 2:
        return None

    checkout, restart = cluster
    if restart - checkout < MID_SHIFT_GAP_MINUTES:
        return None

    return checkout, restart


def _extra_afternoon_evening_split_pair(times: list[int]) -> tuple[int, int] | None:
    extra_done_times = [value for value in times if 17 * 60 + 15 <= value <= AFTERNOON_EXTRA_END_NORMAL]
    restarts = [value for value in times if EVENING_RESTART_MIN <= value <= 18 * 60 + 5]
    has_evening_out = _has_evening_out(times)

    if not has_evening_out:
        return None

    for extra_done in extra_done_times:
        restart_after_extra = [value for value in restarts if value - extra_done >= 10]
        if restart_after_extra:
            return extra_done, min(restart_after_extra)

    return None


def _suspicious_afternoon_evening_split_pair(times: list[int]) -> tuple[int, int] | None:
    if not _has_afternoon_in(times) or not _has_evening_out(times):
        return None

    significant_times = _collapse_duplicate_punches(times)
    checkouts = [value for value in significant_times if AFTERNOON_EXTRA_SUSPICIOUS_START <= value <= 18 * 60 + 5]
    restarts = [value for value in significant_times if EVENING_RESTART_MIN <= value <= EVENING_RESTART_MAX]

    for checkout in checkouts:
        restart_after_checkout = [value for value in restarts if value - checkout >= 10]
        if restart_after_checkout:
            return checkout, min(restart_after_checkout)

    return None


def _has_suspicious_afternoon_evening(times: list[int]) -> bool:
    if not _has_afternoon_in(times) or not _has_evening_out(times):
        return False

    if _suspicious_afternoon_evening_split_pair(times) is not None:
        return True

    return any(AFTERNOON_EXTRA_SUSPICIOUS_START <= value < EVENING_RESTART_MIN for value in times)


def _has_pre_evening_mark_without_afternoon_in(times: list[int]) -> bool:
    if _has_afternoon_in(times) or not _has_evening_out(times) or _is_early_evening_overtime(times):
        return False
    if _early_evening_direct_split_pair(times) is not None:
        return False
    if _has_direct_evening_shift(times):
        return False

    significant_times = _collapse_duplicate_punches(times)
    if len(significant_times) < 2:
        return False

    return any(17 * 60 + 16 <= value < EVENING_RESTART_MIN for value in significant_times[:-1])


def _has_ambiguous_early_evening_start(times: list[int]) -> bool:
    if _has_afternoon_in(times) or not _has_evening_out(times):
        return False
    if _early_evening_direct_split_pair(times) is not None:
        return False

    significant_times = _collapse_duplicate_punches(times)
    if len(significant_times) < 2:
        return False

    first = significant_times[0]
    return AMBIGUOUS_EARLY_EVENING_START_MIN <= first <= AMBIGUOUS_EARLY_EVENING_START_MAX


def _has_ambiguous_afternoon_evening(times: list[int]) -> bool:
    if not _has_afternoon_in(times) or _has_afternoon_checkout_before_evening(times):
        return False
    if not _has_evening_out(times):
        return False

    has_mid_afternoon_mark = any(17 * 60 + 15 <= value <= 17 * 60 + 35 for value in times)
    has_later_mark = any(value > 17 * 60 + 35 for value in times)
    return has_mid_afternoon_mark and has_later_mark


def _has_ambiguous_new_early_evening_sequence(times: list[int]) -> bool:
    significant_times = _collapse_duplicate_punches(times)
    if len(significant_times) <= 2:
        return False

    first = significant_times[0]
    return EARLY_EVENING_START_MIN <= first < LEGACY_EARLY_EVENING_START_MIN


def _has_invalid_pre_evening_sequence(times: list[int]) -> bool:
    if _has_morning_in(times) or _has_afternoon_in(times) or not _has_evening_out(times):
        return False

    significant_times = _collapse_duplicate_punches(times)
    if len(significant_times) < 3:
        return False

    first = significant_times[0]
    return 15 * 60 <= first < EARLY_EVENING_START_MIN


def _detect_missing_count(times: list[int]) -> int | str | None:
    if _has_ambiguous_afternoon_evening(times):
        return "?"
    if _is_extended_morning_only(times):
        return "?"
    if _is_short_evening_tail(times):
        return "?"
    if _is_collapsed_single_punch_cluster(times):
        return 1
    if _is_morning_start_only_without_checkout(times):
        return 1

    count = 0
    has_afternoon_in = _has_afternoon_in(times)
    has_morning_in = _has_morning_in(times)
    has_morning_out = _has_morning_checkout_after_entry(times)
    has_morning_out_mark = _has_morning_out(times)
    has_after_noon_punch = any(value >= 12 * 60 for value in times)
    if has_morning_out_mark and not has_morning_in:
        count += 1
    if has_morning_in and has_after_noon_punch and not has_morning_out:
        count += 1

    has_afternoon_out = _has_afternoon_out(times)
    has_early_evening_direct = _early_evening_direct_split_pair(times) is not None
    has_short_evening_duty = _short_evening_duty_pair(times) is not None
    has_direct_evening_shift = _has_direct_evening_shift(times)
    if (
        has_morning_out
        and has_afternoon_out
        and not has_afternoon_in
        and not has_early_evening_direct
        and not has_short_evening_duty
        and not has_direct_evening_shift
    ):
        count += 1
    if (
        has_morning_out
        and _has_late_afternoon_out_before_evening(times)
        and not has_afternoon_in
        and not has_early_evening_direct
        and not has_short_evening_duty
        and not has_direct_evening_shift
    ):
        count += 1
    if has_afternoon_in and not _has_afternoon_checkout_after_entry(times):
        count += 1

    has_evening_in = any(EVENING_START <= value <= EVENING_START + 30 for value in times)
    has_evening_out = any(value > EVENING_START + 30 for value in times)
    if has_evening_in and not has_evening_out and not has_afternoon_in:
        count += 1

    return count or None


def _detect_late_minutes(times: list[int]) -> int | None:
    late_values = _detect_late_events(times)
    return max(late_values) if late_values else None


def _detect_late_events(times: list[int], suppress_unpaired_evening: bool = False) -> list[int]:
    late_values: list[int] = []

    morning_in = _late_for_shift(times, 5 * 60, MORNING_START, MORNING_START + LATE_DETECTION_WINDOW)
    if morning_in is not None:
        late_values.append(morning_in)

    has_afternoon_in = _has_afternoon_in(times)
    afternoon_in = _late_for_shift(times, 12 * 60, AFTERNOON_START, AFTERNOON_START + LATE_DETECTION_WINDOW)
    if afternoon_in is not None:
        late_values.append(afternoon_in)

    early_evening_direct = _early_evening_direct_split_pair(times)
    if early_evening_direct is not None:
        early_evening_start, _checkout, _restart = early_evening_direct
        late_values.append(early_evening_start - EARLY_EVENING_START)
    else:
        short_duty_pair = _short_evening_duty_pair(times)
        if short_duty_pair is not None and not _has_evening_out(times):
            short_duty_start, _checkout = short_duty_pair
            late_values.append(short_duty_start - EARLY_EVENING_START)

    if not suppress_unpaired_evening:
        evening_in = _late_for_shift(times, 16 * 60 + 30, EVENING_START, EVENING_START + LATE_DETECTION_WINDOW)
        if evening_in is not None and not has_afternoon_in:
            late_values.append(evening_in)
        elif not has_afternoon_in and not _has_evening_start_candidate(times):
            late_evening_in = _first_between(times, EVENING_START + LATE_DETECTION_WINDOW, EVENING_END)
            if late_evening_in is not None:
                late_values.append(late_evening_in - EVENING_START)

    late_values = [value for value in late_values if value > 0]
    return late_values


def _detect_mid_shift_gaps(times: list[int]) -> list[MidShiftGap]:
    significant_times = _collapse_duplicate_punches(times)
    gaps: list[MidShiftGap] = []

    for index in range(1, len(significant_times) - 2, 2):
        start = significant_times[index]
        end = significant_times[index + 1]
        if end - start < MID_SHIFT_GAP_MINUTES:
            continue
        if not _is_internal_shift_gap(start, end):
            continue

        rounded_minutes = _rounded_penalty_minutes(end - start)
        if rounded_minutes <= 0:
            continue

        gaps.append(
            MidShiftGap(
                start=start,
                end=end,
                minutes=end - start,
                rounded_minutes=rounded_minutes,
            )
        )

    return gaps


def _collapse_duplicate_punches(times: list[int]) -> list[int]:
    result: list[int] = []
    for value in times:
        if result and value - result[-1] <= DUPLICATE_PUNCH_WINDOW:
            continue
        result.append(value)
    return result


def _normalize_end_of_afternoon_cluster(times: list[int]) -> list[int]:
    """Collapse habitual end-of-shift punches to the actual final checkout.

    This applies only when an afternoon entry already exists. Without that
    context, marks around 17:00 may be a real short shift and are preserved.
    A later evening restart/out pair is also preserved outside the cluster.
    """
    if not _has_afternoon_in(times):
        return times

    cluster = [
        value
        for value in times
        if AFTERNOON_CHECKOUT_CLUSTER_START <= value <= AFTERNOON_CHECKOUT_CLUSTER_END
    ]
    if len(cluster) <= 1:
        return times

    actual_checkout = max(cluster)
    cluster_values = set(cluster)
    return [value for value in times if value not in cluster_values or value == actual_checkout]


def _is_internal_shift_gap(start: int, end: int) -> bool:
    shifts = (
        (MORNING_START, MORNING_END),
        (AFTERNOON_START, AFTERNOON_END),
        (EVENING_START, EVENING_END),
    )
    return any(shift_start < start < end < shift_end for shift_start, shift_end in shifts)


def _first_between(times: list[int], start: int, end: int) -> int | None:
    values = [value for value in times if start < value <= end]
    return min(values) if values else None


def _late_for_shift(times: list[int], early_start: int, shift_start: int, late_until: int) -> int | None:
    if any(early_start <= value <= shift_start for value in times):
        return None

    first_late = _first_between(times, shift_start, late_until)
    if first_late is None:
        return None

    return first_late - shift_start


def _has_afternoon_in(times: list[int]) -> bool:
    return bool(_afternoon_in_times(times))


def _has_afternoon_checkout_after_entry(times: list[int]) -> bool:
    """Return whether a distinct punch closes a recognized afternoon entry.

    A checkout before 16:30 is still a valid second punch. Punches inside the
    duplicate window are collapsed first, so they cannot form a false pair.
    """
    significant_times = _collapse_duplicate_punches(times)
    afternoon_entries = _afternoon_in_times(significant_times)
    return any(
        checkout > entry
        for entry in afternoon_entries
        for checkout in significant_times
    )


def _has_evening_out(times: list[int]) -> bool:
    return any(EVENING_OUT_MIN <= value <= EVENING_OUT_MAX for value in times)


def _has_evening_start_candidate(times: list[int]) -> bool:
    return any(16 * 60 + 30 <= value <= EVENING_START + LATE_DETECTION_WINDOW for value in times)


def _has_unpaired_evening_mark(times: list[int]) -> bool:
    if _has_afternoon_in(times) or _is_early_evening_overtime(times):
        return False
    if _early_evening_direct_split_pair(times) is not None:
        return False
    if _short_evening_duty_pair(times) is not None:
        return False
    if _has_direct_evening_shift(times):
        return False

    significant_times = _collapse_duplicate_punches(times)
    evening_marks = [value for value in significant_times if EVENING_START <= value <= EVENING_OUT_MAX]
    return len(evening_marks) == 1


def _has_direct_evening_shift(times: list[int]) -> bool:
    if _has_afternoon_in(times):
        return False

    significant_times = _collapse_duplicate_punches(times)
    starts = [value for value in significant_times if EARLY_EVENING_START_MIN <= value <= EVENING_START + 30]
    if not starts:
        return False

    first = significant_times[0]
    last = significant_times[-1]
    if first < LEGACY_EARLY_EVENING_START_MIN and not _has_morning_in(significant_times):
        return len(significant_times) == 2 and _has_evening_out(significant_times)

    return any(last - start >= DIRECT_EVENING_MIN_DURATION for start in starts)


def _has_afternoon_out(times: list[int]) -> bool:
    return any(16 * 60 + 30 <= value <= AFTERNOON_EXTRA_END_NORMAL for value in times)


def _has_late_afternoon_out_before_evening(times: list[int]) -> bool:
    return any(AFTERNOON_EXTRA_SUSPICIOUS_START <= value < EVENING_RESTART_MIN for value in times)


def _has_morning_in(times: list[int]) -> bool:
    return any(value <= MORNING_START + 60 for value in times)


def _has_morning_out(times: list[int]) -> bool:
    return any(11 * 60 <= value <= NOON_OUT_END for value in times)


def _has_morning_checkout_after_entry(times: list[int]) -> bool:
    """Recognize a distinct morning checkout, including an early departure."""
    significant_times = _collapse_duplicate_punches(times)
    morning_entries = [value for value in significant_times if value <= MORNING_START + 60]
    return any(
        entry < checkout <= NOON_OUT_END
        for entry in morning_entries
        for checkout in significant_times
    )


def _afternoon_in_times(times: list[int]) -> list[int]:
    has_morning_in = _has_morning_in(times)
    result: list[int] = []
    for value in times:
        if not (NOON_OUT_START <= value <= AFTERNOON_START + LATE_DETECTION_WINDOW):
            continue
        if has_morning_in and value <= NOON_OUT_END:
            continue
        result.append(value)
    return result


def _is_extended_morning_only(times: list[int]) -> bool:
    if not _has_morning_in(times):
        return False
    return (
        NOON_OUT_START <= times[-1] <= NOON_OUT_END
        and not _has_morning_checkout_after_entry(times)
    )


def _is_short_evening_tail(times: list[int]) -> bool:
    if len(times) != 2:
        return False
    return times[0] >= EVENING_OUT_MIN and times[-1] <= EVENING_OUT_MAX


def _is_collapsed_single_punch_cluster(times: list[int]) -> bool:
    if len(times) < 2:
        return False
    return len(_collapse_duplicate_punches(times)) == 1


def _is_morning_start_only_without_checkout(times: list[int]) -> bool:
    if len(times) < 2 or not _has_morning_in(times):
        return False
    return (
        not _has_morning_checkout_after_entry(times)
        and all(value <= MORNING_START + LATE_DETECTION_WINDOW for value in times)
    )


def _round_half(hours: float) -> float:
    return floor(hours * 2 + 0.5) / 2


def _round_work_minutes(minutes: int) -> float:
    hours = minutes // 60
    remainder = minutes % 60

    if remainder < 15:
        extra = 0
    elif remainder < 25:
        extra = 0.25
    elif remainder < 45:
        extra = 0.5
    elif remainder < AFTERNOON_ROUND_UP_MINUTE:
        extra = 0.75
    else:
        return hours + 1

    return hours + extra


def _round_afternoon_hours(minutes: int) -> float:
    return _round_work_minutes(minutes)


def _rounded_penalty_minutes(minutes: int) -> int:
    if minutes <= 0:
        return 0

    blocks = minutes // 30
    remainder = minutes % 30
    return blocks * 30 + (30 if remainder > 8 else 0)


def _clean(value: float) -> float:
    if value <= 0:
        return 0
    return int(value) if value.is_integer() else value
