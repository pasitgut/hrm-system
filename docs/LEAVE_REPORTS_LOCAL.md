# Leave report PDFs

Leave reports use approved leave requests from the application database and render on the server as A4 PDFs with PDFMake and TH Sarabun New fonts (`public/THSarabunNew.ttf` and `public/THSarabunNew-Bold.ttf`). PDF creation does not require Chromium. The existing Reports page layout, period controls, scope radios, sorting controls, annual switches, and PDF button are preserved. The Leave tab sends the selected settings to `/api/reports/leave`.

## Printed layout

PDF pages follow the legacy report format: timestamp at the top left, company centered, page number at the top right, no footer, 20 pt left/right/bottom margins, 12 pt summary table text, dark slate header rows, and thin gray grid lines. Summary columns wrap long type labels while keeping totals readable; detail pages repeat the employee identity and table headings. The company monthly summary was compared with the supplied reference, and the October 2026 live PDF was visually checked.

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
npx vitest run lib/reports/leave/model.test.ts lib/reports/leave/options.test.ts lib/reports/leave/access.test.ts lib/reports/leave/pdfmake.test.ts app/api/reports/leave/export/route.test.ts app/api/reports/leave/options/route.test.ts
```

Generate synthetic fixture PDFs, including all twelve variants, extra active and inactive types, a half-day, month/year overlaps, and a long reason:

```powershell
npx tsx --env-file-if-exists=.env scripts/verify/leave-report-fixtures.ts
```

Fixtures are saved under `output/pdf/leave-report-fixtures/`. The read-only live smoke uses the configured application `DATABASE_URL`, selects the current Bangkok calendar month, writes a PDF under `output/pdf/leave-reports/`, and prints only counts/type totals and PDF metadata:

```powershell
npx tsx --env-file-if-exists=.env scripts/verify/leave-report-live.ts
```

The live smoke only runs `SELECT` queries and closes its database connection. Do not use database reset or seed scripts against the configured application URL.

## Verification record

- PDFMake generated all 12 variants plus one long-reason fixture, totaling 152 A4 pages. pypdf confirmed there are no blank pages and the `LEAVEEND7A3C` sentinel remains in the seven-page stress PDF.
- pypdfium2 renders were inspected for the monthly company summary, annual month columns, individual detail pages, and the long-reason continuation and totals page.
- `npx tsc --noEmit --incremental false` and the targeted PDFMake unit tests passed. A live database smoke was not run during this renderer migration.
