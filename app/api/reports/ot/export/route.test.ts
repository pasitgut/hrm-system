import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiAuthError } from "@/lib/auth/dal";

const { mockRequireApiUser } = vi.hoisted(() => ({ mockRequireApiUser: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/dal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/dal")>();
  return { ...actual, requireApiUser: mockRequireApiUser };
});

import { POST } from "./route";

const ownId = "edb5ec5c-1b19-47ca-8598-ff2716f58750";
const otherId = "8591f318-500e-4f78-8d27-0e9f0a9f976d";
const companyUser = { sub: "user", employeeId: ownId, email: "user@example.test", role: "ceo", permissions: ["reports.view", "ot.view_company"] };
const selfUser = { sub: "user", employeeId: ownId, email: "user@example.test", role: "employee", permissions: ["reports.view", "ot.view_self"] };

function post(body: unknown) {
  return new NextRequest("http://localhost/api/reports/ot/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reports/ot/export", () => {
  beforeEach(() => mockRequireApiUser.mockReset());

  it("returns 401 for an unauthenticated request", async () => {
    mockRequireApiUser.mockRejectedValueOnce(new ApiAuthError(401, "Unauthorized"));
    const response = await POST(post({ variant: "yearly-all", year: 2026 }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 400 for an invalid variant payload before querying the database", async () => {
    mockRequireApiUser.mockResolvedValueOnce(companyUser);
    const response = await POST(post({ variant: "custom", year: 2026 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "ข้อมูลรายงานไม่ถูกต้อง" });
  });

  it("returns 403 when reports.view or company OT access is missing", async () => {
    mockRequireApiUser.mockResolvedValueOnce({
      ...companyUser,
      permissions: ["ot.view_company", "permissions.reports_view.disabled"],
    });
    const response = await POST(post({ variant: "yearly-all", year: 2026 }));
    expect(response.status).toBe(403);
  });

  it("prevents a self-only reader from exporting another employee", async () => {
    mockRequireApiUser.mockResolvedValueOnce(selfUser);
    const response = await POST(post({
      variant: "monthly-individual-detail",
      year: 2026,
      month: 1,
      employeeIds: [otherId],
    }));
    expect(response.status).toBe(403);
  });
});
