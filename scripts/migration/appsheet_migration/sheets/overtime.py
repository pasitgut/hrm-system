"""ข้อมูลการทำโอที -> OvertimeRequest records.

The sheet identifies people by name only (no employee code) and has no weekday/holiday column:
the day type is derived by the app on demand (lib/ot/overtime-type.ts), so nothing is stored for it.
"""
from __future__ import annotations

import datetime as dt
from collections import Counter

from .. import config
from ..models import Employee, OvertimeRequest
from ..report import Report
from ..values import clean, clean_multiline, excel_datetime, excel_time_of_day
from ..xlsx_reader import SheetRows
from .employees import ApproverFinder

COL_DATE, COL_START_TIME, COL_END_TIME, COL_EMPLOYEE_NAME, COL_NOTE = 0, 1, 2, 4, 5
COL_STATUS, COL_APPROVED_BY, COL_APPROVER_COMMENT = 6, 8, 9


def build_overtime(
    rows: SheetRows,
    employees: dict[str, Employee],
    find_approver: ApproverFinder,
    report: Report,
) -> list[OvertimeRequest]:
    code_by_name = {e.name: code for code, e in employees.items()}
    requests: list[OvertimeRequest] = []
    seen: Counter[tuple] = Counter()

    for row_number, cells in rows[1:]:
        name = clean(cells.get(COL_EMPLOYEE_NAME))
        date = excel_datetime(cells.get(COL_DATE))
        if not name or date is None:
            continue
        start_fraction, end_fraction = cells.get(COL_START_TIME), cells.get(COL_END_TIME)
        if not isinstance(start_fraction, float) or not isinstance(end_fraction, float):
            report.warn(f"[ot] row {row_number}: {name} {date:%Y-%m-%d} has no start/end time - skipped")
            continue
        start_at = excel_time_of_day(date, start_fraction)
        end_at = excel_time_of_day(date, end_fraction)
        if end_at <= start_at:
            end_at += dt.timedelta(days=1)  # overnight shift

        status_text = clean(cells.get(COL_STATUS))
        status = config.REQUEST_STATUS_BY_SHEET_TEXT.get(status_text or "")
        if status is None:
            report.warn(f"[ot] row {row_number}: unknown status {status_text!r} - imported as pending")
            status = "pending"

        approver_name = clean(cells.get(COL_APPROVED_BY))
        approver_code = find_approver(approver_name) if approver_name else None
        if approver_name and approver_code is None:
            report.warn(f"[ot] row {row_number}: approver {approver_name!r} not found - decided_by left empty")

        request = OvertimeRequest(
            sheet_row=row_number, employee_name=name, employee_code=code_by_name.get(name),
            start_at=start_at, end_at=end_at, status=status,
            reason=clean_multiline(cells.get(COL_NOTE)),
            decided_by_code=approver_code if status in config.DECIDED_STATUSES else None,
            decision_note=clean_multiline(cells.get(COL_APPROVER_COMMENT)),
        )
        seen[request.identity] += 1
        if seen[request.identity] > 1:
            report.warn(
                f"[ot] row {row_number}: exact duplicate of an earlier row "
                f"({name} {start_at:%Y-%m-%d %H:%M}-{end_at:%H:%M}) - skipped"
            )
            report.counts["ot skipped (exact duplicate)"] += 1
            continue
        requests.append(request)
    return requests
