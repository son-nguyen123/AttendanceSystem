from dataclasses import dataclass

from app.services.attendance_calculator import calculate_day, _round_work_minutes
from app.services.history_store import get_latest_period_snapshot, list_known_employee_codes
from app.services.punch_parser import time_to_minutes, minutes_to_time


MORNING_START = 7 * 60 + 30
MORNING_END_LIMIT = 12 * 60 + 10
AFTERNOON_START = 13 * 60
AFTERNOON_ENTRY_LIMIT = 16 * 60 + 39
AFTERNOON_END_LIMIT = 17 * 60 + 39
EVENING_START = 18 * 60
EVENING_ENTRY_MIN = 16 * 60 + 40
EVENING_OUT_MIN = 21 * 60 + 30


@dataclass(frozen=True)
class ShiftEvidence:
    name: str
    punches: list[int]
    fixed_start: int
    maximum_hours: float


def apply_newcomer_first_day_benefits(analysis: dict, factory: str) -> list[dict]:
    """Apply one onboarding allowance to first-time employees' first workday."""
    if not _is_newest_analysis_period(analysis.get("period") or {}, factory):
        return []

    known_codes = set(list_known_employee_codes(factory=factory))
    overrides: list[dict] = []
    affected_keys: set[tuple[str, int]] = set()
    replacement_checks: dict[tuple[str, int], list[str]] = {}

    for block in analysis.get("blocks", []):
        employee_code = str(block.get("employee_code") or "").strip()
        if not employee_code or employee_code in known_codes:
            continue
        first_result = next((item for item in block.get("results", []) if item.get("punches")), None)
        if not first_result:
            continue
        adjustment = _newcomer_day_adjustment(first_result)
        if adjustment is None:
            continue

        first_result.update(
            work_value=adjustment["work_value"],
            missing_count=adjustment["missing_count"],
            late_minutes=adjustment["late_minutes"],
        )
        first_result["newcomer_benefit"] = adjustment["note"]
        override = {
            "employee_code": employee_code,
            "day": int(first_result["day"]),
            "work_value": adjustment["work_value"],
            "missing_count": adjustment["missing_count"],
            "late_minutes": adjustment["late_minutes"],
            "review_notes": [adjustment["note"]],
        }
        overrides.append(override)
        key = (employee_code, int(first_result["day"]))
        affected_keys.add(key)
        replacement_checks[key] = adjustment["remaining_messages"]

    if affected_keys:
        refreshed_checks: list[dict] = []
        for item in analysis.get("manual_checks", []):
            key = (str(item.get("employee_code") or ""), int(item.get("day") or 0))
            if key not in affected_keys:
                refreshed_checks.append(item)
                continue
            messages = replacement_checks.get(key, [])
            if messages:
                refreshed_checks.append({**item, "messages": messages})
        analysis["manual_checks"] = refreshed_checks
        _refresh_summary(analysis)
    return overrides


def _newcomer_day_adjustment(result: dict) -> dict | None:
    punches = sorted({time_to_minutes(value) for value in result.get("punches", [])})
    if not punches:
        return None
    shifts = _split_shift_evidence(punches)
    if not shifts:
        return None

    selected_index = next(
        (index for index, shift in enumerate(shifts) if _shift_needs_onboarding_benefit(shift)),
        None,
    )
    if selected_index is None:
        return None

    selected = shifts[selected_index]
    selected_result = calculate_day([minutes_to_time(value) for value in selected.punches])
    benefit_hours = _benefit_hours(selected)
    current_work = _number(result.get("work_value"))
    selected_work = _number(selected_result.work_value)
    adjusted_work = _clean(max(0, current_work - selected_work + benefit_hours))

    remaining_results = [
        calculate_day([minutes_to_time(value) for value in shift.punches])
        for index, shift in enumerate(shifts)
        if index != selected_index
    ]
    remaining_late = sum(item.late_minutes or 0 for item in remaining_results) or None
    remaining_missing: int | str | None
    if any(item.missing_count == "?" for item in remaining_results):
        remaining_missing = "?"
    else:
        missing_total = sum(
            int(item.missing_count)
            for item in remaining_results
            if isinstance(item.missing_count, int)
        )
        remaining_missing = missing_total or None
    remaining_messages = [message for item in remaining_results for message in item.manual_checks]
    note = f"Ngày đầu nhân viên mới: đã áp dụng mốc chuẩn cho ca {selected.name}"
    return {
        "work_value": adjusted_work,
        "missing_count": remaining_missing,
        "late_minutes": remaining_late,
        "remaining_messages": remaining_messages,
        "note": note,
    }


def _split_shift_evidence(times: list[int]) -> list[ShiftEvidence]:
    remaining = list(times)
    shifts: list[ShiftEvidence] = []

    evening_outs = [value for value in remaining if value >= EVENING_OUT_MIN]
    if evening_outs:
        first_out = min(evening_outs)
        starts = [value for value in remaining if EVENING_ENTRY_MIN <= value < first_out]
        if starts:
            start = max(starts)
            evening = [value for value in remaining if value >= start]
            shifts.append(ShiftEvidence("tối", evening, EVENING_START, 4))
            remaining = [value for value in remaining if value < start]

    morning = [value for value in remaining if value <= MORNING_END_LIMIT]
    if morning:
        shifts.append(ShiftEvidence("sáng", morning, MORNING_START, 4))
        morning_values = set(morning)
        remaining = [value for value in remaining if value not in morning_values]

    if len(remaining) == 1 and remaining[0] >= EVENING_ENTRY_MIN:
        shifts.append(ShiftEvidence("tối", remaining, EVENING_START, 4))
        remaining = []

    afternoon = [value for value in remaining if value <= AFTERNOON_END_LIMIT]
    if afternoon:
        shifts.append(ShiftEvidence("chiều", afternoon, AFTERNOON_START, 4.5))
        afternoon_values = set(afternoon)
        remaining = [value for value in remaining if value not in afternoon_values]

    if remaining:
        shifts.append(ShiftEvidence("tối", remaining, EVENING_START, 4))
    return sorted(shifts, key=lambda shift: shift.punches[0])


def _shift_needs_onboarding_benefit(shift: ShiftEvidence) -> bool:
    result = calculate_day([minutes_to_time(value) for value in shift.punches])
    first = shift.punches[0]
    return (
        len(shift.punches) == 1
        or first > shift.fixed_start
        or result.late_minutes is not None
        or result.missing_count is not None
    )


def _benefit_hours(shift: ShiftEvidence) -> float:
    if len(shift.punches) == 1:
        return 4
    checkout = shift.punches[-1]
    if checkout <= shift.fixed_start:
        return 0
    return min(shift.maximum_hours, _round_work_minutes(checkout - shift.fixed_start))


def _is_newest_analysis_period(period: dict, factory: str) -> bool:
    month = int(period.get("month") or 0)
    year = int(period.get("year") or 0)
    if not month or not year:
        return False
    latest = get_latest_period_snapshot(factory=factory).get("period")
    if not latest:
        return True
    return (year, month) >= (int(latest.get("year") or 0), int(latest.get("month") or 0))


def _refresh_summary(analysis: dict) -> None:
    results = [item for block in analysis.get("blocks", []) for item in block.get("results", [])]
    summary = analysis.setdefault("summary", {})
    summary["result_cells"] = sum(item.get("work_value") is not None for item in results)
    summary["missing_cells"] = sum(item.get("missing_count") is not None for item in results)
    summary["late_cells"] = sum(item.get("late_minutes") is not None for item in results)
    summary["manual_check_count"] = len(analysis.get("manual_checks", []))


def _number(value: object) -> float:
    return float(value) if isinstance(value, (int, float)) else 0.0


def _clean(value: float) -> int | float:
    rounded = round(value, 4)
    return int(rounded) if rounded.is_integer() else rounded
