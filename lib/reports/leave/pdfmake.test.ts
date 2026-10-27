import { describe, expect, it } from "vitest";
import { aggregateLeaveReport, type LeaveReportEmployee, type LeaveReportRequestRow } from "./model";
import { getLeaveReportDefinition, getLeaveReportPeriod, LEAVE_REPORT_VARIANTS } from "./options";
import { createLeaveReportPdfDefinition } from "./pdfmake";
import { renderLeaveReportPdf } from "@/lib/reports/pdf";

const employees: LeaveReportEmployee[] = [{
  id: "employee-1",
  code: "0001",
  firstName: "สมชาย",
  lastName: "ใจดี",
  departmentId: 1,
  departmentName: "สำนักงาน",
  positionId: 1,
  positionName: "พนักงาน",
  startDate: "2024-01-01",
  endDate: null,
}];
const leaveTypes = [
  { code: "sick", name: "ลาป่วย", isActive: true },
  { code: "personal", name: "ลากิจ", isActive: true },
  { code: "birthday", name: "ลาวันเกิด", isActive: true },
  { code: "training", name: "ลาอบรม", isActive: true },
  { code: "inactive", name: "ลาเดิม", isActive: false },
];
const requests: LeaveReportRequestRow[] = [
  { id: "1", employeeId: "employee-1", leaveTypeCode: "birthday", startOn: "2026-10-09", endOn: "2026-10-09", session: "full", reason: "กิจธุระ <ทดสอบ>" },
  { id: "2", employeeId: "employee-1", leaveTypeCode: "inactive", startOn: "2026-10-10", endOn: "2026-10-10", session: "am", reason: `รายละเอียด ${"ตรวจสอบเอกสารประกอบและประสานงาน ".repeat(35)}LEAVEEND7A3C` },
];

function reportFor(variant: (typeof LEAVE_REPORT_VARIANTS)[number]["id"]) {
  const definition = getLeaveReportDefinition(variant)!;
  const month = definition.period === "monthly" ? 10 : undefined;
  const period = getLeaveReportPeriod(2026, month);
  const model = aggregateLeaveReport({
    year: 2026,
    month,
    periodStart: period.startOn,
    periodEnd: period.endOn,
    generatedAt: new Date("2026-10-08T05:00:00.000Z"),
    employees,
    leaveTypes,
    requests,
  });
  return { variant, model, sortRules: [] as const };
}

function collectTables(value: unknown): Array<{ table: { headerRows?: number; widths: unknown[]; body: unknown[][] } }> {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectTables);
  const node = value as Record<string, unknown>;
  const tables = node.table && typeof node.table === "object"
    ? [node as { table: { headerRows?: number; widths: unknown[]; body: unknown[][] } }]
    : [];
  return [...tables, ...Object.values(node).flatMap(collectTables)];
}

describe("Leave PDFMake documents", () => {
  it("builds every report variant and keeps table widths within the printable A4 area", () => {
    for (const { id } of LEAVE_REPORT_VARIANTS) {
      const definition = createLeaveReportPdfDefinition(reportFor(id));
      expect(definition.pageSize).toBe("A4");
      expect(definition.defaultStyle.font).toBe("THSarabunNew");
      expect(definition.content.length).toBeGreaterThan(0);
      for (const table of collectTables(definition.content)) {
        const widths = table.table.widths.map(Number);
        const insets = widths.length * 5 + (widths.length + 1) * 0.5;
        expect(widths.reduce((sum, width) => sum + width, 0) + insets).toBeLessThanOrEqual(555.3);
      }
    }
  });

  it("splits leave-type columns and leaves imported reason text as plain PDF text", () => {
    const definition = createLeaveReportPdfDefinition(reportFor("monthly-all"));
    const tables = collectTables(definition.content).filter((table) => table.table.headerRows === 1);
    const serialized = JSON.stringify(definition.content);
    const details = JSON.stringify(createLeaveReportPdfDefinition(reportFor("monthly-individual-detail")).content);
    expect(tables).toHaveLength(2);
    expect(serialized).toContain("ประเภทวันลา ลาอบรม · ลาเดิม");
    expect(serialized).toContain("รวมทุกประเภท (วัน)");
    expect(details).toContain("กิจธุระ <ทดสอบ>");
    expect(JSON.stringify(definition.header(1, 1))).toContain("ข้อมูล ณ วันที่:");
  });

  it("repeats employee and table headings and preserves long detail reasons", () => {
    const definition = createLeaveReportPdfDefinition(reportFor("yearly-individual-detail"));
    const detail = collectTables(definition.content).find((table) => table.table.widths.length === 7 && table.table.headerRows === 6);
    expect(detail).toBeDefined();
    const reasons = detail!.table.body.slice(6).map((row) => (row[5] as { text?: string }).text ?? "").filter(Boolean);
    expect(reasons.length).toBeGreaterThan(2);
    expect(reasons.join("")).toContain("LEAVEEND7A3C");
    expect(JSON.stringify(detail!.table.body.slice(0, 6))).toContain("สมชาย ใจดี");
    expect(JSON.stringify(detail!.table.body.slice(0, 6))).toContain("เหตุผล");
  });

  it("keeps annual month detail pages and totals page separate, and renders a PDF buffer", async () => {
    const detailReport = reportFor("yearly-individual-month-pages-detail");
    const definition = createLeaveReportPdfDefinition(detailReport);
    expect(definition.content).toHaveLength(13);
    expect(definition.content.slice(1).every((node: Record<string, unknown>) => node.pageBreak === "before")).toBe(true);

    const pdf = await renderLeaveReportPdf(reportFor("monthly-individual-detail"));
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
