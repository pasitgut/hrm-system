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

export type LeaveReportDocument = {
  variant: LeaveReportVariant;
  model: LeaveReportModel;
  sortRules: readonly LeaveReportSortRule[];
};

export type LeaveReportMarkup = { html: string; headerTemplate: string; footerTemplate: string };

const COMPANY = "บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด";
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

function localDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${LEAVE_THAI_MONTHS[month - 1]} ${year}`;
}

function bangkokDateTime(value: string) {
  const date = new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  const time = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  return `${day}/${month}/${year} ${time}`;
}

function totalForType(totals: LeaveReportTotals, code: string) {
  return totals.byType[code] ?? 0;
}

function totalDay(totals: LeaveReportTotals) {
  return formatLeaveDays(totals.daysHalfUnits);
}

function totalsStrip(totals: LeaveReportTotals, types: LeaveReportType[], label = "รวมวันลา") {
  const cells = types.map((type) => `<span>${escapeHtml(type.name)} <b>${formatLeaveDays(totalForType(totals, type.code))}</b></span>`).join("");
  return `<div class="totals-strip"><strong>${escapeHtml(label)}</strong>${cells}<span class="total">รวม <b>${totalDay(totals)}</b> วัน</span></div>`;
}

function employeeInfo(entry: LeaveReportEmployeeModel) {
  return `<div class="employee-info"><strong>${escapeHtml(entry.name)}</strong><span>รหัส ${escapeHtml(entry.employee.code)}</span><span>${escapeHtml(entry.employee.departmentName || "ไม่ระบุแผนก")}</span></div>`;
}

function chunkTypes(types: LeaveReportType[], size = 3) {
  if (!types.length) return [[] as LeaveReportType[]];
  const chunks: LeaveReportType[][] = [];
  for (let index = 0; index < types.length; index += size) chunks.push(types.slice(index, index + size));
  return chunks;
}

function typeHeaders(types: LeaveReportType[]) {
  return types.map((type) => `<th class="numeric type-col">${escapeHtml(type.name)} (วัน)</th>`).join("");
}

function totalHeading(allTypes: LeaveReportType[], shownTypes: LeaveReportType[]) {
  return allTypes.length > shownTypes.length ? "รวมทุกประเภท (วัน)" : "รวม (วัน)";
}

function typeCells(totals: LeaveReportTotals, types: LeaveReportType[]) {
  return types.map((type) => {
    const value = totalForType(totals, type.code);
    return `<td class="numeric">${value ? formatLeaveDays(value) : ""}</td>`;
  }).join("");
}

function summaryTable(employees: LeaveReportEmployeeModel[], types: LeaveReportType[], title?: string) {
  const chunks = chunkTypes(types);
  const tables = chunks.map((chunk, chunkIndex) => {
    const rows = employees.map((entry) => {
      return `<tr><td class="code">${escapeHtml(entry.employee.code)}</td><td class="name">${escapeHtml(entry.name)}</td>${typeCells(entry.totals, chunk)}<td class="numeric total">${totalDay(entry.totals)}</td></tr>`;
    }).join("");
    const noRows = !rows ? `<tr><td colspan="${3 + chunk.length}" class="empty">ไม่มีพนักงานในช่วงเวลานี้</td></tr>` : rows;
    return `${chunkIndex ? `<h4 class="type-chunk-title">ประเภทวันลา ${chunk.map((type) => escapeHtml(type.name)).join(" · ")}</h4>` : ""}
      <table class="summary-table"><colgroup><col style="width:11%"><col style="width:41%">${chunk.map(() => `<col style="width:${48 / (chunk.length + 1)}%">`).join("")}<col style="width:${48 / (chunk.length + 1)}%"></colgroup>
      <thead><tr><th>รหัสพนักงาน</th><th>ชื่อ - สกุล</th>${typeHeaders(chunk)}<th class="numeric">${totalHeading(types, chunk)}</th></tr></thead><tbody>${noRows}</tbody></table>`;
  }).join("");
  return `${title ? `<h3 class="group-title">${escapeHtml(title)}</h3>` : ""}${tables}`;
}

function departments(employees: LeaveReportEmployeeModel[], types: LeaveReportType[], month?: number) {
  const groups = new Map<string, LeaveReportEmployeeModel[]>();
  for (const employee of employees) {
    const department = employee.employee.departmentName || "ไม่ระบุแผนก";
    groups.set(department, [...(groups.get(department) ?? []), employee]);
  }
  if (!groups.size) return summaryTable([], types, "พนักงานทั้งหมด");
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "th", { sensitivity: "base" }))
    .map(([name, group]) => {
      const rows = month === undefined ? group : group.map((entry) => ({
        ...entry,
        totals: entry.months.find((item) => item.month === month)?.totals ?? entry.totals,
      }));
      return summaryTable(rows, types, `แผนก: ${name}`);
    }).join("");
}

function emptyTotals(types: LeaveReportType[]): LeaveReportTotals {
  return { daysHalfUnits: 0, byType: Object.fromEntries(types.map((type) => [type.code, 0])), requestCount: 0 };
}

function monthlyTotals(employees: LeaveReportEmployeeModel[], month: number, types: LeaveReportType[]) {
  const totals = emptyTotals(types);
  for (const employee of employees) {
    const monthTotals = employee.months.find((item) => item.month === month)?.totals;
    if (!monthTotals) continue;
    totals.daysHalfUnits += monthTotals.daysHalfUnits;
    totals.requestCount += monthTotals.requestCount;
    for (const type of types) totals.byType[type.code] += monthTotals.byType[type.code] ?? 0;
  }
  return totals;
}

function employeeSummary(employee: LeaveReportEmployeeModel, types: LeaveReportType[], heading: string, pageStart = false) {
  return `<section class="employee-block ${pageStart ? "page-start" : ""}">${employeeInfo(employee)}<h2 class="section-title">${escapeHtml(heading)}</h2>${summaryTable([employee], types)}${totalsStrip(employee.totals, types)}</section>`;
}

function monthColumnsTable(employees: LeaveReportEmployeeModel[], model: LeaveReportModel) {
  const months = model.employees[0]?.months ?? LEAVE_THAI_MONTHS.map((label, index) => ({ month: index + 1, label, totals: emptyTotals(model.types), requests: [] }));
  return chunkTypes(model.types).map((chunk, chunkIndex) => {
    const rows = months.flatMap((month) => employees.length
      ? employees.map((entry) => {
        const totals = entry.months.find((item) => item.month === month.month)?.totals ?? emptyTotals(model.types);
        return `<tr><td>${escapeHtml(month.label)} ${model.year}</td><td>${escapeHtml(entry.employee.departmentName)}</td><td>${escapeHtml(entry.employee.code)}</td><td>${escapeHtml(entry.name)}</td>${typeCells(totals, chunk)}<td class="numeric total">${totalDay(totals)}</td></tr>`;
      })
      : [`<tr><td>${escapeHtml(month.label)} ${model.year}</td><td>—</td><td>—</td><td>ไม่มีพนักงาน</td>${chunk.map(() => `<td></td>`).join("")}<td class="numeric total">0</td></tr>`]).join("");
    const codeWidth = 8;
    const nameWidth = 25;
    const firstWidths = [9, 15, codeWidth, nameWidth];
    const left = 100 - firstWidths.reduce((sum, width) => sum + width, 0);
    const perTypeWidth = left / (chunk.length + 1);
    return `${chunkIndex ? `<h3 class="section-title">ประเภทวันลา ${chunk.map((type) => escapeHtml(type.name)).join(" · ")}</h3>` : ""}<table class="month-columns-table"><colgroup>${firstWidths.map((width) => `<col style="width:${width}%">`).join("")}${chunk.map(() => `<col style="width:${perTypeWidth}%">`).join("")}<col style="width:${perTypeWidth}%"></colgroup><thead><tr><th>เดือน</th><th>แผนก</th><th>รหัส</th><th>ชื่อ - สกุล</th>${typeHeaders(chunk)}<th class="numeric">${totalHeading(model.types, chunk)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
}

function individualMonthColumns(employee: LeaveReportEmployeeModel, model: LeaveReportModel) {
  return chunkTypes(model.types).map((chunk, chunkIndex) => {
    const rows = employee.months.map((month) => `<tr><td>${escapeHtml(month.label)} ${model.year}</td>${typeCells(month.totals, chunk)}<td class="numeric total">${totalDay(month.totals)}</td></tr>`).join("");
    return `${chunkIndex ? `<h3 class="type-chunk-title">ประเภทวันลา ${chunk.map((type) => escapeHtml(type.name)).join(" · ")}</h3>` : ""}<table class="month-columns-table"><colgroup><col style="width:28%">${chunk.map(() => `<col style="width:${72 / (chunk.length + 1)}%">`).join("")}<col style="width:${72 / (chunk.length + 1)}%"></colgroup><thead><tr><th>เดือน</th>${typeHeaders(chunk)}<th class="numeric">${totalHeading(model.types, chunk)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
}

function formatDateRange(request: LeaveReportRequest) {
  if (request.clippedStartOn === request.clippedEndOn) return localDateLabel(request.clippedStartOn);
  return `${localDateLabel(request.clippedStartOn)} - ${localDateLabel(request.clippedEndOn)}`;
}

function sessionLabel(request: LeaveReportRequest) {
  if (request.startOn !== request.endOn || request.session === "full") return "เต็มวัน";
  return request.session === "am" ? "ครึ่งวันเช้า" : "ครึ่งวันบ่าย";
}

function detailTable(requests: LeaveReportRequest[], employee: LeaveReportEmployeeModel, types: LeaveReportType[], withMonth = false) {
  const typeNames = new Map(types.map((type) => [type.code, type.name]));
  const columns = withMonth
    ? `<col style="width:11%"><col style="width:18%"><col style="width:17%"><col style="width:12%"><col style="width:10%"><col style="width:32%">`
    : `<col style="width:20%"><col style="width:20%"><col style="width:13%"><col style="width:12%"><col style="width:35%">`;
  const rows = requests.map((request) => `<tr class="detail-row">${withMonth ? `<td>${escapeHtml(LEAVE_THAI_MONTHS[(request.month ?? Number(request.clippedStartOn.slice(5, 7))) - 1])}</td>` : ""}<td>${escapeHtml(formatDateRange(request))}</td><td>${escapeHtml(typeNames.get(request.leaveTypeCode) ?? request.leaveTypeCode)}</td><td>${escapeHtml(sessionLabel(request))}</td><td class="numeric">${formatLeaveDays(request.daysHalfUnits)}</td><td class="reason">${escapeHtml(request.reason)}</td></tr>`).join("");
  const monthHead = withMonth ? "<th>เดือน</th>" : "";
  const colspan = withMonth ? 6 : 5;
  return `<table class="detail-table ${withMonth ? "with-month" : ""}"><colgroup>${columns}</colgroup><thead><tr class="repeat-employee"><th colspan="${colspan}">${escapeHtml(employee.name)} · รหัส ${escapeHtml(employee.employee.code)} · ${escapeHtml(employee.employee.departmentName)}</th></tr><tr>${monthHead}<th>วันที่ลา</th><th>ประเภท</th><th>ช่วงเวลา</th><th class="numeric">จำนวน (วัน)</th><th>เหตุผล</th></tr></thead><tbody>${rows || `<tr><td colspan="${colspan}" class="empty">ไม่มีรายการวันลาที่อนุมัติในช่วงนี้</td></tr>`}</tbody></table>`;
}

function annualPagesAll(employees: LeaveReportEmployeeModel[], model: LeaveReportModel) {
  const monthSections = LEAVE_THAI_MONTHS.map((label, index) => {
    const month = index + 1;
    const totals = monthlyTotals(employees, month, model.types);
    return `<section class="month-section ${index ? "page-start" : ""}"><h2 class="section-title">${label} ${model.year}</h2>${departments(employees, model.types, month)}${totalsStrip(totals, model.types, `รวมเดือน ${label}`)}</section>`;
  }).join("");
  return `${monthSections}<section class="annual-summary page-start"><h2 class="section-title">สรุปทั้งปี ${model.year}</h2>${departments(employees, model.types)}${totalsStrip(model.totals, model.types, "รวมทั้งปี")}</section>`;
}

function annualPagesIndividual(employees: LeaveReportEmployeeModel[], model: LeaveReportModel, detailed: boolean) {
  return employees.map((employee, employeeIndex) => {
    const months = employee.months.map((month, monthIndex) => `<section class="month-section ${monthIndex ? "page-start" : ""}">${employeeInfo(employee)}<h2 class="section-title">${escapeHtml(month.label)} ${model.year}</h2>${detailed ? detailTable(month.requests, employee, model.types) : summaryTable([monthEmployee(employee, month)], model.types)}${totalsStrip(month.totals, model.types, `รวมเดือน ${month.label}`)}</section>`).join("");
    const annual = `<section class="annual-summary page-start">${employeeInfo(employee)}<h2 class="section-title">สรุปทั้งปี ${model.year}</h2>${totalsStrip(employee.totals, model.types, "รวมทั้งปี")}</section>`;
    return `<section class="employee-report ${employeeIndex ? "page-start" : ""}">${months}${annual}</section>`;
  }).join("");
}

function monthEmployee(employee: LeaveReportEmployeeModel, month: LeaveReportMonth): LeaveReportEmployeeModel {
  return { ...employee, totals: month.totals, months: [month], requests: month.requests };
}

function reportBody(report: LeaveReportDocument) {
  const model = report.model;
  const definition = getLeaveReportDefinition(report.variant)!;
  const employees = sortLeaveReportEmployees(model.employees, report.sortRules);
  if (report.variant === "yearly-all-month-columns") return monthColumnsTable(employees, model) + totalsStrip(model.totals, model.types, "รวมทั้งปี");
  if (report.variant === "yearly-all-month-pages") return annualPagesAll(employees, model);
  if (report.variant === "yearly-individual-month-pages" || report.variant === "yearly-individual-month-pages-detail") {
    return annualPagesIndividual(employees, model, definition.detail);
  }
  if (definition.detail) {
    return employees.map((employee, index) => {
      const withMonth = report.variant === "yearly-individual-month-columns-detail";
      const requests = report.variant.startsWith("monthly")
        ? employee.months[0]?.requests ?? []
        : withMonth ? employee.months.flatMap((month) => month.requests) : employee.requests;
      return `<section class="employee-block ${index ? "page-start" : ""}">${employeeInfo(employee)}<h2 class="section-title">รายละเอียดวันลา ${escapeHtml(model.periodLabel)}</h2>${detailTable(requests, employee, model.types, withMonth)}${totalsStrip(employee.totals, model.types)}</section>`;
    }).join("");
  }
  if (definition.scope === "individual") {
    if (report.variant === "yearly-individual-month-columns") {
      return employees.map((employee, index) => `<section class="employee-block ${index ? "page-start" : ""}">${employeeInfo(employee)}<h2 class="section-title">สรุปรายเดือน ปี ${model.year}</h2>${individualMonthColumns(employee, model)}${totalsStrip(employee.totals, model.types, "รวมทั้งปี")}</section>`).join("");
    }
    return employees.map((employee, index) => employeeSummary(employee, model.types, model.periodLabel, index > 0)).join("");
  }
  return definition.period === "monthly"
    ? departments(employees, model.types)
    : departments(employees, model.types) + totalsStrip(model.totals, model.types);
}

function reportTitle(variant: LeaveReportVariant, model: LeaveReportModel) {
  return variant.startsWith("monthly")
    ? `รายงานวันลา (เดือน ${LEAVE_THAI_MONTHS[(model.month ?? 1) - 1]} ${model.year})`
    : `รายงานวันลา (ปี ${model.year})`;
}

function styles() {
  return `*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Thai,sans-serif;font-size:10px;line-height:1.45;color:#202a35;background:#fff}main{width:100%}.document-heading{text-align:center;margin:0 0 30px;padding:4px 0 0}.document-heading h1{font-size:16px;line-height:1.35;margin:0 0 4px;font-weight:700}.period{font-size:10px;margin:0;color:#34434c}.section-title{font-size:12px;margin:10px 0 7px}.group-title{font-size:10px;font-weight:700;margin:11px 0 4px}.type-chunk-title{font-size:9px;margin:8px 0 4px;color:#475467}.employee-info{display:flex;align-items:baseline;flex-wrap:wrap;gap:3px 12px;border-bottom:1px solid #cfd5dc;padding:0 0 6px;margin:0 0 8px}.employee-info strong{font-size:11px}.employee-info span{color:#667085;font-size:9px}.totals-strip{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 10px;margin:8px 0 12px;padding:6px 8px;border:1px solid #cfd5dc;background:#f6f7f8;font-size:9px;page-break-inside:avoid;break-inside:avoid}.totals-strip .total{font-weight:700}.totals-strip b{font-variant-numeric:tabular-nums}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 8px}thead{display:table-header-group}th,td{border:1px solid #cfd5dc;padding:4px 5px;vertical-align:top;overflow-wrap:anywhere}th{background:#34434c;color:white;font-size:10px;font-weight:700;text-align:center}td{font-size:10px}.summary-table .name{overflow-wrap:anywhere}.numeric{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}th.numeric{text-align:center;white-space:normal}.total{font-weight:700}.empty{text-align:center!important;color:#667085;padding:12px}.month-columns-table th{font-size:9px}.detail-table .repeat-employee th{background:#f1f4f7;color:#202a35;font-size:10px}.detail-table .repeat-employee th{border-bottom:0}.detail-table thead tr:nth-child(2) th{border-top:0}.detail-row{page-break-inside:auto;break-inside:auto}.detail-row td{page-break-inside:auto;break-inside:auto}.reason{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}.page-start{break-before:page;page-break-before:always}.data-note{font-size:8px;color:#667085;border-top:1px solid #e4e7eb;padding-top:5px;margin:14px 0 0}@media print{.page-start{break-before:page;page-break-before:always}thead{display:table-header-group}.detail-row,.detail-row td{page-break-inside:auto;break-inside:auto}}`;
}

export function createLeaveReportMarkup(report: LeaveReportDocument, fontRegularBase64: string, fontBoldBase64: string): LeaveReportMarkup {
  const title = reportTitle(report.variant, report.model);
  const range = `ตั้งแต่วันที่ ${localDateLabel(report.model.periodStart)} ถึงวันที่ ${localDateLabel(report.model.periodEnd)}`;
  const updated = `ข้อมูล ณ วันที่: ${bangkokDateTime(report.model.generatedAt)}`;
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>@font-face{font-family:Thai;src:url(data:font/ttf;base64,${fontRegularBase64})}@font-face{font-family:Thai;font-weight:700;src:url(data:font/ttf;base64,${fontBoldBase64})}${styles()}</style></head><body><main><div class="document-heading"><h1>${escapeHtml(title)}</h1><p class="period">${escapeHtml(range)}</p></div>${reportBody(report) || `<p class="empty">ไม่มีข้อมูลในช่วงเวลานี้</p>`}<p class="data-note">แสดงรายการวันลาที่อนุมัติแล้ว คำนวณตามวันปฏิทินและแบ่งรายการที่คร่อมเดือนหรือปีตามวันที่ในแต่ละช่วง</p></main></body></html>`;
  const fontCss = `<style>@font-face{font-family:Thai;src:url(data:font/ttf;base64,${fontRegularBase64})}@font-face{font-family:Thai;src:url(data:font/ttf;base64,${fontBoldBase64});font-weight:700}</style>`;
  const headerTemplate = `${fontCss}<div style="font-family:Thai,sans-serif;font-size:9px;width:100%;padding:0 10mm;color:#667085;display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center"><span>${escapeHtml(updated)}</span><span style="text-align:center;color:#34434c;font-weight:700">${escapeHtml(COMPANY)}</span><span style="text-align:right;white-space:nowrap">หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
  const footerTemplate = "<div></div>";
  return { html, headerTemplate, footerTemplate };
}
