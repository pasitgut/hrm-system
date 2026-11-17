# AppSheet → HRM migration

`appsheet_to_sql.py` reads `THOME-Appsheet-1.xlsx` (only the 4 sheets below) and writes one SQL file.
Python 3 standard library only — no `pip install` needed.

```bash
python3 scripts/migration/appsheet_to_sql.py path/to/THOME-Appsheet-1.xlsx
# -> scripts/migration/output/appsheet_import.sql   (git-ignored: contains personal data)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration/output/appsheet_import.sql
```

Options: `-o FILE`, `--employee-conflict update|skip` (employee code already in DB; default `update`).
Run `npm run db:migrate` first so the schema is current (needs migrations 0020-0022). Read the warnings the script prints.

The SQL is one transaction, idempotent (deterministic UUIDs + `ON CONFLICT`), and aborts if any
OT/leave/asset row points at an employee code that does not exist.

## Code layout

```
appsheet_to_sql.py            CLI entry point (nothing else)
appsheet_migration/
  config.py                   every constant & mapping: sheet names, status/leave-type maps, excluded codes, lookups
  xlsx_reader.py              stdlib .xlsx reader -> rows of {column index: value}
  values.py                   pure cell helpers (clean text, employee code, Excel dates, deterministic UUID)
  models.py                   dataclasses: Employee, OvertimeRequest, LeaveRequest, AssetRequest, MigrationData
  report.py                   warnings + counters shown at the end of a run
  sheets/                     ONE MODULE PER SHEET: raw rows -> typed records (+ warnings)
    employees.py  overtime.py  leave.py  assets.py
  sql/                        ONE MODULE PER TARGET TABLE: records -> SQL text
    literals.py staging.py    quoting helpers; the stage-table / "employees must exist" pattern
    lookups.py employees.py overtime.py leave.py assets.py
    __init__.py               build_script(): assembles the sections into one transaction
  pipeline.py                 convert() + generate(): read -> map -> SQL
  cli.py                      argparse + the summary printout
tests/                        stdlib unittest, synthetic rows only (the real workbook has personal data)
```

Where to change things: a new/renamed sheet column -> the `COL_*` constants at the top of the sheet's module;
a new status or leave type -> `config.py`; a changed target table -> the matching module in `sql/`.

```bash
python3 -m unittest discover -s scripts/migration/tests -t scripts/migration   # from the repo root
```

## Mapping

### ข้อมูลพนักงาน → `employees`
| Sheet column | Column | Rule |
|---|---|---|
| รหัสพนักงาน | `code` | 4 digits, zero-padded (`2633.0` → `2633`) |
| ชื่อพนักงาน | `first_name`, `last_name` | split on first space |
| คำนำหน้าชื่อ | `prefix` | `น.ส.` → `นางสาว` (the form only offers นาย/นาง/นางสาว/คุณ) |
| อีเมล | `email` | lower-cased |
| เบอร์โทร, รูป, LINE UID, วันเกิด | `phone`, `avatar_url`, `line_uid`, `birth_date` | as-is |
| เริ่มทำงาน | `start_date` | Excel serial → date |
| วันหยุดประจำ | `weekly_holidays` | `Monday,Tuesday` → `{1,2}` (0 = Sunday) |
| แผนก / ตำแหน่ง | `department_id` / `position_id` | looked up by name, created if missing |
| – | `employment_status_id` | `ปฏิบัติงาน` (sheet's สถานะ is empty) |
| – | `employment_type_id` | NULL (sheet's ประเภทว่าจ้าง is empty; set `DEFAULT_EMPLOYMENT_TYPE_CODE` in the script to fill) |

Not migrated: โควต้าลากิจ/ลาป่วย (empty; quota lives on `leave_types`), ประกาศ, รูปnobg, รูปของที่ยืม, qr.
Skipped as test/system accounts: `7777` (ฝึกงาน), `0000` (admin) — edit `EXCLUDED_EMPLOYEE_CODES`.

### ข้อมูลการทำโอที → `overtime_requests`
`วันที่` + `เวลาเริ่ม/เลิก` → `start_at`/`end_at` (Asia/Bangkok), `หมายเหตุ` → `reason` (blank → `ไม่ระบุ`),
`ความเห็นหัวหน้า` → `decision_note`, `สถานะ` → `status_code` (อนุมัติแล้ว/ไม่อนุมัติ/ยังไม่ได้ยืนยัน →
approved/rejected/pending), `อนุมัติโดย` → `decided_by_employee_id` (matched by name; alias map in the script).
The sheet identifies people by **name only**; names are matched to the employee sheet.

* There is no `overtime_type` column any more (migration `0020_remove_overtime_type`): weekday/holiday is derived on
  demand (OT list, approvals, summary, payroll, PDF report) from the date worked vs. the employee's `weekly_holidays`
  (`lib/ot/overtime-type.ts`). Public holidays are not considered. Run `npm run db:migrate` before this import.
* `created_at`/`updated_at` = work start (no submit time in the sheet); `decided_at` stays NULL.
* Exact duplicate rows are skipped and reported.

### ข้อมูลการลา → `leave_requests`
ลากิจ/ลาป่วย/ลาวันเกิด → `personal`/`sick`/`birthday`; employee by `รหัสพนักงาน`; dates from the
(mis-headed) start-date column and `สิ้นสุดการลา`; `ลาเต็มวัน` → `session=full`; `ลาครึ่งวัน` → `am`/`pm` from
the reason text (`ครึ่งเช้า`/`ครึ่งบ่าย`), otherwise `am` (+warning); a reason that is only that marker is dropped.
`อนุมัติโดย` (`name|dd/mm/yyyy|email`) → `decided_by_employee_id` + `decided_at` (12:00 on that date).
`รูป(ลา)` URL is appended to `reason` as `แนบ: <url>` (no attachment column exists).

### ข้อมูลการยืมทรัพย์สิน → `asset_requests` / `asset_request_items` / `asset_request_events`
Same IDs as `scripts/migration/one-off/import_asset_borrowing_2026_09_18.sql`, so rows already imported (with agreements and
signatures) are untouched; `รายการ/จำนวน` lines `name|qty|note` → items. The sheet's agreement HTML / signature
JSON columns are intentionally **not** re-imported here — that earlier script owns them.

### Former employees
OT/leave history references people missing from the employee sheet (2214, 2321, 2426, 2530, 2631). They are created
as `พ้นสภาพ` (soft-deleted) with `start_date` = first activity so history keeps its FK. Fix their real dates/details.

### Not created
`users` (logins/roles/passwords) — e.g. `หัวหน้างาน` has no automatic role mapping; create accounts in the app.
