import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiAuthError } from "@/lib/auth/dal";

const { mockRequireApiUser, mockListOtReportEmployees, mockGetOwnOtReportEmployee } = vi.hoisted(() => ({
  mockRequireApiUser: vi.fn(),
  mockListOtReportEmployees: vi.fn(),
  mockGetOwnOtReportEmployee: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/dal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/dal")>();
  return { ...actual, requireApiUser: mockRequireApiUser };
});
vi.mock("@/lib/reports/ot/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/ot/service")>();
  return {
    ...actual,
    listOtReportEmployees: mockListOtReportEmployees,
    getOwnOtReportEmployee: mockGetOwnOtReportEmployee,
  };
});

import { GET } from "./route";

const companyUser = { sub: "user", employeeId: "edb5ec5c-1b19-47ca-8598-ff2716f58750", email: "user@example.test", role: "executive", permissions: ["reports.view", "ot.view_company"] };

function get() {
  return new NextRequest("http://localhost/api/reports/ot/options");
}

describe("GET /api/reports/ot/options", () => {
  beforeEach(() => {
    mockRequireApiUser.mockReset();
    mockListOtReportEmployees.mockReset();
    mockGetOwnOtReportEmployee.mockReset();
  });

  it("returns 401 for an unauthenticated request", async () => {
    mockRequireApiUser.mockRejectedValueOnce(new ApiAuthError(401, "Unauthorized"));
    expect((await GET(get())).status).toBe(401);
  });

  it("requires a real OT permission as well as reports.view", async () => {
    mockRequireApiUser.mockResolvedValueOnce({
      ...companyUser,
      permissions: ["reports.view", "permissions.ot_view_self.disabled", "permissions.ot_request_self.disabled"],
    });
    expect((await GET(get())).status).toBe(403);
    expect(mockListOtReportEmployees).not.toHaveBeenCalled();
  });

  it("allows a company viewer to receive an empty list without treating the report page as forbidden", async () => {
    mockRequireApiUser.mockResolvedValueOnce(companyUser);
    mockListOtReportEmployees.mockResolvedValueOnce([]);
    const response = await GET(get());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ employees: [], canViewCompany: true });
  });
});
