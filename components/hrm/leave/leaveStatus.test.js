import { describe, expect, it } from "vitest";
import { formatDateRange, formatDays, formatThaiDate, LEAVE_STATUS_TABS, statusColor } from "@/components/hrm/leave/leaveStatus";

describe("LEAVE_STATUS_TABS", () => {
  it("defines exactly the 4 required tabs with Thai labels", () => {
    expect(LEAVE_STATUS_TABS.map((tab) => tab.key)).toEqual(["all", "pending", "approved", "rejected"]);
    expect(LEAVE_STATUS_TABS.map((tab) => tab.label)).toEqual(["ทั้งหมด", "รอจัดการ", "อนุมัติแล้ว", "ไม่อนุมัติ"]);
  });
});

describe("statusColor", () => {
  it("maps known status codes to their chip colors", () => {
    expect(statusColor("pending")).toBe("yellow");
    expect(statusColor("approved")).toBe("lime");
    expect(statusColor("rejected")).toBe("rose");
    expect(statusColor("cancelled")).toBe("gray");
  });

  it("falls back to gray for an unknown status", () => {
    expect(statusColor("bogus")).toBe("gray");
  });
});

describe("formatDays", () => {
  it("formats a whole day count", () => {
    expect(formatDays(3)).toBe("3 วัน");
  });

  it("formats a half-day count", () => {
    expect(formatDays(0.5)).toBe("0.5 วัน");
  });

  it("falls back to a dash for invalid input", () => {
    expect(formatDays(null)).toBe("-");
    expect(formatDays(undefined)).toBe("-");
  });
});

describe("formatThaiDate", () => {
  it("formats a YYYY-MM-DD date as Thai day/short-month/Buddhist-year", () => {
    expect(formatThaiDate("2026-10-05")).toBe("5 ต.ค. 2569");
  });
});

describe("formatDateRange", () => {
  it("formats a single-day range as one date", () => {
    expect(formatDateRange("2026-10-05", "2026-10-05")).toBe("5 ต.ค. 2569");
  });

  it("formats a multi-day range as start – end", () => {
    expect(formatDateRange("2026-10-05", "2026-10-07")).toBe("5 ต.ค. 2569 – 7 ต.ค. 2569");
  });
});
