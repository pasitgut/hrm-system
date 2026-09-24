// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { OtCalendarView } from "@/components/hrm/ot/OtCalendarView";
import { currentMonthInBangkok } from "@/components/hrm/ot/otStatus";

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

describe("OtCalendarView month picker", () => {
  it("keeps previous/next controls and applies a month and Buddhist year from the compact picker", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<OtCalendarView />);

    expect(screen.getByRole("button", { name: "เดือนก่อนหน้า" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เดือนถัดไป" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "เลือกเดือนและปี" }));

    expect(screen.getByRole("dialog", { name: "เลือกเดือนและปี" })).toBeInTheDocument();
    const [currentYear, currentMonth] = currentMonthInBangkok().split("-");
    const yearSelect = screen.getByRole("combobox", { name: "ปี พ.ศ." });
    fireEvent.pointerDown(yearSelect, { button: 0, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("option", { name: String(Number(currentYear) + 544) }));
    fireEvent.click(screen.getByRole("button", { name: "แสดงเดือน" }));

    const nextYear = String(Number(currentYear) + 1);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/ot?month=${nextYear}-${currentMonth}&status=all`));
    expect(screen.queryByRole("dialog", { name: "เลือกเดือนและปี" })).not.toBeInTheDocument();
  });
});
