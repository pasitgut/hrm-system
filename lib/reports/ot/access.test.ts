import { describe, expect, it } from "vitest";
import { assertOtReportExportAccess, getOtReportAccess, OtReportAccessError } from "./access";
import { getOtReportDefinition } from "./options";

const ownId = "edb5ec5c-1b19-47ca-8598-ff2716f58750";
const otherId = "8591f318-500e-4f78-8d27-0e9f0a9f976d";

describe("OT report access", () => {
  it("requires both reports.view and an actual OT permission", () => {
    expect(() => getOtReportAccess(["reports.view", "permissions.ot_view_self.disabled", "permissions.ot_request_self.disabled"], ownId)).toThrow(OtReportAccessError);
    expect(() => getOtReportAccess(["ot.view_company", "permissions.reports_view.disabled"], ownId)).toThrow(OtReportAccessError);
    expect(getOtReportAccess(["reports.view", "ot.view_self"], ownId).company).toBe(false);
  });

  it("limits self-only access to the caller's own individual reports", () => {
    const access = getOtReportAccess(["reports.view", "ot.view_self"], ownId);
    assertOtReportExportAccess(access, getOtReportDefinition("monthly-individual")!, [ownId]);
    expect(() => assertOtReportExportAccess(access, getOtReportDefinition("monthly-all")!)).toThrow(OtReportAccessError);
    expect(() => assertOtReportExportAccess(access, getOtReportDefinition("yearly-individual")!, [otherId])).toThrow(OtReportAccessError);
  });

  it("allows company OT viewers to use company and selected employee variants", () => {
    const access = getOtReportAccess(["reports.view", "ot.view_company"], ownId);
    expect(() => assertOtReportExportAccess(access, getOtReportDefinition("yearly-all-month-pages")!)).not.toThrow();
    expect(() => assertOtReportExportAccess(access, getOtReportDefinition("yearly-individual-detail")!, [otherId])).not.toThrow();
  });
});
