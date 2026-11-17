from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

from .models import MigrationData
from .pipeline import generate
from .report import Report

DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "output" / "appsheet_import.sql"


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert the legacy AppSheet workbook into one idempotent SQL import for the HRM database.",
    )
    parser.add_argument("xlsx", type=Path, help="THOME-Appsheet-1.xlsx")
    parser.add_argument("-o", "--out", type=Path, default=DEFAULT_OUTPUT, help=f"output file (default: {DEFAULT_OUTPUT})")
    parser.add_argument(
        "--employee-conflict", choices=("update", "skip"), default="update",
        help="employee code already in the DB: 'update' fills/refreshes it from the sheet (default), 'skip' leaves it alone",
    )
    return parser.parse_args(argv)


def _print_summary(out: Path, data: MigrationData, report: Report) -> None:
    print(f"Wrote {out}")
    print(f"  employees          {len(data.employees):4d}  (of which {len(data.former_stubs)} former-staff stubs)")
    print(f"  overtime_requests  {len(data.overtime):4d}  (by status {dict(Counter(r.status for r in data.overtime))})")
    print(
        f"  leave_requests     {len(data.leave):4d}  (by type {dict(Counter(r.leave_type_code for r in data.leave))};"
        f" by status {dict(Counter(r.status for r in data.leave))})"
    )
    print(f"  asset_requests     {len(data.assets):4d}  ({sum(len(a.items) for a in data.assets)} items)")
    for label, count in report.counts.items():
        print(f"  {label}: {count}")
    if report.warnings:
        print(f"\n{len(report.warnings)} warning(s) - review before importing:")
        for warning in report.warnings:
            print("  -", warning)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    sql, data, report = generate(args.xlsx, args.employee_conflict)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(sql, encoding="utf-8")
    _print_summary(args.out, data, report)
    return 0
