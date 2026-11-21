// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { permissionsForRole } from "@/tests/setup/permissions";

let mockRole = "employee";

vi.mock("@/components/hrm/HrmShell", () => ({
  useHrmRole: () => ({ permissions: permissionsForRole(mockRole), employeeId: "emp-1", email: "user@example.com" }),
}));

import ApprovalModule from "@/components/hrm/approvals/ApprovalModule";

const sampleItems = [
  {
    id: "ot-1", type: "ot", kind: "ทำ OT", employeeId: "emp-2", employeeName: "ธนากร มั่นคง",
    detail: "21 ก.ย. 2569 · 18:00–20:00 · 2 ชม.", reason: "ปิดงาน release", submittedAt: "2026-09-21T10:00:00Z",
    statusCode: "pending", statusName: "รอจัดการ",
  },
];

function mockFetchOnce(items: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApprovalModule role gating", () => {
  it("does not render approve/reject buttons for an employee", async () => {
    mockRole = "employee";
    mockFetchOnce(sampleItems);
    render(<ApprovalModule />);

    expect((await screen.findAllByText("ธนากร มั่นคง")).length).toBeGreaterThan(0);
    expect(screen.queryByText("อนุมัติ")).not.toBeInTheDocument();
    expect(screen.queryByText("ไม่อนุมัติ")).not.toBeInTheDocument();
  });

  it("renders approve/reject buttons for hr", async () => {
    mockRole = "hr";
    mockFetchOnce(sampleItems);
    render(<ApprovalModule />);

    expect((await screen.findAllByText("อนุมัติ")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ไม่อนุมัติ").length).toBeGreaterThan(0);
  });

  it("renders approve/reject buttons for executive", async () => {
    mockRole = "executive";
    mockFetchOnce(sampleItems);
    render(<ApprovalModule />);

    expect((await screen.findAllByText("อนุมัติ")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("ไม่อนุมัติ").length).toBeGreaterThan(0);
  });
});
