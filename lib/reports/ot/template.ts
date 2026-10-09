import {
  bangkokParts,
  formatBangkokDate,
  formatOtHours,
  THAI_MONTHS,
  type OtReportEmployeeModel,
  type OtReportModel,
  type OtReportMonth,
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

export type OtReportMarkup = {
  html: string;
  headerTemplate: string;
  footerTemplate: string;
};

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

function localDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${THAI_MONTHS[month - 1]} ${year}`;
}

function prettyGeneratedAt(value: string) {
  const date = new Date(value);
  const part = bangkokParts(date);
  return `${formatBangkokDate(date)} ${String(part.hour).padStart(2, "0")}:${String(part.minute).padStart(2, "0")}`;
}

function totalsCells(totals: OtReportTotals) {
  return `<td class="numeric">${formatOtHours(totals.weekdayMs)}</td>
    <td class="numeric">${formatOtHours(totals.holidayMs)}</td>
    <td class="numeric">${formatOtHours(totals.unknownMs)}</td>
    <td class="numeric total">${formatOtHours(totals.totalMs)}</td>`;
}

function totalsSummary(totals: OtReportTotals, label = "รวม OT ที่อนุมัติ") {
  return `<div class="totals-strip"><span>${escapeHtml(label)}</span>
    <span>${escapeHtml(OT_REPORT_LABELS.weekdays)} <b>${formatOtHours(totals.weekdayMs)}</b> ชม.</span>
    <span>${escapeHtml(OT_REPORT_LABELS.holidays)} <b>${formatOtHours(totals.holidayMs)}</b> ชม.</span>
    <span>${escapeHtml(OT_REPORT_LABELS.unknown)} <b>${formatOtHours(totals.unknownMs)}</b> ชม.</span>
    <span class="total">${escapeHtml(OT_REPORT_LABELS.total)} <b>${formatOtHours(totals.totalMs)}</b> ชม.</span>
  </div>`;
}

function employeeInfo(employee: OtReportEmployeeModel) {
  return `<div class="employee-meta"><strong>${escapeHtml(employee.name)}</strong>
    <span>รหัส ${escapeHtml(employee.employee.code)}</span>
    <span>${escapeHtml(employee.employee.departmentName || "ไม่ระบุแผนก")}</span>
    <span>${escapeHtml(employee.employee.positionName || "ไม่ระบุตำแหน่ง")}</span></div>`;
}

function employeeSummaryTable(employees: OtReportEmployeeModel[], title?: string) {
  const rows = employees.map((entry) => `<tr>
    <td class="code">${escapeHtml(entry.employee.code)}</td>
    <td>${escapeHtml(entry.name)}</td>
    ${totalsCells(entry.totals)}
  </tr>`).join("");
  return `${title ? `<h3 class="group-title">${escapeHtml(title)}</h3>` : ""}
    <table class="summary-table">
      <thead><tr><th class="code">รหัสพนักงาน</th><th>ชื่อ - สกุล</th><th class="numeric">${escapeHtml(OT_REPORT_LABELS.weekdays)} (ชม.)</th><th class="numeric">${escapeHtml(OT_REPORT_LABELS.holidays)} (ชม.)</th><th class="numeric">${escapeHtml(OT_REPORT_LABELS.unknown)} (ชม.)</th><th class="numeric">รวม (ชม.)</th></tr></thead>
      <tbody>${rows || `<tr><td class="empty" colspan="6">ไม่มีพนักงานในช่วงเวลานี้</td></tr>`}</tbody>
    </table>`;
}

function departmentSections(employees: OtReportEmployeeModel[]) {
  if (!employees.length) return employeeSummaryTable([], "ไม่มีพนักงานในช่วงเวลานี้");
  const groups = new Map<string, OtReportEmployeeModel[]>();
  for (const employee of employees) {
    const name = employee.employee.departmentName || "ไม่ระบุแผนก";
    groups.set(name, [...(groups.get(name) ?? []), employee]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "th", { sensitivity: "base" }))
    .map(([department, group]) => employeeSummaryTable(group, `แผนก: ${department}`))
    .join("");
}

function monthEmployeeSummaryTable(employees: OtReportEmployeeModel[], month: OtReportMonth, title?: string) {
  const rows = employees.map((entry) => {
    const totals = entry.months.find((item) => item.month === month.month)?.totals ?? {
      weekdayMs: 0, holidayMs: 0, unknownMs: 0, totalMs: 0, requestCount: 0,
    };
    return `<tr><td class="code">${escapeHtml(entry.employee.code)}</td><td>${escapeHtml(entry.name)}</td>${totalsCells(totals)}</tr>`;
  }).join("");
  return `${title ? `<h3 class="group-title">${escapeHtml(title)}</h3>` : ""}
    <table class="summary-table">
      <thead><tr><th class="code">รหัสพนักงาน</th><th>ชื่อ - สกุล</th><th class="numeric">${escapeHtml(OT_REPORT_LABELS.weekdays)} (ชม.)</th><th class="numeric">${escapeHtml(OT_REPORT_LABELS.holidays)} (ชม.)</th><th class="numeric">${escapeHtml(OT_REPORT_LABELS.unknown)} (ชม.)</th><th class="numeric">รวม (ชม.)</th></tr></thead>
      <tbody>${rows || `<tr><td class="empty" colspan="6">ไม่มีพนักงานในช่วงเวลานี้</td></tr>`}</tbody>
    </table>`;
}

function departmentMonthSections(employees: OtReportEmployeeModel[], month: OtReportMonth) {
  if (!employees.length) return monthEmployeeSummaryTable([], month, "ไม่มีพนักงานในช่วงเวลานี้");
  const groups = new Map<string, OtReportEmployeeModel[]>();
  for (const employee of employees) {
    const name = employee.employee.departmentName || "ไม่ระบุแผนก";
    groups.set(name, [...(groups.get(name) ?? []), employee]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "th", { sensitivity: "base" }))
    .map(([department, group]) => monthEmployeeSummaryTable(group, month, `แผนก: ${department}`))
    .join("");
}

function monthlyTotals(employees: OtReportEmployeeModel[], monthNumber: number): OtReportTotals {
  const totals: OtReportTotals = { weekdayMs: 0, holidayMs: 0, unknownMs: 0, totalMs: 0, requestCount: 0 };
  for (const employee of employees) {
    const source = employee.months.find((item) => item.month === monthNumber)?.totals;
    if (!source) continue;
    totals.weekdayMs += source.weekdayMs;
    totals.holidayMs += source.holidayMs;
    totals.unknownMs += source.unknownMs;
    totals.totalMs += source.totalMs;
    totals.requestCount += source.requestCount;
  }
  return totals;
}

function monthColumnTable(employees: OtReportEmployeeModel[], year: number) {
  const months = employees[0]?.months ?? THAI_MONTHS.map((label, index) => ({
    month: index + 1, label,
    totals: { weekdayMs: 0, holidayMs: 0, unknownMs: 0, totalMs: 0, requestCount: 0 },
    requests: [],
  }));
  const rows = months.flatMap((month) => employees.length
    ? employees.map((employee) => {
      const totals = employee.months.find((item) => item.month === month.month)?.totals ?? {
        weekdayMs: 0, holidayMs: 0, unknownMs: 0, totalMs: 0, requestCount: 0,
      };
      return `<tr><td>${escapeHtml(month.label)} ${year}</td>
        <td class="code">${escapeHtml(employee.employee.code)}</td><td>${escapeHtml(employee.name)}</td>
        <td class="numeric">${formatOtHours(totals.weekdayMs)}</td><td class="numeric">${formatOtHours(totals.holidayMs)}</td><td class="numeric">${formatOtHours(totals.unknownMs)}</td><td class="numeric total">${formatOtHours(totals.totalMs)}</td>
      </tr>`;
    })
    : [`<tr><td>${escapeHtml(month.label)} ${year}</td><td>—</td><td>ไม่มีพนักงาน</td><td class="numeric">0.0</td><td class="numeric">0.0</td><td class="numeric">0.0</td><td class="numeric total">0.0</td></tr>`]).join("");
  return `<table class="month-columns-table">
    <thead><tr><th>เดือน</th><th class="code">รหัส</th><th>ชื่อ - สกุล</th><th class="numeric">${escapeHtml(OT_REPORT_LABELS.weekdays)}</th><th class="numeric">${escapeHtml(OT_REPORT_LABELS.holidays)}</th><th class="numeric">${escapeHtml(OT_REPORT_LABELS.unknown)}</th><th class="numeric">รวม (ชม.)</th></tr></thead>
    <tbody>${rows || `<tr><td class="empty" colspan="7">ไม่มีพนักงานในช่วงเวลานี้</td></tr>`}</tbody>
  </table>`;
}

function individualMonthColumnTable(employee: OtReportEmployeeModel, year: number) {
  const rows = employee.months.map((month) => `<tr>
    <td>${escapeHtml(month.label)} ${year}</td>${totalsCells(month.totals)}
  </tr>`).join("");
  return `<table class="summary-table">
    <thead><tr><th>เดือน</th><th class="numeric">${escapeHtml(OT_REPORT_LABELS.weekdays)} (ชม.)</th><th class="numeric">${escapeHtml(OT_REPORT_LABELS.holidays)} (ชม.)</th><th class="numeric">${escapeHtml(OT_REPORT_LABELS.unknown)} (ชม.)</th><th class="numeric">รวม (ชม.)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function requestRows(requests: OtReportRequest[], withMonth: boolean) {
  return requests.map((request) => {
    const month = withMonth ? `<td class="month-cell">${escapeHtml(THAI_MONTHS[request.month - 1])}</td>` : "";
    const date = request.endDate !== request.startDate
      ? `${localDateLabel(request.startDate)} - ${localDateLabel(request.endDate)}`
      : localDateLabel(request.startDate);
    const time = request.endDate !== request.startDate
      ? `${request.startTime} - ${localDateLabel(request.endDate)} ${request.endTime}`
      : `${request.startTime} - ${request.endTime}`;
    const type = request.overtimeType === "weekday" ? OT_REPORT_LABELS.weekdays
      : request.overtimeType === "holiday" ? OT_REPORT_LABELS.holidays : OT_REPORT_LABELS.unknown;
    const typeClass = request.overtimeType === "unknown" ? "type-unknown" : "";
    return `<tr class="detail-row">${month}<td class="date-cell">${escapeHtml(date)}</td><td class="time-cell">${escapeHtml(time)}</td><td class="${typeClass}">${escapeHtml(type)}</td><td class="numeric">${formatOtHours(request.durationMs)}</td><td class="reason">${escapeHtml(request.reason)}</td></tr>`;
  }).join("");
}

function detailTable(requests: OtReportRequest[], employee: OtReportEmployeeModel, withMonth = false) {
  const rows = requestRows(requests, withMonth);
  const colspan = withMonth ? 6 : 5;
  const monthHeader = withMonth ? "<th class=\"month-cell\">เดือน</th>" : "";
  const widths = withMonth ? ["12%", "16%", "17%", "13%", "12%", "30%"] : ["17%", "18%", "13%", "12%", "40%"];
  const columns = `<colgroup>${widths.map((width) => `<col style="width:${width}">`).join("")}</colgroup>`;
  return `<table class="detail-table ${withMonth ? "with-month" : ""}">
    ${columns}
    <thead><tr class="repeat-employee"><th colspan="${colspan}">${escapeHtml(employee.employee.code)} · ${escapeHtml(employee.name)}</th></tr>
      <tr>${monthHeader}<th>วันที่</th><th>เวลา OT</th><th>ประเภท</th><th class="numeric">ชั่วโมง</th><th>งานที่ทำ / เหตุผล</th></tr></thead>
    <tbody>${rows || `<tr><td class="empty" colspan="${colspan}">ไม่มีรายการ OT ที่อนุมัติในช่วงนี้</td></tr>`}</tbody>
  </table>`;
}

function monthDetailBlock(employee: OtReportEmployeeModel, month: OtReportMonth, year: number, pageStart: boolean) {
  return `<section class="month-detail ${pageStart ? "page-start" : ""}">
    ${employeeInfo(employee)}<h3>${escapeHtml(month.label)} ${year}</h3>
    ${detailTable(month.requests, employee)}
    ${totalsSummary(month.totals, `รวมเดือน${month.label}`)}
  </section>`;
}

function employeeAnnualPage(employee: OtReportEmployeeModel, pageStart: boolean, body: string, heading: string) {
  return `<section class="employee-report ${pageStart ? "page-start" : ""}">
    ${employeeInfo(employee)}<h2 class="section-title">${escapeHtml(heading)}</h2>${body}
  </section>`;
}

function overviewHtml(report: OtReportDocument) {
  const { model } = report;
  const definition = getOtReportDefinition(report.variant)!;
  const allEmployees = sortOtReportEmployees(model.employees, report.sortRules);
  if (report.variant === "monthly-all" || report.variant === "yearly-all") {
    return departmentSections(allEmployees) + totalsSummary(model.totals);
  }
  if (report.variant === "yearly-all-month-columns") {
    return monthColumnTable(allEmployees, model.year) + totalsSummary(model.totals);
  }
  if (report.variant === "yearly-all-month-pages") {
    const months = allEmployees[0]?.months ?? THAI_MONTHS.map((label, index) => ({
      month: index + 1, label,
      totals: { weekdayMs: 0, holidayMs: 0, unknownMs: 0, totalMs: 0, requestCount: 0 },
      requests: [],
    }));
    const monthly = months.map((month, index) => `<section class="month-report ${index ? "page-start" : ""}">
      <h2 class="section-title">${escapeHtml(month.label)} ${model.year}</h2>
      ${departmentMonthSections(allEmployees, month)}
      ${totalsSummary(monthlyTotals(allEmployees, month.month), `รวมเดือน${month.label}`)}
    </section>`).join("");
    const annual = `<section class="annual-summary page-start"><h2 class="section-title">สรุปทั้งปี ${model.year}</h2>${departmentSections(allEmployees)}${totalsSummary(model.totals)}</section>`;
    return monthly + annual;
  }
  if (report.variant === "monthly-individual") {
    return allEmployees.map((employee, index) => employeeAnnualPage(
      employee, index > 0, totalsSummary(employee.totals, "สรุป OT ที่อนุมัติ"), `สรุป OT · ${model.periodLabel}`,
    )).join("");
  }
  if (report.variant === "yearly-individual") {
    return allEmployees.map((employee, index) => employeeAnnualPage(
      employee, index > 0, totalsSummary(employee.totals, "สรุป OT ที่อนุมัติทั้งปี"), `สรุป OT รายปี ${model.year}`,
    )).join("");
  }
  if (report.variant === "yearly-individual-month-columns") {
    return allEmployees.map((employee, index) => employeeAnnualPage(
      employee, index > 0, individualMonthColumnTable(employee, model.year) + totalsSummary(employee.totals), `สรุป OT รายเดือน · ปี ${model.year}`,
    )).join("");
  }
  if (report.variant === "yearly-individual-month-pages") {
    return allEmployees.map((employee, employeeIndex) => {
      const months = employee.months.map((month, monthIndex) => `<section class="month-report ${monthIndex ? "page-start" : ""}">
        ${employeeInfo(employee)}
        <h2 class="section-title">${escapeHtml(month.label)} ${model.year}</h2>
        ${monthEmployeeSummaryTable([employee], month)}
        ${totalsSummary(month.totals, `รวมเดือน${month.label}`)}
      </section>`).join("");
      const annual = `<section class="annual-summary page-start">${employeeInfo(employee)}<h2 class="section-title">สรุปทั้งปี ${model.year}</h2>${totalsSummary(employee.totals, "สรุป OT ที่อนุมัติทั้งปี")}</section>`;
      return `<section class="employee-report ${employeeIndex ? "page-start" : ""}">${months}${annual}</section>`;
    }).join("");
  }
  if (definition.scope === "individual") return "";
  return departmentSections(allEmployees) + totalsSummary(model.totals);
}

function monthlyAllHtml(report: OtReportDocument) {
  const employees = sortOtReportEmployees(report.model.employees, report.sortRules);
  return departmentSections(employees) + totalsSummary(report.model.totals);
}

function detailHtml(report: OtReportDocument) {
  const { model } = report;
  const employees = sortOtReportEmployees(model.employees, report.sortRules);
  if (report.variant === "monthly-individual-detail") {
    return employees.map((employee, index) => {
      const month = employee.months[0];
      return employeeAnnualPage(
        employee,
        index > 0,
        detailTable(month?.requests ?? [], employee) + totalsSummary(employee.totals),
        `รายการ OT รายวัน · ${model.periodLabel}`,
      );
    }).join("");
  }
  if (report.variant === "yearly-individual-detail" || report.variant === "yearly-individual-month-columns-detail") {
    const withMonth = report.variant === "yearly-individual-month-columns-detail";
    return employees.map((employee, index) => {
      const requests = employee.months.flatMap((month) => month.requests);
      return employeeAnnualPage(
        employee,
        index > 0,
        detailTable(requests, employee, withMonth) + totalsSummary(employee.totals),
        `รายการ OT รายวัน · ปี ${model.year}`,
      );
    }).join("");
  }
  if (report.variant === "yearly-individual-month-pages-detail") {
    return employees.map((employee, employeeIndex) => {
      const months = employee.months.map((month, monthIndex) => monthDetailBlock(employee, month, model.year, monthIndex > 0)).join("");
      const annual = `<section class="annual-summary page-start">${employeeInfo(employee)}<h2 class="section-title">สรุปทั้งปี ${model.year}</h2>${totalsSummary(employee.totals, "สรุป OT ที่อนุมัติทั้งปี")}</section>`;
      return `<section class="employee-report ${employeeIndex ? "page-start" : ""}">${months}${annual}</section>`;
    }).join("");
  }
  return monthlyAllHtml(report);
}

function reportTitle(variant: OtReportVariant) {
  if (variant.startsWith("monthly")) return "รายงาน OT รายเดือน";
  return "รายงาน OT รายปี";
}

function reportBody(report: OtReportDocument) {
  const definition = getOtReportDefinition(report.variant)!;
  const { model } = report;
  const range = `ตั้งแต่วันที่ ${localDateLabel(model.periodStart)} ถึงวันที่ ${localDateLabel(model.periodEnd)}`;
  const employeeCount = model.employees.length;
  const unknownNotice = model.hasUnknownType
    ? `<p class="warning">มีรายการ ${escapeHtml(OT_REPORT_LABELS.unknown)} ${formatOtHours(model.totals.unknownMs)} ชั่วโมง ซึ่งรวมในยอดรวมแล้ว</p>`
    : "";
  const employeeLabel = definition.scope === "all"
    ? `พนักงานที่อยู่ในช่วงงวดหรือมีรายการ OT ที่เข้าเงื่อนไข ${employeeCount} คน`
    : `พนักงาน ${employeeCount} คน`;
  const scopeNotice = definition.scope === "individual" && employeeCount > 1
    ? "เริ่มส่วนของพนักงานแต่ละคนในหน้าใหม่"
    : "";
  const body = definition.detail ? detailHtml(report) : overviewHtml(report);
  return `<main>
    <div class="document-heading"><p class="eyebrow">${escapeHtml(OT_REPORT_LABELS.company)}</p>
      <h1>${escapeHtml(reportTitle(report.variant))}</h1>
      <p class="period">${escapeHtml(model.periodLabel)} · ${escapeHtml(range)}</p>
      <p class="meta">เฉพาะรายการ OT ที่อนุมัติแล้ว · จัดงวดตามวันที่เริ่ม OT ในเวลา Asia/Bangkok</p>
      <p class="meta">สร้างเมื่อ ${escapeHtml(prettyGeneratedAt(model.generatedAt))}</p>
      <p class="meta">${escapeHtml(employeeLabel)}${scopeNotice ? ` · ${escapeHtml(scopeNotice)}` : ""}</p>
      ${unknownNotice}
    </div>
    ${body || `<p class="empty-document">ไม่มีข้อมูลตามตัวเลือกนี้</p>`}
    <p class="data-note">ชั่วโมงคำนวณจากเวลาสิ้นสุดลบเวลาเริ่มตามข้อมูลที่บันทึก ไม่มีการหักเวลาพัก · แผนกและตำแหน่งเป็นข้อมูลปัจจุบัน</p>
  </main>`;
}

function styles() {
  return `*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Thai,sans-serif;font-size:9px;line-height:1.45;color:#202a35;background:#fff}main{width:100%}.document-heading{text-align:center;margin:0 0 15px;padding-bottom:10px;border-bottom:1px solid #cfd5dc}.eyebrow{font-size:10px;font-weight:700;margin:0 0 4px}.document-heading h1{font-size:17px;line-height:1.3;margin:0 0 3px}.period{font-size:11px;font-weight:700;margin:2px 0}.meta{font-size:8px;color:#667085;margin:2px 0}.warning{margin:6px auto 0;max-width:90%;padding:5px 8px;border:1px solid #e7c48a;background:#fff8eb;color:#7a4b08;text-align:left}.section-title{font-size:12px;margin:10px 0 7px}.group-title{font-size:9px;margin:12px 0 4px;font-weight:700}.employee-report{margin:0}.employee-meta{display:flex;flex-wrap:wrap;gap:3px 12px;align-items:baseline;border-bottom:1px solid #cfd5dc;padding:0 0 6px;margin:0 0 8px}.employee-meta strong{font-size:11px}.employee-meta span{color:#667085;font-size:8px}.totals-strip{display:flex;flex-wrap:wrap;justify-content:space-between;gap:5px 12px;margin:9px 0 12px;padding:7px 8px;border:1px solid #cfd5dc;background:#f6f7f8;font-size:8px;page-break-inside:avoid;break-inside:avoid}.totals-strip .total{font-weight:700}.totals-strip b{font-variant-numeric:tabular-nums}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 8px}thead{display:table-header-group}tfoot{display:table-row-group}th,td{border:1px solid #cfd5dc;padding:4px 5px;vertical-align:top;overflow-wrap:anywhere}th{background:#34434c;color:#fff;font-size:10px;font-weight:700;text-align:left}td{font-size:10px}.detail-table .repeat-employee th{background:#f1f4f7;color:#202a35;font-size:10px}.detail-table .repeat-employee th{border-bottom:0}.detail-table thead tr:nth-child(2) th{border-top:0}tr{page-break-inside:avoid;break-inside:avoid}.summary-table .code{width:15%}.summary-table th:nth-child(2){width:29%}.numeric{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.summary-table .numeric{width:14%}.total{font-weight:700}.empty{text-align:center!important;color:#667085;padding:12px}.month-columns-table th:first-child{width:13%}.month-columns-table .code{width:10%}.month-columns-table th:nth-child(3){width:24%}.month-columns-table .numeric{width:13%}.month-cell{width:12%;font-weight:700}.date-cell{width:16%}.time-cell{width:17%;font-variant-numeric:tabular-nums}.detail-table th:nth-child(4){width:13%}.detail-table th:nth-child(5){width:12%}.detail-table th:nth-child(6){width:42%}.detail-table:not(.with-month) th:nth-child(1){width:17%}.detail-table:not(.with-month) th:nth-child(2){width:18%}.detail-table:not(.with-month) th:nth-child(3){width:13%}.detail-table:not(.with-month) th:nth-child(4){width:12%}.detail-table:not(.with-month) th:nth-child(5){width:40%}.detail-row{page-break-inside:auto;break-inside:auto}.detail-row td{page-break-inside:auto;break-inside:auto}.reason{overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap}.type-unknown{color:#7a4b08;font-weight:700}.month-report{margin:0}.page-start{break-before:page;page-break-before:always}.employee-report.page-start{display:block}.month-detail h3{font-size:10px;margin:0 0 6px}.data-note{font-size:7px;color:#667085;border-top:1px solid #e4e7eb;padding-top:5px;margin:14px 0 0}.empty-document{text-align:center;padding:20px;color:#667085}@media print{.page-start{break-before:page;page-break-before:always}thead{display:table-header-group}tr{page-break-inside:avoid;break-inside:avoid}.detail-row,.detail-row td{page-break-inside:auto;break-inside:auto}}`;
}

function pageHeader(report: OtReportDocument, fontRegularBase64: string, fontBoldBase64: string) {
  const title = `${reportTitle(report.variant)} · ${report.model.periodLabel}`;
  return `<style>@font-face{font-family:Thai;src:url(data:font/ttf;base64,${fontRegularBase64})}@font-face{font-family:Thai;src:url(data:font/ttf;base64,${fontBoldBase64});font-weight:700}</style><div style="font-family:Thai,sans-serif;font-size:8px;width:100%;padding:0 10mm;color:#667085;display:flex;justify-content:space-between;align-items:center"><span>${escapeHtml(OT_REPORT_LABELS.company)}</span><span>${escapeHtml(title)}</span></div>`;
}

function pageFooter(fontRegularBase64: string, fontBoldBase64: string) {
  return `<style>@font-face{font-family:Thai;src:url(data:font/ttf;base64,${fontRegularBase64})}@font-face{font-family:Thai;src:url(data:font/ttf;base64,${fontBoldBase64});font-weight:700}</style><div style="font-family:Thai,sans-serif;font-size:8px;width:100%;padding:0 10mm;color:#667085;text-align:center">หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></div>`;
}

export function createOtReportMarkup(
  report: OtReportDocument,
  fontRegularBase64: string,
  fontBoldBase64: string,
): OtReportMarkup {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
    @font-face{font-family:Thai;src:url(data:font/ttf;base64,${fontRegularBase64})} @font-face{font-family:Thai;font-weight:700;src:url(data:font/ttf;base64,${fontBoldBase64})}
    ${styles()}
    .detail-table.with-month th:nth-child(6){width:30%}
  </style></head><body>${reportBody(report)}</body></html>`;
  return {
    html,
    headerTemplate: pageHeader(report, fontRegularBase64, fontBoldBase64),
    footerTemplate: pageFooter(fontRegularBase64, fontBoldBase64),
  };
}
