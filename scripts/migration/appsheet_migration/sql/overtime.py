"""overtime_requests: stage -> insert. `overtime_type` is not a column any more (derived by the app)."""
from __future__ import annotations

from ..models import MigrationData
from ..values import deterministic_uuid
from . import literals as lit
from . import staging

STAGE = "ot_stage"
STAGE_COLUMNS = (
    "id uuid, emp_code varchar(4), start_at timestamptz, end_at timestamptz, "
    "reason text, status_code text, decided_by varchar(4), decision_note text"
)

INSERT_SQL = """INSERT INTO overtime_requests (id, employee_id, start_at, end_at, reason, status_code,
  decided_by_employee_id, decided_at, decision_note, created_at, updated_at)
SELECT s.id, e.id, s.start_at, s.end_at, s.reason, s.status_code, a.id, NULL, s.decision_note,
       s.start_at, s.start_at   -- sheet has no submit/decision timestamps; use the work time
FROM ot_stage s
JOIN employees e ON e.code = s.emp_code
LEFT JOIN employees a ON a.code = s.decided_by
ON CONFLICT (id) DO NOTHING;
"""


def overtime_section(data: MigrationData) -> list[str]:
    rows = [
        lit.row(
            lit.uuid_literal(deterministic_uuid("ot", *r.identity, r.employee_code)),
            lit.text(r.employee_code), lit.timestamptz(r.start_at), lit.timestamptz(r.end_at),
            lit.text(r.reason_text), lit.text(r.status), lit.text(r.decided_by_code), lit.text(r.decision_note),
        )
        for r in data.overtime
    ]
    chunks = ["-- ===== overtime_requests =====", staging.create_stage_table(STAGE, STAGE_COLUMNS)]
    if rows:
        chunks.append(staging.insert_stage_rows(STAGE, lit.values_list(rows)))
    chunks.append(staging.require_employees_exist(STAGE, "OT") + "\n" + INSERT_SQL)
    return chunks
