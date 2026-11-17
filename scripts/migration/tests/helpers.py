"""Builders for synthetic sheet rows (the real workbook holds personal data and is not committed)."""
from __future__ import annotations

import datetime as dt

from appsheet_migration.config import EXCEL_EPOCH


def serial(date: dt.date, hour: int = 0, minute: int = 0) -> float:
    moment = dt.datetime.combine(date, dt.time(hour, minute))
    return (moment - EXCEL_EPOCH).total_seconds() / 86400


def time_fraction(hour: int, minute: int = 0) -> float:
    return (hour * 60 + minute) / 1440


def sheet(*rows: dict[int, object]) -> list[tuple[int, dict[int, object]]]:
    """A header row followed by data rows, numbered like Excel rows."""
    return [(i + 1, cells) for i, cells in enumerate(({0: "header"}, *rows))]


def employee_row(code: str, name: str, start: dt.date, **extra: object) -> dict[int, object]:
    cells: dict[int, object] = {0: name, 1: code, 8: serial(start)}
    cells.update({  # optional columns by keyword
        k: v for k, v in {
            2: extra.get("department"), 4: extra.get("email"), 5: extra.get("position"), 7: extra.get("holidays"),
            17: extra.get("prefix"),
        }.items() if v is not None
    })
    return cells
