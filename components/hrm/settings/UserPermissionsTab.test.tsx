// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { normalizePermissions } from "@/lib/auth/permissions";
import { ROLE_DEFAULT_PERMISSIONS } from "@/lib/auth/roles";
import UserPermissionsTab from "@/components/hrm/settings/UserPermissionsTab";

const BASE_ROLE_PERMISSIONS = {
  employee: [...ROLE_DEFAULT_PERMISSIONS.employee],
  hr: [...ROLE_DEFAULT_PERMISSIONS.hr],
  executive: [...ROLE_DEFAULT_PERMISSIONS.executive],
};

const EMPTY_ROLE_DENIED = {
  employee: [],
  hr: [],
  executive: [],
};

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        id: "user-1",
        employeeId: "emp-1",
        employeeCode: "1001",
        firstName: "สมชาย",
        lastName: "พนักงาน",
        email: "somchai@example.com",
        role: "employee",
        permissions: [...BASE_ROLE_PERMISSIONS.employee],
        deniedPages: [],
        isActive: true,
      },
      {
        id: "user-2",
        employeeId: "emp-2",
        employeeCode: "1002",
        firstName: "นภา",
        lastName: "ผู้บริหาร",
        email: "napa@example.com",
        role: "executive",
        permissions: [...BASE_ROLE_PERMISSIONS.executive],
        deniedPages: [],
        isActive: true,
      },
    ],
    missingAccounts: {
      eligibleCount: 0,
      missingEmailCount: 0,
      totalWithoutAccount: 0,
      missingEmailEmployees: [],
    },
    rolePermissions: BASE_ROLE_PERMISSIONS,
    roleDeniedPages: EMPTY_ROLE_DENIED,
    roleCounts: { employee: 1, hr: 0, executive: 1 },
    ...overrides,
  };
}

function activateTab(tabMatcher: RegExp) {
  const tab = screen.getByRole("tab", { name: tabMatcher });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
}

describe("UserPermissionsTab", () => {
  beforeEach(() => {
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Page Access Matrix by default, lets admin toggle role page access on/off, and saves roleDeniedPages", async () => {
    const updatedEmployeePerms = normalizePermissions([
      ...BASE_ROLE_PERMISSIONS.employee,
      "employees.documents.view",
    ]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makePayload(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rolePermissions: {
            ...BASE_ROLE_PERMISSIONS,
            employee: updatedEmployeePerms,
          },
          roleDeniedPages: {
            ...EMPTY_ROLE_DENIED,
            employee: ["reports"],
          },
          syncedUserCount: 1,
          syncedByRole: { employee: 1, hr: 0, executive: 0 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makePayload({
          rolePermissions: {
            ...BASE_ROLE_PERMISSIONS,
            employee: updatedEmployeePerms,
          },
          roleDeniedPages: {
            ...EMPTY_ROLE_DENIED,
            employee: ["reports"],
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<UserPermissionsTab />);

    // Default tab shows Page Access Matrix across 3 roles
    expect(await screen.findByRole("region", { name: "ตารางเปิดปิดการเข้าถึงแต่ละหน้าตามบทบาท" })).toBeInTheDocument();

    const empReportsSwitch = screen.getByRole("switch", { name: "เปิดปิดหน้า รายงาน (พนักงาน)" });
    const empDocumentsSwitch = screen.getByRole("switch", { name: "เปิดปิดหน้า เอกสาร (พนักงาน)" });
    expect(empReportsSwitch).toHaveAttribute("aria-checked", "true");
    expect(empDocumentsSwitch).toHaveAttribute("aria-checked", "false");

    // Turn OFF /reports for employee and turn ON /documents for employee
    fireEvent.click(empReportsSwitch);
    fireEvent.click(empDocumentsSwitch);

    expect(empReportsSwitch).toHaveAttribute("aria-checked", "false");
    expect(empDocumentsSwitch).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: "บันทึกการเข้าถึงหน้า" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/role-permissions",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    const patchCall = fetchMock.mock.calls.find(([url]) => url === "/api/role-permissions");
    expect(JSON.parse(patchCall![1].body)).toEqual({
      rolePermissions: { employee: updatedEmployeePerms },
      roleDeniedPages: { employee: ["reports"] },
      syncMode: "matching",
    });

    expect(await screen.findByRole("status")).toHaveTextContent("บันทึกสิทธิ์การเข้าถึงหน้าแล้ว · อัปเดต 1 บัญชี");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("renders Role Matrix Table in the second tab, filters categories like OT, and saves role permission changes", async () => {
    const updatedExecutive = [...BASE_ROLE_PERMISSIONS.executive, "work.create"];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makePayload(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rolePermissions: {
            ...BASE_ROLE_PERMISSIONS,
            executive: updatedExecutive,
          },
          roleDeniedPages: EMPTY_ROLE_DENIED,
          syncedUserCount: 1,
          syncedByRole: { employee: 0, hr: 0, executive: 1 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makePayload({
          rolePermissions: {
            ...BASE_ROLE_PERMISSIONS,
            executive: updatedExecutive,
          },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<UserPermissionsTab />);
    await screen.findByRole("region", { name: "ตารางเปิดปิดการเข้าถึงแต่ละหน้าตามบทบาท" });

    activateTab(/สิทธิ์รายละเอียด/);

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /พนักงาน/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /HR/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /ผู้บริหาร/ })).toBeInTheDocument();

    // Filter matrix to the OT category
    fireEvent.click(screen.getByRole("button", { name: "OT" }));
    expect(screen.getByRole("checkbox", { name: "ดู OT ของตัวเอง (พนักงาน)" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "อนุมัติ OT (ผู้บริหาร)" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "อนุมัติ OT (พนักงาน)" })).not.toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "ดูและส่งออกรายงาน (พนักงาน)" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ทั้งหมด" }));
    const execWorkCreate = screen.getByRole("checkbox", { name: "สร้างรายการติดตามงาน (ผู้บริหาร)" });
    fireEvent.click(execWorkCreate);
    expect(execWorkCreate).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "บันทึกสิทธิ์ตามบทบาท" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/role-permissions",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    const patchCall = fetchMock.mock.calls.find(([url]) => url === "/api/role-permissions");
    expect(JSON.parse(patchCall![1].body)).toEqual({
      rolePermissions: { executive: updatedExecutive },
      syncMode: "matching",
    });

    expect(await screen.findByRole("status")).toHaveTextContent("บันทึกสิทธิ์ตามบทบาทแล้ว · อัปเดต 1 บัญชี");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("keeps missing accounts provisioning working and lets admin toggle per-user page access", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makePayload({
          items: [],
          missingAccounts: {
            eligibleCount: 2,
            missingEmailCount: 1,
            totalWithoutAccount: 3,
            missingEmailEmployees: [
              { id: "emp-3", code: "1003", firstName: "สมชาย", lastName: "ไม่มีเมล", email: null, reason: "missing_email" },
            ],
          },
          roleCounts: { employee: 0, hr: 0, executive: 0 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          createdCount: 2,
          skippedCount: 1,
          skipped: [
            { id: "emp-3", code: "1003", firstName: "สมชาย", lastName: "ไม่มีเมล", email: null, reason: "missing_email" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makePayload({
          items: [
            {
              id: "user-1",
              employeeId: "emp-1",
              employeeCode: "1001",
              firstName: "กิตติ",
              lastName: "พร้อมใช้",
              email: "kitti@example.com",
              role: "employee",
              permissions: [...BASE_ROLE_PERMISSIONS.employee],
              deniedPages: [],
              isActive: true,
            },
            {
              id: "user-2",
              employeeId: "emp-2",
              employeeCode: "1002",
              firstName: "มานี",
              lastName: "มีเมล",
              email: "manee@example.com",
              role: "employee",
              permissions: ["work.view"],
              deniedPages: [],
              isActive: true,
            },
          ],
          roleCounts: { employee: 2, hr: 0, executive: 0 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          item: {
            id: "user-1",
            role: "employee",
            permissions: [...BASE_ROLE_PERMISSIONS.employee],
            deniedPages: ["reports"],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makePayload({
          items: [
            {
              id: "user-1",
              employeeId: "emp-1",
              employeeCode: "1001",
              firstName: "กิตติ",
              lastName: "พร้อมใช้",
              email: "kitti@example.com",
              role: "employee",
              permissions: [...BASE_ROLE_PERMISSIONS.employee],
              deniedPages: ["reports"],
              isActive: true,
            },
            {
              id: "user-2",
              employeeId: "emp-2",
              employeeCode: "1002",
              firstName: "มานี",
              lastName: "มีเมล",
              email: "manee@example.com",
              role: "employee",
              permissions: ["work.view"],
              deniedPages: [],
              isActive: true,
            },
          ],
          roleCounts: { employee: 2, hr: 0, executive: 0 },
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<UserPermissionsTab />);

    expect(await screen.findByText(/พบพนักงานที่ปฏิบัติงานอยู่แต่ยังไม่มีบัญชีผู้ใช้ 2 คน/)).toBeInTheDocument();
    expect(screen.getByText(/พนักงานที่ยังสร้างบัญชีไม่ได้ \(1 คน\)/)).toBeInTheDocument();

    activateTab(/สิทธิ์รายบุคคล/);
    expect(await screen.findByText(/ยังไม่มีบัญชีผู้ใช้ — กดปุ่ม “สร้างบัญชีผู้ใช้” ด้านบนเพื่อสร้างจากรายชื่อพนักงาน/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /สร้างบัญชีผู้ใช้ \(2 คน\)/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/user-permissions/provision", { method: "POST" });
    });

    expect(await screen.findByRole("heading", { name: "กิตติ พร้อมใช้" })).toBeInTheDocument();
    expect(screen.getByText("ตามบทบาท")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "สร้างบัญชีผู้ใช้สำเร็จ 2 บัญชี (รหัสผ่านเริ่มต้นคือรหัสพนักงาน 4 หลัก) · ข้าม 1 คนที่ยังไม่มีอีเมลที่ถูกต้อง",
    );

    // Toggle individual page access OFF for selected user and save
    const userReportsSwitch = screen.getByRole("switch", { name: "เปิดปิดหน้า รายงาน สำหรับ กิตติ พร้อมใช้" });
    expect(userReportsSwitch).toHaveAttribute("aria-checked", "true");
    fireEvent.click(userReportsSwitch);
    expect(userReportsSwitch).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("ปิดเฉพาะบุคคล")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "บันทึกสิทธิ์" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/user-permissions/user-1",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    const userPatch = fetchMock.mock.calls.find(([url]) => url === "/api/user-permissions/user-1");
    expect(JSON.parse(userPatch![1].body)).toEqual({
      role: "employee",
      permissions: BASE_ROLE_PERMISSIONS.employee,
      deniedPages: ["reports"],
    });
  });
});
