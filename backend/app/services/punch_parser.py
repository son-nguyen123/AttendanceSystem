import re

TIME_RE = re.compile(r"\d{2}:\d{2}")


def parse_punches(value: object) -> list[str]:
    if value is None:
        return []

    punches = TIME_RE.findall(str(value))
    unique: list[str] = []
    for punch in punches:
        if punch not in unique:
            unique.append(punch)
    return sorted(unique, key=time_to_minutes)


def time_to_minutes(value: str) -> int:
    hour, minute = value.split(":", 1)
    return int(hour) * 60 + int(minute)


def minutes_to_time(value: int) -> str:
    return f"{value // 60:02d}:{value % 60:02d}"
