// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AddOtDialog } from "@/components/hrm/ot/AddOtDialog";

function getStartTimeInput() {
  return screen.getByLabelText("เวลาที่เริ่ม");
}

function getEndTimeInput() {
  return screen.getByLabelText("เวลาที่สิ้นสุด");
}

function getSubmitButton() {
  return screen.getByRole("button", { name: "ส่งคำขอ OT" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AddOtDialog", () => {
  it("updates the live duration preview as start/end time change", () => {
    render(<AddOtDialog open onClose={() => {}} />);

    // defaults are 18:00 - 20:00
    expect(screen.getByText("2 ชั่วโมง")).toBeInTheDocument();

    fireEvent.change(getEndTimeInput(), { target: { value: "20:30" } });
    expect(screen.getByText("2 ชม. 30 นาที")).toBeInTheDocument();
  });

  it("disables submit and shows the check-time state for an invalid time range", () => {
    render(<AddOtDialog open onClose={() => {}} />);

    fireEvent.change(getStartTimeInput(), { target: { value: "20:00" } });
    fireEvent.change(getEndTimeInput(), { target: { value: "18:00" } });

    expect(screen.getByText("ตรวจสอบเวลา")).toBeInTheDocument();
    expect(getSubmitButton()).toBeDisabled();
  });

  it("submits a valid request with the expected POST /api/ot body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ item: { id: "ot-1", statusCode: "pending" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const onClose = vi.fn();

    render(<AddOtDialog open onClose={onClose} onCreated={onCreated} />);

    fireEvent.change(getStartTimeInput(), { target: { value: "18:00" } });
    fireEvent.change(getEndTimeInput(), { target: { value: "20:30" } });
    fireEvent.change(screen.getByLabelText("รายละเอียดการทำ OT"), { target: { value: "ปิดงาน release" } });

    const form = document.getElementById("add-ot-form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ot");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.startTime).toBe("18:00");
    expect(body.endTime).toBe("20:30");
    expect(body.reason).toBe("ปิดงาน release");
    expect(typeof body.date).toBe("string");

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "ot-1", statusCode: "pending" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
