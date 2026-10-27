import { bangkokParts, formatOtHours, sortOtReportEmployees, THAI_MONTHS, type OtReportEmployeeModel, type OtReportTotals } from "./model";
import { getOtReportDefinition, OT_REPORT_LABELS, type OtReportVariant } from "./options";
import type { OtReportPdfDocument, OtReportPdfEmployee, OtReportPdfModel, OtReportPdfRequest } from "./pdf-payload";

const PAGE_CONTENT_WIDTH = 555.28;
const GRID_COLOR = "#bdbdbd";
const HEADER_COLOR = "#37474f";
const FONT = "THSarabunNew";
const TABLE_HORIZONTAL_PADDING = 1.5;
const TABLE_VERTICAL_LINE_WIDTH = 0.5;
const MONTH_COLUMN_WIDTH = 82;
const DETAIL_REASON_ROW_LIMIT = 400;

type PdfCell = string | Record<string, any>;
type PdfNode = Record<string, any>;

function emptyTotals(): OtReportTotals {
  return { weekdayMs: 0, holidayMs: 0, unknownMs: 0, totalMs: 0, requestCount: 0 };
}

function thaiDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${THAI_MONTHS[month - 1]} ${year}`;
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function generatedAtLabel(value: string) {
  const date = bangkokParts(new Date(value));
  const day = String(date.day).padStart(2, "0");
  const month = String(date.month).padStart(2, "0");
  const hour = String(date.hour).padStart(2, "0");
  const minute = String(date.minute).padStart(2, "0");
  return `ข้อมูล ณ วันที่: ${day}/${month}/${date.year} ${hour}:${minute}`;
}

function reportTitle(variant: OtReportVariant, model: Pick<OtReportPdfModel, "year" | "month">) {
  if (variant === "yearly-all-month-columns" || variant === "yearly-individual-month-columns" || variant === "yearly-individual-month-columns-detail") {
    return `รายงานโอทีรายปี ${model.year}`;
  }
  if (variant.startsWith("monthly")) {
    return `รายงานโอที (เดือน ${THAI_MONTHS[(model.month ?? 1) - 1]} ${model.year})`;
  }
  return `รายงานโอที (ปี ${model.year})`;
}

function periodLabel(model: Pick<OtReportPdfModel, "periodStart" | "periodEnd">) {
  return `ตั้งแต่ วันที่ ${thaiDate(model.periodStart)} ถึง วันที่ ${thaiDate(model.periodEnd)}`;
}

function employeeLabel(employee: OtReportPdfEmployee) {
  return `${employee.name} - ${employee.employee.positionName || "ไม่ระบุตำแหน่ง"} - ${employee.employee.departmentName || "ไม่ระบุแผนก"}`;
}

function heading(title: string, range?: string): PdfNode[] {
  return [
    { text: title, style: "documentTitle", alignment: "center" },
    ...(range ? [{ text: range, style: "period", alignment: "center", margin: [0, 0, 0, 14] }] : []),
  ];
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
    fontSize: 10,
    ...(colSpan ? { colSpan } : {}),
  };
}

function plainCell(text: string | number, alignment: "left" | "center" | "right" = "left", options: PdfNode = {}): PdfNode {
  return { text: String(text ?? ""), alignment, fontSize: 12, ...options };
}

function spanningTextRow(text: string, columns: number, options: PdfNode = {}): PdfCell[] {
  return [{ text, colSpan: columns, ...options }, ...Array.from({ length: columns - 1 }, () => "")];
}

function fitTableWidths(widths: Array<number | string>): Array<number | string> {
  if (!widths.every((width) => typeof width === "number")) return widths;

  const totalWidth = widths.reduce<number>((total, width) => total + Number(width), 0);
  if (Math.abs(totalWidth - PAGE_CONTENT_WIDTH) > 0.01) return widths;

  const columnCount = widths.length;
  const tableInsets = columnCount * TABLE_HORIZONTAL_PADDING * 2 + (columnCount + 1) * TABLE_VERTICAL_LINE_WIDTH;
  const availableColumnWidth = PAGE_CONTENT_WIDTH - tableInsets;
  const scale = availableColumnWidth / totalWidth;
  return widths.map((width) => Number(width) * scale);
}

function splitDetailReason(reason: string): string[] {
  const characters = Array.from(reason);
  if (characters.length <= DETAIL_REASON_ROW_LIMIT) return [reason];

  const chunks: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let end = Math.min(start + DETAIL_REASON_ROW_LIMIT, characters.length);
    if (end < characters.length) {
      const preferredBreak = start + Math.floor(DETAIL_REASON_ROW_LIMIT * 0.65);
      for (let index = end - 1; index >= preferredBreak; index -= 1) {
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

function tableNode(widths: Array<number | string>, body: PdfCell[][], headerRows = 0, margin: number[] = [0, 0, 0, 8]): PdfNode {
  return {
    table: {
      widths: fitTableWidths(widths),
      body,
      ...(headerRows ? { headerRows, keepWithHeaderRows: 1 } : {}),
    },
    layout: "otGrid",
    margin,
  };
}

function sortedEmployees(report: OtReportPdfDocument): OtReportPdfEmployee[] {
  return sortOtReportEmployees(
    report.model.employees as unknown as OtReportEmployeeModel[],
    report.sortRules,
  ) as unknown as OtReportPdfEmployee[];
}

function totalCells(totals: OtReportTotals, includeUnknown: boolean): PdfCell[] {
  const durations = [totals.weekdayMs, totals.holidayMs, ...(includeUnknown ? [totals.unknownMs] : []), totals.totalMs];
  return durations.map((duration, index) => {
    const isTotal = index === durations.length - 1;
    return plainCell(isTotal || duration > 0 ? formatOtHours(duration) : "", "right", isTotal ? { bold: true } : {});
  });
}

function summaryTable(
  employees: OtReportPdfEmployee[],
  options: { includeUnknown: boolean; year: number; displayMonth?: number; totalsMonth?: number; emptyLabel?: string },
): PdfNode {
  const includeMonth = options.displayMonth !== undefined;
  const metricCount = options.includeUnknown ? 4 : 3;
  const monthWidth = includeMonth ? MONTH_COLUMN_WIDTH : 0;
  const codeWidth = 60;
  const metricWidth = 70;
  const nameWidth = PAGE_CONTENT_WIDTH - monthWidth - codeWidth - metricCount * metricWidth;
  const widths = [
    ...(includeMonth ? [monthWidth] : []),
    codeWidth,
    nameWidth,
    ...Array.from({ length: metricCount }, () => metricWidth),
  ];
  const headings = [
    ...(includeMonth ? ["เดือน"] : []),
    "รหัสพนักงาน",
    "ชื่อ - สกุล",
    `${OT_REPORT_LABELS.weekdays} (ชม.)`,
    `${OT_REPORT_LABELS.holidays} (ชม.)`,
    ...(options.includeUnknown ? [`${OT_REPORT_LABELS.unknown} (ชม.)`] : []),
    "รวม (ชม.)",
  ];
  const body: PdfCell[][] = [headings.map((label) => headCell(label))];

  if (!employees.length) {
    body.push(spanningTextRow(options.emptyLabel ?? "ไม่มีพนักงานในช่วงเวลานี้", headings.length, { alignment: "center", fontSize: 12 }));
  } else {
    for (const employee of employees) {
      const monthData = options.totalsMonth === undefined
        ? undefined
        : employee.months.find((item) => item.month === options.totalsMonth);
      const totals = monthData?.totals ?? (options.totalsMonth === undefined ? employee.totals : emptyTotals());
      body.push([
        ...(includeMonth ? [plainCell(`${THAI_MONTHS[options.displayMonth! - 1]} ${options.year}`, "center")] : []),
        plainCell(employee.employee.code, "center"),
        plainCell(employee.name),
        ...totalCells(totals, options.includeUnknown),
      ]);
    }
  }

  return tableNode(widths, body, 1);
}

function departmentNodes(
  employees: OtReportPdfEmployee[],
  includeUnknown: boolean,
  options: { year: number; displayMonth?: number; totalsMonth?: number },
): PdfNode[] {
  const groups = new Map<string, OtReportPdfEmployee[]>();
  for (const employee of employees) {
    const department = employee.employee.departmentName || "ไม่ระบุแผนก";
    groups.set(department, [...(groups.get(department) ?? []), employee]);
  }

  if (!groups.size) {
    return [summaryTable([], { includeUnknown, ...options })];
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "th", { sensitivity: "base" }))
    .flatMap(([department, group]) => [
      { text: `แผนก: ${department}`, style: "groupTitle", margin: [0, 0, 0, 4] },
      summaryTable(group, { includeUnknown, ...options }),
    ]);
}

function monthColumnsTable(employees: OtReportPdfEmployee[], year: number, includeUnknown: boolean, repeatMonth = false): PdfNode {
  const metricCount = includeUnknown ? 4 : 3;
  const fixedMonth = MONTH_COLUMN_WIDTH;
  const fixedCode = 60;
  const metricWidth = 70;
  const nameWidth = PAGE_CONTENT_WIDTH - fixedMonth - fixedCode - metricCount * metricWidth;
  const headings = [
    "เดือน",
    "รหัสพนักงาน",
    "ชื่อ - สกุล",
    `${OT_REPORT_LABELS.weekdays} (ชม.)`,
    `${OT_REPORT_LABELS.holidays} (ชม.)`,
    ...(includeUnknown ? [`${OT_REPORT_LABELS.unknown} (ชม.)`] : []),
    "รวม (ชม.)",
  ];
  const body: PdfCell[][] = [headings.map((label) => headCell(label))];

  for (let monthIndex = 0; monthIndex < THAI_MONTHS.length; monthIndex += 1) {
    if (!employees.length) {
      body.push([
        plainCell(`${THAI_MONTHS[monthIndex]} ${year}`, "center"),
        "",
        plainCell("ไม่มีพนักงานในช่วงเวลานี้"),
        ...totalCells(emptyTotals(), includeUnknown),
      ]);
      continue;
    }

    employees.forEach((employee, employeeIndex) => {
      const totals = employee.months.find((item) => item.month === monthIndex + 1)?.totals ?? emptyTotals();
      body.push([
        plainCell(repeatMonth || employeeIndex === 0 ? `${THAI_MONTHS[monthIndex]} ${year}` : "", "center"),
        plainCell(employee.employee.code, "center"),
        plainCell(employee.name),
        ...totalCells(totals, includeUnknown),
      ]);
    });
  }

  return tableNode([fixedMonth, fixedCode, nameWidth, ...Array.from({ length: metricCount }, () => metricWidth)], body, 1, [0, 0, 0, 0]);
}

function monthlySummary(report: OtReportPdfDocument, employee: OtReportPdfEmployee): PdfNode[] {
  const definition = getOtReportDefinition(report.variant)!;
  const month = definition.period === "monthly" ? report.model.month ?? 1 : undefined;
  return [
    ...heading(reportTitle(report.variant, report.model), periodLabel(report.model)),
    ...departmentNodes([employee], report.model.hasUnknownType, {
      year: report.model.year,
      displayMonth: month,
      totalsMonth: month,
    }),
  ];
}

function summaryDocument(report: OtReportPdfDocument): PdfNode[] {
  const { model, variant } = report;
  const employees = sortedEmployees(report);
  const title = reportTitle(variant, model);
  const range = periodLabel(model);
  const content: PdfNode[] = [];

  if (variant === "yearly-all-month-columns") {
    content.push(pageBlock([...heading(title), monthColumnsTable(employees, model.year, model.hasUnknownType)]));
    return content;
  }

  if (variant === "yearly-individual-month-columns") {
    employees.forEach((employee, index) => {
      content.push(pageBlock([
        ...heading(title),
        monthColumnsTable([employee], model.year, model.hasUnknownType, true),
      ], index > 0));
    });
    return content;
  }

  if (variant === "yearly-all-month-pages") {
    THAI_MONTHS.forEach((month, index) => {
      content.push(pageBlock([
        ...heading(title, range),
        { text: `${month} ${model.year}`, style: "monthHeading" },
        ...departmentNodes(employees, model.hasUnknownType, { year: model.year, totalsMonth: index + 1 }),
      ], index > 0));
    });
    content.push(pageBlock([
      ...heading(title, range),
      ...departmentNodes(employees, model.hasUnknownType, { year: model.year }),
    ], true));
    return content;
  }

  if (variant === "yearly-individual-month-pages") {
    employees.forEach((employee, employeeIndex) => {
      THAI_MONTHS.forEach((month, monthIndex) => {
        content.push(pageBlock([
          ...heading(title, range),
          { text: `${month} ${model.year}`, style: "monthHeading" },
          ...departmentNodes([employee], model.hasUnknownType, { year: model.year, totalsMonth: monthIndex + 1 }),
        ], employeeIndex > 0 || monthIndex > 0));
      });
      content.push(pageBlock([
        ...heading(title, range),
        ...departmentNodes([employee], model.hasUnknownType, { year: model.year }),
      ], true));
    });
    return content;
  }

  if (variant === "monthly-individual" || variant === "yearly-individual") {
    employees.forEach((employee, index) => {
      content.push(pageBlock(monthlySummary(report, employee), index > 0));
    });
    return content;
  }

  const month = getOtReportDefinition(variant)!.period === "monthly" ? model.month ?? 1 : undefined;
  content.push(pageBlock([
    ...heading(title, range),
    ...departmentNodes(employees, model.hasUnknownType, { year: model.year, totalsMonth: month }),
  ]));
  return content;
}

function detailTableHeading(report: OtReportPdfDocument, employee: OtReportPdfEmployee, monthLabel?: string): PdfCell[][] {
  const title = report.variant === "monthly-individual-detail" || report.variant.endsWith("detail")
    ? "รายงานโอที"
    : reportTitle(report.variant, report.model);
  const rows = [
    spanningTextRow(title, 10, { alignment: "center", fontSize: 18, bold: true, margin: [0, 8, 0, 0], border: [false, false, false, false] }),
    spanningTextRow(periodLabel(report.model), 10, { alignment: "center", fontSize: 14, margin: [0, 0, 0, 2], border: [false, false, false, false] }),
  ];
  if (monthLabel) rows.push(spanningTextRow(monthLabel, 10, { alignment: "center", fontSize: 14, bold: true, border: [false, false, false, false] }));
  rows.push(spanningTextRow(employeeLabel(employee), 10, { alignment: "center", fontSize: 16, bold: true, margin: [0, 2, 0, 1], border: [false, false, false, false] }));
  rows.push(spanningTextRow("", 10, { border: [false, false, false, true], borderColor: ["#ffffff", "#ffffff", "#ffffff", "#111111"], margin: [0, 0, 0, 2] }));
  rows.push(spanningTextRow("", 10, { border: [false, false, false, false], margin: [0, 0, 0, 4] }));
  return rows;
}

function detailDateLabel(request: OtReportPdfRequest) {
  return request.startDate === request.endDate
    ? shortDate(request.startDate)
    : `${shortDate(request.startDate)} - ${shortDate(request.endDate)}`;
}

function detailCell(text: string, alignment: "left" | "center" | "right" = "center"): PdfNode {
  return { text, alignment, fontSize: 10, margin: [1.5, 2, 1.5, 2] };
}

function detailTable(report: OtReportPdfDocument, employee: OtReportPdfEmployee, requests: OtReportPdfRequest[], monthLabel?: string): PdfNode {
  const widths = [50, 55, 40, 40, 35, 40, 40, 35, 170.28, 50];
  const groupRow: PdfCell[] = [
    headCell(""),
    headCell(""),
    headCell("วันทำงาน", "center", 3), "", "",
    headCell("วันหยุด", "center", 3), "", "",
    headCell(""),
    headCell(""),
  ];
  const labelRow = ["เดือน", "วันที่", "เริ่ม", "ถึง", "ชม.", "เริ่ม", "ถึง", "ชม.", "งานที่ทำ", "สถานะ"]
    .map((label) => headCell(label));
  const body: PdfCell[][] = [
    ...detailTableHeading(report, employee, monthLabel),
    groupRow,
    labelRow,
  ];

  requests.forEach((request) => {
    const weekday = request.overtimeType === "weekday";
    const holiday = request.overtimeType === "holiday";
    const reasonChunks = splitDetailReason(request.reason ?? "");
    body.push([
      detailCell(THAI_MONTHS[request.month - 1]),
      detailCell(detailDateLabel(request)),
      detailCell(weekday ? request.startTime : ""),
      detailCell(weekday ? request.endTime : ""),
      detailCell(weekday ? formatOtHours(request.durationMs) : "", "right"),
      detailCell(holiday ? request.startTime : ""),
      detailCell(holiday ? request.endTime : ""),
      detailCell(holiday ? formatOtHours(request.durationMs) : "", "right"),
      detailCell(reasonChunks[0], "left"),
      detailCell("อนุมัติแล้ว"),
    ]);
    reasonChunks.slice(1).forEach((reasonChunk) => {
      body.push([
        ...Array.from({ length: 8 }, () => detailCell("")),
        detailCell(reasonChunk, "left"),
        detailCell(""),
      ]);
    });
  });

  if (!requests.length) {
    body.push(spanningTextRow("ไม่มีรายการ OT ที่อนุมัติในช่วงนี้", 10, { alignment: "center", fontSize: 10 }));
  }

  const headerRows = 7 + (monthLabel ? 1 : 0);
  return tableNode(widths, body, headerRows, [0, 0, 0, 10]);
}

function unknownDetailTable(report: OtReportPdfDocument, employee: OtReportPdfEmployee, requests: OtReportPdfRequest[], monthLabel?: string): PdfNode | null {
  const unknown = requests.filter((request) => request.overtimeType === "unknown");
  if (!unknown.length) return null;

  const rows: PdfCell[][] = [
    ...detailTableHeading(report, employee, monthLabel).map((row) => {
      const firstCell = row[0] as PdfNode;
      return [{ ...firstCell, colSpan: 7 }, ...Array.from({ length: 6 }, () => "")];
    }),
    ["เดือน", "วันที่", "เริ่ม", "ถึง", "ชม.", "งานที่ทำ · ไม่ระบุประเภท", "สถานะ"].map((label) => headCell(label)),
  ];

  unknown.forEach((request) => {
    const reasonChunks = splitDetailReason(request.reason ?? "");
    rows.push([
      detailCell(THAI_MONTHS[request.month - 1]),
      detailCell(detailDateLabel(request)),
      detailCell(request.startTime),
      detailCell(request.endTime),
      detailCell(formatOtHours(request.durationMs), "right"),
      detailCell(reasonChunks[0], "left"),
      detailCell("อนุมัติแล้ว"),
    ]);
    reasonChunks.slice(1).forEach((reasonChunk) => {
      rows.push([
        ...Array.from({ length: 5 }, () => detailCell("")),
        detailCell(reasonChunk, "left"),
        detailCell(""),
      ]);
    });
  });

  return tableNode([50, 55, 40, 40, 45, 275.28, 50], rows, 6 + (monthLabel ? 1 : 0), [0, 0, 0, 8]);
}

function totalsTable(totals: OtReportTotals, includeUnknown: boolean): PdfNode {
  const rows: Array<[string, number]> = [
    ["รวมโอทีวันทำงาน", totals.weekdayMs],
    ["รวมโอทีวันหยุด", totals.holidayMs],
    ...(includeUnknown ? [["รวมโอทีไม่ระบุประเภท", totals.unknownMs] as [string, number]] : []),
    ["รวมโอทีทั้งหมด", totals.totalMs],
  ];
  const body = rows.map(([label, value], index) => {
    const isTotal = index === rows.length - 1;
    return [
      plainCell(label, "left", { bold: isTotal }),
      plainCell(`${formatOtHours(value)} ชม.`, "right", { bold: isTotal, ...(isTotal ? { fillColor: "#eeeeee" } : {}) }),
    ];
  });
  return tableNode([200, 100], body, 0, [0, 12, 0, 10]);
}

function detailContent(report: OtReportPdfDocument, employee: OtReportPdfEmployee, requests: OtReportPdfRequest[], totals: OtReportTotals, monthLabel?: string): PdfNode[] {
  const hasUnknown = requests.some((request) => request.overtimeType === "unknown");
  const hasKnown = requests.some((request) => request.overtimeType !== "unknown");
  const content: PdfNode[] = [];

  if (hasKnown || !hasUnknown) {
    content.push(detailTable(report, employee, requests.filter((request) => request.overtimeType !== "unknown"), monthLabel));
    if (!hasUnknown) content.push(totalsTable(totals, false));
  }

  const unknownTable = unknownDetailTable(report, employee, requests, monthLabel);
  if (unknownTable) {
    content.push({ text: "รายการ OT ที่ไม่ระบุประเภท", style: "unknownHeading", margin: [0, 8, 0, 3] });
    content.push(unknownTable);
    content.push(totalsTable(totals, true));
  }

  return content;
}

function annualDetailTotals(report: OtReportPdfDocument, employee: OtReportPdfEmployee): PdfNode[] {
  return [
    { text: "รายงานโอที", style: "documentTitle", alignment: "center" },
    { text: periodLabel(report.model), style: "period", alignment: "center", margin: [0, 0, 0, 3] },
    { text: employeeLabel(employee), style: "employeeHeading", alignment: "center", margin: [0, 0, 0, 8] },
    totalsTable(employee.totals, report.model.hasUnknownType),
  ];
}

function detailDocument(report: OtReportPdfDocument): PdfNode[] {
  const employees = sortedEmployees(report);
  const content: PdfNode[] = [];
  let hasContent = false;

  if (report.variant === "yearly-individual-month-pages-detail") {
    employees.forEach((employee) => {
      employee.months.forEach((month) => {
        content.push(pageBlock(
          detailContent(report, employee, month.requests, month.totals, `${month.label} ${report.model.year}`),
          hasContent,
        ));
        hasContent = true;
      });
      content.push(pageBlock(annualDetailTotals(report, employee), true));
    });
    return content;
  }

  employees.forEach((employee) => {
    const requests = report.variant.startsWith("monthly")
      ? employee.months[0]?.requests ?? []
      : employee.months.flatMap((month) => month.requests);
    content.push(pageBlock(detailContent(report, employee, requests, employee.totals), hasContent));
    hasContent = true;
  });

  return content;
}

export function createOtReportPdfDefinition(report: OtReportPdfDocument) {
  const definition = getOtReportDefinition(report.variant)!;
  const reportContent = definition.detail ? detailDocument(report) : summaryDocument(report);
  const content = reportContent.length ? reportContent : [pageBlock([
    ...heading(reportTitle(report.variant, report.model), periodLabel(report.model)),
    { text: "ไม่มีพนักงานในช่วงเวลานี้", alignment: "center", margin: [0, 12, 0, 0] },
  ])];
  const generated = generatedAtLabel(report.model.generatedAt);

  return {
    pageSize: "A4",
    pageMargins: [20, 52, 20, 20],
    defaultStyle: { font: FONT, fontSize: 12, color: "#000000" },
    content,
    header: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: generated, width: "*", alignment: "left" },
        { text: OT_REPORT_LABELS.company, width: "*", alignment: "center", fontSize: 14, bold: true },
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
      groupTitle: { fontSize: 14, bold: true, color: "#37474f" },
      monthHeading: { fontSize: 14, bold: true, margin: [0, 0, 0, 10] },
      employeeHeading: { fontSize: 16, bold: true },
      unknownHeading: { fontSize: 12, bold: true },
    },
  };
}

export const OT_PDF_TABLE_LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => TABLE_VERTICAL_LINE_WIDTH,
  hLineColor: () => GRID_COLOR,
  vLineColor: () => GRID_COLOR,
  paddingLeft: () => TABLE_HORIZONTAL_PADDING,
  paddingRight: () => TABLE_HORIZONTAL_PADDING,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};
