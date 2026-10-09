import { describe, expect, it } from "vitest";
import { aggregateLeaveReport, formatLeaveDays, type LeaveReportEmployee, type LeaveReportRequestRow } from "./model";

const employees: LeaveReportEmployee[] = [{
  id: "a", code: "0001", firstName: "สมชาย", lastName: "ใจดี", departmentId: 1, departmentName: "สำนักงาน",
  positionId: 1, positionName: "พนักงาน", startDate: "2024-01-01", endDate: null,
}];
const leaveTypes = [
  { code: "extra", name: "ลาพิเศษ", isActive: true },
  { code: "inactive", name: "ลาประเภทเดิม", isActive: false },
  { code: "birthday", name: "ลาวันเกิด", isActive: true },
  { code: "personal", name: "ลากิจ", isActive: true },
  { code: "sick", name: "ลาป่วย", isActive: true },
];
const requests: LeaveReportRequestRow[] = [
  { id: "cross-year", employeeId: "a", leaveTypeCode: "sick", startOn: "2025-12-31", endOn: "2026-01-02", session: "full", reason: "ข้ามปี" },
  { id: "cross-month", employeeId: "a", leaveTypeCode: "sick", startOn: "2026-01-31", endOn: "2026-02-02", session: "full", reason: "ข้ามเดือน" },
  { id: "half-day", employeeId: "a", leaveTypeCode: "personal", startOn: "2026-02-15", endOn: "2026-02-15", session: "am", reason: "ครึ่งวัน" },
  { id: "cross-month-birthday", employeeId: "a", leaveTypeCode: "birthday", startOn: "2026-03-31", endOn: "2026-04-01", session: "full", reason: "วันเกิด" },
  { id: "inactive-history", employeeId: "a", leaveTypeCode: "inactive", startOn: "2026-01-20", endOn: "2026-01-20", session: "full", reason: "ประวัติเดิม" },
];

describe("Leave report aggregation", () => {
  it("clips overlapping requests to month and year while preserving half-day arithmetic", () => {
    const report = aggregateLeaveReport({
      year: 2026, periodStart: "2026-01-01", periodEnd: "2026-12-31", employees, leaveTypes, requests,
      generatedAt: new Date("2026-10-08T05:00:00.000Z"),
    });
    expect(report.types.map((type) => type.code)).toEqual(["sick", "personal", "birthday", "extra", "inactive"]);
    expect(report.totals.daysHalfUnits).toBe(17);
    expect(formatLeaveDays(report.totals.daysHalfUnits)).toBe("8.5");
    expect(report.totals.byType).toMatchObject({ sick: 10, personal: 1, birthday: 4, inactive: 2, extra: 0 });
    expect(report.totals.requestCount).toBe(5);
    expect(report.employees[0].months.map((month) => month.totals.daysHalfUnits)).toEqual([8, 5, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(report.employees[0].months.reduce((sum, month) => sum + month.totals.daysHalfUnits, 0)).toBe(report.totals.daysHalfUnits);
    expect(report.employees[0].months[0].requests.find((request) => request.id === "cross-year")?.clippedStartOn).toBe("2026-01-01");
    expect(report.employees[0].months[1].requests.find((request) => request.id === "cross-month")?.daysHalfUnits).toBe(4);
  });

  it("keeps a half-day half-day when the request is a single date and clips multi-day requests as whole calendar days", () => {
    const february = aggregateLeaveReport({
      year: 2026, month: 2, periodStart: "2026-02-01", periodEnd: "2026-02-28", employees, leaveTypes, requests,
    });
    expect(february.totals.byType.personal).toBe(1);
    expect(february.totals.byType.sick).toBe(4);
    expect(february.totals.daysHalfUnits).toBe(5);
  });
});
