"""ข้อมูลการยืมทรัพย์สิน -> AssetRequest records.

The sheet's agreement HTML / signature JSON columns are not read: scripts/migration/one-off/import_asset_borrowing_2026_09_18.sql
already imported agreements and signatures under the same request IDs.
"""
from __future__ import annotations

import datetime as dt
import uuid

from .. import config
from ..models import AssetItem, AssetRequest, Employee
from ..report import Report
from ..values import clean, clean_multiline, employee_code, excel_date, excel_datetime
from ..xlsx_reader import SheetRows
from .employees import ApproverFinder

COL_ID, COL_FORM_DATE, COL_POSITION, COL_CODE, COL_REASON, COL_FROM, COL_TO = 0, 1, 3, 4, 5, 6, 7
COL_ITEMS, COL_REMARKS, COL_STATUS, COL_APPROVED_BY = 8, 9, 10, 11
COL_AGREEMENT_UPDATED_AT, COL_DEPARTMENT = 22, 23


def parse_items(cell: object) -> list[AssetItem]:
    """Lines of `name|quantity|note` (quantity defaults to 1, minimum 1)."""
    items: list[AssetItem] = []
    for line in str(cell or "").replace("\r", "").split("\n"):
        if not line.strip():
            continue
        parts = [p.strip() for p in line.split("|")]
        if not parts[0]:
            continue
        try:
            quantity = max(int(float(parts[1])), 1) if len(parts) > 1 and parts[1] else 1
        except ValueError:
            quantity = 1
        items.append(AssetItem(name=parts[0], quantity=quantity, note=parts[2] if len(parts) > 2 else ""))
    return items


def build_assets(
    rows: SheetRows,
    employees: dict[str, Employee],
    find_approver: ApproverFinder,
    report: Report,
) -> list[AssetRequest]:
    requests: list[AssetRequest] = []
    for row_number, cells in rows[1:]:
        sheet_id = clean(cells.get(COL_ID))
        if not sheet_id:
            continue
        try:
            uuid.UUID(sheet_id)
        except ValueError:
            report.warn(f"[asset] row {row_number}: ID {sheet_id!r} is not a UUID - skipped")
            continue
        code = employee_code(cells.get(COL_CODE))
        employee = employees.get(code)
        if employee is None:
            report.warn(f"[asset] row {row_number}: employee code {code} not found - skipped")
            continue
        items = parse_items(cells.get(COL_ITEMS))
        if not items:
            report.warn(f"[asset] row {row_number}: {sheet_id} has no items - skipped")
            continue

        status_text = clean(cells.get(COL_STATUS))
        status = config.ASSET_STATUS_BY_SHEET_TEXT.get(status_text or "")
        if status is None:
            report.warn(f"[asset] row {row_number}: unknown status {status_text!r} - imported as 'unknown'")
            status = "unknown"

        form_at = excel_datetime(cells.get(COL_FORM_DATE))
        from_date = excel_date(cells.get(COL_FROM)) or (form_at.date() if form_at else None)
        if from_date is None:
            report.warn(f"[asset] row {row_number}: no from-date - skipped")
            continue
        approver_name = clean(cells.get(COL_APPROVED_BY))
        requests.append(AssetRequest(
            sheet_id=sheet_id, employee_code=code,
            position=clean(cells.get(COL_POSITION)) or "",
            department=clean(cells.get(COL_DEPARTMENT)) or employee.department or "",
            form_at=form_at or dt.datetime.combine(from_date, dt.time(0, 0)),
            updated_at=excel_datetime(cells.get(COL_AGREEMENT_UPDATED_AT)) or form_at,
            from_date=from_date, to_date=excel_date(cells.get(COL_TO)),
            reason=clean_multiline(cells.get(COL_REASON)) or "",
            remarks=clean_multiline(cells.get(COL_REMARKS)) or "",
            status=status, approver_name=approver_name or "",
            approver_code=find_approver(approver_name) if approver_name else None,
            items=items,
        ))
    return requests
