// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

let mockRole = "employee";

vi.mock("@/components/hrm/HrmShell", () => ({
  useHrmRole: () => ({ role: mockRole, employeeId: "emp-1", email: "user@peopleos.co" }),
}));

import { OtListView } from "@/components/hrm/ot/OtListView";

const fixtureItems = [
  { id: "1", employeeId: "emp-1", employeeName: "ทดสอบ หนึ่ง", employeeCode: "E001", date: "2026-09-05", startTime: "18:00", endTime: "20:00", durationHours: 2, reason: "งาน A", statusCode: "pending", statusName: "รอจัดการ" },
  { id: "2", employeeId: "emp-1", employeeName: "ทดสอบ หนึ่ง", employeeCode: "E001", date: "2026-09-10", startTime: "18:00", endTime: "21:00", durationHours: 3, reason: "งาน B", statusCode: "approved", statusName: "อนุมัติแล้ว" },
  { id: "3", employeeId: "emp-1", employeeName: "ทดสอบ หนึ่ง", employeeCode: "E001", date: "2026-09-12", startTime: "18:00", endTime: "19:00", durationHours: 1, reason: "งาน C", statusCode: "approved", statusName: "อนุมัติแล้ว" },
  { id: "4", employeeId: "emp-1", employeeName: "ทดสอบ หนึ่ง", employeeCode: "E001", date: "2026-09-15", startTime: "18:00", endTime: "19:30", durationHours: 1.5, reason: "งาน D", statusCode: "rejected", statusName: "ไม่อนุมัติ" },
];

function tab(name: string) {
  return screen.getByRole("tab", { name: new RegExp(`^${name}`) });
}

describe("OtListView status tabs", () => {
  it("shows correct live counts for all 4 tabs", () => {
    render(<OtListView items={fixtureItems} />);

    expect(tab("ทั้งหมด")).toHaveTextContent("4");
    expect(tab("รอจัดการ")).toHaveTextContent("1");
    expect(tab("อนุมัติแล้ว")).toHaveTextContent("2");
    expect(tab("ไม่อนุมัติ")).toHaveTextContent("1");
  });

  // The view renders a desktop <table> and a mobile card list in parallel
  // (both are always in the DOM; CSS media queries pick one — jsdom doesn't
  // apply layout), so a visible row is matched twice. Assert presence/
  // absence via getAllByText/queryAllByText rather than the singular forms.
  it("defaults to the 'all' tab and shows every row", () => {
    render(<OtListView items={fixtureItems} />);
    expect(screen.getAllByText("งาน A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("งาน B").length).toBeGreaterThan(0);
    expect(screen.getAllByText("งาน C").length).toBeGreaterThan(0);
    expect(screen.getAllByText("งาน D").length).toBeGreaterThan(0);
  });

  it("filters to only pending rows when the pending tab is selected", () => {
    render(<OtListView items={fixtureItems} />);
    fireEvent.click(tab("รอจัดการ"));

    expect(screen.getAllByText("งาน A").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("งาน B")).toHaveLength(0);
    expect(screen.queryAllByText("งาน C")).toHaveLength(0);
    expect(screen.queryAllByText("งาน D")).toHaveLength(0);
  });

  it("filters to only approved rows when the approved tab is selected", () => {
    render(<OtListView items={fixtureItems} />);
    fireEvent.click(tab("อนุมัติแล้ว"));

    expect(screen.queryAllByText("งาน A")).toHaveLength(0);
    expect(screen.getAllByText("งาน B").length).toBeGreaterThan(0);
    expect(screen.getAllByText("งาน C").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("งาน D")).toHaveLength(0);
  });

  it("filters to only rejected rows when the rejected tab is selected", () => {
    render(<OtListView items={fixtureItems} />);
    fireEvent.click(tab("ไม่อนุมัติ"));

    expect(screen.queryAllByText("งาน A")).toHaveLength(0);
    expect(screen.queryAllByText("งาน B")).toHaveLength(0);
    expect(screen.queryAllByText("งาน C")).toHaveLength(0);
    expect(screen.getAllByText("งาน D").length).toBeGreaterThan(0);
  });

  it("shows the employee column for a supervisor but not for an employee", () => {
    mockRole = "employee";
    const { unmount } = render(<OtListView items={fixtureItems} />);
    expect(screen.queryAllByText("พนักงาน")).toHaveLength(0);
    unmount();

    mockRole = "supervisor";
    render(<OtListView items={fixtureItems} />);
    expect(screen.getAllByText("พนักงาน").length).toBeGreaterThan(0);
    mockRole = "employee";
  });
});
