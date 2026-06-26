from dataclasses import dataclass
from math import floor

from app.services.punch_parser import time_to_minutes


MORNING_START = 7 * 60 + 30
MORNING_END = 11 * 60 + 30
AFTERNOON_START = 13 * 60
AFTERNOON_END = 17 * 60
EVENING_START = 18 * 60
EVENING_END = 22 * 60


@dataclass(frozen=True)
class CalculationResult:
    work_value: float | str | None
    missing_count: int | str | None
    late_minutes: int | None
    manual_checks: list[str]


def calculate_day(punches: list[str]) -> CalculationResult:
    if not punches:
        return CalculationResult(None, None, None, [])

    times = sorted({time_to_minutes(punch) for punch in punches})
    manual_checks: list[str] = []
    missing_count = _detect_missing_count(times)
    late_minutes = _detect_late_minutes(times)

    work_value = _calculate_work_value(times)
    if work_value is None:
        manual_checks.append("Không đủ cặp giờ để tính công")

    if len(times) == 1:
        manual_checks.append("Chỉ có một lần bấm công")
    if missing_count == "?":
        manual_checks.append("Dữ liệu ca mập mờ, cần kiểm tra")
    elif missing_count:
        manual_checks.append(f"Có dấu hiệu quên bấm công: {missing_count} lần")

    return CalculationResult(work_value, missing_count, late_minutes, manual_checks)


def _calculate_work_value(times: list[int]) -> float | None:
    first = times[0]
    last = times[-1]

    morning = _morning_hours(times)
    afternoon = _afternoon_hours(times)
    evening = _evening_hours(times)

    if morning > 0 and afternoon > 0:
        if _has_afternoon_checkout_before_evening(times):
            afternoon_value = 4.5 if _has_afternoon_extra_before_evening(times) else min(afternoon, 4)
            return _clean(morning + afternoon_value + evening)
        return _clean(morning + afternoon)

    if morning > 0 and evening > 0:
        return _clean(morning + evening)

    if afternoon > 0:
        if _has_afternoon_checkout_before_evening(times) and evening > 0:
            afternoon_value = 4.5 if _has_afternoon_extra_before_evening(times) else min(afternoon, 4)
            return _clean(afternoon_value + evening)
        return _clean(afternoon)

    if evening > 0:
        return _clean(evening)

    if morning > 0:
        return _clean(morning)

    if first < MORNING_END and last > first:
        return _clean(_round_half((last - max(first, MORNING_START)) / 60))

    return None


def _morning_hours(times: list[int]) -> float:
    starts = [value for value in times if value <= MORNING_START + 60]
    if not starts:
        return 0

    morning_outs = [value for value in times if MORNING_START < value <= 12 * 60 + 10]
    if not morning_outs:
        return 0

    out_time = max(morning_outs)
    if out_time >= MORNING_END:
        return 4

    return _round_half(max(0, out_time - MORNING_START) / 60)


def _afternoon_hours(times: list[int]) -> float:
    last = times[-1]
    afternoon_starts = [value for value in times if 12 * 60 <= value <= 14 * 60]
    if not afternoon_starts:
        return 0

    if last < AFTERNOON_START:
        return 0

    return _round_half(max(0, last - AFTERNOON_START) / 60)


def _evening_hours(times: list[int]) -> float:
    if len(times) < 2:
        return 0

    first = times[0]
    last = times[-1]
    has_afternoon_in = _has_afternoon_in(times)
    split_pair = _afternoon_evening_split_pair(times) if has_afternoon_in else None
    if split_pair is not None and last > EVENING_START:
        return _round_half(max(0, last - EVENING_START) / 60)

    evening_starts = [value for value in times if 16 * 60 + 30 <= value <= EVENING_END]
    if not evening_starts or last <= 17 * 60:
        return 0

    start = evening_starts[0]
    if start <= 17 * 60:
        effective_start = 17 * 60
    elif start <= EVENING_START + 15:
        effective_start = EVENING_START
    else:
        effective_start = start

    if first < MORNING_END and start >= 16 * 60 + 30 and has_afternoon_in:
        effective_start = 17 * 60

    return _round_half(max(0, last - effective_start) / 60)


def _has_afternoon_checkout_before_evening(times: list[int]) -> bool:
    return _has_afternoon_in(times) and _afternoon_evening_split_pair(times) is not None


def _has_afternoon_extra_before_evening(times: list[int]) -> bool:
    return _has_afternoon_in(times) and _extra_afternoon_evening_split_pair(times) is not None


def _afternoon_evening_split_pair(times: list[int]) -> tuple[int, int] | None:
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


def _extra_afternoon_evening_split_pair(times: list[int]) -> tuple[int, int] | None:
    extra_done_times = [value for value in times if 17 * 60 + 15 <= value <= 17 * 60 + 35]
    restarts = [value for value in times if 17 * 60 + 40 <= value <= 18 * 60 + 5]
    has_evening_out = any(21 * 60 + 30 <= value <= 22 * 60 + 30 for value in times)

    if not has_evening_out:
        return None

    for extra_done in extra_done_times:
        restart_after_extra = [value for value in restarts if value - extra_done >= 10]
        if restart_after_extra:
            return extra_done, min(restart_after_extra)

    return None


def _has_ambiguous_afternoon_evening(times: list[int]) -> bool:
    if not _has_afternoon_in(times) or _has_afternoon_checkout_before_evening(times):
        return False

    has_mid_afternoon_mark = any(17 * 60 + 15 <= value <= 17 * 60 + 35 for value in times)
    has_later_mark = any(value > 17 * 60 + 35 for value in times)
    return has_mid_afternoon_mark and has_later_mark


def _detect_missing_count(times: list[int]) -> int | str | None:
    if _has_ambiguous_afternoon_evening(times):
        return "?"

    count = 0
    has_afternoon_in = _has_afternoon_in(times)
    has_morning_in = any(value <= MORNING_START + 60 for value in times)
    has_morning_out = any(11 * 60 <= value <= 12 * 60 + 10 for value in times)
    has_after_noon_punch = any(value >= 12 * 60 for value in times)
    if has_morning_in and has_after_noon_punch and not has_morning_out:
        count += 1

    has_afternoon_out = any(value >= 16 * 60 + 30 for value in times)
    if has_afternoon_in and not has_afternoon_out:
        count += 1

    has_evening_in = any(EVENING_START <= value <= EVENING_START + 30 for value in times)
    has_evening_out = any(value >= 21 * 60 + 30 for value in times)
    if has_evening_in and not has_evening_out and not has_afternoon_in:
        count += 1

    return count or None


def _detect_late_minutes(times: list[int]) -> int | None:
    late_values: list[int] = []

    morning_in = _late_for_shift(times, 5 * 60, MORNING_START, MORNING_START + 60)
    if morning_in is not None:
        late_values.append(morning_in)

    has_afternoon_in = _has_afternoon_in(times)
    afternoon_in = _late_for_shift(times, 12 * 60, AFTERNOON_START, AFTERNOON_START + 45)
    if afternoon_in is not None:
        late_values.append(afternoon_in)

    evening_in = _late_for_shift(times, 16 * 60 + 30, EVENING_START, EVENING_START + 45)
    if evening_in is not None and not has_afternoon_in:
        late_values.append(evening_in)

    late_values = [value for value in late_values if value > 0]
    return max(late_values) if late_values else None


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
    return any(12 * 60 <= value <= 14 * 60 for value in times)


def _round_half(hours: float) -> float:
    return floor(hours * 2 + 0.5) / 2


def _clean(value: float) -> float:
    if value <= 0:
        return 0
    return int(value) if value.is_integer() else value
