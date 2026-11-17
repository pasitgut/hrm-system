"""Everything you might want to tweak when the workbook or the HRM schema changes."""
from __future__ import annotations

import datetime as dt
import uuid

# --- Workbook ---------------------------------------------------------------

SHEET_EMPLOYEES = "ข้อมูลพนักงาน"
SHEET_ASSETS = "ข้อมูลการยืมทรัพย์สิน"
SHEET_OVERTIME = "ข้อมูลการทำโอที"
SHEET_LEAVE = "ข้อมูลการลา"
SHEETS_USED = [SHEET_EMPLOYEES, SHEET_ASSETS, SHEET_OVERTIME, SHEET_LEAVE]

EXCEL_EPOCH = dt.datetime(1899, 12, 30)  # Excel 1900 date system
TIMEZONE_OFFSET = "+07"  # Asia/Bangkok: the workbook stores local wall-clock times

# --- Output -----------------------------------------------------------------

# Fixed namespace so the same sheet row always produces the same UUID (idempotent re-runs).
UUID_NAMESPACE = uuid.UUID("6f1c2a54-3b0e-4f0b-9a52-7a3f0d1e5c10")
SCRIPT_PATH_FOR_HEADER = "scripts/migration/appsheet_to_sql.py"

# --- Employees --------------------------------------------------------------

# Test / system accounts in the AppSheet, not real staff. (7777 "ฝึกงาน" is a dev login, 0000 is the admin.)
EXCLUDED_EMPLOYEE_CODES = {"7777", "0000"}

EMPLOYMENT_STATUS_ACTIVE = "ปฏิบัติงาน"
EMPLOYMENT_STATUS_FORMER = "พ้นสภาพ"
# The sheet's "ประเภทว่าจ้าง" column is empty. Set e.g. "full_time" to fill employment_type_id.
DEFAULT_EMPLOYMENT_TYPE_CODE: str | None = None

# Start dates before this year are almost certainly placeholders and get a warning.
PLACEHOLDER_START_YEAR = 2010

# The employee form only offers นาย / นาง / นางสาว / คุณ.
PREFIX_ALIASES = {"น.ส.": "นางสาว", "น.ส": "นางสาว", "นส.": "นางสาว", "นส": "นางสาว"}

WEEKDAY_INDEX = {  # 0 = Sunday, matching employees.weekly_holidays / JS Date#getDay
    "sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3,
    "thursday": 4, "friday": 5, "saturday": 6,
}

# Names written in "approved by" cells that differ from the employee sheet (lower-case -> employee code).
APPROVER_ALIASES = {
    "max chantawat": "2005",  # ชาญธวัช เจริญธรรมโชติ
    "punpun kute": "1904",    # ปัญปัญ วันทนะ
}

# --- Requests ---------------------------------------------------------------

REQUEST_STATUS_BY_SHEET_TEXT = {  # sheet text -> request_statuses.code
    "อนุมัติแล้ว": "approved", "อนุมัติ": "approved",
    "ไม่อนุมัติ": "rejected",
    "ยังไม่ได้ยืนยัน": "pending", "รออนุมัติ": "pending", "รอจัดการ": "pending",
    "ยกเลิก": "cancelled",
}
DECIDED_STATUSES = ("approved", "rejected")

LEAVE_TYPE_BY_SHEET_TEXT = {"ลากิจ": "personal", "ลาป่วย": "sick", "ลาวันเกิด": "birthday", "ลาพักร้อน": "vacation"}
HALF_DAY_SHEET_TEXT = "ลาครึ่งวัน"

ASSET_STATUS_BY_SHEET_TEXT = {  # sheet text -> asset_request_status enum
    "อนุมัติ": "approved", "อนุมัติแล้ว": "approved",
    "รออนุมัติ": "pending", "ยังไม่ได้ยืนยัน": "pending",
    "ไม่อนุมัติ": "rejected",
    "คืนแล้ว": "returned", "รอตรวจคืน": "return_pending",
}

OVERTIME_DEFAULT_REASON = "ไม่ระบุ"
# Leave decisions only carry a date; store it at midday so any timezone shows the same day.
LEAVE_DECISION_HOUR = 12

# --- Lookup rows the generated SQL makes sure exist (no-ops when present) ---

REQUEST_STATUS_LOOKUP = [
    ("pending", "รอจัดการ"), ("approved", "อนุมัติแล้ว"), ("rejected", "ไม่อนุมัติ"), ("cancelled", "ยกเลิก"),
]
LEAVE_TYPE_LOOKUP = [  # (code, name, annual_quota_days, quota_basis) -- mirrors drizzle/0021
    ("personal", "ลากิจ", 6, "tenure"),
    ("sick", "ลาป่วย", 30, "fixed"),
    ("birthday", "ลาวันเกิด", 1, "fixed"),
    ("vacation", "ลาพักร้อน", 6, "fixed"),
]
