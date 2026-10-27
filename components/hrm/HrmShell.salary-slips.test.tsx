// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/salary-slips/import" }));
vi.mock("@/app/login/actions", () => ({ logoutAction: vi.fn() }));
window.matchMedia = window.matchMedia || ((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
import HrmShell from "./HrmShell";
const user = { role: "employee", employeeId: "a", email: "hr@example.com" };
describe("salary slip navigation", () => {
  it("shows the independent salary-slip route and preserves the payroll link", () => {
    render(<HrmShell user={user} permissions={["salary_slips.view", "employees.compensation.view"]}>content</HrmShell>);
    const slip = screen.getByRole("link", { name: "สลิปเงินเดือน" });
    expect(slip).toHaveAttribute("href", "/salary-slips"); expect(slip).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "เงินเดือน" })).toHaveAttribute("href", "/payroll");
  });
  it("doesn't grant slip access through compensation permission", () => {
    render(<HrmShell user={user} permissions={["employees.compensation.view"]}>content</HrmShell>);
    expect(screen.queryByRole("link", { name: "สลิปเงินเดือน" })).not.toBeInTheDocument();
  });
});
