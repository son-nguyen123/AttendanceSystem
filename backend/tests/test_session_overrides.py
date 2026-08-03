from app.services.session_overrides import merge_session_overrides, save_automatic_overrides


def test_manual_session_override_wins_per_field(tmp_path) -> None:
    save_automatic_overrides(
        tmp_path,
        [
            {
                "employee_code": "1420",
                "day": 7,
                "work_value": 8,
                "missing_count": None,
                "late_minutes": None,
                "review_notes": ["Tự động ngày đầu"],
            }
        ],
    )

    merged = merge_session_overrides(
        tmp_path,
        [{"employee_code": "1420", "day": 7, "work_value": 7.5}],
    )

    assert merged == [
        {
            "employee_code": "1420",
            "day": 7,
            "work_value": 7.5,
            "missing_count": None,
            "late_minutes": None,
            "review_notes": ["Tự động ngày đầu"],
        }
    ]
