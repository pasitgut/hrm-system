import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiAuthError } from "@/lib/auth/dal";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  createModel: vi.fn(),
  renderPdf: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/dal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/dal")>();
  return { ...actual, requireApiUser: mocks.requireApiUser };
});
vi.mock("@/lib/reports/leave/service", () => ({
  createLeaveReportModel: mocks.createModel,
  LeaveReportServiceError: class LeaveReportServiceError extends Error { status = 400; },
}));
vi.mock("@/lib/reports/pdf", () => ({
  renderLeaveReportPdf: mocks.renderPdf,
}));

import { POST } from "./route";

const ownId = "edb5ec5c-1b19-47ca-8598-ff2716f58750";
const otherId = "8591f318-500e-4f78-8d27-0e9f0a9f976d";
const companyUser = { sub: "user", employeeId: ownId, email: "user@example.test", role: "executive", permissions: ["reports.view", "leave.view_company"] };
const selfUser = { sub: "user", employeeId: ownId, email: "user@example.test", role: "employee", permissions: ["reports.view", "leave.view_self"] };

function post(body: unknown) {
  return new NextRequest("http://localhost/api/reports/leave/export", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/reports/leave/export", () => {
  beforeEach(() => {
    mocks.requireApiUser.mockReset();
    mocks.createModel.mockReset();
    mocks.renderPdf.mockReset();
  });

  it("returns an auth response for an unauthenticated caller", async () => {
    mocks.requireApiUser.mockRejectedValueOnce(new ApiAuthError(401, "Unauthorized"));
    const response = await POST(post({ variant: "monthly-all", year: 2026, month: 10 }));
    expect(response.status).toBe(401);
  });

  it("rejects malformed reports and users without reports.view before querying", async () => {
    mocks.requireApiUser.mockResolvedValueOnce(companyUser);
    const invalid = await POST(post({ variant: "custom", year: 2026 }));
    expect(invalid.status).toBe(400);
    mocks.requireApiUser.mockResolvedValueOnce({ ...companyUser, permissions: ["leave.view_company", "permissions.reports_view.disabled"] });
    const denied = await POST(post({ variant: "yearly-all", year: 2026 }));
    expect(denied.status).toBe(403);
    expect(mocks.createModel).not.toHaveBeenCalled();
  });

  it("blocks self-only users from company reports and other employees", async () => {
    mocks.requireApiUser.mockResolvedValueOnce(selfUser);
    const company = await POST(post({ variant: "yearly-all", year: 2026 }));
    expect(company.status).toBe(403);
    mocks.requireApiUser.mockResolvedValueOnce(selfUser);
    const otherEmployee = await POST(post({ variant: "yearly-individual", year: 2026, employeeIds: [otherId] }));
    expect(otherEmployee.status).toBe(403);
    expect(mocks.createModel).not.toHaveBeenCalled();
  });

  it("returns a no-store PDF attachment for an authorized company report", async () => {
    mocks.requireApiUser.mockResolvedValueOnce(companyUser);
    mocks.createModel.mockResolvedValueOnce({ model: "fixture" });
    mocks.renderPdf.mockResolvedValueOnce(Buffer.from("%PDF-1.4 fixture"));
    const response = await POST(post({ variant: "monthly-all", year: 2026, month: 10, sortRules: [] }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toContain("leave-report-monthly-all-2026-10.pdf");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 8).toString()).toBe("%PDF-1.4");
  });
});
