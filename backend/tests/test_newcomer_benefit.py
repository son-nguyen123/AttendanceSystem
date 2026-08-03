from app.services.attendance_calculator import calculate_day
from app.services import newcomer_benefit


def _analysis(employee_code: str, day: int, punches: list[str]) -> dict:
    calculated = calculate_day(punches)
    return {
        "period": {"month": 7, "year": 2026},
        "summary": {},
        "manual_checks": [
            {
                "employee_code": employee_code,
                "day": day,
                "cell": "",
                "punches": punches,
                "messages": calculated.manual_checks,
            }
        ] if calculated.manual_checks else [],
        "blocks": [
            {
                "employee_code": employee_code,
                "results": [
                    {
                        "day": day,
                        "punches": punches,
                        "work_value": calculated.work_value,
                        "missing_count": calculated.missing_count,
                        "late_minutes": calculated.late_minutes,
                    }
                ],
            }
        ],
    }


def _enable_first_time_employee(monkeypatch) -> None:
    monkeypatch.setattr(newcomer_benefit, "list_known_employee_codes", lambda factory: [])
    monkeypatch.setattr(
        newcomer_benefit,
        "get_latest_period_snapshot",
        lambda factory: {"period": {"month": 6, "year": 2026}, "employee_codes": []},
    )


def test_first_day_late_morning_uses_fixed_start_once(monkeypatch) -> None:
    _enable_first_time_employee(monkeypatch)
    analysis = _analysis("1420", 7, ["08:41", "11:32", "12:54", "17:02"])

    overrides = newcomer_benefit.apply_newcomer_first_day_benefits(analysis, "factory1")
    result = analysis["blocks"][0]["results"][0]

    assert result["work_value"] == 8
    assert result["missing_count"] is None
    assert result["late_minutes"] is None
    assert len(overrides) == 1
    assert "ca sáng" in overrides[0]["review_notes"][0]


def test_first_day_early_checkout_keeps_actual_checkout(monkeypatch) -> None:
    _enable_first_time_employee(monkeypatch)
    analysis = _analysis("1500", 1, ["08:40", "10:15"])

    newcomer_benefit.apply_newcomer_first_day_benefits(analysis, "factory1")

    assert analysis["blocks"][0]["results"][0]["work_value"] == 2.75


def test_first_day_ambiguous_early_evening_pair_becomes_standard_evening(monkeypatch) -> None:
    _enable_first_time_employee(monkeypatch)
    analysis = _analysis("1426", 14, ["17:10", "22:02"])

    newcomer_benefit.apply_newcomer_first_day_benefits(analysis, "factory1")
    result = analysis["blocks"][0]["results"][0]

    assert result["work_value"] == 4
    assert result["missing_count"] is None
    assert result["late_minutes"] is None


def test_first_day_keeps_anomaly_from_later_shift(monkeypatch) -> None:
    _enable_first_time_employee(monkeypatch)
    punches = ["08:41", "11:32", "13:00", "15:00", "15:20", "17:02"]
    analysis = _analysis("1501", 1, punches)

    newcomer_benefit.apply_newcomer_first_day_benefits(analysis, "factory1")
    result = analysis["blocks"][0]["results"][0]

    assert result["missing_count"] == "?"
    assert any("ra/vào giữa giờ công" in item["messages"][0] for item in analysis["manual_checks"])


def test_known_employee_never_gets_newcomer_benefit(monkeypatch) -> None:
    monkeypatch.setattr(newcomer_benefit, "list_known_employee_codes", lambda factory: ["1420"])
    monkeypatch.setattr(
        newcomer_benefit,
        "get_latest_period_snapshot",
        lambda factory: {"period": {"month": 6, "year": 2026}, "employee_codes": ["1420"]},
    )
    analysis = _analysis("1420", 7, ["08:41", "11:32", "12:54", "17:02"])

    overrides = newcomer_benefit.apply_newcomer_first_day_benefits(analysis, "factory1")

    assert overrides == []
    assert analysis["blocks"][0]["results"][0]["work_value"] == 6.5
