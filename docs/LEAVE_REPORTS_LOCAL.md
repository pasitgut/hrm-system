# Leave report PDFs

Leave reports use approved leave requests from the application database and render on the server as A4 PDFs with the local Noto Sans Thai fonts. The existing Reports page layout, period controls, scope radios, sorting controls, annual switches, and PDF button are preserved. The Leave tab sends the selected settings to `/api/reports/leave`.

## Report contents and calculations

- The report includes approved requests whose date range overlaps the selected calendar month or year. Requests crossing a month or year are clipped to the selected period and split into monthly rows for annual monthly views.
- A full-day request counts each inclusive calendar date. A single-date `am` or `pm` request counts as 0.5 day. Weekends and holidays are not deducted. These rules follow the existing `leaveDaySpan` calculation in `app/api/leave/_shared.ts`.
- Annual totals equal the sum of the twelve monthly allocations. The existing leave quota summary books an entire request to the year of `startOn`; for a cross-year request its result can therefore differ from this calendar allocation. The quota API was not changed.
- All active leave types are available as report columns. Inactive types remain visible when an approved request in the report period uses them. Sick, personal, and birthday leave appear first; additional active and historical types follow. When many types are present, tables split into readable groups, repeat employee identity columns, and label the total as covering every leave type.
- Company reports include employees employed during the period and employees with an approved matching request, including offboarded staff with history. Individual reports include the selected employees and approved matching requests.
- Employee name, department, and position come from the current employee master record because the database does not keep historical organization snapshots.
- Monthly company summaries are grouped by department. Individual detailed reports include the clipped request dates, type, session, days, and reason. Long reasons can continue across pages with repeated table headings and employee identity.

## Access and endpoints

The caller needs `reports.view` and one of `leave.view_company` / `leave.approve` for company reports, or `leave.view_self` / `leave.request.self` for self-only reports. Self-only callers can request individual reports only for their own employee ID. The employee options endpoint returns only the caller's own employee row for self-only access. Export responses use `application/pdf` and `Cache-Control: no-store`.

- `GET /api/reports/leave/options` loads only minimal employee picker fields.
- `POST /api/reports/leave/export` validates the report variant, year/month, employee selection, and sorting rules before reading approved requests and rendering the PDF.

All twelve variants follow the same report layout choices as OT: monthly company/individual/detail, then annual summary/month columns/month pages for company and individual, including individual detail combinations. Custom date ranges and bonus reports remain unavailable in the existing UI.

## Local verification

Run the targeted checks without resetting or seeding a database:

```powershell
npx tsc --noEmit --incremental false
npx vitest run lib/reports/leave/model.test.ts lib/reports/leave/options.test.ts lib/reports/leave/access.test.ts lib/reports/leave/template.test.ts app/api/reports/leave/export/route.test.ts app/api/reports/leave/options/route.test.ts
```

Generate synthetic fixture PDFs, including all twelve variants, extra active and inactive types, a half-day, month/year overlaps, and a long reason:

```powershell
npx tsx --env-file-if-exists=.env scripts/verify-leave-report-fixtures.ts
```

Fixtures are saved under `output/pdf/leave-report-fixtures/`. The read-only live smoke uses the configured application `DATABASE_URL`, selects the current Bangkok calendar month, writes a PDF under `output/pdf/leave-reports/`, and prints only counts/type totals and PDF metadata:

```powershell
npx tsx --env-file-if-exists=.env scripts/verify-leave-report-live.ts
```

The live smoke only runs `SELECT` queries and closes its database connection. Do not use database reset or seed scripts against the configured application URL.

## Verification record

- `npx tsc --noEmit --incremental false` passes. The six targeted leave test files pass (16 tests); the six OT regression files also pass (20 tests) after the shared renderer change.
- All 12 leave variants and the long-reason fixture were rendered. pypdf extracted text from every page; no blank pages were found, and sentinel `LEAVEEND7A3C` survives extraction from the three-page long-reason PDF. pypdfium2 renders were visually inspected for the monthly company table, extra-type annual columns, annual month pages, employee identity on detailed continuation pages, and long-reason overflow.
- The read-only October 2026 application database smoke returned 1 employee and 1 approved request. Totals were sick 0 days, personal 0 days, birthday 1 day, total 1 day. The generated `%PDF-` file is 14,979 bytes at `output/pdf/leave-reports/leave-monthly-2026-10.pdf`; the script performed zero database writes. The parent also inspected this one-page PDF against the supplied reference.
