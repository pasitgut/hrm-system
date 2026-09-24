// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

let mockRole = "employee";
let mockEmployeeId = "emp-1";

vi.mock("@/components/hrm/HrmShell", () => ({
  useHrmRole: () => ({ role: mockRole, employeeId: mockEmployeeId, email: "user@peopleos.co" }),
}));

import { LeaveListView } from "@/components/hrm/leave/LeaveListView";

const fixtureItems = [
  { id: "1", employeeId: "emp-1", employeeName: "ทดสอบ หนึ่ง", employeeCode: "E001", leaveTypeCode: "sick", leaveTypeName: "ลาป่วย", startOn: "2026-09-05", endOn: "2026-09-05", session: "full", days: 1, reason: "ไม่สบาย", statusCode: "pending", statusName: "รอจัดการ" },
  { id: "2", employeeId: "emp-1", employeeName: "ทดสอบ หนึ่ง", employeeCode: "E001", leaveTypeCode: "annual", leaveTypeName: "ลาพักร้อน", startOn: "2026-09-10", endOn: "2026-09-12", session: "full", days: 3, reason: "เที่ยว", statusCode: "approved", statusName: "อนุมัติแล้ว" },
  { id: "3", employeeId: "emp-2", employeeName: "ทดสอบ สอง", employeeCode: "E002", leaveTypeCode: "annual", leaveTypeName: "ลาพักร้อน", startOn: "2026-09-12", endOn: "2026-09-12", session: "full", days: 1, reason: "ธุระ", statusCode: "approved", statusName: "อนุมัติแล้ว" },
  { id: "4", employeeId: "emp-1", employeeName: "ทดสอบ หนึ่ง", employeeCode: "E001", leaveTypeCode: "sick", leaveTypeName: "ลาป่วย", startOn: "2026-09-15", endOn: "2026-09-15", session: "am", days: 0.5, reason: "หมอนัด", statusCode: "rejected", statusName: "ไม่อนุมัติ" },
];

function tab(name: string) {
  return screen.getByRole("tab", { name: new RegExp(`^${name}`) });
}

describe("LeaveListView status tabs", () => {
  it("shows correct live counts for all 4 tabs", () => {
    render(<LeaveListView items={fixtureItems} />);

    expect(tab("ทั้งหมด")).toHaveTextContent("4");
    expect(tab("รอจัดการ")).toHaveTextContent("1");
    expect(tab("อนุมัติแล้ว")).toHaveTextContent("2");
    expect(tab("ไม่อนุมัติ")).toHaveTextContent("1");
  });

  it("filters to only pending rows when the pending tab is selected", () => {
    render(<LeaveListView items={fixtureItems} />);
    fireEvent.click(tab("รอจัดการ"));

    expect(screen.getAllByText("ไม่สบาย").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("เที่ยว")).toHaveLength(0);
  });

  it("shows the employee column for a supervisor but not for an employee", () => {
    mockRole = "employee";
    const { unmount } = render(<LeaveListView items={fixtureItems} />);
    expect(screen.queryAllByText("พนักงาน")).toHaveLength(0);
    unmount();

    mockRole = "supervisor";
    render(<LeaveListView items={fixtureItems} />);
    expect(screen.getAllByText("พนักงาน").length).toBeGreaterThan(0);
    mockRole = "employee";
  });

  it("shows edit/cancel actions only for the current user's own pending rows", () => {
    mockRole = "employee";
    mockEmployeeId = "emp-1";
    render(<LeaveListView items={fixtureItems} />);

    // Only item "1" is pending and owned by emp-1. The view renders a
    // desktop <table> and a mobile card list in parallel (both are always
    // in the DOM; CSS media queries pick one — jsdom doesn't apply
    // layout), so each action button appears twice.
    expect(screen.getAllByRole("button", { name: "แก้ไข" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "ยกเลิก" })).toHaveLength(2);
  });
});
