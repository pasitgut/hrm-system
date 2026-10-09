import { describe, expect, it } from "vitest";
import { getLeaveReportPeriod, leaveReportExportSchema } from "./options";

const ownId = "edb5ec5c-1b19-47ca-8598-ff2716f58750";

describe("leave report export validation", () => {
  it("requires a period month and employee selection for individual reports", () => {
    expect(leaveReportExportSchema.safeParse({ variant: "monthly-all", year: 2026 }).success).toBe(false);
    expect(leaveReportExportSchema.safeParse({ variant: "monthly-individual", year: 2026, month: 1 }).success).toBe(false);
    expect(leaveReportExportSchema.safeParse({ variant: "monthly-individual", year: 2026, month: 1, employeeIds: [ownId] }).success).toBe(true);
  });

  it("rejects duplicate employee ids, duplicate sorting, and wrong annual periods", () => {
    expect(leaveReportExportSchema.safeParse({ variant: "monthly-individual", year: 2026, month: 1, employeeIds: [ownId, ownId] }).success).toBe(false);
    expect(leaveReportExportSchema.safeParse({ variant: "yearly-all", year: 2026, month: 1 }).success).toBe(false);
    expect(leaveReportExportSchema.safeParse({ variant: "yearly-all", year: 2026, sortRules: [{ field: "days", direction: "asc" }, { field: "days", direction: "desc" }] }).success).toBe(false);
  });

  it("computes inclusive calendar date ranges", () => {
    expect(getLeaveReportPeriod(2026, 2)).toEqual({ startOn: "2026-02-01", endOn: "2026-02-28" });
    expect(getLeaveReportPeriod(2024).endOn).toBe("2024-12-31");
    expect(getLeaveReportPeriod(2024, 2).endOn).toBe("2024-02-29");
  });
});
