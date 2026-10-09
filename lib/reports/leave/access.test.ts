import { describe, expect, it } from "vitest";
import { assertLeaveReportExportAccess, getLeaveReportAccess, LeaveReportAccessError } from "./access";
import { getLeaveReportDefinition } from "./options";

const ownId = "edb5ec5c-1b19-47ca-8598-ff2716f58750";
const otherId = "8591f318-500e-4f78-8d27-0e9f0a9f976d";

describe("Leave report access", () => {
  it("requires report access and a leave specific permission", () => {
    expect(() => getLeaveReportAccess(["reports.view", "permissions.leave_view_self.disabled", "permissions.leave_request_self.disabled"], ownId)).toThrow(LeaveReportAccessError);
    expect(() => getLeaveReportAccess(["leave.view_company", "permissions.reports_view.disabled"], ownId)).toThrow(LeaveReportAccessError);
    expect(getLeaveReportAccess(["reports.view", "leave.view_self"], ownId).company).toBe(false);
  });

  it("restricts self-only users to individual exports for their own employee ID", () => {
    const access = getLeaveReportAccess(["reports.view", "leave.request.self"], ownId);
    expect(() => assertLeaveReportExportAccess(access, getLeaveReportDefinition("monthly-individual")!, [ownId])).not.toThrow();
    expect(() => assertLeaveReportExportAccess(access, getLeaveReportDefinition("yearly-all")!)).toThrow(LeaveReportAccessError);
    expect(() => assertLeaveReportExportAccess(access, getLeaveReportDefinition("yearly-individual")!, [otherId])).toThrow(LeaveReportAccessError);
  });

  it("allows company leave viewers to export company and selected employee reports", () => {
    const access = getLeaveReportAccess(["reports.view", "leave.approve"], ownId);
    expect(() => assertLeaveReportExportAccess(access, getLeaveReportDefinition("yearly-all-month-pages")!)).not.toThrow();
    expect(() => assertLeaveReportExportAccess(access, getLeaveReportDefinition("yearly-individual-detail")!, [otherId])).not.toThrow();
  });
});
