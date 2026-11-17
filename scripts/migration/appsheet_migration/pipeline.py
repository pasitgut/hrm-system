"""Wires the layers together: sheets -> typed records -> SQL text."""
from __future__ import annotations

from pathlib import Path

from . import config
from .models import MigrationData
from .report import Report
from .sheets.assets import build_assets
from .sheets.employees import add_former_employees, build_employees, make_approver_finder
from .sheets.leave import build_leave
from .sheets.overtime import build_overtime
from .sql import build_script
from .xlsx_reader import SheetRows, read_sheets


def convert(sheets: dict[str, SheetRows], report: Report) -> MigrationData:
    """Clean + map the four sheets. The order matters: people first, then what refers to them."""
    employees = build_employees(sheets[config.SHEET_EMPLOYEES], report)
    find_approver = make_approver_finder(employees)  # built before stubs are added: only real staff approve
    overtime = build_overtime(sheets[config.SHEET_OVERTIME], employees, find_approver, report)
    leave = build_leave(sheets[config.SHEET_LEAVE], employees, find_approver, report)
    add_former_employees(employees, overtime, leave, report)
    assets = build_assets(sheets[config.SHEET_ASSETS], employees, find_approver, report)
    return MigrationData(employees=employees, overtime=overtime, leave=leave, assets=assets)


def generate(xlsx: Path, employee_conflict: str = "update") -> tuple[str, MigrationData, Report]:
    """Read the workbook and return `(sql, data, report)`."""
    report = Report()
    data = convert(read_sheets(xlsx, config.SHEETS_USED), report)
    return build_script(data, employee_conflict, xlsx.name), data, report
