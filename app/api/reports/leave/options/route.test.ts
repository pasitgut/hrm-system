import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ requireApiUser: vi.fn(), listEmployees: vi.fn(), getOwnEmployee: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/dal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/dal")>();
  return { ...actual, requireApiUser: mocks.requireApiUser };
});
vi.mock("@/lib/reports/leave/service", () => ({
  listLeaveReportEmployees: mocks.listEmployees,
  getOwnLeaveReportEmployee: mocks.getOwnEmployee,
  LeaveReportServiceError: class LeaveReportServiceError extends Error { status = 400; },
}));

import { GET } from "./route";

describe("GET /api/reports/leave/options", () => {
  beforeEach(() => {
    mocks.requireApiUser.mockReset();
    mocks.listEmployees.mockReset();
    mocks.getOwnEmployee.mockReset();
  });

  it("requires reports.view and a leave report permission before loading employee options", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({ employeeId: "a", permissions: ["leave.view_company", "permissions.reports_view.disabled"] });
    const response = await GET(new NextRequest("http://localhost/api/reports/leave/options"));
    expect(response.status).toBe(403);
    expect(mocks.listEmployees).not.toHaveBeenCalled();
    expect(mocks.getOwnEmployee).not.toHaveBeenCalled();
  });

  it("does not expose company options to self-only users", async () => {
    mocks.requireApiUser.mockResolvedValueOnce({ employeeId: "own-id", permissions: ["reports.view", "leave.view_self"] });
    mocks.getOwnEmployee.mockResolvedValueOnce({ id: "own-id", code: "0001", name: "Own Employee", departmentName: "Department" });
    const response = await GET(new NextRequest("http://localhost/api/reports/leave/options"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ canViewCompany: false, employees: [{ id: "own-id" }] });
    expect(mocks.listEmployees).not.toHaveBeenCalled();
  });
});
