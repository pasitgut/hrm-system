// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/salary-slips/import" }));
vi.mock("@/app/login/actions", () => ({ logoutAction: vi.fn() }));
window.matchMedia = window.matchMedia || ((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
import HrmShell from "./HrmShell";
const user = { role: "employee", employeeId: "a", email: "hr@example.com" };
describe("payroll navigation", () => {
  it("shows the integrated payroll route and hides the retired salary-slip import route", () => {
    render(<HrmShell user={user} permissions={["salary_slips.view", "employees.compensation.view"]}>content</HrmShell>);
    expect(screen.queryByRole("link", { name: "สลิปเงินเดือน" })).not.toBeInTheDocument();
    const payroll = screen.getByRole("link", { name: "เงินเดือน" });
    expect(payroll).toHaveAttribute("href", "/payroll"); expect(payroll).toHaveAttribute("aria-current", "page");
  });
  it("requires both payroll view and compensation view permissions", () => {
    render(<HrmShell user={user} permissions={["employees.compensation.view"]}>content</HrmShell>);
    expect(screen.queryByRole("link", { name: "เงินเดือน" })).not.toBeInTheDocument();
  });
});
