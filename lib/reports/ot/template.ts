import {
  bangkokParts,
  formatOtHours,
  THAI_MONTHS,
  type OtReportEmployeeModel,
  type OtReportModel,
  type OtReportRequest,
  type OtReportTotals,
} from "./model";
import { getOtReportDefinition, OT_REPORT_LABELS, type OtReportSortRule, type OtReportVariant } from "./options";
import { sortOtReportEmployees } from "./model";

export type OtReportDocument = {
  variant: OtReportVariant;
  model: OtReportModel;
  sortRules: readonly OtReportSortRule[];
};

export type OtReportMarkup = { html: string; headerTemplate: string; footerTemplate: string };

const CONTENT_WIDTH_PT = 555.28;
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

function localDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${THAI_MONTHS[month - 1]} ${year}`;
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function generatedAtLabel(value: string) {
  const part = bangkokParts(new Date(value));
  const day = String(part.day).padStart(2, "0");
  const month = String(part.month).padStart(2, "0");
  return `ข้อมูล ณ วันที่: ${day}/${month}/${part.year} ${String(part.hour).padStart(2, "0")}:${String(part.minute).padStart(2, "0")}`;
}

function reportTitle(variant: OtReportVariant, model: OtReportModel) {
  if (variant === "yearly-all-month-columns" || variant === "yearly-individual-month-columns" || variant === "yearly-individual-month-columns-detail") {
    return `รายงานโอทีรายปี ${model.year}`;
  }
  if (variant.startsWith("monthly")) {
    return `รายงานโอที (เดือน ${THAI_MONTHS[(model.month ?? 1) - 1]} ${model.year})`;
  }
  return `รายงานโอที (ปี ${model.year})`;
}

function periodLabel(model: OtReportModel) {
  return `ตั้งแต่ วันที่ ${localDateLabel(model.periodStart)} ถึง วันที่ ${localDateLabel(model.periodEnd)}`;
}

function mainHeading(title: string, range: string, compact = false) {
  return `<div class="document-heading ${compact ? "compact" : ""}"><h1>${escapeHtml(title)}</h1><p class="period">${escapeHtml(range)}</p></div>`;
}

function titleOnlyHeading(title: string) {
  return `<div class="document-heading title-only"><h1>${escapeHtml(title)}</h1></div>`;
}

function employeeLabel(employee: OtReportEmployeeModel) {
  return `${employee.name} - ${employee.employee.positionName || "ไม่ระบุตำแหน่ง"} - ${employee.employee.departmentName || "ไม่ระบุแผนก"}`;
}

function totalCells(totals: OtReportTotals, includeUnknown: boolean) {
  const fields = [totals.weekdayMs, totals.holidayMs, ...(includeUnknown ? [totals.unknownMs] : []), totals.totalMs];
  return fields.map((duration, index) => {
    const total = index === fields.length - 1;
    return `<td class="numeric ${total ? "total" : ""}">${total || duration > 0 ? formatOtHours(duration) : ""}</td>`;
  }).join("");
}

function emptyTotals(): OtReportTotals {
  return { weekdayMs: 0, holidayMs: 0, unknownMs: 0, totalMs: 0, requestCount: 0 };
}

function summaryTable(
  employees: OtReportEmployeeModel[],
  options: { includeUnknown: boolean; year: number; displayMonth?: number; totalsMonth?: number; emptyLabel?: string },
) {
  const includeMonth = options.displayMonth !== undefined;
  const metricCount = options.includeUnknown ? 4 : 3;
  const monthWidth = includeMonth ? 50 : 0;
  const codeWidth = 60;
  const metricWidth = 70;
  const nameWidth = CONTENT_WIDTH_PT - monthWidth - codeWidth - metricCount * metricWidth;
  const cols = [
    ...(includeMonth ? [`<col style="width:${monthWidth}pt">`] : []),
    `<col style="width:${codeWidth}pt"><col style="width:${nameWidth.toFixed(2)}pt">`,
    ...Array.from({ length: metricCount }, () => `<col style="width:${metricWidth}pt">`),
  ].join("");
  const rows = employees.map((entry) => {
    const monthData = options.totalsMonth === undefined ? undefined : entry.months.find((item) => item.month === options.totalsMonth);
    const totals = monthData?.totals ?? (options.totalsMonth === undefined ? entry.totals : emptyTotals());
    return `<tr>${includeMonth ? `<td class="month-cell">${escapeHtml(THAI_MONTHS[options.displayMonth! - 1])} ${options.year}</td>` : ""}<td class="code">${escapeHtml(entry.employee.code)}</td><td class="name">${escapeHtml(entry.name)}</td>${totalCells(totals, options.includeUnknown)}</tr>`;
  }).join("");
  const emptyCells = (includeMonth ? 1 : 0) + 2 + metricCount;
  const heading = [
    ...(includeMonth ? ["เดือน"] : []),
    "รหัสพนักงาน", "ชื่อ - สกุล",
    `${OT_REPORT_LABELS.weekdays} (ชม.)`, `${OT_REPORT_LABELS.holidays} (ชม.)`,
    ...(options.includeUnknown ? [`${OT_REPORT_LABELS.unknown} (ชม.)`] : []),
    "รวม (ชม.)",
  ];
  return `<table class="summary-table"><colgroup>${cols}</colgroup>
    <thead><tr>${heading.map((label, index) => `<th class="${index >= heading.length - metricCount ? "numeric" : ""}">${escapeHtml(label)}</th>`).join("")}</tr></thead>
    <tbody>${rows || `<tr><td class="empty" colspan="${emptyCells}">${escapeHtml(options.emptyLabel ?? "ไม่มีพนักงานในช่วงเวลานี้")}</td></tr>`}</tbody>
  </table>`;
}

function departmentSections(
  employees: OtReportEmployeeModel[],
  includeUnknown: boolean,
  options: { year: number; displayMonth?: number; totalsMonth?: number },
) {
  const groups = new Map<string, OtReportEmployeeModel[]>();
  for (const employee of employees) {
    const department = employee.employee.departmentName || "ไม่ระบุแผนก";
    groups.set(department, [...(groups.get(department) ?? []), employee]);
  }
  if (!groups.size) {
    return `<section class="department">${summaryTable([], { includeUnknown, ...options })}</section>`;
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "th", { sensitivity: "base" }))
    .map(([department, group]) => `<section class="department"><h2 class="group-title">แผนก: ${escapeHtml(department)}</h2>${summaryTable(group, { includeUnknown, ...options })}</section>`)
    .join("");
}

function monthColumnsTable(employees: OtReportEmployeeModel[], year: number, includeUnknown: boolean, showRepeatedMonth = false) {
  const metricCount = includeUnknown ? 4 : 3;
  const fixedMonth = 50;
  const fixedCode = 60;
  const fixedMetrics = metricCount * 70;
  const name = CONTENT_WIDTH_PT - fixedMonth - fixedCode - fixedMetrics;
  const cols = `<col style="width:${fixedMonth}pt"><col style="width:${fixedCode}pt"><col style="width:${name.toFixed(2)}pt">${Array.from({ length: metricCount }, () => `<col style="width:70pt">`).join("")}`;
  const rows = THAI_MONTHS.flatMap((label, index) => employees.length
    ? employees.map((employee, employeeIndex) => {
      const totals = employee.months.find((item) => item.month === index + 1)?.totals ?? emptyTotals();
      const monthCell = showRepeatedMonth || employeeIndex === 0 ? `${label} ${year}` : "";
      return `<tr><td class="month-cell">${escapeHtml(monthCell)}</td><td class="code">${escapeHtml(employee.employee.code)}</td><td class="name">${escapeHtml(employee.name)}</td>${totalCells(totals, includeUnknown)}</tr>`;
    })
    : [`<tr><td class="month-cell">${escapeHtml(`${label} ${year}`)}</td><td></td><td class="name">ไม่มีพนักงานในช่วงเวลานี้</td>${totalCells(emptyTotals(), includeUnknown)}</tr>`]).join("");
  const headings = ["เดือน", "รหัสพนักงาน", "ชื่อ - สกุล", `${OT_REPORT_LABELS.weekdays} (ชม.)`, `${OT_REPORT_LABELS.holidays} (ชม.)`,
    ...(includeUnknown ? [`${OT_REPORT_LABELS.unknown} (ชม.)`] : []), "รวม (ชม.)"];
  const colSpan = 3 + metricCount;
  return `<table class="month-columns-table"><colgroup>${cols}</colgroup>
    <thead><tr>${headings.map((label, index) => `<th class="${index >= headings.length - metricCount ? "numeric" : ""}">${escapeHtml(label)}</th>`).join("")}</tr></thead>
    <tbody>${rows || `<tr><td class="empty" colspan="${colSpan}">ไม่มีพนักงานในช่วงเวลานี้</td></tr>`}</tbody>
  </table>`;
}

function localDateTimeLabel(request: OtReportRequest) {
  return request.startDate === request.endDate
    ? shortDate(request.startDate)
    : `${shortDate(request.startDate)} - ${shortDate(request.endDate)}`;
}

function documentHeaderRows(report: OtReportDocument, employee: OtReportEmployeeModel, colSpan: number, monthLabel?: string) {
  const title = report.variant === "monthly-individual-detail" || report.variant.endsWith("detail")
    ? "รายงานโอที"
    : reportTitle(report.variant, report.model);
  const yearRange = periodLabel(report.model);
  return `<tr class="doc-title-row"><th colspan="${colSpan}"><h1>${escapeHtml(title)}</h1></th></tr>
    <tr class="doc-period-row"><th colspan="${colSpan}"><p>${escapeHtml(yearRange)}</p></th></tr>
    ${monthLabel ? `<tr class="month-label-row"><th colspan="${colSpan}">${escapeHtml(monthLabel)}</th></tr>` : ""}
    <tr class="employee-heading-row"><th colspan="${colSpan}">${escapeHtml(employeeLabel(employee))}</th></tr>
    <tr class="employee-divider-row"><th colspan="${colSpan}"></th></tr>
    <tr class="detail-spacer-row"><th colspan="${colSpan}"></th></tr>`;
}

function detailColumnGroup() {
  return `<colgroup><col style="width:50pt"><col style="width:55pt"><col style="width:40pt"><col style="width:40pt"><col style="width:35pt"><col style="width:40pt"><col style="width:40pt"><col style="width:35pt"><col style="width:170.28pt"><col style="width:50pt"></colgroup>`;
}

function detailHeading(report: OtReportDocument, employee: OtReportEmployeeModel, columns: number, monthLabel?: string) {
  return documentHeaderRows(report, employee, columns, monthLabel);
}

function detailedTotalsTable(totals: OtReportTotals, includeUnknown: boolean) {
  const rows: [string, number][] = [
    ["รวมโอทีวันทำงาน", totals.weekdayMs],
    ["รวมโอทีวันหยุด", totals.holidayMs],
    ...(includeUnknown ? [["รวมโอทีไม่ระบุประเภท", totals.unknownMs] as [string, number]] : []),
    ["รวมโอทีทั้งหมด", totals.totalMs],
  ];
  return `<table class="detail-totals"><colgroup><col style="width:200pt"><col style="width:100pt"></colgroup><tbody>${rows.map(([label, value], index) => {
    const total = index === rows.length - 1;
    return `<tr class="${total ? "grand-total" : ""}"><td>${escapeHtml(label)}</td><td class="numeric">${formatOtHours(value)} ชม.</td></tr>`;
  }).join("")}</tbody></table>`;
}

function detailRows(requests: OtReportRequest[]) {
  return requests.map((request) => {
    const month = THAI_MONTHS[request.month - 1];
    const date = localDateTimeLabel(request);
    const work = request.overtimeType === "weekday";
    const holiday = request.overtimeType === "holiday";
    return `<tr class="detail-row"><td class="center month-cell">${escapeHtml(month)}</td>
      <td class="center date-cell">${escapeHtml(date)}</td>
      <td class="center">${work ? escapeHtml(request.startTime) : ""}</td>
      <td class="center">${work ? escapeHtml(request.endTime) : ""}</td>
      <td class="numeric">${work ? formatOtHours(request.durationMs) : ""}</td>
      <td class="center">${holiday ? escapeHtml(request.startTime) : ""}</td>
      <td class="center">${holiday ? escapeHtml(request.endTime) : ""}</td>
      <td class="numeric">${holiday ? formatOtHours(request.durationMs) : ""}</td>
      <td class="reason">${escapeHtml(request.reason)}</td><td class="center">อนุมัติแล้ว</td></tr>`;
  }).join("");
}

function knownDetailTable(
  report: OtReportDocument,
  employee: OtReportEmployeeModel,
  requests: OtReportRequest[],
  totals: OtReportTotals,
  includeTotals: boolean,
  monthLabel?: string,
) {
  const known = requests.filter((request) => request.overtimeType !== "unknown");
  const emptyRow = `<tr><td class="empty" colspan="10">ไม่มีรายการ OT ที่อนุมัติในช่วงนี้</td></tr>`;
  return `<table class="detail-table">${detailColumnGroup()}<thead>${detailHeading(report, employee, 10, monthLabel)}
      <tr class="detail-groups"><th></th><th></th><th></th><th>วันทำงาน</th><th></th><th></th><th>วันหยุด</th><th></th><th></th><th></th></tr>
      <tr class="detail-labels"><th>เดือน</th><th>วันที่</th><th>เริ่ม</th><th>ถึง</th><th>ชม.</th><th>เริ่ม</th><th>ถึง</th><th>ชม.</th><th>งานที่ทำ</th><th>สถานะ</th></tr>
    </thead><tbody>${detailRows(known) || (requests.some((request) => request.overtimeType === "unknown") ? "" : emptyRow)}</tbody>
    ${includeTotals ? `<tfoot><tr><td colspan="10">${detailedTotalsTable(totals, false)}</td></tr></tfoot>` : ""}
  </table>`;
}

function unknownDetailTable(report: OtReportDocument, employee: OtReportEmployeeModel, requests: OtReportRequest[], totals: OtReportTotals, monthLabel?: string) {
  const unknown = requests.filter((request) => request.overtimeType === "unknown");
  if (!unknown.length) return "";
  const widths = `<colgroup><col style="width:50pt"><col style="width:55pt"><col style="width:40pt"><col style="width:40pt"><col style="width:45pt"><col style="width:275.28pt"><col style="width:50pt"></colgroup>`;
  const rows = unknown.map((request) => `<tr class="detail-row"><td class="center">${escapeHtml(THAI_MONTHS[request.month - 1])}</td><td class="center">${escapeHtml(localDateTimeLabel(request))}</td><td class="center">${escapeHtml(request.startTime)}</td><td class="center">${escapeHtml(request.endTime)}</td><td class="numeric">${formatOtHours(request.durationMs)}</td><td class="reason">${escapeHtml(request.reason)}</td><td class="center">อนุมัติแล้ว</td></tr>`).join("");
  return `<h2 class="unknown-heading">รายการ OT ที่ไม่ระบุประเภท</h2><table class="unknown-detail-table">${widths}<thead>${detailHeading(report, employee, 7, monthLabel)}
    <tr class="detail-labels"><th>เดือน</th><th>วันที่</th><th>เริ่ม</th><th>ถึง</th><th>ชม.</th><th>งานที่ทำ · ไม่ระบุประเภท</th><th>สถานะ</th></tr>
    </thead><tbody>${rows}</tbody><tfoot><tr><td colspan="7">${detailedTotalsTable(totals, true)}</td></tr></tfoot></table>`;
}

function detailTable(report: OtReportDocument, employee: OtReportEmployeeModel, requests: OtReportRequest[], totals: OtReportTotals, monthLabel?: string) {
  const hasUnknown = requests.some((request) => request.overtimeType === "unknown");
  const known = requests.some((request) => request.overtimeType !== "unknown");
  const knownTable = known || !hasUnknown ? knownDetailTable(report, employee, requests, totals, !hasUnknown, monthLabel) : "";
  const unknownTable = unknownDetailTable(report, employee, requests, totals, monthLabel);
  return knownTable + unknownTable;
}

function summaryDocument(report: OtReportDocument) {
  const model = report.model;
  const definition = getOtReportDefinition(report.variant)!;
  const employees = sortOtReportEmployees(model.employees, report.sortRules);
  const title = reportTitle(report.variant, model);
  const range = periodLabel(model);
  if (report.variant === "yearly-all-month-columns") {
    return `${titleOnlyHeading(title)}${monthColumnsTable(employees, model.year, model.hasUnknownType)}`;
  }
  if (report.variant === "yearly-individual-month-columns") {
    return employees.map((employee, index) => `<section class="individual-block ${index ? "page-start" : ""}">${titleOnlyHeading(title)}${monthColumnsTable([employee], model.year, model.hasUnknownType, true)}</section>`).join("");
  }
  if (report.variant === "yearly-all-month-pages") {
    const months = THAI_MONTHS.map((label, index) => `<section class="month-page ${index ? "page-start" : ""}">
      ${mainHeading(title, range)}<h2 class="month-heading">${escapeHtml(label)} ${model.year}</h2>
      ${departmentSections(employees, model.hasUnknownType, { year: model.year, totalsMonth: index + 1 })}</section>`).join("");
    const annual = `<section class="month-page page-start">${mainHeading(title, range)}${departmentSections(employees, model.hasUnknownType, { year: model.year })}</section>`;
    return months + annual;
  }
  if (report.variant === "yearly-individual-month-pages") {
    return employees.flatMap((employee, employeeIndex) => {
      const months = THAI_MONTHS.map((label, index) => {
        const pageStart = employeeIndex > 0 || index > 0;
        return `<section class="month-page ${pageStart ? "page-start" : ""}">${mainHeading(title, range)}
          <h2 class="month-heading">${escapeHtml(label)} ${model.year}</h2>
          ${departmentSections([employee], model.hasUnknownType, { year: model.year, totalsMonth: index + 1 })}</section>`;
      });
      return [...months, `<section class="month-page page-start">${mainHeading(title, range)}${departmentSections([employee], model.hasUnknownType, { year: model.year })}</section>`];
    }).join("");
  }
  const month = definition.period === "monthly" ? model.month ?? 1 : undefined;
  if (report.variant === "monthly-individual") {
    return employees.map((employee, index) => `<section class="individual-block ${index ? "page-start" : ""}">${mainHeading(title, range)}${departmentSections([employee], model.hasUnknownType, { year: model.year, displayMonth: month, totalsMonth: month })}</section>`).join("");
  }
  if (report.variant === "yearly-individual") {
    return employees.map((employee, index) => `<section class="individual-block ${index ? "page-start" : ""}">${mainHeading(title, range)}${departmentSections([employee], model.hasUnknownType, { year: model.year })}</section>`).join("");
  }
  return `${mainHeading(title, range)}${departmentSections(employees, model.hasUnknownType, { year: model.year, totalsMonth: month })}`;
}

function detailDocument(report: OtReportDocument) {
  const employees = sortOtReportEmployees(report.model.employees, report.sortRules);
  if (report.variant === "yearly-individual-month-pages-detail") {
    return employees.flatMap((employee, employeeIndex) => {
      const monthPages = employee.months.map((month, monthIndex) => {
        const pageStart = employeeIndex > 0 || monthIndex > 0;
        return `<section class="detail-page ${pageStart ? "page-start" : ""}">${detailTable(report, employee, month.requests, month.totals, `${month.label} ${report.model.year}`)}</section>`;
      });
      const annual = `<section class="detail-page page-start"><div class="detail-final-heading"><h1>รายงานโอที</h1><p>${escapeHtml(periodLabel(report.model))}</p><strong>${escapeHtml(employeeLabel(employee))}</strong></div>${detailedTotalsTable(employee.totals, report.model.hasUnknownType)}</section>`;
      return [...monthPages, annual];
    }).join("");
  }
  return employees.map((employee, index) => {
    const requests = report.variant.startsWith("monthly")
      ? employee.months[0]?.requests ?? []
      : employee.months.flatMap((month) => month.requests);
    return `<section class="detail-page ${index > 0 ? "page-start" : ""}">${detailTable(report, employee, requests, employee.totals)}</section>`;
  }).join("");
}

function styles() {
  return `*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:THSarabunNew,sans-serif;font-size:12pt;line-height:1.2;color:#000;background:#fff}main{width:100%}
    .document-heading{text-align:center;margin:0 0 32.2pt}.document-heading.compact{margin-bottom:26.2pt}.document-heading.title-only{margin-bottom:33.2pt}.document-heading h1{font-size:18pt;line-height:1.2;font-weight:700;margin:0 0 1pt}.document-heading .period{font-size:14pt;font-weight:400;line-height:1.15;margin:0}.month-heading{font-size:14pt;line-height:1.2;font-weight:700;margin:0 0 14pt}
    .department{margin:0 0 11.414pt;break-inside:auto}.group-title{font-size:14pt;line-height:1.2;font-weight:700;color:#37474f;margin:0 0 4pt}.summary-table,.month-columns-table,.detail-table,.unknown-detail-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0}
    th,td{border:.5pt solid #bdbdbd;padding:3.7pt 4pt;vertical-align:middle;overflow-wrap:anywhere;font-weight:400}.summary-table th,.month-columns-table th{height:23.612pt;background:#37474f;color:#fff;font-size:12pt;line-height:1.1;font-weight:700;text-align:center}.summary-table td,.month-columns-table td{height:23.612pt;font-size:12pt;line-height:1.1}.summary-table .name,.month-columns-table .name{white-space:normal;overflow-wrap:anywhere}.summary-table .code,.month-columns-table .code{white-space:nowrap}.numeric{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}th.numeric{text-align:center;white-space:normal}.month-cell,.center{text-align:center}.summary-table td.numeric,.month-columns-table td.numeric{font-weight:400}.summary-table td.total,.month-columns-table td.total{font-weight:400}.empty{text-align:center!important;padding:9pt!important}
    .month-columns-table th{white-space:normal}.month-columns-table td{overflow-wrap:normal}.month-columns-table .name{white-space:normal}
    .detail-page{width:100%;break-inside:auto}.detail-table,.unknown-detail-table{margin:0}.detail-table th,.unknown-detail-table th{font-size:10pt;line-height:1;vertical-align:middle;text-align:center;padding:2pt 2pt;border:.5pt solid #bdbdbd}.detail-table td,.unknown-detail-table td{font-size:10pt;line-height:1.18;padding:2.2pt 2.5pt;border:.5pt solid #bdbdbd;vertical-align:middle}.detail-table .doc-title-row th,.unknown-detail-table .doc-title-row th{background:#fff;color:#111;border:0;padding:10pt 0 0;height:32pt}.detail-table .doc-title-row h1,.unknown-detail-table .doc-title-row h1{font-family:THSarabunNew,sans-serif;font-size:18pt;font-weight:700;line-height:22pt;margin:0}.detail-table .doc-period-row th,.unknown-detail-table .doc-period-row th{background:#fff;color:#111;border:0;height:16.85pt;padding:0;font-weight:400}.detail-table .doc-period-row p,.unknown-detail-table .doc-period-row p{font-size:14pt;font-weight:400;line-height:16.85pt;margin:0}.detail-table .employee-heading-row th,.unknown-detail-table .employee-heading-row th{background:#fff;color:#111;border:0;height:23pt;padding:0;font-size:16pt;font-weight:700;line-height:20pt}.detail-table .employee-divider-row th,.unknown-detail-table .employee-divider-row th{height:7.3pt;padding:0;border:0;border-bottom:1pt solid #111;background:#fff}.detail-table .detail-spacer-row th,.unknown-detail-table .detail-spacer-row th{height:17.5pt;padding:0;border:0;background:#fff}
    .detail-table .detail-groups th{height:17.01pt;background:#37474f;color:#fff;font-weight:700}.detail-table .detail-labels th,.unknown-detail-table .detail-labels th{height:17.01pt;background:#37474f;color:#fff;font-weight:700}.detail-table td.center,.unknown-detail-table td.center,.detail-table td.numeric,.unknown-detail-table td.numeric,.detail-totals td.numeric{text-align:center}.detail-table td.reason,.unknown-detail-table td.reason{text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;vertical-align:top}.detail-table tr.detail-row,.unknown-detail-table tr.detail-row{break-inside:auto;page-break-inside:auto}.detail-table tr.detail-row td,.unknown-detail-table tr.detail-row td{break-inside:auto;page-break-inside:auto}.detail-table td.empty{height:auto}.unknown-heading{font-size:12pt;font-weight:700;margin:12pt 0 3pt}
    .detail-table>tfoot>tr>td,.unknown-detail-table>tfoot>tr>td{border:0;padding:0;background:#fff}.detail-totals{width:300pt;margin:15pt auto 0;border-collapse:collapse;table-layout:fixed;break-inside:avoid;page-break-inside:avoid}.detail-totals td{height:25.01pt;border:.5pt solid #bdbdbd;font-size:10pt;line-height:1.1;padding:3pt 5pt}.detail-totals td:first-child{font-weight:700}.detail-totals .grand-total td{background:#eee;font-weight:700}.month-label-row th,.detail-final-heading{text-align:center;font-weight:700;font-size:14pt;line-height:1.2}.detail-final-heading{margin-bottom:8pt;border-bottom:1pt solid #111;padding-bottom:8pt}.detail-final-heading h1{font-size:18pt;line-height:1.2;margin:0 0 1pt}.detail-final-heading p{font-size:14pt;font-weight:400;line-height:1.15;margin:0 0 3pt}.detail-final-heading strong{font-size:16pt}
    .page-start{break-before:page;page-break-before:always}@media print{thead{display:table-header-group}tfoot{display:table-row-group}.page-start{break-before:page;page-break-before:always}.department,.detail-page{break-inside:auto}.detail-table tr.detail-row,.unknown-detail-table tr.detail-row{break-inside:auto;page-break-inside:auto}}`;
}

function pageHeader(report: OtReportDocument, fontRegularBase64: string, fontBoldBase64: string) {
  const fontCss = `<style>@font-face{font-family:THSarabunNew;src:url(data:font/ttf;base64,${fontRegularBase64})}@font-face{font-family:THSarabunNew;src:url(data:font/ttf;base64,${fontBoldBase64});font-weight:700}</style>`;
  const generated = generatedAtLabel(report.model.generatedAt);
  const company = OT_REPORT_LABELS.company;
  return `${fontCss}<div style="font-family:THSarabunNew,sans-serif;box-sizing:border-box;width:100%;margin:0;padding:7.5pt 20pt 0;display:flex;align-items:center;color:#616161;font-size:10pt;line-height:1;white-space:nowrap"><span style="width:33.333%;text-align:left">${escapeHtml(generated)}</span><span style="width:33.333%;text-align:center;color:#616161;font-size:14pt;font-weight:700">${escapeHtml(company)}</span><span style="width:33.333%;text-align:right">หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}

export function createOtReportMarkup(report: OtReportDocument, fontRegularBase64: string, fontBoldBase64: string): OtReportMarkup {
  const definition = getOtReportDefinition(report.variant)!;
  const body = definition.detail ? detailDocument(report) : summaryDocument(report);
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
    @font-face{font-family:THSarabunNew;src:url(data:font/ttf;base64,${fontRegularBase64})}@font-face{font-family:THSarabunNew;font-weight:700;src:url(data:font/ttf;base64,${fontBoldBase64})}
    ${styles()}
  </style></head><body><main>${body}</main></body></html>`;
  const footerTemplate = `<div style="font-family:THSarabunNew,sans-serif;width:100%"></div>`;
  return { html, headerTemplate: pageHeader(report, fontRegularBase64, fontBoldBase64), footerTemplate };
}
