import { describe, expect, it } from "vitest";
import { OT_REPORT_VARIANTS, getOtReportPeriod, otReportExportSchema } from "./options";

const oneEmployee = "edb5ec5c-1b19-47ca-8598-ff2716f58750";

describe("OT report request contract", () => {
  it("exposes all 12 distinct report variants", () => {
    expect(OT_REPORT_VARIANTS).toHaveLength(12);
    expect(new Set(OT_REPORT_VARIANTS.map((item) => item.id)).size).toBe(12);
  });

  it("requires a selected employee for every individual report", () => {
    expect(otReportExportSchema.safeParse({ variant: "monthly-individual", year: 2026, month: 1 }).success).toBe(false);
    expect(otReportExportSchema.safeParse({ variant: "yearly-individual-detail", year: 2026, employeeIds: [oneEmployee] }).success).toBe(true);
    expect(otReportExportSchema.safeParse({ variant: "yearly-all", year: 2026, employeeIds: [oneEmployee] }).success).toBe(false);
  });

  it("rejects mismatched periods, duplicate people, and invalid year bounds", () => {
    expect(otReportExportSchema.safeParse({ variant: "yearly-all", year: 2026, month: 1 }).success).toBe(false);
    expect(otReportExportSchema.safeParse({ variant: "monthly-all", year: 2026 }).success).toBe(false);
    expect(otReportExportSchema.safeParse({ variant: "monthly-individual", year: 2026, month: 1, employeeIds: [oneEmployee, oneEmployee] }).success).toBe(false);
    expect(otReportExportSchema.safeParse({ variant: "monthly-all", year: 1999, month: 1 }).success).toBe(false);
  });

  it("uses full Bangkok calendar bounds, including leap February", () => {
    const february = getOtReportPeriod(2024, 2);
    expect(february.startAt.toISOString()).toBe("2024-01-31T17:00:00.000Z");
    expect(february.endAt.toISOString()).toBe("2024-02-29T17:00:00.000Z");
    expect(february.startLocalDate).toBe("2024-02-01");
    expect(february.endLocalDate).toBe("2024-02-29");
  });
});
