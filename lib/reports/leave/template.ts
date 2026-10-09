import {
  formatLeaveDays,
  LEAVE_THAI_MONTHS,
  sortLeaveReportEmployees,
  type LeaveReportEmployeeModel,
  type LeaveReportModel,
  type LeaveReportMonth,
  type LeaveReportRequest,
  type LeaveReportTotals,
  type LeaveReportType,
} from "./model";
import { getLeaveReportDefinition, type LeaveReportSortRule, type LeaveReportVariant } from "./options";

export type LeaveReportDocument = { variant: LeaveReportVariant; model: LeaveReportModel; sortRules: readonly LeaveReportSortRule[] };
export type LeaveReportMarkup = { html: string; headerTemplate: string; footerTemplate: string };

const CONTENT_WIDTH_PT = 555.28;
const COMPANY = "บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด";
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

function localDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${LEAVE_THAI_MONTHS[month - 1]} ${year}`;
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function generatedAtLabel(value: string) {
  const date = new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  const time = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  return `ข้อมูล ณ วันที่: ${day}/${month}/${year} ${time}`;
}

function reportTitle(variant: LeaveReportVariant, model: LeaveReportModel) {
  if (variant === "yearly-all-month-columns" || variant === "yearly-individual-month-columns" || variant === "yearly-individual-month-columns-detail") {
    return `รายงานวันลารายปี ${model.year}`;
  }
  return variant.startsWith("monthly")
    ? `รายงานวันลา (เดือน ${LEAVE_THAI_MONTHS[(model.month ?? 1) - 1]} ${model.year})`
    : `รายงานวันลา (ปี ${model.year})`;
}

function periodLabel(model: LeaveReportModel) {
  return `ตั้งแต่ วันที่ ${localDateLabel(model.periodStart)} ถึง วันที่ ${localDateLabel(model.periodEnd)}`;
}

function mainHeading(title: string, range: string, compact = false) {
  return `<div class="document-heading ${compact ? "compact" : ""}"><h1>${escapeHtml(title)}</h1><p class="period">${escapeHtml(range)}</p></div>`;
}

function titleOnlyHeading(title: string) {
  return `<div class="document-heading title-only"><h1>${escapeHtml(title)}</h1></div>`;
}

function employeeLabel(employee: LeaveReportEmployeeModel) {
  return `${employee.name} - ${employee.employee.positionName || "ไม่ระบุตำแหน่ง"} - ${employee.employee.departmentName || "ไม่ระบุแผนก"}`;
}

function totalForType(totals: LeaveReportTotals, code: string) {
  return totals.byType[code] ?? 0;
}

function totalDay(totals: LeaveReportTotals) {
  return formatLeaveDays(totals.daysHalfUnits);
}

function emptyTotals(types: LeaveReportType[]): LeaveReportTotals {
  return { daysHalfUnits: 0, byType: Object.fromEntries(types.map((type) => [type.code, 0])), requestCount: 0 };
}

function chunkTypes(types: LeaveReportType[], size = 3) {
  if (!types.length) return [[] as LeaveReportType[]];
  const chunks: LeaveReportType[][] = [];
  for (let index = 0; index < types.length; index += size) chunks.push(types.slice(index, index + size));
  return chunks;
}

function monthTotals(employee: LeaveReportEmployeeModel, month: number | undefined, types: LeaveReportType[]) {
  return month === undefined
    ? employee.totals
    : employee.months.find((entry) => entry.month === month)?.totals ?? emptyTotals(types);
}

function tableColumns(options: { month?: boolean; department?: boolean; typeCount: number }) {
  const metricCount = options.typeCount + 1;
  const monthWidth = options.month ? 50 : 0;
  const departmentWidth = options.department ? 75 : 0;
  const codeWidth = 60;
  const metricWidth = (CONTENT_WIDTH_PT - monthWidth - departmentWidth - codeWidth - 225.28) / metricCount;
  const nameWidth = CONTENT_WIDTH_PT - monthWidth - departmentWidth - codeWidth - metricCount * metricWidth;
  return {
    nameWidth,
    metricWidth,
    html: `${options.month ? `<col style="width:${monthWidth}pt">` : ""}${options.department ? `<col style="width:${departmentWidth}pt">` : ""}<col style="width:${codeWidth}pt"><col style="width:${nameWidth.toFixed(2)}pt">${Array.from({ length: metricCount }, () => `<col style="width:${metricWidth.toFixed(2)}pt">`).join("")}`,
  };
}

function typeCells(totals: LeaveReportTotals, types: LeaveReportType[]) {
  return types.map((type) => {
    const value = totalForType(totals, type.code);
    return `<td class="numeric">${value ? formatLeaveDays(value) : ""}</td>`;
  }).join("");
}

function totalHeading(allTypes: LeaveReportType[], shownTypes: LeaveReportType[]) {
  return allTypes.length > shownTypes.length ? "รวมทุกประเภท (วัน)" : "รวม (วัน)";
}

function summaryTable(
  employees: LeaveReportEmployeeModel[],
  allTypes: LeaveReportType[],
  options: { month?: number; year?: number; showMonth?: boolean; showDepartment?: boolean; emptyLabel?: string } = {},
) {
  const chunks = chunkTypes(allTypes);
  return chunks.map((shownTypes, chunkIndex) => {
    const columns = tableColumns({ month: options.showMonth, department: options.showDepartment, typeCount: shownTypes.length });
    const rows = employees.map((entry) => {
      const totals = monthTotals(entry, options.month, allTypes);
      const month = options.month === undefined ? "" : `${LEAVE_THAI_MONTHS[options.month - 1]} ${options.year ?? ""}`;
      return `<tr>${options.showMonth ? `<td class="center">${escapeHtml(month)}</td>` : ""}${options.showDepartment ? `<td>${escapeHtml(entry.employee.departmentName || "ไม่ระบุแผนก")}</td>` : ""}<td class="code">${escapeHtml(entry.employee.code)}</td><td class="name">${escapeHtml(entry.name)}</td>${typeCells(totals, shownTypes)}<td class="numeric">${totalDay(totals)}</td></tr>`;
    }).join("");
    const headings = [
      ...(options.showMonth ? ["เดือน"] : []), ...(options.showDepartment ? ["แผนก"] : []),
      "รหัสพนักงาน", "ชื่อ - สกุล", ...shownTypes.map((type) => `${type.name} (วัน)`), totalHeading(allTypes, shownTypes),
    ];
    const numericStart = headings.length - shownTypes.length - 1;
    const colSpan = headings.length;
    return `${chunkIndex ? `<h3 class="type-chunk-title">ประเภทวันลา ${shownTypes.map((type) => escapeHtml(type.name)).join(" · ")}</h3>` : ""}
      <table class="summary-table"><colgroup>${columns.html}</colgroup>
        <thead><tr>${headings.map((label, index) => `<th class="${index >= numericStart ? "numeric" : ""}">${escapeHtml(label)}</th>`).join("")}</tr></thead>
        <tbody>${rows || `<tr><td class="empty" colspan="${colSpan}">${escapeHtml(options.emptyLabel ?? "ไม่มีพนักงานในช่วงเวลานี้")}</td></tr>`}</tbody>
      </table>`;
  }).join("");
}

function departments(
  employees: LeaveReportEmployeeModel[],
  types: LeaveReportType[],
  options: { month?: number; year?: number; showMonth?: boolean } = {},
) {
  const groups = new Map<string, LeaveReportEmployeeModel[]>();
  for (const employee of employees) {
    const department = employee.employee.departmentName || "ไม่ระบุแผนก";
    groups.set(department, [...(groups.get(department) ?? []), employee]);
  }
  if (!groups.size) return `<section class="department">${summaryTable([], types)}</section>`;
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "th", { sensitivity: "base" }))
    .map(([name, group]) => `<section class="department"><h2 class="group-title">แผนก: ${escapeHtml(name)}</h2>${summaryTable(group, types, options)}</section>`)
    .join("");
}

function monthColumnsTable(employees: LeaveReportEmployeeModel[], model: LeaveReportModel) {
  return chunkTypes(model.types).map((shownTypes, chunkIndex) => {
    const columns = tableColumns({ month: true, typeCount: shownTypes.length });
    const rows = LEAVE_THAI_MONTHS.flatMap((label, index) => employees.length
      ? employees.map((employee, employeeIndex) => {
        const totals = employee.months.find((entry) => entry.month === index + 1)?.totals ?? emptyTotals(model.types);
        const month = employeeIndex === 0 ? `${label} ${model.year}` : "";
        return `<tr><td class="month-cell">${escapeHtml(month)}</td><td class="code">${escapeHtml(employee.employee.code)}</td><td class="name">${escapeHtml(employee.name)}</td>${typeCells(totals, shownTypes)}<td class="numeric">${totalDay(totals)}</td></tr>`;
      })
      : [`<tr><td class="month-cell">${escapeHtml(`${label} ${model.year}`)}</td><td></td><td>ไม่มีพนักงาน</td>${typeCells(emptyTotals(model.types), shownTypes)}<td class="numeric">0.0</td></tr>`]).join("");
    const headings = ["เดือน", "รหัสพนักงาน", "ชื่อ - สกุล", ...shownTypes.map((type) => `${type.name} (วัน)`), totalHeading(model.types, shownTypes)];
    const numericStart = headings.length - shownTypes.length - 1;
    return `${chunkIndex ? `<h3 class="type-chunk-title">ประเภทวันลา ${shownTypes.map((type) => escapeHtml(type.name)).join(" · ")}</h3>` : ""}
      <table class="month-columns-table"><colgroup>${columns.html}</colgroup><thead><tr>${headings.map((label, index) => `<th class="${index >= numericStart ? "numeric" : ""}">${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
}

function individualMonthColumns(employee: LeaveReportEmployeeModel, model: LeaveReportModel) {
  return chunkTypes(model.types).map((shownTypes, chunkIndex) => {
    const columns = tableColumns({ month: true, typeCount: shownTypes.length });
    const rows = employee.months.map((month) => `<tr><td class="month-cell">${escapeHtml(`${month.label} ${model.year}`)}</td><td class="code">${escapeHtml(employee.employee.code)}</td><td class="name">${escapeHtml(employee.name)}</td>${typeCells(month.totals, shownTypes)}<td class="numeric">${totalDay(month.totals)}</td></tr>`).join("");
    const headings = ["เดือน", "รหัสพนักงาน", "ชื่อ - สกุล", ...shownTypes.map((type) => `${type.name} (วัน)`), totalHeading(model.types, shownTypes)];
    const numericStart = headings.length - shownTypes.length - 1;
    return `${chunkIndex ? `<h3 class="type-chunk-title">ประเภทวันลา ${shownTypes.map((type) => escapeHtml(type.name)).join(" · ")}</h3>` : ""}
      <table class="month-columns-table"><colgroup>${columns.html}</colgroup><thead><tr>${headings.map((label, index) => `<th class="${index >= numericStart ? "numeric" : ""}">${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
}

function sessionLabel(request: LeaveReportRequest) {
  if (request.startOn !== request.endOn || request.session === "full") return "เต็มวัน";
  return request.session === "am" ? "ครึ่งวันเช้า" : "ครึ่งวันบ่าย";
}

function detailHeaderRows(report: LeaveReportDocument, employee: LeaveReportEmployeeModel, columns: number, monthLabel?: string) {
  const title = reportTitle(report.variant, report.model);
  return `<tr class="doc-title-row"><th colspan="${columns}"><h1>${escapeHtml(title)}</h1></th></tr>
    <tr class="doc-period-row"><th colspan="${columns}"><p>${escapeHtml(periodLabel(report.model))}</p></th></tr>
    ${monthLabel ? `<tr class="month-label-row"><th colspan="${columns}">${escapeHtml(monthLabel)}</th></tr>` : ""}
    <tr class="employee-heading-row"><th colspan="${columns}">${escapeHtml(employeeLabel(employee))}</th></tr>
    <tr class="employee-divider-row"><th colspan="${columns}"></th></tr>
    <tr class="detail-spacer-row"><th colspan="${columns}"></th></tr>`;
}

function detailTotals(totals: LeaveReportTotals, types: LeaveReportType[]) {
  const rows: [string, number][] = [...types.map((type) => [type.name, totalForType(totals, type.code)] as [string, number]), ["รวมวันลาทั้งหมด", totals.daysHalfUnits]];
  return `<table class="detail-totals"><colgroup><col style="width:200pt"><col style="width:100pt"></colgroup><tbody>${rows.map(([label, value], index) => {
    const grand = index === rows.length - 1;
    return `<tr class="${grand ? "grand-total" : ""}"><td>${escapeHtml(label)}</td><td class="numeric">${formatLeaveDays(value)} วัน</td></tr>`;
  }).join("")}</tbody></table>`;
}

function detailTable(report: LeaveReportDocument, requests: LeaveReportRequest[], employee: LeaveReportEmployeeModel, totals: LeaveReportTotals, monthLabel?: string) {
  const columns = `<colgroup><col style="width:50pt"><col style="width:105pt"><col style="width:85pt"><col style="width:80pt"><col style="width:60pt"><col style="width:125.28pt"><col style="width:50pt"></colgroup>`;
  const typeNames = new Map(report.model.types.map((type) => [type.code, type.name]));
  const rows = requests.map((request) => {
    const dates = request.clippedStartOn === request.clippedEndOn
      ? shortDate(request.clippedStartOn)
      : `${shortDate(request.clippedStartOn)} - ${shortDate(request.clippedEndOn)}`;
    const month = request.month ?? Number(request.clippedStartOn.slice(5, 7));
    return `<tr class="detail-row"><td class="center">${escapeHtml(LEAVE_THAI_MONTHS[month - 1])}</td><td class="center">${escapeHtml(dates)}</td><td class="center">${escapeHtml(typeNames.get(request.leaveTypeCode) ?? request.leaveTypeCode)}</td><td class="center">${escapeHtml(sessionLabel(request))}</td><td class="numeric">${formatLeaveDays(request.daysHalfUnits)}</td><td class="reason">${escapeHtml(request.reason)}</td><td class="center">อนุมัติแล้ว</td></tr>`;
  }).join("");
  return `<table class="detail-table">${columns}<thead>${detailHeaderRows(report, employee, 7, monthLabel)}
    <tr class="detail-labels"><th>เดือน</th><th>วันที่ลา</th><th>ประเภท</th><th>ช่วงเวลา</th><th>จำนวน (วัน)</th><th>เหตุผล</th><th>สถานะ</th></tr></thead>
    <tbody>${rows || `<tr><td class="empty" colspan="7">ไม่มีรายการวันลาที่อนุมัติในช่วงนี้</td></tr>`}</tbody>
    <tfoot><tr><td colspan="7">${detailTotals(totals, report.model.types)}</td></tr></tfoot></table>`;
}

function detailTotalsPage(report: LeaveReportDocument, employee: LeaveReportEmployeeModel, totals: LeaveReportTotals) {
  return `<div class="detail-final-heading"><h1>${escapeHtml(reportTitle(report.variant, report.model))}</h1><p>${escapeHtml(periodLabel(report.model))}</p><strong>${escapeHtml(employeeLabel(employee))}</strong></div>${detailTotals(totals, report.model.types)}`;
}

function reportSummary(report: LeaveReportDocument) {
  const model = report.model;
  const definition = getLeaveReportDefinition(report.variant)!;
  const employees = sortLeaveReportEmployees(model.employees, report.sortRules);
  const title = reportTitle(report.variant, model);
  const range = periodLabel(model);
  if (report.variant === "yearly-all-month-columns") {
    return `${titleOnlyHeading(title)}${monthColumnsTable(employees, model)}`;
  }
  if (report.variant === "yearly-individual-month-columns") {
    return employees.map((employee, index) => `<section class="individual-block ${index ? "page-start" : ""}">${titleOnlyHeading(title)}${individualMonthColumns(employee, model)}</section>`).join("");
  }
  if (report.variant === "yearly-all-month-pages") {
    const monthly = LEAVE_THAI_MONTHS.map((label, index) => `<section class="month-page ${index ? "page-start" : ""}">${mainHeading(title, range)}<h2 class="month-heading">${escapeHtml(label)} ${model.year}</h2>${departments(employees, model.types, { month: index + 1, year: model.year })}</section>`).join("");
    return `${monthly}<section class="month-page page-start">${mainHeading(title, range)}${departments(employees, model.types)}</section>`;
  }
  if (report.variant === "yearly-individual-month-pages") {
    return employees.flatMap((employee, employeeIndex) => {
      const monthly = LEAVE_THAI_MONTHS.map((label, index) => `<section class="month-page ${employeeIndex || index ? "page-start" : ""}">${mainHeading(title, range)}<h2 class="month-heading">${escapeHtml(label)} ${model.year}</h2>${departments([employee], model.types, { month: index + 1, year: model.year })}</section>`);
      return [...monthly, `<section class="month-page page-start">${mainHeading(title, range)}${departments([employee], model.types)}</section>`];
    }).join("");
  }
  const month = definition.period === "monthly" ? model.month ?? 1 : undefined;
  if (report.variant === "monthly-individual") {
    return employees.map((employee, index) => `<section class="individual-block ${index ? "page-start" : ""}">${mainHeading(title, range)}${departments([employee], model.types, { month, year: model.year, showMonth: true })}</section>`).join("");
  }
  if (report.variant === "yearly-individual") {
    return employees.map((employee, index) => `<section class="individual-block ${index ? "page-start" : ""}">${mainHeading(title, range)}${departments([employee], model.types)}</section>`).join("");
  }
  return `${mainHeading(title, range)}${departments(employees, model.types, { month, year: model.year })}`;
}

function reportDetails(report: LeaveReportDocument) {
  const model = report.model;
  const employees = sortLeaveReportEmployees(model.employees, report.sortRules);
  if (report.variant === "yearly-individual-month-pages-detail") {
    return employees.flatMap((employee, employeeIndex) => {
      const monthly = employee.months.map((month, monthIndex) => `<section class="detail-page ${employeeIndex || monthIndex ? "page-start" : ""}">${detailTable(report, month.requests, employee, month.totals, `${month.label} ${model.year}`)}</section>`);
      const annual = `<section class="detail-page page-start">${detailTotalsPage(report, employee, employee.totals)}</section>`;
      return [...monthly, annual];
    }).join("");
  }
  return employees.map((employee, index) => {
    const requests = report.variant.startsWith("monthly")
      ? employee.months[0]?.requests ?? []
      : report.variant === "yearly-individual-month-columns-detail"
        ? employee.months.flatMap((month) => month.requests)
        : employee.requests;
    const totals = report.variant.startsWith("monthly") ? employee.months[0]?.totals ?? emptyTotals(model.types) : employee.totals;
    return `<section class="detail-page ${index ? "page-start" : ""}">${detailTable(report, requests, employee, totals)}</section>`;
  }).join("");
}

function styles() {
  return `*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:THSarabunNew,sans-serif;font-size:12pt;line-height:1.2;color:#000;background:#fff}main{width:100%}
    .document-heading{text-align:center;margin:0 0 32.2pt}.document-heading.compact{margin-bottom:26.2pt}.document-heading.title-only{margin-bottom:33.2pt}.document-heading h1{font-size:18pt;line-height:1.2;font-weight:700;margin:0 0 1pt}.document-heading .period{font-size:14pt;font-weight:400;line-height:1.15;margin:0}.month-heading{font-size:14pt;line-height:1.2;font-weight:700;margin:0 0 14pt}
    .department{margin:0 0 11.414pt;break-inside:auto}.group-title{font-size:14pt;line-height:1.2;font-weight:700;color:#37474f;margin:0 0 4pt}.type-chunk-title{font-size:11pt;font-weight:700;line-height:1.2;margin:9pt 0 3pt}
    .summary-table,.month-columns-table,.detail-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0}.summary-table th,.month-columns-table th{height:23.612pt;background:#37474f;color:#fff;font-size:12pt;line-height:1.1;font-weight:700;text-align:center;vertical-align:middle;padding:3.7pt 3pt;border:.5pt solid #bdbdbd;overflow-wrap:anywhere}.summary-table td,.month-columns-table td{height:23.612pt;font-size:12pt;line-height:1.1;font-weight:400;vertical-align:middle;padding:3.7pt 4pt;border:.5pt solid #bdbdbd;overflow-wrap:anywhere}.summary-table .code,.month-columns-table .code{white-space:nowrap}.summary-table .name,.month-columns-table .name{white-space:normal;overflow-wrap:anywhere}.summary-table td.numeric,.month-columns-table td.numeric{font-weight:400}.numeric{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}th.numeric{text-align:center;white-space:normal}.center{text-align:center}.month-cell{text-align:center}.empty{text-align:center!important;padding:9pt!important}.month-columns-table th{white-space:normal}.month-columns-table td.name{white-space:normal}
    .detail-page{width:100%;break-inside:auto}.detail-table th{font-size:10pt;line-height:1;vertical-align:middle;text-align:center;padding:2pt 2pt;border:.5pt solid #bdbdbd}.detail-table td{font-size:10pt;line-height:1.18;padding:2.2pt 2.5pt;border:.5pt solid #bdbdbd;vertical-align:middle}.detail-table .doc-title-row th{background:#fff;color:#111;border:0;padding:10pt 0 0;height:32pt}.detail-table .doc-title-row h1{font-family:THSarabunNew,sans-serif;font-size:18pt;font-weight:700;line-height:22pt;margin:0}.detail-table .doc-period-row th{background:#fff;color:#111;border:0;height:16.85pt;padding:0;font-weight:400}.detail-table .doc-period-row p{font-size:14pt;font-weight:400;line-height:16.85pt;margin:0}.detail-table .employee-heading-row th{background:#fff;color:#111;border:0;height:23pt;padding:0;font-size:16pt;font-weight:700;line-height:20pt}.detail-table .employee-divider-row th{height:7.3pt;padding:0;border:0;border-bottom:1pt solid #111;background:#fff}.detail-table .detail-spacer-row th{height:17.5pt;padding:0;border:0;background:#fff}.detail-table .month-label-row th{background:#fff;color:#111;border:0;height:18pt;padding:0;font-size:14pt;font-weight:700}.detail-table .detail-labels th{height:20pt;background:#37474f;color:#fff;font-weight:700}.detail-table td.reason{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;vertical-align:top;text-align:left}.detail-table td.center,.detail-table td.numeric,.detail-totals td.numeric{text-align:center}.detail-table tr.detail-row,.detail-table tr.detail-row td{break-inside:auto;page-break-inside:auto}.detail-table>tfoot>tr>td{border:0;padding:0;background:#fff}.detail-totals{width:300pt;margin:15pt auto 0;border-collapse:collapse;table-layout:fixed;break-inside:avoid;page-break-inside:avoid}.detail-totals td{height:25.01pt;border:.5pt solid #bdbdbd;font-size:10pt;line-height:1.1;padding:3pt 5pt}.detail-totals td:first-child{font-weight:700}.detail-totals .grand-total td{background:#eee;font-weight:700}.detail-final-heading{text-align:center;font-size:14pt;line-height:1.2;margin-bottom:8pt;border-bottom:1pt solid #111;padding-bottom:8pt}.detail-final-heading h1{font-size:18pt;line-height:1.2;margin:0 0 1pt}.detail-final-heading p{font-size:14pt;font-weight:400;line-height:1.15;margin:0 0 3pt}.detail-final-heading strong{font-size:16pt}.month-label-row th{font-size:14pt;font-weight:700}
    .page-start{break-before:page;page-break-before:always}@media print{thead{display:table-header-group}tfoot{display:table-row-group}.page-start{break-before:page;page-break-before:always}.department,.detail-page{break-inside:auto}.detail-table tr.detail-row,.detail-table tr.detail-row td{break-inside:auto;page-break-inside:auto}}`;
}

function pageHeader(model: LeaveReportModel, fontRegularBase64: string, fontBoldBase64: string) {
  const fontCss = `<style>@font-face{font-family:THSarabunNew;src:url(data:font/ttf;base64,${fontRegularBase64})}@font-face{font-family:THSarabunNew;src:url(data:font/ttf;base64,${fontBoldBase64});font-weight:700}</style>`;
  const updated = generatedAtLabel(model.generatedAt);
  return `${fontCss}<div style="font-family:THSarabunNew,sans-serif;box-sizing:border-box;width:100%;margin:0;padding:7.5pt 20pt 0;display:flex;align-items:center;color:#616161;font-size:10pt;line-height:1;white-space:nowrap"><span style="width:33.333%;text-align:left">${escapeHtml(updated)}</span><span style="width:33.333%;text-align:center;color:#616161;font-size:14pt;font-weight:700">${escapeHtml(COMPANY)}</span><span style="width:33.333%;text-align:right">หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}

export function createLeaveReportMarkup(report: LeaveReportDocument, fontRegularBase64: string, fontBoldBase64: string): LeaveReportMarkup {
  const definition = getLeaveReportDefinition(report.variant)!;
  const body = definition.detail ? reportDetails(report) : reportSummary(report);
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
    @font-face{font-family:THSarabunNew;src:url(data:font/ttf;base64,${fontRegularBase64})}@font-face{font-family:THSarabunNew;font-weight:700;src:url(data:font/ttf;base64,${fontBoldBase64})}
    ${styles()}
  </style></head><body><main>${body || `<p class="empty">ไม่มีข้อมูลในช่วงเวลานี้</p>`}</main></body></html>`;
  const footerTemplate = `<div style="font-family:THSarabunNew,sans-serif;width:100%"></div>`;
  return { html, headerTemplate: pageHeader(report.model, fontRegularBase64, fontBoldBase64), footerTemplate };
}
