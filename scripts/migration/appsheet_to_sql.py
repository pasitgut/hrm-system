#!/usr/bin/env python3
"""Prepare the legacy AppSheet workbook (THOME-Appsheet-1.xlsx) for import into the HRM Postgres database.

    python3 scripts/migration/appsheet_to_sql.py THOME-Appsheet-1.xlsx
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration/output/appsheet_import.sql

Pure standard library. See scripts/migration/README.md for the column mapping and the judgement calls,
and scripts/migration/appsheet_migration/ for the code (one module per sheet / target table).
"""
import sys

from appsheet_migration.cli import main

if __name__ == "__main__":
    sys.exit(main())
