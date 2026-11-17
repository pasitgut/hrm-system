"""Typed records produced from the sheets and consumed by the SQL writers."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

from .config import OVERTIME_DEFAULT_REASON


@dataclass
class Employee:
    code: str
    name: str
    first_name: str
    last_name: str
    start_date: dt.date
    prefix: str | None = None
    email: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    line_uid: str | None = None
    birth_date: dt.date | None = None
    weekly_holidays: list[int] = field(default_factory=list)
    department: str | None = None
    position: str | None = None
    # True for people that only appear in OT/leave history (not in the employee sheet).
    is_former_stub: bool = False


@dataclass
class OvertimeRequest:
    sheet_row: int
    employee_name: str
    employee_code: str | None  # filled from the leave sheet when the employee sheet lacks the person
    start_at: dt.datetime
    end_at: dt.datetime
    status: str
    reason: str | None
    decided_by_code: str | None
    decision_note: str | None

    @property
    def reason_text(self) -> str:
        return self.reason or OVERTIME_DEFAULT_REASON

    @property
    def identity(self) -> tuple:
        """What makes two sheet rows "the same request" (also seeds the deterministic UUID)."""
        return (self.employee_name, self.start_at, self.end_at, self.status, self.reason)


@dataclass
class LeaveRequest:
    sheet_row: int
    employee_name: str
    employee_code: str
    leave_type_code: str
    start_on: dt.date
    end_on: dt.date
    session: str  # full | am | pm
    reason: str | None
    status: str
    decided_by_code: str | None
    decided_at: dt.datetime | None
    decision_note: str | None

    @property
    def identity(self) -> tuple:
        return (self.employee_code, self.start_on, self.end_on, self.leave_type_code, self.session, self.status)


@dataclass
class AssetItem:
    name: str
    quantity: int
    note: str


@dataclass
class AssetRequest:
    sheet_id: str  # the AppSheet row ID (a UUID) -- reused as the primary key
    employee_code: str
    position: str
    department: str
    form_at: dt.datetime
    updated_at: dt.datetime | None
    from_date: dt.date
    to_date: dt.date | None
    reason: str
    remarks: str
    status: str
    approver_name: str
    approver_code: str | None
    items: list[AssetItem]


@dataclass
class MigrationData:
    employees: dict[str, Employee]  # by employee code, insertion-ordered
    overtime: list[OvertimeRequest]
    leave: list[LeaveRequest]
    assets: list[AssetRequest]

    @property
    def real_employees(self) -> list[Employee]:
        return [e for e in self.employees.values() if not e.is_former_stub]

    @property
    def former_stubs(self) -> list[Employee]:
        return [e for e in self.employees.values() if e.is_former_stub]
