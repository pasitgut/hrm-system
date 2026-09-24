// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LeaveRequestDialog } from "@/components/hrm/leave/LeaveRequestDialog";

const leaveTypesResponse = {
  items: [
    { id: "1", code: "sick", name: "ลาป่วย", description: null, annualQuotaDays: 30, isActive: true },
    { id: "2", code: "annual", name: "ลาพักร้อน", description: null, annualQuotaDays: 10, isActive: true },
  ],
};

function stubFetch(postResponse: unknown = { item: { id: "leave-1", statusCode: "pending" } }) {
  return vi.fn().mockImplementation((url: string, options?: { method?: string }) => {
    if (url === "/api/leave-types") {
      return Promise.resolve({ ok: true, json: async () => leaveTypesResponse });
    }
    return Promise.resolve({ ok: true, json: async () => postResponse });
  });
}

function getSubmitButton() {
  return screen.getByRole("button", { name: "ส่งคำขอลา" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LeaveRequestDialog (create mode)", () => {
  it("loads active leave types into the select", async () => {
    vi.stubGlobal("fetch", stubFetch());
    render(<LeaveRequestDialog open mode="create" onClose={() => {}} />);

    await waitFor(() => expect(screen.getAllByText("ลาป่วย").length).toBeGreaterThan(0));
  });

  it("submits a valid full-day request with the expected POST /api/leave body", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(<LeaveRequestDialog open mode="create" onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => expect(screen.getAllByText("ลาป่วย").length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText("สาเหตุการลา"), { target: { value: "ไม่สบาย" } });

    const form = document.getElementById("add-leave-form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([url]: [string]) => url === "/api/leave");
      expect(postCall).toBeDefined();
    });

    const postCall = fetchMock.mock.calls.find(([url]: [string]) => url === "/api/leave") as [string, RequestInit];
    const [url, options] = postCall;
    expect(url).toBe("/api/leave");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string);
    expect(body.session).toBe("full");
    expect(body.reason).toBe("ไม่สบาย");
    expect(typeof body.startOn).toBe("string");
    expect(typeof body.endOn).toBe("string");

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: "leave-1", statusCode: "pending" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("disables the session select when the date range spans more than one day", async () => {
    vi.stubGlobal("fetch", stubFetch());
    render(<LeaveRequestDialog open mode="create" onClose={() => {}} />);
    await waitFor(() => expect(screen.getAllByText("ลาป่วย").length).toBeGreaterThan(0));

    const endInput = screen.getByLabelText("วันที่สิ้นสุดการลา") as HTMLInputElement;
    const [year, month, day] = endInput.value.split("-").map(Number);
    fireEvent.change(endInput, { target: { value: `${year}-${String(month).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}` } });

    expect(getSubmitButton()).not.toBeDisabled();
  });
});

describe("LeaveRequestDialog (edit mode)", () => {
  it("pre-fills fields from initialValues and PATCHes on submit", async () => {
    const fetchMock = stubFetch({ item: { id: "leave-1", statusCode: "pending", leaveTypeCode: "annual" } });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();

    render(
      <LeaveRequestDialog
        open
        mode="edit"
        initialValues={{ id: "leave-1", leaveTypeCode: "annual", startOn: "2026-10-05", endOn: "2026-10-05", session: "am", reason: "ธุระ" }}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );

    await waitFor(() => expect((screen.getByLabelText("สาเหตุการลา") as HTMLTextAreaElement).value).toBe("ธุระ"));

    const form = document.getElementById("edit-leave-form");
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([url]: [string]) => url === "/api/leave/leave-1");
      expect(patchCall).toBeDefined();
    });
    const patchCall = fetchMock.mock.calls.find(([url]: [string]) => url === "/api/leave/leave-1") as [string, RequestInit];
    expect(patchCall[1].method).toBe("PATCH");
  });
});
