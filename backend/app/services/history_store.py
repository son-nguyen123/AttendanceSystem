import json
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from app.services.period_detector import detect_period_from_workbook
from app.services.payroll_workbook import export_payroll_workbook, preview_payroll
from app.services.workbook_processor import analyze_workbook, export_processed_workbook


STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"
HISTORY_DIR = STORAGE_DIR / "history"
DB_PATH = STORAGE_DIR / "attendance_history.db"


def init_history_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS attendance_periods (
                id TEXT PRIMARY KEY,
                month INTEGER NOT NULL,
                year INTEGER NOT NULL,
                label TEXT NOT NULL,
                source_filename TEXT NOT NULL,
                source_path TEXT NOT NULL,
                output1_path TEXT NOT NULL,
                output2_path TEXT NOT NULL,
                sheet_name TEXT NOT NULL,
                block_count INTEGER NOT NULL DEFAULT 0,
                result_cells INTEGER NOT NULL DEFAULT 0,
                missing_cells INTEGER NOT NULL DEFAULT 0,
                late_cells INTEGER NOT NULL DEFAULT 0,
                manual_check_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS employee_monthly_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                period_id TEXT NOT NULL,
                employee_code TEXT NOT NULL,
                employee_name TEXT NOT NULL DEFAULT '',
                total_hours REAL NOT NULL DEFAULT 0,
                work_days REAL NOT NULL DEFAULT 0,
                monthly_salary REAL,
                daily_salary REAL NOT NULL DEFAULT 0,
                hourly_salary REAL NOT NULL DEFAULT 0,
                standard_work_days REAL NOT NULL DEFAULT 26,
                bonus REAL NOT NULL DEFAULT 0,
                advance_or_penalty REAL NOT NULL DEFAULT 0,
                final_salary REAL NOT NULL DEFAULT 0,
                note TEXT NOT NULL DEFAULT '',
                FOREIGN KEY(period_id) REFERENCES attendance_periods(id) ON DELETE CASCADE,
                UNIQUE(period_id, employee_code)
            );

            CREATE TABLE IF NOT EXISTS employee_daily_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                period_id TEXT NOT NULL,
                employee_code TEXT NOT NULL,
                day INTEGER NOT NULL,
                punches_json TEXT NOT NULL DEFAULT '[]',
                work_value TEXT,
                missing_count TEXT,
                late_minutes INTEGER,
                manual_checks_json TEXT NOT NULL DEFAULT '[]',
                FOREIGN KEY(period_id) REFERENCES attendance_periods(id) ON DELETE CASCADE,
                UNIQUE(period_id, employee_code, day)
            );

            CREATE INDEX IF NOT EXISTS idx_period_month_year
                ON attendance_periods(year, month);
            CREATE INDEX IF NOT EXISTS idx_employee_monthly_code
                ON employee_monthly_records(employee_code);
            CREATE INDEX IF NOT EXISTS idx_employee_daily_lookup
                ON employee_daily_records(employee_code, period_id, day);
            """
        )
        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(employee_daily_records)").fetchall()
        }
        if "review_notes_json" not in columns:
            conn.execute(
                "ALTER TABLE employee_daily_records ADD COLUMN review_notes_json TEXT NOT NULL DEFAULT '[]'"
            )


def save_session_to_history(
    source_path: Path,
    source_filename: str,
    month: int | None = None,
    year: int | None = None,
    label: str | None = None,
    review_overrides: list[dict] | None = None,
) -> dict:
    init_history_db()
    detected = detect_period_from_workbook(source_path)
    selected_month = month or _as_int(detected.get("month"))
    selected_year = year or _as_int(detected.get("year"))
    if not selected_month or not selected_year:
        raise ValueError("Chưa xác định được tháng/năm của file")
    if selected_month < 1 or selected_month > 12:
        raise ValueError("Tháng phải nằm trong khoảng 1-12")

    period_id = uuid4().hex
    period_dir = HISTORY_DIR / period_id
    period_dir.mkdir(parents=True, exist_ok=True)

    suffix = source_path.suffix or ".xlsx"
    original_path = period_dir / f"original{suffix}"
    output1_path = period_dir / "attendance_output.xlsx"
    output2_path = period_dir / "payroll_private_output.xlsx"

    overrides = review_overrides or []

    shutil.copy2(source_path, original_path)
    export_processed_workbook(source_path, output1_path, review_overrides=overrides)
    export_payroll_workbook(source_path, output2_path, review_overrides=overrides)

    analysis = analyze_workbook(source_path)
    _apply_review_overrides_to_analysis(analysis, overrides)
    payroll_preview = preview_payroll(source_path, review_overrides=overrides)
    payroll_by_code = {item["employee_code"]: item for item in payroll_preview.get("employees", [])}
    manual_by_employee_day = _manual_checks_by_employee_day(analysis.get("manual_checks", []))
    review_notes_by_employee_day = _review_notes_by_employee_day(overrides)

    now = datetime.now().isoformat(timespec="seconds")
    period_label = label.strip() if label and label.strip() else f"Tháng {selected_month:02d}/{selected_year}"

    with _connect() as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute(
            """
            INSERT INTO attendance_periods (
                id, month, year, label, source_filename, source_path, output1_path, output2_path,
                sheet_name, block_count, result_cells, missing_cells, late_cells, manual_check_count,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                period_id,
                selected_month,
                selected_year,
                period_label,
                source_filename,
                str(original_path),
                str(output1_path),
                str(output2_path),
                analysis.get("sheet_name", ""),
                analysis["summary"]["blocks"],
                analysis["summary"]["result_cells"],
                analysis["summary"]["missing_cells"],
                analysis["summary"]["late_cells"],
                analysis["summary"]["manual_check_count"],
                now,
                now,
            ),
        )

        for block in analysis.get("blocks", []):
            employee_code = block["employee_code"]
            payroll = payroll_by_code.get(employee_code, {})
            conn.execute(
                """
                INSERT INTO employee_monthly_records (
                    period_id, employee_code, employee_name, total_hours, work_days,
                    monthly_salary, daily_salary, hourly_salary, standard_work_days,
                    bonus, advance_or_penalty, final_salary, note
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    period_id,
                    employee_code,
                    payroll.get("name") or "",
                    _num(payroll.get("total_hours")),
                    _num(payroll.get("work_days")),
                    payroll.get("monthly_salary"),
                    _num(payroll.get("daily_salary")),
                    _num(payroll.get("hourly_salary")),
                    _num(payroll.get("standard_work_days"), 26),
                    _num(payroll.get("bonus")),
                    _num(payroll.get("advance_or_penalty")),
                    _num(payroll.get("final_salary")),
                    payroll.get("note") or "",
                ),
            )

            for result in block.get("results", []):
                manual_messages = manual_by_employee_day.get((employee_code, result["day"]), [])
                review_notes = review_notes_by_employee_day.get((employee_code, result["day"]), [])
                conn.execute(
                    """
                    INSERT INTO employee_daily_records (
                        period_id, employee_code, day, punches_json, work_value,
                        missing_count, late_minutes, manual_checks_json, review_notes_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        period_id,
                        employee_code,
                        result["day"],
                        json.dumps(result.get("punches", []), ensure_ascii=False),
                        _text_or_none(result.get("work_value")),
                        _text_or_none(result.get("missing_count")),
                        result.get("late_minutes"),
                        json.dumps(manual_messages, ensure_ascii=False),
                        json.dumps(review_notes, ensure_ascii=False),
                    ),
                )

    return get_period_detail(period_id)


def list_periods(employee_code: str | None = None, month: int | None = None, year: int | None = None) -> list[dict]:
    init_history_db()
    filters = []
    params: list[object] = []
    join_employee = bool(employee_code)
    if join_employee:
        filters.append("em.employee_code LIKE ?")
        params.append(f"%{employee_code.strip()}%")
    if month:
        filters.append("p.month = ?")
        params.append(month)
    if year:
        filters.append("p.year = ?")
        params.append(year)

    sql = """
        SELECT DISTINCT p.*
        FROM attendance_periods p
    """
    if join_employee:
        sql += " JOIN employee_monthly_records em ON em.period_id = p.id"
    if filters:
        sql += " WHERE " + " AND ".join(filters)
    sql += " ORDER BY p.year DESC, p.month DESC, p.created_at DESC"

    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_period_row_to_dict(row) for row in rows]


def get_period_detail(period_id: str) -> dict:
    init_history_db()
    with _connect() as conn:
        period = conn.execute("SELECT * FROM attendance_periods WHERE id = ?", (period_id,)).fetchone()
        if period is None:
            raise KeyError(period_id)
        employees = conn.execute(
            """
            SELECT *
            FROM employee_monthly_records
            WHERE period_id = ?
            ORDER BY CAST(employee_code AS INTEGER), employee_code
            """,
            (period_id,),
        ).fetchall()
        daily_rows = conn.execute(
            """
            SELECT *
            FROM employee_daily_records
            WHERE period_id = ?
            ORDER BY CAST(employee_code AS INTEGER), employee_code, day
            """,
            (period_id,),
        ).fetchall()

    daily_by_code: dict[str, list[dict]] = {}
    for row in daily_rows:
        item = dict(row)
        item["punches"] = json.loads(item.pop("punches_json") or "[]")
        item["manual_checks"] = json.loads(item.pop("manual_checks_json") or "[]")
        item["review_notes"] = json.loads(item.pop("review_notes_json") or "[]")
        item["work_value"] = _restore_number(item["work_value"])
        item["missing_count"] = _restore_number(item["missing_count"])
        daily_by_code.setdefault(item["employee_code"], []).append(item)

    employee_items = []
    for row in employees:
        item = dict(row)
        item["daily_records"] = daily_by_code.get(item["employee_code"], [])
        employee_items.append(item)

    return {"period": _period_row_to_dict(period), "employees": employee_items}


def search_employee_history(employee_code: str, month: int | None = None, year: int | None = None) -> list[dict]:
    init_history_db()
    filters = ["em.employee_code LIKE ?"]
    params: list[object] = [f"%{employee_code.strip()}%"]
    if month:
        filters.append("p.month = ?")
        params.append(month)
    if year:
        filters.append("p.year = ?")
        params.append(year)

    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT
                p.id AS period_id, p.month, p.year, p.label, p.created_at,
                em.employee_code, em.employee_name, em.total_hours, em.work_days,
                em.final_salary, em.note
            FROM employee_monthly_records em
            JOIN attendance_periods p ON p.id = em.period_id
            WHERE {" AND ".join(filters)}
            ORDER BY p.year DESC, p.month DESC, p.created_at DESC, em.employee_code
            """,
            params,
        ).fetchall()
    return [dict(row) for row in rows]


def list_known_employee_codes() -> list[str]:
    init_history_db()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT employee_code
            FROM employee_monthly_records
            ORDER BY CAST(employee_code AS INTEGER), employee_code
            """
        ).fetchall()
    return [str(row["employee_code"]) for row in rows]


def get_latest_period_snapshot() -> dict:
    init_history_db()
    with _connect() as conn:
        period = conn.execute(
            """
            SELECT *
            FROM attendance_periods
            ORDER BY year DESC, month DESC, created_at DESC
            LIMIT 1
            """
        ).fetchone()
        if period is None:
            return {"period": None, "employee_codes": []}

        rows = conn.execute(
            """
            SELECT DISTINCT employee_code
            FROM employee_monthly_records
            WHERE period_id = ?
            ORDER BY CAST(employee_code AS INTEGER), employee_code
            """,
            (period["id"],),
        ).fetchall()

    return {
        "period": _period_row_to_dict(period),
        "employee_codes": [str(row["employee_code"]) for row in rows],
    }


def get_period_file(period_id: str, kind: str) -> Path:
    init_history_db()
    column_by_kind = {
        "original": "source_path",
        "output1": "output1_path",
        "output2": "output2_path",
    }
    column = column_by_kind.get(kind)
    if column is None:
        raise ValueError("Loại file không hợp lệ")

    with _connect() as conn:
        row = conn.execute(f"SELECT {column} FROM attendance_periods WHERE id = ?", (period_id,)).fetchone()
    if row is None:
        raise KeyError(period_id)

    path = Path(row[0])
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def delete_period(period_id: str) -> None:
    init_history_db()
    with _connect() as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        row = conn.execute("SELECT source_path FROM attendance_periods WHERE id = ?", (period_id,)).fetchone()
        if row is None:
            raise KeyError(period_id)
        conn.execute("DELETE FROM attendance_periods WHERE id = ?", (period_id,))

    period_dir = HISTORY_DIR / period_id
    if period_dir.exists():
        shutil.rmtree(period_dir)


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _period_row_to_dict(row: sqlite3.Row) -> dict:
    item = dict(row)
    item["has_output1"] = Path(item["output1_path"]).exists()
    item["has_output2"] = Path(item["output2_path"]).exists()
    return item


def _manual_checks_by_employee_day(items: list[dict]) -> dict[tuple[str, int], list[str]]:
    result: dict[tuple[str, int], list[str]] = {}
    for item in items:
        key = (item["employee_code"], item["day"])
        result.setdefault(key, []).extend(item.get("messages", []))
    return result


def _apply_review_overrides_to_analysis(analysis: dict, review_overrides: list[dict]) -> None:
    overrides = _review_overrides_by_employee_day(review_overrides)
    summary = analysis["summary"]
    summary.update({"result_cells": 0, "missing_cells": 0, "late_cells": 0})

    for block in analysis.get("blocks", []):
        employee_code = block["employee_code"]
        for result in block.get("results", []):
            override = overrides.get((employee_code, result["day"]), {})
            if "missing_count" in override:
                result["missing_count"] = override["missing_count"]
            if "late_minutes" in override:
                result["late_minutes"] = override["late_minutes"]
            if "work_value" in override:
                result["work_value"] = override["work_value"]

            if result.get("work_value") is not None and result.get("work_value") != "":
                summary["result_cells"] += 1
            if result.get("missing_count") is not None and result.get("missing_count") != "":
                summary["missing_cells"] += 1
            if result.get("late_minutes") is not None and result.get("late_minutes") != "":
                summary["late_cells"] += 1


def _review_overrides_by_employee_day(items: list[dict]) -> dict[tuple[str, int], dict]:
    result: dict[tuple[str, int], dict] = {}
    for item in items:
        employee_code = str(item.get("employee_code", "")).strip()
        day = item.get("day")
        if not employee_code or not isinstance(day, int):
            continue

        target = result.setdefault((employee_code, day), {})
        if "missing_count" in item:
            target["missing_count"] = item.get("missing_count")
        if "late_minutes" in item:
            target["late_minutes"] = item.get("late_minutes")
        if "work_value" in item:
            target["work_value"] = item.get("work_value")
    return result


def _review_notes_by_employee_day(items: list[dict]) -> dict[tuple[str, int], list[str]]:
    result: dict[tuple[str, int], list[str]] = {}
    type_labels = {"missing": "Quên bấm / chưa rõ", "late": "Đi trễ"}
    status_labels = {"ok": "Đã OK", "edited": "Đã sửa", "pending": "Chưa xác nhận"}

    for item in items:
        employee_code = str(item.get("employee_code", "")).strip()
        day = item.get("day")
        if not employee_code or not isinstance(day, int):
            continue

        notes = item.get("review_notes")
        if isinstance(notes, list) and notes:
            result.setdefault((employee_code, day), []).extend(str(note) for note in notes)
            continue

        review_type = type_labels.get(str(item.get("type") or ""), "Kiểm tra")
        status = status_labels.get(str(item.get("status") or ""), "Chưa xác nhận")
        result.setdefault((employee_code, day), []).append(f"{status}: {review_type}")
    return result


def _as_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _num(value: object, fallback: float = 0) -> float:
    if value is None or value == "":
        return fallback
    return float(value)


def _text_or_none(value: object) -> str | None:
    if value is None:
        return None
    return str(value)


def _restore_number(value: str | None) -> int | float | str | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except ValueError:
        return value
    return int(parsed) if parsed.is_integer() else parsed
