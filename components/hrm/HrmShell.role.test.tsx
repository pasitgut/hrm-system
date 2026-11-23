// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/app/login/actions", () => ({
  logoutAction: vi.fn(),
}));

// jsdom doesn't implement matchMedia; HrmShell's theme-detection effect needs it.
window.matchMedia =
  window.matchMedia ||
  ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

import HrmShell from "@/components/hrm/HrmShell";
import { permissionsForRole } from "@/tests/setup/permissions";

const employeeUser = { role: "employee", employeeId: "emp-1", email: "employee@example.com" };
const hrUser = { role: "hr", employeeId: "hr-1", email: "hr@example.com" };

describe("HrmShell", () => {
  it("renders only children, with no chrome, when there is no user (i.e. on /login)", () => {
    render(
      <HrmShell user={null}>
        <div>login page content</div>
      </HrmShell>,
    );

    expect(screen.getByText("login page content")).toBeInTheDocument();
    expect(screen.queryByLabelText("เมนูหลัก")).not.toBeInTheDocument();
    expect(screen.queryByText("HRM")).not.toBeInTheDocument();
  });

  it("hides the approvals nav item for an employee", () => {
    render(
      <HrmShell user={employeeUser}>
        <div>content</div>
      </HrmShell>,
    );

    expect(screen.queryByText("รออนุมัติ")).not.toBeInTheDocument();
  });

  it("shows the approvals nav item for an account with approval permissions", () => {
    render(
      <HrmShell user={hrUser} permissions={permissionsForRole("hr")}>
        <div>content</div>
      </HrmShell>,
    );

    expect(screen.getAllByText("รออนุมัติ").length).toBeGreaterThan(0);
  });

  it("no longer renders the fake role-toggle button", () => {
    render(
      <HrmShell user={hrUser} permissions={permissionsForRole("hr")}>
        <div>content</div>
      </HrmShell>,
    );

    expect(screen.queryByText("โหมดพนักงาน")).not.toBeInTheDocument();
    expect(screen.queryByText("โหมดหัวหน้างาน")).not.toBeInTheDocument();
  });

  it("renders a logout control", () => {
    render(
      <HrmShell user={employeeUser}>
        <div>content</div>
      </HrmShell>,
    );

    expect(screen.getByLabelText("ออกจากระบบ")).toBeInTheDocument();
  });

  it("shows a warning banner when optional external integrations are not configured", () => {
    render(
      <HrmShell
        user={hrUser}
        permissions={permissionsForRole("hr")}
        integrations={{
          googleDrive: false,
          cloudinary: false,
          checker: true,
          unconfigured: [
            { key: "googleDrive", name: "Google Drive", feature: "อัปโหลดและดาวน์โหลดเอกสารพนักงาน", configured: false },
            { key: "cloudinary", name: "Cloudinary", feature: "อัปโหลดรูปโปรไฟล์ รูปทรัพย์สิน และรูปในสัญญา", configured: false },
          ],
        }}
      >
        <div>content</div>
      </HrmShell>,
    );

    expect(screen.getByText(/บางบริการภายนอกยังไม่พร้อมใช้งาน/)).toBeInTheDocument();
    expect(screen.getByText(/Google Drive, Cloudinary/)).toBeInTheDocument();
  });

  it("shows a database connection error banner when dbStatus is not ready", () => {
    render(
      <HrmShell
        user={hrUser}
        permissions={permissionsForRole("hr")}
        dbStatus={{
          ready: false,
          migrated: false,
          reason: "ipv6_direct_host",
          message: "ไม่สามารถเชื่อมต่อโฮสต์ db.*.supabase.co จากสภาพแวดล้อม IPv4",
          hint: "ให้ใช้ Supabase Pooler (pooler.supabase.com)",
        }}
      >
        <div>content</div>
      </HrmShell>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("db.*.supabase.co");
    expect(screen.getByText("ให้ใช้ Supabase Pooler (pooler.supabase.com)")).toBeInTheDocument();
  });

  it("shows the data import link for HR/admin accounts and hides it for employees", () => {
    const { rerender } = render(
      <HrmShell user={employeeUser} permissions={permissionsForRole("employee")}>
        <div>content</div>
      </HrmShell>,
    );
    expect(screen.queryByRole("link", { name: "นำเข้าข้อมูล" })).not.toBeInTheDocument();

    rerender(
      <HrmShell user={hrUser} permissions={permissionsForRole("hr")}>
        <div>content</div>
      </HrmShell>,
    );
    const importLink = screen.getByRole("link", { name: "นำเข้าข้อมูล" });
    expect(importLink).toHaveAttribute("href", "/settings/import");

    const permissionsLink = screen.getByRole("link", { name: "สิทธิ์การเข้าถึง" });
    expect(permissionsLink).toHaveAttribute("href", "/settings/permissions");

    const adminDataLink = screen.getByRole("link", { name: "จัดการฐานข้อมูล" });
    expect(adminDataLink).toHaveAttribute("href", "/settings/admin-data");
  });

  it("hides navigation links when page access markers deny those routes despite underlying permissions", () => {
    render(
      <HrmShell
        user={hrUser}
        permissions={[
          ...permissionsForRole("hr"),
          "salary_slips.view",
          "page.ot.denied",
          "page.payroll.denied",
          "page.import.denied",
          "page.admin_data.denied",
        ]}
      >
        <div>content</div>
      </HrmShell>,
    );

    expect(screen.queryByRole("link", { name: "เวลาล่วงเวลา" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "เงินเดือน" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "นำเข้าข้อมูล" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "จัดการฐานข้อมูล" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "สิทธิ์การเข้าถึง" })).toBeInTheDocument();
  });

  it("keeps admin database manager visible for built-in system admin even if page.admin_data.denied were present", () => {
    render(
      <HrmShell
        user={{ ...hrUser, isSystemAdmin: true }}
        permissions={[...permissionsForRole("hr"), "page.admin_data.denied"]}
      >
        <div>content</div>
      </HrmShell>,
    );

    expect(screen.getByRole("link", { name: "จัดการฐานข้อมูล" })).toHaveAttribute("href", "/settings/admin-data");
  });
});
