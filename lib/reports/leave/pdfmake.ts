import {
  formatLeaveDays,
  LEAVE_THAI_MONTHS,
  sortLeaveReportEmployees,
  type LeaveReportEmployeeModel,
  type LeaveReportModel,
  type LeaveReportRequest,
  type LeaveReportTotals,
  type LeaveReportType,
} from "./model";
import { getLeaveReportDefinition, type LeaveReportVariant } from "./options";
import type { LeaveReportDocument } from "./template";

const PAGE_CONTENT_WIDTH = 555.28;
const HEADER_COLOR = "#37474f";
const FONT = "THSarabunNew";
const GRID_HORIZONTAL_PADDING = 2.5;
const GRID_LINE_WIDTH = 0.5;
const DETAIL_REASON_ROW_LIMIT = 360;

type PdfNode = Record<string, any>;
type PdfCell = string | PdfNode;

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
  const time = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  return `ข้อมูล ณ วันที่: ${day}/${month}/${date.getUTCFullYear()} ${time}`;
}

function reportTitle(variant: LeaveReportVariant, model: LeaveReportModel) {
  if (["yearly-all-month-columns", "yearly-individual-month-columns", "yearly-individual-month-columns-detail"].includes(variant)) {
    return `รายงานวันลารายปี ${model.year}`;
  }
  return variant.startsWith("monthly")
    ? `รายงานวันลา (เดือน ${LEAVE_THAI_MONTHS[(model.month ?? 1) - 1]} ${model.year})`
    : `รายงานวันลา (ปี ${model.year})`;
}

function periodLabel(model: LeaveReportModel) {
  return `ตั้งแต่ วันที่ ${localDateLabel(model.periodStart)} ถึง วันที่ ${localDateLabel(model.periodEnd)}`;
}

function employeeLabel(employee: LeaveReportEmployeeModel) {
  return `${employee.name} - ${employee.employee.positionName || "ไม่ระบุตำแหน่ง"} - ${employee.employee.departmentName || "ไม่ระบุแผนก"}`;
}

function pageBlock(nodes: PdfNode[], breakBefore = false): PdfNode {
  return { stack: nodes, ...(breakBefore ? { pageBreak: "before" } : {}) };
}

function headCell(text: string, alignment: "left" | "center" | "right" = "center", colSpan?: number): PdfNode {
  return {
    text,
    alignment,
    color: "#ffffff",
    fillColor: HEADER_COLOR,
    bold: true,
    fontSize: 11,
    margin: [1, 2, 1, 2],
    ...(colSpan ? { colSpan } : {}),
  };
}

function plainCell(text: string | number, alignment: "left" | "center" | "right" = "left", options: PdfNode = {}): PdfNode {
  return { text: String(text ?? ""), alignment, fontSize: 12, margin: [1.5, 1, 1.5, 1], ...options };
}

function fitTableWidths(widths: number[]): number[] {
  const insets = widths.length * GRID_HORIZONTAL_PADDING * 2 + (widths.length + 1) * GRID_LINE_WIDTH;
  const available = PAGE_CONTENT_WIDTH - insets;
  const total = widths.reduce((sum, width) => sum + width, 0);
  const scale = available / total;
  return widths.map((width) => width * scale);
}

function tableNode(widths: number[], body: PdfCell[][], headerRows = 0, margin: number[] = [0, 0, 0, 8]): PdfNode {
  return {
    table: {
      widths: fitTableWidths(widths),
      body,
      ...(headerRows ? { headerRows, keepWithHeaderRows: 1 } : {}),
    },
    layout: "leaveGrid",
    margin,
  };
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

function totalHeading(allTypes: LeaveReportType[], shownTypes: LeaveReportType[]) {
  return allTypes.length > shownTypes.length ? "รวมทุกประเภท (วัน)" : "รวม (วัน)";
}

function totalCells(totals: LeaveReportTotals, types: LeaveReportType[], shownTypes: LeaveReportType[]): PdfCell[] {
  return [
    ...shownTypes.map((type) => plainCell(totals.byType[type.code] ? formatLeaveDays(totals.byType[type.code]) : "", "right")),
    plainCell(formatLeaveDays(totals.daysHalfUnits), "right", { bold: true }),
  ];
}

function summaryTable(
  employees: LeaveReportEmployeeModel[],
  allTypes: LeaveReportType[],
  options: { month?: number; year?: number; showMonth?: boolean } = {},
): PdfNode[] {
  return chunkTypes(allTypes).flatMap((shownTypes, chunkIndex) => {
    const metricCount = shownTypes.length + 1;
    const widths = [
      ...(options.showMonth ? [50] : []),
      60,
      225.28,
      ...Array.from({ length: metricCount }, () => (PAGE_CONTENT_WIDTH - (options.showMonth ? 50 : 0) - 60 - 225.28) / metricCount),
    ];
    const headings = [
      ...(options.showMonth ? ["เดือน"] : []),
      "รหัสพนักงาน",
      "ชื่อ - สกุล",
      ...shownTypes.map((type) => `${type.name} (วัน)`),
      totalHeading(allTypes, shownTypes),
    ];
    const body: PdfCell[][] = [headings.map((heading) => headCell(heading))];
    if (!employees.length) {
      body.push([
        { text: "ไม่มีพนักงานในช่วงเวลานี้", colSpan: headings.length, alignment: "center", fontSize: 12 },
        ...Array.from({ length: headings.length - 1 }, () => ""),
      ]);
    } else {
      for (const employee of employees) {
        const totals = monthTotals(employee, options.month, allTypes);
        const month = options.month === undefined ? "" : `${LEAVE_THAI_MONTHS[options.month - 1]} ${options.year ?? ""}`;
        body.push([
          ...(options.showMonth ? [plainCell(month, "center")] : []),
          plainCell(employee.employee.code, "center"),
          plainCell(employee.name),
          ...totalCells(totals, allTypes, shownTypes),
        ]);
      }
    }
    return [
      ...(chunkIndex ? [{ text: `ประเภทวันลา ${shownTypes.map((type) => type.name).join(" · ")}`, style: "typeChunkTitle", margin: [0, 7, 0, 3] }] : []),
      tableNode(widths, body, 1),
    ];
  });
}

function departmentNodes(
  employees: LeaveReportEmployeeModel[],
  types: LeaveReportType[],
  options: { month?: number; year?: number; showMonth?: boolean } = {},
): PdfNode[] {
  const groups = new Map<string, LeaveReportEmployeeModel[]>();
  for (const employee of employees) {
    const department = employee.employee.departmentName || "ไม่ระบุแผนก";
    groups.set(department, [...(groups.get(department) ?? []), employee]);
  }
  if (!groups.size) return summaryTable([], types, options);
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "th", { sensitivity: "base" }))
    .flatMap(([name, group]) => [
      { text: `แผนก: ${name}`, style: "groupTitle", margin: [0, 0, 0, 4] },
      ...summaryTable(group, types, options),
    ]);
}

function monthColumnsTable(employees: LeaveReportEmployeeModel[], model: LeaveReportModel, repeatMonth = false): PdfNode[] {
  return chunkTypes(model.types).flatMap((shownTypes, chunkIndex) => {
    const metricCount = shownTypes.length + 1;
    const widths = [
      82,
      60,
      225.28,
      ...Array.from({ length: metricCount }, () => (PAGE_CONTENT_WIDTH - 82 - 60 - 225.28) / metricCount),
    ];
    const headings = ["เดือน", "รหัสพนักงาน", "ชื่อ - สกุล", ...shownTypes.map((type) => `${type.name} (วัน)`), totalHeading(model.types, shownTypes)];
    const body: PdfCell[][] = [headings.map((heading) => headCell(heading))];
    for (let monthIndex = 0; monthIndex < LEAVE_THAI_MONTHS.length; monthIndex += 1) {
      if (!employees.length) {
        body.push([
          plainCell(`${LEAVE_THAI_MONTHS[monthIndex]} ${model.year}`, "center"),
          "",
          plainCell("ไม่มีพนักงานในช่วงเวลานี้"),
          ...totalCells(emptyTotals(model.types), model.types, shownTypes),
        ]);
        continue;
      }
      employees.forEach((employee, employeeIndex) => {
        const totals = employee.months.find((entry) => entry.month === monthIndex + 1)?.totals ?? emptyTotals(model.types);
        body.push([
          plainCell(repeatMonth || employeeIndex === 0 ? `${LEAVE_THAI_MONTHS[monthIndex]} ${model.year}` : "", "center"),
          plainCell(employee.employee.code, "center"),
          plainCell(employee.name),
          ...totalCells(totals, model.types, shownTypes),
        ]);
      });
    }
    return [
      ...(chunkIndex ? [{ text: `ประเภทวันลา ${shownTypes.map((type) => type.name).join(" · ")}`, style: "typeChunkTitle", margin: [0, 7, 0, 3] }] : []),
      tableNode(widths, body, 1, [0, 0, 0, 0]),
    ];
  });
}

function heading(report: LeaveReportDocument, includePeriod = true): PdfNode[] {
  return [
    { text: reportTitle(report.variant, report.model), style: "documentTitle", alignment: "center" },
    ...(includePeriod ? [{ text: periodLabel(report.model), style: "period", alignment: "center", margin: [0, 0, 0, 14] }] : []),
  ];
}

function summaryDocument(report: LeaveReportDocument): PdfNode[] {
  const { model, variant } = report;
  const employees = sortLeaveReportEmployees(model.employees, report.sortRules);
  const title = reportTitle(variant, model);
  const range = periodLabel(model);
  const content: PdfNode[] = [];

  if (variant === "yearly-all-month-columns") {
    return [pageBlock([...heading(report, false), ...monthColumnsTable(employees, model)])];
  }
  if (variant === "yearly-individual-month-columns") {
    employees.forEach((employee, index) => content.push(pageBlock([
      ...heading(report, false),
      ...monthColumnsTable([employee], model, true),
    ], index > 0)));
    return content;
  }
  if (variant === "yearly-all-month-pages") {
    LEAVE_THAI_MONTHS.forEach((month, index) => content.push(pageBlock([
      ...heading(report),
      { text: `${month} ${model.year}`, style: "monthHeading" },
      ...departmentNodes(employees, model.types, { month: index + 1, year: model.year }),
    ], index > 0)));
    content.push(pageBlock([
      ...heading(report),
      ...departmentNodes(employees, model.types),
    ], true));
    return content;
  }
  if (variant === "yearly-individual-month-pages") {
    employees.forEach((employee, employeeIndex) => {
      LEAVE_THAI_MONTHS.forEach((month, monthIndex) => content.push(pageBlock([
        ...heading(report),
        { text: `${month} ${model.year}`, style: "monthHeading" },
        ...departmentNodes([employee], model.types, { month: monthIndex + 1, year: model.year }),
      ], employeeIndex > 0 || monthIndex > 0)));
      content.push(pageBlock([
        ...heading(report),
        ...departmentNodes([employee], model.types),
      ], true));
    });
    return content;
  }

  const definition = getLeaveReportDefinition(variant)!;
  const month = definition.period === "monthly" ? model.month ?? 1 : undefined;
  if (variant === "monthly-individual" || variant === "yearly-individual") {
    employees.forEach((employee, index) => content.push(pageBlock([
      ...heading(report),
      ...departmentNodes([employee], model.types, { month, year: model.year, showMonth: variant === "monthly-individual" }),
    ], index > 0)));
    return content;
  }

  content.push(pageBlock([
    ...heading(report),
    ...departmentNodes(employees, model.types, { month, year: model.year }),
  ]));
  return content;
}

function splitReason(reason: string): string[] {
  const characters = Array.from(reason);
  if (characters.length <= DETAIL_REASON_ROW_LIMIT) return [reason];
  const chunks: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let end = Math.min(start + DETAIL_REASON_ROW_LIMIT, characters.length);
    if (end < characters.length) {
      for (let index = end - 1; index >= start + Math.floor(DETAIL_REASON_ROW_LIMIT * 0.65); index -= 1) {
        if (/\s/.test(characters[index])) {
          end = index + 1;
          break;
        }
      }
    }
    chunks.push(characters.slice(start, end).join(""));
    start = end;
  }
  return chunks;
}

function sessionLabel(request: LeaveReportRequest) {
  if (request.startOn !== request.endOn || request.session === "full") return "เต็มวัน";
  return request.session === "am" ? "ครึ่งวันเช้า" : "ครึ่งวันบ่าย";
}

function spanningRow(text: string, columns: number, options: PdfNode = {}): PdfCell[] {
  return [
    { text, colSpan: columns, ...options },
    ...Array.from({ length: columns - 1 }, () => ""),
  ];
}

function detailTable(
  report: LeaveReportDocument,
  requests: LeaveReportRequest[],
  employee: LeaveReportEmployeeModel,
  totals: LeaveReportTotals,
  monthLabel?: string,
): PdfNode {
  const columns = 7;
  const rows: PdfCell[][] = [
    spanningRow(reportTitle(report.variant, report.model), columns, { alignment: "center", fontSize: 18, bold: true, margin: [0, 8, 0, 0], border: [false, false, false, false] }),
    spanningRow(periodLabel(report.model), columns, { alignment: "center", fontSize: 14, margin: [0, 0, 0, 2], border: [false, false, false, false] }),
    ...(monthLabel ? [spanningRow(monthLabel, columns, { alignment: "center", fontSize: 14, bold: true, border: [false, false, false, false] })] : []),
    spanningRow(employeeLabel(employee), columns, { alignment: "center", fontSize: 16, bold: true, margin: [0, 2, 0, 1], border: [false, false, false, false] }),
    spanningRow("", columns, { border: [false, false, false, true], borderColor: ["#ffffff", "#ffffff", "#ffffff", "#111111"], margin: [0, 0, 0, 2] }),
    spanningRow("", columns, { border: [false, false, false, false], margin: [0, 0, 0, 4] }),
    ["เดือน", "วันที่ลา", "ประเภท", "ช่วงเวลา", "จำนวน (วัน)", "เหตุผล", "สถานะ"].map((label) => headCell(label)),
  ];
  const headerRows = rows.length;
  const typeNames = new Map(report.model.types.map((type) => [type.code, type.name]));
  for (const request of requests) {
    const dates = request.clippedStartOn === request.clippedEndOn
      ? shortDate(request.clippedStartOn)
      : `${shortDate(request.clippedStartOn)} - ${shortDate(request.clippedEndOn)}`;
    const month = request.month ?? Number(request.clippedStartOn.slice(5, 7));
    const reasons = splitReason(request.reason);
    rows.push([
      plainCell(LEAVE_THAI_MONTHS[month - 1], "center", { fontSize: 10 }),
      plainCell(dates, "center", { fontSize: 10 }),
      plainCell(typeNames.get(request.leaveTypeCode) ?? request.leaveTypeCode, "center", { fontSize: 10 }),
      plainCell(sessionLabel(request), "center", { fontSize: 10 }),
      plainCell(formatLeaveDays(request.daysHalfUnits), "center", { fontSize: 10 }),
      plainCell(reasons[0], "left", { fontSize: 10, valign: "top" }),
      plainCell("อนุมัติแล้ว", "center", { fontSize: 10 }),
    ]);
    for (const reason of reasons.slice(1)) {
      rows.push([
        ...Array.from({ length: 5 }, () => plainCell("", "center", { fontSize: 10 })),
        plainCell(reason, "left", { fontSize: 10, valign: "top" }),
        plainCell("", "center", { fontSize: 10 }),
      ]);
    }
  }
  if (!requests.length) rows.push(spanningRow("ไม่มีรายการวันลาที่อนุมัติในช่วงนี้", columns, { alignment: "center", fontSize: 12 }));

  const widths = fitTableWidths([50, 105, 85, 80, 60, 125.28, 50]);
  const content: PdfNode[] = [{
    table: { widths, body: rows, headerRows, keepWithHeaderRows: 1 },
    layout: "leaveGrid",
    margin: [0, 0, 0, 8],
  }];
  content.push(detailTotals(totals, report.model.types));
  return { stack: content };
}

function detailTotals(totals: LeaveReportTotals, types: LeaveReportType[]): PdfNode {
  const rows = [
    ...types.map((type) => [plainCell(type.name, "left", { bold: true, fontSize: 10 }), plainCell(`${formatLeaveDays(totals.byType[type.code] ?? 0)} วัน`, "center", { fontSize: 10 })]),
    [plainCell("รวมวันลาทั้งหมด", "left", { bold: true, fontSize: 10 }), plainCell(`${formatLeaveDays(totals.daysHalfUnits)} วัน`, "center", { bold: true, fontSize: 10, fillColor: "#eeeeee" })],
  ];
  return {
    columns: [
      { width: "*", text: "" },
      { width: 300, table: { widths: [193, 95], body: rows }, layout: "leaveGrid" },
      { width: "*", text: "" },
    ],
    margin: [0, 8, 0, 10],
  };
}

function detailDocument(report: LeaveReportDocument): PdfNode[] {
  const model = report.model;
  const employees = sortLeaveReportEmployees(model.employees, report.sortRules);
  const content: PdfNode[] = [];

  if (report.variant === "yearly-individual-month-pages-detail") {
    employees.forEach((employee, employeeIndex) => {
      employee.months.forEach((month, monthIndex) => content.push(pageBlock([
        detailTable(report, month.requests, employee, month.totals, `${month.label} ${model.year}`),
      ], employeeIndex > 0 || monthIndex > 0)));
      content.push(pageBlock([
        ...heading(report),
        { text: employeeLabel(employee), style: "employeeHeading", alignment: "center", margin: [0, 0, 0, 8] },
        detailTotals(employee.totals, model.types),
      ], true));
    });
    return content;
  }

  employees.forEach((employee, index) => {
    const requests = report.variant.startsWith("monthly")
      ? employee.months[0]?.requests ?? []
      : report.variant === "yearly-individual-month-columns-detail"
        ? employee.months.flatMap((month) => month.requests)
        : employee.requests;
    const totals = report.variant.startsWith("monthly")
      ? employee.months[0]?.totals ?? emptyTotals(model.types)
      : employee.totals;
    content.push(pageBlock([detailTable(report, requests, employee, totals)], index > 0));
  });
  return content;
}

export function createLeaveReportPdfDefinition(report: LeaveReportDocument) {
  const isDetail = getLeaveReportDefinition(report.variant)!.detail;
  const content = isDetail ? detailDocument(report) : summaryDocument(report);
  const generated = generatedAtLabel(report.model.generatedAt);
  return {
    pageSize: "A4",
    pageMargins: [20, 52, 20, 20],
    defaultStyle: { font: FONT, fontSize: 12, color: "#000000" },
    content: content.length ? content : [pageBlock([
      ...heading(report),
      { text: "ไม่มีพนักงานในช่วงเวลานี้", alignment: "center", margin: [0, 12, 0, 0] },
    ])],
    header: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: generated, width: "*", alignment: "left" },
        { text: "บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด", width: "*", alignment: "center", fontSize: 14, bold: true },
        { text: `หน้า ${currentPage} / ${pageCount}`, width: "*", alignment: "right" },
      ],
      margin: [20, 7.5, 20, 0],
      font: FONT,
      fontSize: 10,
      color: "#616161",
    }),
    styles: {
      documentTitle: { fontSize: 18, bold: true, margin: [0, 0, 0, 1] },
      period: { fontSize: 14 },
      groupTitle: { fontSize: 14, bold: true, color: HEADER_COLOR },
      monthHeading: { fontSize: 14, bold: true, margin: [0, 0, 0, 10] },
      employeeHeading: { fontSize: 16, bold: true },
      typeChunkTitle: { fontSize: 11, bold: true },
    },
  };
}
