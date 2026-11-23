// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ADMIN_TABLES } from "@/lib/admin-data/registry";
import AdminDataModule from "@/components/hrm/settings/AdminDataModule";

afterEach(() => {
  vi.unstubAllGlobals();
});

const SAMPLE_EMPLOYEE = {
  id: "emp-1",
  code: "1001",
  prefix: "นาย",
  firstName: "สมชาย",
  lastName: "ใจดี",
  nickname: "ชาย",
  email: "somchai@example.com",
  phone: "0812345678",
  citizenId: null,
  lineUid: null,
  startDate: "2026-01-01",
  endDate: null,
  baseSalary: 30000,
  departmentId: "1",
  departmentName: "Engineering",
  positionId: "1",
  positionName: "Engineer",
  employmentStatusId: "1",
  employmentStatusName: "ปฏิบัติงาน",
  employmentTypeId: "1",
  employmentTypeName: "ประจำ",
  isActive: true,
};

function stubAdminFetch(onDeleteCalled: (url: string) => void) {
  return vi.fn((url: string, options?: RequestInit) => {
    if (url === "/api/admin-data") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          tables: ADMIN_TABLES.map((t) => ({ ...t, rowCount: t.key === "employees" ? 1 : 0 })),
          lookups: {
            employees: [{ value: "emp-1", label: "1001 · สมชาย ใจดี" }],
            departments: [{ value: "1", label: "Engineering" }],
            positions: [{ value: "1", label: "Engineer" }],
            employmentStatuses: [{ value: "1", label: "ปฏิบัติงาน" }],
            employmentTypes: [{ value: "1", label: "ประจำ" }],
            leaveTypes: [],
            requestStatuses: [],
            roles: [{ value: "employee", label: "พนักงาน" }],
          },
        }),
      });
    }
    if (url.startsWith("/api/admin-data/employees?")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          rows: [SAMPLE_EMPLOYEE],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
      });
    }
    if (url === "/api/admin-data/employees/emp-1" && (!options || !options.method || options.method === "GET")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          table: "employees",
          id: "emp-1",
          label: "1001 · สมชาย ใจดี",
          confirmText: "1001",
          impacts: [
            { label: "บัญชีผู้ใช้ (users)", count: 1, action: "delete" },
            { label: "คำขอ OT ของพนักงาน", count: 2, action: "delete" },
          ],
        }),
      });
    }
    if (url === "/api/admin-data/employees/emp-1" && options?.method === "DELETE") {
      onDeleteCalled(url);
      return Promise.resolve({
        ok: true,
        json: async () => ({
          deleted: true,
          id: "emp-1",
          deletedRelated: { users: 1, overtimeRequests: 2 },
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ rows: [], total: 0, page: 1, pageSize: 50 }) });
  });
}

describe("AdminDataModule", () => {
  it("lists tables and rows and requires typing employee code before permanent deletion", async () => {
    const deleteSpy = vi.fn();
    vi.stubGlobal("fetch", stubAdminFetch(deleteSpy));

    render(<AdminDataModule />);

    expect(await screen.findByText("somchai@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เพิ่มรายการ" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ลบถาวร" }));

    expect(await screen.findByText(/1001 · สมชาย ใจดี/)).toBeInTheDocument();
    expect(screen.getByText("บัญชีผู้ใช้ (users)")).toBeInTheDocument();
    expect(screen.getByText("ลบ 1 รายการ")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "ยืนยันลบถาวร" });
    expect(confirmBtn).toBeDisabled();

    const codeInput = screen.getByLabelText(/พิมพ์รหัส "1001" เพื่อยืนยันการลบถาวร/);
    fireEvent.change(codeInput, { target: { value: "9999" } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(codeInput, { target: { value: "1001" } });
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("/api/admin-data/employees/emp-1"));
    expect(await screen.findByRole("status")).toHaveTextContent("ลบข้อมูลออกจากตาราง “พนักงาน” ถาวรเรียบร้อยแล้ว");
  });
});
