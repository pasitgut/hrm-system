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

const employeeUser = { role: "employee", employeeId: "emp-1", email: "employee@peopleos.co" };
const supervisorUser = { role: "supervisor", employeeId: "sup-1", email: "supervisor@peopleos.co" };
const ceoUser = { role: "ceo", employeeId: "ceo-1", email: "ceo@peopleos.co" };

describe("HrmShell", () => {
  it("renders only children, with no chrome, when there is no user (i.e. on /login)", () => {
    render(
      <HrmShell user={null}>
        <div>login page content</div>
      </HrmShell>,
    );

    expect(screen.getByText("login page content")).toBeInTheDocument();
    expect(screen.queryByLabelText("เมนูหลัก")).not.toBeInTheDocument();
    expect(screen.queryByText("PeopleOS")).not.toBeInTheDocument();
  });

  it("hides the approvals nav item for an employee", () => {
    render(
      <HrmShell user={employeeUser}>
        <div>content</div>
      </HrmShell>,
    );

    expect(screen.queryByText("รออนุมัติ")).not.toBeInTheDocument();
  });

  it("shows the approvals nav item for a supervisor", () => {
    render(
      <HrmShell user={supervisorUser}>
        <div>content</div>
      </HrmShell>,
    );

    expect(screen.getAllByText("รออนุมัติ").length).toBeGreaterThan(0);
  });

  it("shows the approvals nav item for a ceo", () => {
    render(
      <HrmShell user={ceoUser}>
        <div>content</div>
      </HrmShell>,
    );

    expect(screen.getAllByText("รออนุมัติ").length).toBeGreaterThan(0);
  });

  it("no longer renders the fake role-toggle button", () => {
    render(
      <HrmShell user={supervisorUser}>
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
});
