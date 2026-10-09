import { describe, expect, it } from "vitest";
import { aggregateLeaveReport, type LeaveReportEmployee, type LeaveReportRequestRow } from "./model";
import { createLeaveReportMarkup } from "./template";

const employees: LeaveReportEmployee[] = [{ id: "a", code: "0001", firstName: "สมชาย", lastName: "ใจดี", departmentId: 1, departmentName: "สำนักงาน", positionId: 1, positionName: "พนักงาน", startDate: "2024-01-01", endDate: null }];
const report = aggregateLeaveReport({
  year: 2026, month: 10, periodStart: "2026-10-01", periodEnd: "2026-10-31", employees,
  leaveTypes: [
    { code: "sick", name: "ลาป่วย", isActive: true },
    { code: "personal", name: "ลากิจ", isActive: true },
    { code: "birthday", name: "ลาวันเกิด", isActive: true },
    { code: "training", name: "ลาอบรม", isActive: true },
    { code: "inactive", name: "ลาเดิม", isActive: false },
  ],
  requests: [
    { id: "1", employeeId: "a", leaveTypeCode: "birthday", startOn: "2026-10-09", endOn: "2026-10-09", session: "full", reason: "กิจธุระ <ทดสอบ>" },
    { id: "2", employeeId: "a", leaveTypeCode: "inactive", startOn: "2026-10-10", endOn: "2026-10-10", session: "full", reason: "ประวัติประเภทเดิม" },
  ] as LeaveReportRequestRow[],
  generatedAt: new Date("2026-10-08T05:00:00.000Z"),
});

describe("Leave PDF template", () => {
  it("shows dynamic type headings, blank zero cells, total zero values, and escapes request text", () => {
    const markup = createLeaveReportMarkup({ variant: "monthly-all", model: report, sortRules: [] }, "regular-font", "bold-font");
    expect(markup.html).toContain("รายงานวันลา (เดือน ตุลาคม 2026)");
    expect(markup.html).toContain("ลาป่วย (วัน)");
    expect(markup.html).toContain("ลาวันเกิด (วัน)");
    expect(markup.html).toContain("ลาเดิม (วัน)");
    expect(markup.html).toContain("รวมทุกประเภท (วัน)");
    expect(markup.html).toContain("<td class=\"numeric\"></td>");
    expect(markup.headerTemplate).toContain("ข้อมูล ณ วันที่:");
    expect(markup.headerTemplate).toContain("totalPages");
    const detailed = createLeaveReportMarkup({ variant: "monthly-individual-detail", model: report, sortRules: [] }, "regular-font", "bold-font");
    expect(detailed.html).toContain("&lt;ทดสอบ&gt;");
    expect(detailed.html).not.toContain("กิจธุระ <ทดสอบ>");
  });

  it("repeats employee identity in detail table heads and keeps long reasons breakable", () => {
    const detailed = createLeaveReportMarkup({ variant: "monthly-individual-detail", model: report, sortRules: [] }, "regular-font", "bold-font");
    expect(detailed.html).toContain("repeat-employee");
    expect(detailed.html).toContain("word-break:break-word");
    expect(detailed.html).toContain("เหตุผล");
  });
});
