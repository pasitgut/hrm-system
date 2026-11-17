"""leave_requests: stage -> insert."""
from __future__ import annotations

from ..models import MigrationData
from ..values import deterministic_uuid
from . import literals as lit
from . import staging

STAGE = "leave_stage"
STAGE_COLUMNS = (
    "id uuid, emp_code varchar(4), leave_type_code text, start_on date, end_on date, session text, "
    "reason text, status_code text, decided_by varchar(4), decided_at timestamptz, decision_note text"
)

INSERT_SQL = """INSERT INTO leave_requests (id, employee_id, leave_type_code, start_on, end_on, session, reason, status_code,
  decided_by_employee_id, decided_at, decision_note, created_at, updated_at)
SELECT s.id, e.id, s.leave_type_code, s.start_on, s.end_on, s.session, s.reason, s.status_code, a.id, s.decided_at, s.decision_note,
       COALESCE(s.decided_at, (s.start_on::text || ' 12:00:00+07')::timestamptz),   -- sheet has no submit timestamp
       COALESCE(s.decided_at, (s.start_on::text || ' 12:00:00+07')::timestamptz)
FROM leave_stage s
JOIN employees e ON e.code = s.emp_code
LEFT JOIN employees a ON a.code = s.decided_by
ON CONFLICT (id) DO NOTHING;
"""


def leave_section(data: MigrationData) -> list[str]:
    rows = [
        lit.row(
            lit.uuid_literal(deterministic_uuid("leave", *r.identity)),
            lit.text(r.employee_code), lit.text(r.leave_type_code), lit.date(r.start_on), lit.date(r.end_on),
            lit.text(r.session), lit.text(r.reason), lit.text(r.status), lit.text(r.decided_by_code),
            lit.timestamptz(r.decided_at), lit.text(r.decision_note),
        )
        for r in data.leave
    ]
    chunks = ["-- ===== leave_requests =====", staging.create_stage_table(STAGE, STAGE_COLUMNS)]
    if rows:
        chunks.append(staging.insert_stage_rows(STAGE, lit.values_list(rows)))
    chunks.append(staging.require_employees_exist(STAGE, "Leave") + "\n" + INSERT_SQL)
    return chunks
