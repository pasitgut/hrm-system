import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { WorkTrackingApiRecord } from "@/lib/work-tracking/types";
import {
  deriveWorkRecordStatus,
  mergeSubStatuses,
  mergeWorkTrackingRecord,
} from "@/app/api/work/_shared";

function makeRecord(overrides: Partial<WorkTrackingApiRecord> = {}): WorkTrackingApiRecord {
  return {
    houseNo: "98/59",
    round: "2",
    date: "14/08/2026",
    projectText: "โครงการ A",
    detail: "งานระบบ",
    status: "in_progress",
    deliveredDate: "17/08/2026",
    reportStatuses: {},
    subStatuses: [],
    workers: "{}",
    itemCount: 1,
    ...overrides,
  };
}

describe("work tracking merge helpers", () => {
  it("keeps all Checker subtasks visible when LINE only updated one of them", () => {
    const merged = mergeSubStatuses(
      [
        { detail: "ภายนอก + ชั้น 1", status: "in_progress", reportStatuses: { pdf: "ready" } },
        { detail: "ชั้น 2 + ชั้น 3", status: "in_progress", reportStatuses: {} },
      ],
      [
        { detail: "ภายนอก + ชั้น 1", status: "completed", reportStatuses: {} },
      ],
    );

    expect(merged).toEqual([
      { detail: "ภายนอก + ชั้น 1", status: "completed", reportStatuses: { pdf: "ready" } },
      { detail: "ชั้น 2 + ชั้น 3", status: "in_progress", reportStatuses: {} },
    ]);
  });

  it("keeps delivered status when Checker already marked a subtask delivered", () => {
    const merged = mergeSubStatuses(
      [{ detail: "ตรวจงาน", status: "delivered", reportStatuses: {} }],
      [{ detail: "ตรวจงาน", status: "completed", reportStatuses: {} }],
    );

    expect(merged[0]?.status).toBe("delivered");
  });

  it("derives overall status from subtask statuses", () => {
    expect(deriveWorkRecordStatus([])).toBe("in_progress");
    expect(deriveWorkRecordStatus([
      { detail: "A", status: "delivered" },
      { detail: "B", status: "completed" },
    ])).toBe("completed");
    expect(deriveWorkRecordStatus([
      { detail: "A", status: "delivered" },
      { detail: "B", status: "delivered" },
    ])).toBe("delivered");
    expect(deriveWorkRecordStatus([
      { detail: "A", status: "delivered" },
      { detail: "B", status: "in_progress" },
    ])).toBe("in_progress");
  });

  it("merges Checker metadata, subtasks, derived status, and LINE workers", () => {
    const checkerItem = makeRecord({
      itemCount: 2,
      subStatuses: [
        { detail: "งาน A", status: "in_progress", reportStatuses: {} },
        { detail: "งาน B", status: "delivered", reportStatuses: {} },
      ],
      requestStatus: "1",
    });
    const localItem = makeRecord({
      projectText: "",
      status: "completed",
      subStatuses: [{ detail: "งาน A", status: "delivered", reportStatuses: {} }],
      workers: JSON.stringify({
        "2213": [{ date: "14/08/2026", time: "19:00-21:00", name: "สมชาย", items: ["งาน A (ส่งแล้ว)"] }],
      }),
    });

    const merged = mergeWorkTrackingRecord(checkerItem, localItem);

    expect(merged.projectText).toBe("โครงการ A");
    expect(merged.status).toBe("delivered");
    expect(merged.itemCount).toBe(2);
    expect(merged.subStatuses).toHaveLength(2);
    expect(merged.workers).toContain("สมชาย");
    expect(merged.requestStatus).toBe("1");
  });
});
