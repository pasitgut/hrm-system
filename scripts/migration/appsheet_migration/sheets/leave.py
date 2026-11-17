"""ข้อมูลการลา -> LeaveRequest records (employees are identified by รหัสพนักงาน here)."""
from __future__ import annotations

import datetime as dt
import re
from collections import Counter

from .. import config
from ..models import Employee, LeaveRequest
from ..report import Report
from ..values import clean, clean_multiline, employee_code, excel_date
from ..xlsx_reader import SheetRows
from .employees import ApproverFinder

COL_NAME, COL_TYPE, COL_PERIOD, COL_START, COL_END, COL_REASON, COL_ATTACHMENT = 0, 1, 2, 3, 4, 5, 6
COL_STATUS, COL_CODE, COL_APPROVED_BY, COL_APPROVER_COMMENT = 7, 8, 10, 11

_SESSION_MARKER_ONLY = re.compile(r"ครึ่ง(เช้า|บ่าย)(วัน)?")
_DECISION_DATE = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")


def resolve_session(
    period_text: str | None, start: dt.date, end: dt.date, reason: str | None,
    row_number: int, name: str, report: Report,
) -> tuple[str, str | None]:
    """Returns `(session, reason)`: full / am / pm, and the reason minus a bare "ครึ่งเช้า/ครึ่งบ่าย" marker.

    The sheet has no am/pm column; the hint (if any) is written in the reason cell.
    """
    if period_text != config.HALF_DAY_SHEET_TEXT:
        return "full", reason
    if start != end:
        report.warn(f"[leave] row {row_number}: half-day over several days - imported as full days")
        return "full", reason
    text = reason or ""
    if "บ่าย" in text and "เช้า" not in text:
        session = "pm"
    else:
        session = "am"
        if "เช้า" not in text and "บ่าย" not in text:
            report.warn(
                f"[leave] row {row_number}: {name} {start} half-day with no เช้า/บ่าย hint - "
                "assumed 'am' (day count is 0.5 either way)"
            )
    return session, (None if _SESSION_MARKER_ONLY.fullmatch(text) else reason)


def parse_approval(
    cell: str | None, status: str, find_approver: ApproverFinder, row_number: int, report: Report,
) -> tuple[str | None, dt.datetime | None]:
    """`"ปัญปัญ วันทนะ|13/03/2026|kute@x.com"` -> (approver employee code, decision datetime)."""
    if not cell or status not in config.DECIDED_STATUSES:
        return None, None
    parts = [p.strip() for p in cell.split("|")]
    approver = find_approver(parts[0], parts[2] if len(parts) > 2 else None)
    if approver is None:
        report.warn(f"[leave] row {row_number}: approver {parts[0]!r} not found - decided_by left empty")
    decided_at = None
    if len(parts) > 1 and _DECISION_DATE.fullmatch(parts[1]):
        day, month, year = map(int, parts[1].split("/"))
        decided_at = dt.datetime(year, month, day, config.LEAVE_DECISION_HOUR, 0)
    return approver, decided_at


def build_leave(
    rows: SheetRows,
    employees: dict[str, Employee],
    find_approver: ApproverFinder,
    report: Report,
) -> list[LeaveRequest]:
    requests: list[LeaveRequest] = []
    seen: Counter[tuple] = Counter()

    for row_number, cells in rows[1:]:
        name = clean(cells.get(COL_NAME))
        code = employee_code(cells.get(COL_CODE))
        if not name or not code or code in config.EXCLUDED_EMPLOYEE_CODES:
            continue
        known = employees.get(code)
        if known and known.name != name:
            report.warn(f"[leave] row {row_number}: code {code} is {known.name!r} in the employee sheet but {name!r} here")

        type_text = clean(cells.get(COL_TYPE))
        leave_type = config.LEAVE_TYPE_BY_SHEET_TEXT.get(type_text or "")
        if leave_type is None:
            report.warn(f"[leave] row {row_number}: unknown leave type {type_text!r} - skipped")
            continue
        start_on, end_on = excel_date(cells.get(COL_START)), excel_date(cells.get(COL_END))
        if start_on is None or end_on is None or end_on < start_on:
            report.warn(f"[leave] row {row_number}: invalid dates {start_on}..{end_on} - skipped")
            continue

        status_text = clean(cells.get(COL_STATUS))
        status = config.REQUEST_STATUS_BY_SHEET_TEXT.get(status_text or "")
        if status is None:
            report.warn(f"[leave] row {row_number}: unknown status {status_text!r} - imported as pending")
            status = "pending"

        session, reason = resolve_session(
            clean(cells.get(COL_PERIOD)), start_on, end_on, clean_multiline(cells.get(COL_REASON)),
            row_number, name, report,
        )
        attachment = clean(cells.get(COL_ATTACHMENT))
        if attachment:  # leave_requests has no attachment column
            reason = (reason + "\n" if reason else "") + f"แนบ: {attachment}"
        decided_by, decided_at = parse_approval(
            clean(cells.get(COL_APPROVED_BY)), status, find_approver, row_number, report,
        )

        request = LeaveRequest(
            sheet_row=row_number, employee_name=name, employee_code=code, leave_type_code=leave_type,
            start_on=start_on, end_on=end_on, session=session, reason=reason, status=status,
            decided_by_code=decided_by, decided_at=decided_at,
            decision_note=clean_multiline(cells.get(COL_APPROVER_COMMENT)),
        )
        seen[request.identity] += 1
        if seen[request.identity] > 1:
            report.warn(
                f"[leave] row {row_number}: exact duplicate of an earlier row "
                f"({name} {leave_type} {start_on}..{end_on}) - skipped"
            )
            report.counts["leave skipped (exact duplicate)"] += 1
            continue
        requests.append(request)
    return requests
