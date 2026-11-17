import { describe, expect, it } from "vitest";
import { deriveOvertimeType } from "./overtime-type";

describe("deriveOvertimeType", () => {
  it("is holiday when the Bangkok date is one of the employee's weekly days off", () => {
    // 2026-09-12 is a Saturday in Asia/Bangkok.
    expect(deriveOvertimeType(new Date("2026-09-12T11:00:00Z"), [6])).toBe("holiday");
    expect(deriveOvertimeType(new Date("2026-09-12T11:00:00Z"), [0, 1])).toBe("weekday");
  });

  it("uses the Bangkok date, not the UTC date", () => {
    // 2026-09-12 18:30 UTC is already Sunday 01:30 in Bangkok.
    expect(deriveOvertimeType(new Date("2026-09-12T18:30:00Z"), [0])).toBe("holiday");
    expect(deriveOvertimeType(new Date("2026-09-12T18:30:00Z"), [6])).toBe("weekday");
  });

  it("is weekday when no weekly holidays are configured", () => {
    expect(deriveOvertimeType(new Date("2026-09-13T03:00:00Z"), [])).toBe("weekday");
    expect(deriveOvertimeType(new Date("2026-09-13T03:00:00Z"), null)).toBe("weekday");
  });
});
