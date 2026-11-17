"""asset_requests + items + events: stage -> insert, only for requests that do not exist yet."""
from __future__ import annotations

import json

from ..models import AssetRequest, MigrationData
from . import literals as lit
from . import staging

STAGE = "asset_stage"
STAGE_COLUMNS = (
    "id uuid, emp_code varchar(4), position text, department text, form_at timestamptz, "
    "updated_at timestamptz, from_date date, to_date date, reason text, remarks text, status text, approver_name text, "
    "approver_code varchar(4), items jsonb"
)

INSERT_SQL = """CREATE TEMP TABLE asset_new ON COMMIT DROP AS
  SELECT s.id FROM asset_stage s WHERE NOT EXISTS (SELECT 1 FROM asset_requests r WHERE r.id = s.id);

INSERT INTO asset_requests (id, legacy_sheet_id, borrower_employee_id, borrower_employee_code, borrower_name, borrower_department,
  borrower_position, form_date, from_date, to_date, reason, remarks, status, approved_borrow_by_employee_id,
  approved_borrow_by_name, created_at, updated_at)
SELECT s.id, s.id::text, e.id, e.code, btrim(concat_ws(' ', e.first_name, e.last_name)), s.department, s.position,
       s.form_at, s.from_date, s.to_date, s.reason, s.remarks, s.status::asset_request_status, a.id, s.approver_name,
       s.form_at, COALESCE(s.updated_at, s.form_at)
FROM asset_stage s
JOIN employees e ON e.code = s.emp_code
LEFT JOIN employees a ON a.code = s.approver_code
ON CONFLICT (id) DO NOTHING;

INSERT INTO asset_request_items (request_id, position, name, quantity, note)
SELECT s.id, (i.ord - 1)::smallint, i.value ->> 'name', (i.value ->> 'quantity')::integer, COALESCE(i.value ->> 'note', '')
FROM asset_stage s
JOIN asset_new n ON n.id = s.id
CROSS JOIN LATERAL jsonb_array_elements(s.items) WITH ORDINALITY AS i(value, ord)
ON CONFLICT (request_id, position) DO NOTHING;

INSERT INTO asset_request_events (request_id, actor_employee_id, event_type, from_status, to_status, details, created_at)
SELECT s.id, a.id, 'imported_from_spreadsheet', NULL, s.status::asset_request_status,
       jsonb_build_object('source', 'appsheet_migration', 'approverName', s.approver_name), s.form_at
FROM asset_stage s
JOIN asset_new n ON n.id = s.id
LEFT JOIN employees a ON a.code = s.approver_code;
"""


def _items_json(request: AssetRequest) -> str:
    return json.dumps([{"name": i.name, "quantity": i.quantity, "note": i.note} for i in request.items], ensure_ascii=False)


def assets_section(data: MigrationData) -> list[str]:
    rows = [
        lit.row(
            lit.uuid_literal(r.sheet_id), lit.text(r.employee_code), lit.text(r.position), lit.text(r.department),
            lit.timestamptz(r.form_at), lit.timestamptz(r.updated_at), lit.date(r.from_date), lit.date(r.to_date),
            lit.text(r.reason), lit.text(r.remarks), lit.text(r.status), lit.text(r.approver_name),
            lit.text(r.approver_code), lit.text(_items_json(r)) + "::jsonb",
        )
        for r in data.assets
    ]
    chunks = [
        "-- ===== asset_requests / asset_request_items / asset_request_events =====",
        "-- Same IDs as the earlier scripts/migration/one-off/import_asset_borrowing_2026_09_18.sql, so already-imported rows (with their",
        "-- agreements and signatures) are left untouched.",
        staging.create_stage_table(STAGE, STAGE_COLUMNS),
    ]
    if rows:
        chunks.append(staging.insert_stage_rows(STAGE, lit.values_list(rows)))
    chunks.append(staging.require_employees_exist(STAGE, "Asset") + "\n" + INSERT_SQL)
    return chunks
