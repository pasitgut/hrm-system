import { describe, expect, it } from "vitest";
import { createOtReportPdfDefinition, OT_PDF_TABLE_LAYOUT } from "./pdfmake";
import { THAI_MONTHS, type OtReportEmployeeModel, type OtReportModel } from "./model";
import type { OtReportVariant } from "./options";

function sampleReport(variant: OtReportVariant, month: number | null = null, weekdayReason = "ตรวจงานหน้างาน") {
  const weekdayRequest = {
    id: "request-weekday",
    employeeId: "employee-1",
    startAt: "2026-01-13T11:00:00.000Z",
    endAt: "2026-01-13T12:30:00.000Z",
    startDate: "2026-01-13",
    endDate: "2026-01-13",
    startTime: "18:00",
    endTime: "19:30",
    month: 1,
    overtimeType: "weekday" as const,
    durationMs: 5_400_000,
    reason: weekdayReason,
  };
  const unknownRequest = {
    ...weekdayRequest,
    id: "request-unknown",
    overtimeType: "unknown" as const,
    month: 2,
    reason: "เตรียมเอกสาร",
  };
  const months = (month === null ? THAI_MONTHS.map((_, index) => index + 1) : [month]).map((itemMonth) => {
    const requests = itemMonth === 1 ? [weekdayRequest] : itemMonth === 2 ? [unknownRequest] : [];
    const totals = {
      weekdayMs: requests.filter((request) => request.overtimeType === "weekday").reduce((sum, request) => sum + request.durationMs, 0),
      holidayMs: 0,
      unknownMs: requests.filter((request) => request.overtimeType === "unknown").reduce((sum, request) => sum + request.durationMs, 0),
      totalMs: requests.reduce((sum, request) => sum + request.durationMs, 0),
      requestCount: requests.length,
    };
    return { month: itemMonth, label: THAI_MONTHS[itemMonth - 1], totals, requests };
  });
  const totals = months.reduce((result, item) => ({
    weekdayMs: result.weekdayMs + item.totals.weekdayMs,
    holidayMs: 0,
    unknownMs: result.unknownMs + item.totals.unknownMs,
    totalMs: result.totalMs + item.totals.totalMs,
    requestCount: result.requestCount + item.totals.requestCount,
  }), { weekdayMs: 0, holidayMs: 0, unknownMs: 0, totalMs: 0, requestCount: 0 });

  const employee: OtReportEmployeeModel = {
    employee: {
      id: "employee-1",
      code: "E-001",
      firstName: "อรุณ",
      lastName: "ทดสอบ",
      departmentId: 1,
      departmentName: "บัญชี",
      positionId: 1,
      positionName: "เจ้าหน้าที่",
      startDate: "2020-01-01",
      endDate: null,
    },
    name: "อรุณ ทดสอบ",
    totals,
    months,
  };
  const model: OtReportModel = {
    year: 2026,
    month,
    periodStart: month === null ? "2026-01-01" : `2026-${String(month).padStart(2, "0")}-01`,
    periodEnd: month === null ? "2026-12-31" : `2026-${String(month).padStart(2, "0")}-28`,
    periodLabel: month === null ? "ปี 2026" : `${THAI_MONTHS[month - 1]} 2026`,
    generatedAt: "2026-10-27T08:00:00.000Z",
    employees: [employee],
    totals,
    hasUnknownType: totals.unknownMs > 0,
    detailCount: totals.requestCount,
  };

  return { variant, model, sortRules: [] };
}

function collectTableNodes(value: unknown): Array<{ table: { headerRows?: number; widths: unknown[]; body: unknown[][] } }> {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectTableNodes);

  const node = value as Record<string, unknown>;
  const tables = node.table && typeof node.table === "object"
    ? [node as { table: { headerRows?: number; widths: unknown[]; body: unknown[][] } }]
    : [];
  return [...tables, ...Object.values(node).flatMap(collectTableNodes)];
}

describe("createOtReportPdfDefinition", () => {
  it("builds searchable summary tables with repeated header rows and dynamic page labels", () => {
    const definition = createOtReportPdfDefinition(sampleReport("yearly-all"));
    const summaryTable = collectTableNodes(definition.content).find((node) => node.table.headerRows === 1);
    const header = definition.header(2, 5);

    expect(definition.pageSize).toBe("A4");
    expect(definition.defaultStyle.font).toBe("THSarabunNew");
    expect(summaryTable?.table.body).toHaveLength(2);
    expect(JSON.stringify(summaryTable)).toContain("อรุณ ทดสอบ");
    expect(JSON.stringify(header)).toContain("หน้า 2 / 5");
  });

  it("creates known and unknown detail tables with repeated report and column headers", () => {
    const definition = createOtReportPdfDefinition(sampleReport("yearly-individual-detail"));
    const tables = collectTableNodes(definition.content);
    const knownTable = tables.find((node) => node.table.widths.length === 10 && node.table.headerRows === 7);
    const unknownTable = tables.find((node) => node.table.widths.length === 7 && node.table.headerRows === 6);

    expect(knownTable).toBeDefined();
    expect(unknownTable).toBeDefined();
    expect(JSON.stringify(definition.content)).toContain("ตรวจงานหน้างาน");
    expect(JSON.stringify(definition.content)).toContain("เตรียมเอกสาร");
  });

  it("keeps every table inside the printable page width after cell padding and grid lines", () => {
    const definition = createOtReportPdfDefinition(sampleReport("yearly-individual-detail"));
    const tables = collectTableNodes(definition.content);

    for (const node of tables) {
      const columns = node.table.widths.length;
      const declaredWidth = node.table.widths.reduce<number>((total, width) => total + Number(width), 0);
      const insets = columns * (OT_PDF_TABLE_LAYOUT.paddingLeft() + OT_PDF_TABLE_LAYOUT.paddingRight())
        + (columns + 1) * OT_PDF_TABLE_LAYOUT.vLineWidth();

      expect(declaredWidth + insets).toBeLessThanOrEqual(555.28 + 0.01);
    }
  });

  it("leaves enough room for full Thai month labels in month-column reports", () => {
    const definition = createOtReportPdfDefinition(sampleReport("yearly-all-month-columns"));
    const monthTable = collectTableNodes(definition.content)
      .find((node) => node.table.widths.length === 7 && node.table.headerRows === 1 && node.table.body.length === 13);

    expect(Number(monthTable?.table.widths[0])).toBeGreaterThan(70);
  });

  it("splits long OT reasons across continuation rows without dropping text", () => {
    const reason = `Long reason ${"work detail ".repeat(80)}OTEND9F4C`;
    const definition = createOtReportPdfDefinition(sampleReport("yearly-individual-detail", null, reason));
    const detailTable = collectTableNodes(definition.content)
      .find((node) => node.table.widths.length === 10 && node.table.headerRows === 7);
    const reasonChunks = detailTable?.table.body.slice(7).map((row) => {
      const reasonCell = row[8] as { text?: string };
      return reasonCell.text ?? "";
    }).filter(Boolean) ?? [];

    expect(reasonChunks.length).toBeGreaterThan(1);
    expect(reasonChunks.join("")).toBe(reason);
    expect(Math.max(...reasonChunks.map((chunk) => Array.from(chunk).length))).toBeLessThanOrEqual(400);
  });

  it("keeps the yearly individual month pages and annual summary on separate pages", () => {
    const definition = createOtReportPdfDefinition(sampleReport("yearly-individual-month-pages"));
    const pageBreaks = definition.content.filter((node: Record<string, unknown>) => node.pageBreak === "before");

    expect(definition.content).toHaveLength(13);
    expect(pageBreaks).toHaveLength(12);
  });
});
