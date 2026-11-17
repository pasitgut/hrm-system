"""ข้อมูลพนักงาน -> Employee records, plus the lookups other sheets use to find people."""
from __future__ import annotations

import datetime as dt
import re
from collections import Counter, defaultdict
from typing import Callable

from .. import config
from ..models import Employee, LeaveRequest, OvertimeRequest
from ..report import Report
from ..values import clean, employee_code, excel_date, split_name
from ..xlsx_reader import Cells, SheetRows

# Column indices of the employee sheet.
COL_NAME, COL_CODE, COL_DEPARTMENT, COL_AVATAR, COL_EMAIL, COL_POSITION, COL_PHONE = 0, 1, 2, 3, 4, 5, 6
COL_WEEKLY_HOLIDAYS, COL_START_DATE, COL_LINE_UID, COL_BIRTH_DATE, COL_PREFIX = 7, 8, 11, 16, 17

ApproverFinder = Callable[..., "str | None"]


def parse_weekly_holidays(text: str | None, code: str, report: Report) -> list[int]:
    """`"Monday,Tuesday"` -> `[1, 2]` (0 = Sunday)."""
    days: list[int] = []
    for token in re.split(r"[,\s]+", text or ""):
        if not token:
            continue
        index = config.WEEKDAY_INDEX.get(token.lower())
        if index is None:
            report.warn(f"[employees] code {code}: unknown weekday {token!r} in วันหยุดประจำ - ignored")
        elif index not in days:
            days.append(index)
    return sorted(days)


def _employee_from_row(row_number: int, cells: Cells, report: Report) -> Employee | None:
    code = employee_code(cells.get(COL_CODE))
    name = clean(cells.get(COL_NAME))
    if not code and not name:
        return None
    if code in config.EXCLUDED_EMPLOYEE_CODES:
        report.warn(f"[employees] row {row_number}: code {code} ({name}) skipped as test/system account")
        report.counts["employees skipped (test/system)"] += 1
        return None
    if not code or not re.fullmatch(r"\d{4}", code):
        report.warn(f"[employees] row {row_number}: invalid employee code {code!r} ({name}) - skipped")
        return None
    if not name:
        report.warn(f"[employees] row {row_number}: code {code} has no name - skipped")
        return None
    start_date = excel_date(cells.get(COL_START_DATE))
    if start_date is None:
        report.warn(f"[employees] row {row_number}: code {code} has no start date - skipped (start_date is NOT NULL)")
        return None

    first_name, last_name = split_name(name)
    if not last_name:
        report.warn(f"[employees] row {row_number}: code {code} name {name!r} has no last name")
    if start_date.year < config.PLACEHOLDER_START_YEAR:
        report.warn(f"[employees] code {code} ({name}): start date {start_date} looks like a placeholder - please verify")

    prefix = clean(cells.get(COL_PREFIX))
    email = clean(cells.get(COL_EMAIL))
    return Employee(
        code=code, name=name, first_name=first_name, last_name=last_name, start_date=start_date,
        prefix=config.PREFIX_ALIASES.get(prefix, prefix),
        email=email.lower() if email else None,
        phone=clean(cells.get(COL_PHONE)),
        avatar_url=clean(cells.get(COL_AVATAR)),
        line_uid=clean(cells.get(COL_LINE_UID)),
        birth_date=excel_date(cells.get(COL_BIRTH_DATE)),
        weekly_holidays=parse_weekly_holidays(clean(cells.get(COL_WEEKLY_HOLIDAYS)), code, report),
        department=clean(cells.get(COL_DEPARTMENT)),
        position=clean(cells.get(COL_POSITION)),
    )


def build_employees(rows: SheetRows, report: Report) -> dict[str, Employee]:
    employees: dict[str, Employee] = {}
    for row_number, cells in rows[1:]:  # rows[0] is the header
        employee = _employee_from_row(row_number, cells, report)
        if employee is None:
            continue
        if employee.code in employees:
            report.warn(f"[employees] row {row_number}: duplicate code {employee.code} - skipped")
            continue
        employees[employee.code] = employee

    email_counts = Counter(e.email for e in employees.values() if e.email)
    for email, count in email_counts.items():
        if count > 1:
            report.warn(f"[employees] email {email} used by {count} employees (employees.email is UNIQUE) - fix before import")
    return employees


def make_approver_finder(employees: dict[str, Employee]) -> ApproverFinder:
    """Returns `find(name, email=None) -> employee code | None` (email first, then name, then aliases)."""
    by_name = {e.name.lower(): code for code, e in employees.items()}
    by_email = {e.email: code for code, e in employees.items() if e.email}

    def find(name: str | None, email: str | None = None) -> str | None:
        if email and email.lower() in by_email:
            return by_email[email.lower()]
        if name:
            key = " ".join(name.split()).lower()
            return by_name.get(key) or config.APPROVER_ALIASES.get(key)
        return None

    return find


def add_former_employees(
    employees: dict[str, Employee],
    overtime: list[OvertimeRequest],
    leave: list[LeaveRequest],
    report: Report,
) -> None:
    """OT/leave history can belong to people missing from the employee sheet (typically resigned staff).

    Fills in OT rows' employee codes from the leave sheet (OT has names only), drops the ones that still
    can't be matched, and creates a stub `พ้นสภาพ` employee for every unknown code so history keeps its FK.
    """
    leave_code_by_name = {r.employee_name: r.employee_code for r in leave}
    leave_name_by_code = {r.employee_code: r.employee_name for r in reversed(leave)}  # first row wins
    for request in overtime:
        if request.employee_code is None:
            request.employee_code = leave_code_by_name.get(request.employee_name)
            if request.employee_code is None:
                report.warn(
                    f"[ot] row {request.sheet_row}: cannot find an employee code for {request.employee_name!r} - row dropped"
                )
    overtime[:] = [r for r in overtime if r.employee_code]

    activity: dict[str, list[dt.date]] = defaultdict(list)
    for request in overtime:
        activity[request.employee_code].append(request.start_at.date())
    for request in leave:
        activity[request.employee_code].append(request.start_on)

    for code in sorted(activity):
        if code in employees:
            continue
        name = leave_name_by_code.get(code) or next((o.employee_name for o in overtime if o.employee_code == code), code)
        first_name, last_name = split_name(name)
        first_activity = min(activity[code])
        employees[code] = Employee(
            code=code, name=name, first_name=first_name, last_name=last_name,
            start_date=first_activity, is_former_stub=True,
        )
        report.counts["employees created as former-staff stubs"] += 1
        report.warn(
            f"[employees] {code} {name}: has {len(activity[code])} OT/leave rows but is not in the employee sheet - "
            f"created as '{config.EMPLOYMENT_STATUS_FORMER}' (start_date = first activity {first_activity}); please review"
        )
