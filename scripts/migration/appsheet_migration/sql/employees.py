"""employees: stage -> upsert by code."""
from __future__ import annotations

from .. import config
from ..models import MigrationData
from . import literals as lit
from . import staging

STAGE = "emp_stage"
STAGE_COLUMNS = (
    "code varchar(4), prefix text, first_name text, last_name text, email text, phone text, "
    "avatar_url text, line_uid text, birth_date date, start_date date, weekly_holidays integer[], department text, "
    "position text, status text, type_code text, deleted boolean"
)
TARGET_COLUMNS = (
    "code, prefix, first_name, last_name, email, phone, avatar_url, line_uid, birth_date, "
    "start_date, weekly_holidays, department_id, position_id, employment_status_id, employment_type_id, deleted_at"
)

# Sheet values fill gaps and refresh identity fields; blanks in the sheet never erase what the DB already has.
ON_CONFLICT_UPDATE = """ON CONFLICT (code) DO UPDATE SET
  prefix = COALESCE(EXCLUDED.prefix, employees.prefix),
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  email = COALESCE(EXCLUDED.email, employees.email),
  phone = COALESCE(EXCLUDED.phone, employees.phone),
  avatar_url = COALESCE(EXCLUDED.avatar_url, employees.avatar_url),
  line_uid = COALESCE(EXCLUDED.line_uid, employees.line_uid),
  birth_date = COALESCE(EXCLUDED.birth_date, employees.birth_date),
  start_date = EXCLUDED.start_date,
  weekly_holidays = CASE WHEN cardinality(EXCLUDED.weekly_holidays) = 0 THEN employees.weekly_holidays ELSE EXCLUDED.weekly_holidays END,
  department_id = COALESCE(EXCLUDED.department_id, employees.department_id),
  position_id = COALESCE(EXCLUDED.position_id, employees.position_id),
  updated_at = now()
WHERE EXCLUDED.deleted_at IS NULL"""  # a former-staff stub never overwrites a real record
ON_CONFLICT_SKIP = "ON CONFLICT (code) DO NOTHING"


def employees_section(data: MigrationData, on_conflict: str) -> list[str]:
    rows = []
    for e in data.real_employees + data.former_stubs:
        status = config.EMPLOYMENT_STATUS_FORMER if e.is_former_stub else config.EMPLOYMENT_STATUS_ACTIVE
        rows.append(lit.row(
            lit.text(e.code), lit.text(e.prefix), lit.text(e.first_name), lit.text(e.last_name), lit.text(e.email),
            lit.text(e.phone), lit.text(e.avatar_url), lit.text(e.line_uid), lit.date(e.birth_date), lit.date(e.start_date),
            lit.int_array(e.weekly_holidays), lit.text(e.department), lit.text(e.position),
            lit.text(status), lit.text(config.DEFAULT_EMPLOYMENT_TYPE_CODE), "true" if e.is_former_stub else "false",
        ))
    conflict = ON_CONFLICT_UPDATE if on_conflict == "update" else ON_CONFLICT_SKIP

    chunks = ["-- ===== employees =====", staging.create_stage_table(STAGE, STAGE_COLUMNS)]
    if rows:
        chunks.append(staging.insert_stage_rows(STAGE, lit.values_list(rows)))
    chunks.append(f"""INSERT INTO employees ({TARGET_COLUMNS})
SELECT s.code, s.prefix, s.first_name, s.last_name, s.email, s.phone, s.avatar_url, s.line_uid, s.birth_date,
       s.start_date, s.weekly_holidays, d.id, p.id, st.id, ty.id, CASE WHEN s.deleted THEN now() END
FROM emp_stage s
LEFT JOIN departments d ON d.name = s.department
LEFT JOIN positions p ON p.name = s.position
LEFT JOIN employment_statuses st ON st.name = s.status
LEFT JOIN employment_types ty ON ty.code = s.type_code
{conflict};
""")
    return chunks
