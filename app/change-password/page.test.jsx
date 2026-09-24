// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

import ChangePasswordPage from "@/app/change-password/page";

afterEach(() => vi.unstubAllGlobals());

describe("ChangePasswordPage", () => {
  it("uses a full page request to enter the dashboard after changing the first password", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }));

    render(<ChangePasswordPage />);
    fireEvent.change(screen.getByLabelText("รหัสผ่านใหม่"), { target: { value: "SafeNewPass123!" } });
    fireEvent.change(screen.getByLabelText("ยืนยันรหัสผ่านใหม่"), { target: { value: "SafeNewPass123!" } });
    fireEvent.submit(screen.getByRole("button", { name: "เปลี่ยนรหัสผ่าน" }).closest("form"));

    expect(await screen.findByRole("status")).toHaveTextContent("เปลี่ยนรหัสผ่านสำเร็จ");
    expect(screen.getByRole("link", { name: "เข้าสู่ระบบ" })).toHaveAttribute("href", "/");
  });
});
