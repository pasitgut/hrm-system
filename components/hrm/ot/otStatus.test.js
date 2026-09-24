import { describe, expect, it } from "vitest";
import {
  computeDurationHours,
  currentMonthInBangkok,
  formatDuration,
  formatMonthLabel,
  OT_STATUS_TABS,
  shiftMonth,
  statusColor,
} from "@/components/hrm/ot/otStatus";

describe("computeDurationHours", () => {
  it("computes an exact whole-hour duration", () => {
    expect(computeDurationHours("18:00", "20:00")).toBe(2);
  });

  it("computes a duration with minutes", () => {
    expect(computeDurationHours("18:00", "20:30")).toBe(2.5);
  });

  it("returns null when end is before start", () => {
    expect(computeDurationHours("20:00", "18:00")).toBeNull();
  });

  it("returns null when end equals start", () => {
    expect(computeDurationHours("18:00", "18:00")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(computeDurationHours("", "20:00")).toBeNull();
    expect(computeDurationHours(null, "20:00")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats an exact hour count", () => {
    expect(formatDuration(3)).toBe("3 ชั่วโมง");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(2.5)).toBe("2 ชม. 30 นาที");
  });

  it("formats a sub-hour duration as minutes only", () => {
    expect(formatDuration(0.5)).toBe("30 นาที");
  });

  it("falls back to a check-the-time message for invalid input", () => {
    expect(formatDuration(0)).toBe("ตรวจสอบเวลา");
    expect(formatDuration(-1)).toBe("ตรวจสอบเวลา");
    expect(formatDuration(null)).toBe("ตรวจสอบเวลา");
  });
});

describe("OT_STATUS_TABS", () => {
  it("defines exactly the 4 required tabs with Thai labels", () => {
    expect(OT_STATUS_TABS.map((tab) => tab.key)).toEqual(["all", "pending", "approved", "rejected"]);
    expect(OT_STATUS_TABS.map((tab) => tab.label)).toEqual(["ทั้งหมด", "รอจัดการ", "อนุมัติแล้ว", "ไม่อนุมัติ"]);
  });
});

describe("statusColor", () => {
  it("maps known status codes to their chip colors", () => {
    expect(statusColor("pending")).toBe("yellow");
    expect(statusColor("approved")).toBe("lime");
    expect(statusColor("rejected")).toBe("rose");
  });

  it("falls back to gray for an unknown status", () => {
    expect(statusColor("cancelled")).toBe("gray");
  });
});

describe("shiftMonth", () => {
  it("shifts within a year", () => {
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
    expect(shiftMonth("2026-09", -1)).toBe("2026-08");
  });

  it("rolls over year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("formatMonthLabel", () => {
  it("formats a month as Thai month name + Buddhist year", () => {
    expect(formatMonthLabel("2026-09")).toBe("กันยายน 2569");
  });
});

describe("currentMonthInBangkok", () => {
  it("returns a YYYY-MM string derived from Asia/Bangkok local time", () => {
    // 2026-09-22T18:00:00Z is 2026-09-23 01:00 in Bangkok (UTC+7).
    expect(currentMonthInBangkok(new Date("2026-09-22T18:00:00Z"))).toBe("2026-09");
    // 2026-08-31T15:00:00Z is 2026-08-31 22:00 in Bangkok — still August.
    expect(currentMonthInBangkok(new Date("2026-08-31T15:00:00Z"))).toBe("2026-08");
    // 2026-08-31T18:00:00Z is 2026-09-01 01:00 in Bangkok — rolls to September.
    expect(currentMonthInBangkok(new Date("2026-08-31T18:00:00Z"))).toBe("2026-09");
  });
});
