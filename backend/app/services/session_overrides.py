import json
from pathlib import Path


AUTO_OVERRIDES_FILENAME = "automatic_review_overrides.json"


def save_automatic_overrides(session_dir: Path, overrides: list[dict]) -> None:
    path = session_dir / AUTO_OVERRIDES_FILENAME
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(overrides, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def load_automatic_overrides(session_dir: Path) -> list[dict]:
    path = session_dir / AUTO_OVERRIDES_FILENAME
    if not path.exists():
        return []
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    return value if isinstance(value, list) else []


def merge_session_overrides(session_dir: Path, manual_overrides: list[dict] | None = None) -> list[dict]:
    """Merge by employee/day with manual values taking precedence per field."""
    merged: dict[tuple[str, int], dict] = {}
    for item in [*load_automatic_overrides(session_dir), *(manual_overrides or [])]:
        code = str(item.get("employee_code") or "").strip()
        day = item.get("day")
        if not code or not isinstance(day, int):
            continue
        key = (code, day)
        merged[key] = {**merged.get(key, {}), **item, "employee_code": code, "day": day}
    return list(merged.values())
