// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

let mockRole = "supervisor";

vi.mock("@/components/hrm/HrmShell", () => ({
  useHrmRole: () => ({ role: mockRole, employeeId: "emp-1", email: "user@peopleos.co" }),
}));

import EmployeeModule from "@/components/hrm/employees/EmployeeModule";

const employeeItem = {
  id: "emp-1",
  code: "E001",
  prefix: "คุณ",
  firstName: "ทดสอบ",
  lastName: "ใจดี",
  nickname: "เทส",
  citizenId: null,
  firstNameEn: null,
  lastNameEn: null,
  birthDate: null,
  email: "test@example.com",
  phone: null,
  avatarUrl: null,
  startDate: "2026-01-01",
  department: { id: 1, name: "Engineering" },
  position: { id: 1, name: "Software Engineer" },
  employmentStatus: { id: 1, name: "ปฏิบัติงาน" },
  employmentType: { id: 1, code: "full_time", name: "พนักงานประจำ" },
  managerId: null,
  managerName: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function mockResponse(url: string) {
  if (url.startsWith("/api/departments")) return { ok: true, json: async () => ({ items: [{ id: 1, name: "Engineering" }] }) };
  if (url.startsWith("/api/positions")) return { ok: true, json: async () => ({ items: [{ id: 1, name: "Software Engineer" }] }) };
  if (url.startsWith("/api/employment-statuses")) return { ok: true, json: async () => ({ items: [{ id: 1, name: "ปฏิบัติงาน" }] }) };
  if (url.startsWith("/api/employment-types")) return { ok: true, json: async () => ({ items: [{ id: 1, code: "full_time", name: "พนักงานประจำ" }] }) };
  if (url.startsWith("/api/employees")) return { ok: true, json: async () => ({ items: [employeeItem] }) };
  throw new Error(`unexpected fetch: ${url}`);
}

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(mockResponse(url))));
}

afterEach(() => {
  vi.unstubAllGlobals();
  mockRole = "supervisor";
});

describe("EmployeeModule", () => {
  it("loads real data from the lookup + list endpoints and renders the directory", async () => {
    stubFetch();
    render(<EmployeeModule />);

    await waitFor(() => expect(screen.getAllByText(/ทดสอบ ใจดี/).length).toBeGreaterThan(0));
    expect(screen.getAllByText("Engineering").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Software Engineer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("พนักงานประจำ").length).toBeGreaterThan(0);
  });

  it("hides the add-employee action for an employee role (canManageEmployees gate)", async () => {
    mockRole = "employee";
    stubFetch();
    render(<EmployeeModule />);

    await waitFor(() => expect(screen.getAllByText(/ทดสอบ ใจดี/).length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "เพิ่มพนักงาน" })).not.toBeInTheDocument();
  });

  it("shows the add-employee action for a supervisor", async () => {
    stubFetch();
    render(<EmployeeModule />);

    await waitFor(() => expect(screen.getByRole("button", { name: "เพิ่มพนักงาน" })).toBeInTheDocument());
  });

  it("filters the rendered list by the search query, client-side", async () => {
    stubFetch();
    render(<EmployeeModule />);
    await waitFor(() => expect(screen.getAllByText(/ทดสอบ ใจดี/).length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText("ค้นหาพนักงาน"), { target: { value: "ไม่มีอยู่จริง" } });
    await waitFor(() => expect(screen.getByText("ไม่พบพนักงานที่ตรงกับตัวกรอง")).toBeInTheDocument());
    expect(screen.queryAllByText(/ทดสอบ ใจดี/)).toHaveLength(0);
  });
});
