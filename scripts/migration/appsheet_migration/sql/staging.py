"""Shared shape of every import section.

Each section loads its rows into a TEMP "stage" table first, checks that every referenced employee exists
(aborting the whole transaction with a readable message otherwise), then inserts into the real table.
"""
from __future__ import annotations


def create_stage_table(name: str, columns: str) -> str:
    return f"CREATE TEMP TABLE {name} ({columns}) ON COMMIT DROP;"


def insert_stage_rows(name: str, values: str) -> str:
    return f"INSERT INTO {name} VALUES\n{values};"


def require_employees_exist(stage_table: str, label: str) -> str:
    """A DO block that raises when a stage row's `emp_code` has no matching employee."""
    return f"""DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(DISTINCT s.emp_code, ', ') INTO missing FROM {stage_table} s LEFT JOIN employees e ON e.code = s.emp_code WHERE e.id IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION '{label} import stopped; employee codes not found: %', missing; END IF;
END $$;"""
