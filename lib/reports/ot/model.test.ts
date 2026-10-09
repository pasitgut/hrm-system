import { describe, expect, it } from "vitest";
import { aggregateOtReport, formatOtHours, sortOtReportEmployees, type OtReportEmployee, type OtReportRequestRow } from "./model";

const employees: OtReportEmployee[] = [
  { id: "a", code: "0002", firstName: "กานต์", lastName: "ใจดี", departmentId: 1, departmentName: "ตรวจสอบ", positionId: 1, positionName: "เจ้าหน้าที่", startDate: "2025-01-01", endDate: null },
  { id: "b", code: "0001", firstName: "นที", lastName: "แสนดี", departmentId: 1, departmentName: "ตรวจสอบ", positionId: 2, positionName: "หัวหน้า", startDate: "2020-01-01", endDate: "2026-01-31" },
];

const requests: OtReportRequestRow[] = [
  { id: "weekday", employeeId: "a", startAt: new Date("2025-12-31T17:00:00.000Z"), endAt: new Date("2025-12-31T18:15:00.000Z"), overtimeType: "weekday", reason: "ตรวจรายการ" },
  { id: "cross-month", employeeId: "a", startAt: new Date("2026-01-31T16:30:00.000Z"), endAt: new Date("2026-01-31T18:00:00.000Z"), overtimeType: "holiday", reason: "งานข้ามวัน" },
  { id: "unknown-a", employeeId: "a", startAt: new Date("2026-02-10T03:00:00.000Z"), endAt: new Date("2026-02-10T03:30:00.000Z"), overtimeType: null, reason: "งานประเภทไม่ระบุ" },
  { id: "unknown-b", employeeId: "b", startAt: new Date("2026-01-01T00:00:00.000Z"), endAt: new Date("2026-01-01T01:00:00.000Z"), overtimeType: "legacy", reason: "ข้อมูลเดิม" },
];

const period = { periodStart: "2026-01-01", periodEnd: "2026-12-31", generatedAt: new Date("2026-12-31T05:00:00.000Z") };

describe("OT report aggregation", () => {
  it("uses Bangkok calendar month, keeps unknown type separate, and sums milliseconds before formatting", () => {
    const annual = aggregateOtReport({ year: 2026, employees, requests, ...period });
    const january = aggregateOtReport({ year: 2026, month: 1, employees, requests, ...period });
    const february = annual.employees[0].months.find((month) => month.month === 2)!;
    const januaryA = january.employees.find((employee) => employee.employee.id === "a")!;

    expect(january.month).toBe(1);
    expect(january.totals.weekdayMs).toBe(4_500_000);
    expect(january.totals.holidayMs).toBe(5_400_000);
    expect(january.totals.unknownMs).toBe(3_600_000);
    expect(january.totals.totalMs).toBe(13_500_000);
    expect(annual.totals.totalMs).toBe(january.totals.totalMs + february.totals.totalMs);
    expect(formatOtHours(annual.totals.totalMs)).toBe("4.25");
    expect(januaryA.months[0].requests[1].startDate).toBe("2026-01-31");
    expect(januaryA.months[0].requests[1].endDate).toBe("2026-02-01");
    expect(januaryA.months[0].totals.unknownMs).toBe(0);
    expect(annual.hasUnknownType).toBe(true);
    expect(february.totals.unknownMs).toBe(1_800_000);
  });

  it("keeps month groups and employee tie breaks deterministic", () => {
    const report = aggregateOtReport({ year: 2026, employees, requests, ...period });
    const sorted = sortOtReportEmployees(report.employees, [
      { field: "hours", direction: "desc" },
      { field: "name", direction: "asc" },
    ]);
    expect(sorted.map((entry) => entry.employee.code)).toEqual(["0002", "0001"]);
    expect(report.employees.every((employee) => employee.months.length === 12)).toBe(true);
    expect(report.employees[0].months[5].totals.totalMs).toBe(0);
  });
});
