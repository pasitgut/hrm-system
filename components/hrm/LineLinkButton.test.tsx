// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LineLinkButton } from "@/components/hrm/LineLinkButton";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("LINE account linking", () => {
  it("requests a one-use code on demand and tells the user what to send to LINE", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ code: "one-use-code", expiresAt: "2026-11-21T12:00:00Z" }));
    render(<LineLinkButton />);
    fireEvent.click(screen.getByRole("button", { name: "เชื่อม LINE" }));
    expect(await screen.findByText("ลงทะเบียน one-use-code")).toBeInTheDocument();
  });
  it("shows a recoverable error when the bot has not been configured", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
    render(<LineLinkButton />);
    fireEvent.click(screen.getByRole("button", { name: "เชื่อม LINE" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ยังไม่พร้อม");
  });
});
