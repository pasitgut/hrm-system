"""SQL literal formatting."""
from __future__ import annotations

import datetime as dt

from ..config import TIMEZONE_OFFSET


def text(value: str | None) -> str:
    """String literal, or NULL."""
    return "NULL" if value is None else "'" + value.replace("'", "''") + "'"


def timestamptz(value: dt.datetime | None) -> str:
    return "NULL" if value is None else f"'{value:%Y-%m-%d %H:%M:%S}{TIMEZONE_OFFSET}'"


def date(value: dt.date | None) -> str:
    return "NULL" if value is None else f"'{value:%Y-%m-%d}'"


def uuid_literal(value: str) -> str:
    return f"'{value}'::uuid"


def int_array(values: list[int]) -> str:
    return "ARRAY[" + ",".join(map(str, values)) + "]::integer[]"


def row(*literals: str) -> str:
    """One `(a, b, c)` tuple of a multi-row VALUES list."""
    return "  (" + ", ".join(literals) + ")"


def values_list(rows: list[str]) -> str:
    return ",\n".join(rows)


def inline_tuple(*values: object) -> str:
    """`('pending','รอจัดการ',6)`: strings quoted, numbers bare, no spaces (used for tiny lookup lists)."""
    return "(" + ",".join(text(v) if isinstance(v, str) else str(v) for v in values) + ")"
