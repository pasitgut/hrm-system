"""Rows other tables reference (statuses, leave types, departments, positions) -- all `ON CONFLICT DO NOTHING`."""
from __future__ import annotations

from .. import config
from ..models import MigrationData
from . import literals as lit


def lookup_section(data: MigrationData) -> list[str]:
    chunks = ["-- Lookups the importer depends on (no-ops when they already exist)"]
    chunks.append(
        "INSERT INTO request_statuses (code, name) VALUES "
        + ",".join(lit.inline_tuple(*r) for r in config.REQUEST_STATUS_LOOKUP)
        + " ON CONFLICT (code) DO NOTHING;"
    )
    chunks.append(
        "INSERT INTO leave_types (code, name, annual_quota_days, quota_basis) VALUES "
        + ",".join(lit.inline_tuple(*r) for r in config.LEAVE_TYPE_LOOKUP)
        + " ON CONFLICT (code) DO NOTHING;"
    )
    chunks.append(
        "INSERT INTO employment_statuses (name) VALUES "
        + ",".join(lit.inline_tuple(n) for n in (config.EMPLOYMENT_STATUS_ACTIVE, config.EMPLOYMENT_STATUS_FORMER))
        + " ON CONFLICT (name) DO NOTHING;"
    )

    departments = {e.department for e in data.employees.values() if e.department} | {a.department for a in data.assets if a.department}
    positions = {e.position for e in data.employees.values() if e.position} | {a.position for a in data.assets if a.position}
    for table, names in (("departments", departments), ("positions", positions)):
        if names:
            chunks.append(
                f"INSERT INTO {table} (name) VALUES " + ", ".join(f"({lit.text(n)})" for n in sorted(names)) + " ON CONFLICT (name) DO NOTHING;"
            )
    chunks.append("")
    return chunks
