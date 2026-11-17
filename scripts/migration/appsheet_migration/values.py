"""Pure helpers that turn raw cell values into clean Python values."""
from __future__ import annotations

import datetime as dt
import re
import uuid

from .config import EXCEL_EPOCH, UUID_NAMESPACE


def clean(value: object) -> str | None:
    """Trimmed text with internal whitespace runs collapsed; None when blank."""
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = " ".join(str(value).replace("\x00", "").split())
    return text or None


def clean_multiline(value: object) -> str | None:
    """Trimmed text that keeps line breaks (reasons / notes); None when blank."""
    if value is None:
        return None
    lines = str(value).replace("\x00", "").replace("\r", "").split("\n")
    text = "\n".join(line.strip() for line in lines).strip()
    return text or None


def employee_code(value: object) -> str | None:
    """`2633.0` / `"2633"` / `633` -> `"2633"` / `"2633"` / `"0633"`; other text is returned unchanged."""
    text = clean(value)
    if text is None:
        return None
    if re.fullmatch(r"\d+\.0+", text):
        text = text.split(".")[0]
    return text.zfill(4) if re.fullmatch(r"\d{1,4}", text) else text


def excel_datetime(value: object) -> dt.datetime | None:
    """Excel serial number -> naive datetime (local wall-clock time)."""
    return EXCEL_EPOCH + dt.timedelta(days=float(value)) if isinstance(value, (int, float)) else None


def excel_date(value: object) -> dt.date | None:
    moment = excel_datetime(value)
    return moment.date() if moment else None


def excel_time_of_day(date: dt.datetime, fraction: float) -> dt.datetime:
    """`date` at midnight plus an Excel time fraction (0.5 = 12:00), rounded to the minute."""
    midnight = date.replace(hour=0, minute=0, second=0)
    return midnight + dt.timedelta(seconds=round(fraction * 86400 / 60) * 60)


def split_name(full_name: str) -> tuple[str, str]:
    """First word is the first name, the rest the last name (may be empty)."""
    first, _, last = full_name.partition(" ")
    return first, last


def deterministic_uuid(*parts: object) -> str:
    """Same parts -> same UUID on every run, so re-importing never duplicates rows."""
    return str(uuid.uuid5(UUID_NAMESPACE, "|".join(str(part) for part in parts)))
