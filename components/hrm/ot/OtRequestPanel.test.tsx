// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { OtRequestPanel } from "@/components/hrm/ot/OtRequestPanel";

afterEach(() => {
  vi.unstubAllGlobals();
});

const request = {
  id: "ot-1",
  type: "ot",
  employeeId: "emp-2",
  employeeName: "สมชาย ใจดี",
  detail: "25 ก.ย. 2569 · 18:00–20:30",
  reason: "ปิดงานระบบ",
  statusCode: "pending",
  statusName: "รอจัดการ",
};

describe("OtRequestPanel", () => {
  it("lets a supervisor approve or reject an OT request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [request] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ item: { ...request, statusCode: "rejected", statusName: "ไม่อนุมัติ" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const onUpdated = vi.fn();

    render(<OtRequestPanel role="supervisor" onUpdated={onUpdated} />);

    expect(await screen.findByText("ปิดงานระบบ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ไม่อนุมัติ" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/ot/ot-1/decision");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ decision: "rejected" });
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ statusCode: "rejected" }));
  });

  it("keeps decision actions hidden from employees", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [request] }) }));

    render(<OtRequestPanel role="employee" />);

    expect(await screen.findByText("ปิดงานระบบ")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "อนุมัติ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ไม่อนุมัติ" })).not.toBeInTheDocument();
  });
});
