// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ROLE_DEFAULT_PERMISSIONS, type Role } from "@/lib/auth/roles";
import { encodePermissionsForStorage } from "@/lib/auth/permissions";

let mockContext: {
  role: Role;
  permissions: readonly string[];
  employeeId: string;
  email: string;
  isSystemAdmin: boolean;
} = {
  role: "employee",
  permissions: ROLE_DEFAULT_PERMISSIONS.employee,
  employeeId: "emp-1",
  email: "user@example.com",
  isSystemAdmin: false,
};

vi.mock("@/components/hrm/HrmShell", () => ({
  useHrmRole: () => mockContext,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import OTModule from "@/components/hrm/ot/OTModule";

function stubOtFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.startsWith("/api/ot/summary")) {
        const isCompany = mockContext.permissions.includes("ot.view_company") || mockContext.permissions.includes("ot.approve");
        const includeComp = mockContext.permissions.includes("employees.compensation.view") || mockContext.permissions.includes("employees.compensation.manage");
        if (!isCompany) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              scope: "individual",
              employeeId: "emp-1",
              employeeName: "สมชาย ใจดี",
              month: "2026-09",
              totalApprovedHours: 5,
              totalPendingHours: 2,
              totalRejectedHours: 0,
              requestCount: 2,
              byStatus: { approved: 1, pending: 1, rejected: 0 },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            scope: "company",
            month: "2026-09",
            totalApprovedHours: 10,
            totalPendingHours: 2,
            requestCount: 3,
            ...(includeComp ? { totalApprovedPay: 4500, missingPayInfoCount: 0 } : {}),
            byEmployee: [
              {
                employeeId: "emp-1",
                employeeName: "สมชาย ใจดี",
                employeeCode: "1001",
                approvedHours: 8,
                weekdayApprovedHours: 5,
                holidayApprovedHours: 3,
                pendingHours: 2,
                rejectedHours: 0,
                requestCount: 2,
                ...(includeComp
                  ? {
                      baseSalary: 30000,
                      otWeekdayMultiplier: 1.5,
                      otHolidayMultiplier: 3,
                      workHoursPerDay: 8,
                      weekdayRatePerHour: 187.5,
                      holidayRatePerHour: 375,
                      approvedPay: 3000,
                    }
                  : {}),
              },
            ],
          }),
        });
      }
      if (url.startsWith("/api/approvals")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "ot-1",
                type: "ot",
                employeeId: "emp-2",
                employeeName: "สมหญิง ขยัน",
                detail: "25 ก.ย. 2569 · 18:00–20:00",
                overtimeType: "weekday",
                reason: "ปิดงานระบบ",
                statusCode: "pending",
                statusName: "รอจัดการ",
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "ot-2",
              employeeId: "emp-1",
              employeeName: "สมชาย ใจดี",
              employeeCode: "1001",
              date: "2026-09-10",
              startTime: "18:00",
              endTime: "20:00",
              durationHours: 2,
              overtimeType: "weekday",
              reason: "งานเร่งด่วน",
              statusCode: "pending",
              statusName: "รอจัดการ",
            },
          ],
        }),
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OTModule role-differentiated views", () => {
  it("renders Employee Self Service view for employee role without company or payroll fields", async () => {
    mockContext = {
      role: "employee",
      permissions: ROLE_DEFAULT_PERMISSIONS.employee,
      employeeId: "emp-1",
      email: "emp@example.com",
      isSystemAdmin: false,
    };
    stubOtFetch();

    render(<OTModule />);

    expect(screen.getByText("Employee Self Service · OT")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "การทำงานล่วงเวลาของฉัน" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "สรุปชั่วโมง OT ของฉัน" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ยื่นคำขอ OT" })).toBeInTheDocument();

    expect(await screen.findByText("5 ชม.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ตั้งค่าเรท OT" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ศูนย์อนุมัติ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "อนุมัติ" })).not.toBeInTheDocument();
    expect(screen.queryByText("ฐานเงินเดือน")).not.toBeInTheDocument();
    expect(screen.queryByText("ยอด OT ที่ต้องจ่าย")).not.toBeInTheDocument();
  });

  it("renders HR Portal view with approval queue first and full payroll formula table", async () => {
    mockContext = {
      role: "hr",
      permissions: ROLE_DEFAULT_PERMISSIONS.hr,
      employeeId: "emp-hr",
      email: "hr@example.com",
      isSystemAdmin: false,
    };
    stubOtFetch();

    render(<OTModule />);

    expect(screen.getByText("HR Portal · OT")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "จัดการการทำงานล่วงเวลา" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ตั้งค่าเรท OT" })).toHaveAttribute("href", "/settings");

    const queueHeading = await screen.findByRole("heading", { name: "คิวตรวจสอบและอนุมัติ OT" });
    const summaryHeading = screen.getByRole("heading", { name: "สรุปชั่วโมงและคำนวณค่า OT ทั้งบริษัท" });
    expect(queueHeading.compareDocumentPosition(summaryHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect((await screen.findAllByText("ฐานเงินเดือน")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/เรท OT/).length).toBeGreaterThan(0);
    expect(screen.getByText("ยอด OT ที่ต้องจ่าย")).toBeInTheDocument();
    expect(screen.getAllByText("4,500.00 บาท").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "อนุมัติ" })).toBeInTheDocument();
  });

  it("renders Executive Dashboard view with budget summary first, total OT pay visible, and no raw salary formula columns", async () => {
    mockContext = {
      role: "executive",
      permissions: ROLE_DEFAULT_PERMISSIONS.executive,
      employeeId: "emp-exec",
      email: "exec@example.com",
      isSystemAdmin: false,
    };
    stubOtFetch();

    render(<OTModule />);

    expect(screen.getByText("Executive Dashboard · OT")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ภาพรวมและอนุมัติ OT องค์กร" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ดูรายงานสรุป" })).toHaveAttribute("href", "/reports");
    expect(screen.getByRole("link", { name: "ศูนย์อนุมัติ" })).toHaveAttribute("href", "/approvals");
    expect(screen.queryByRole("link", { name: "ตั้งค่าเรท OT" })).not.toBeInTheDocument();

    const summaryHeading = await screen.findByRole("heading", { name: "สรุปภาระชั่วโมงและงบประมาณ OT องค์กร" });
    const approvalHeading = screen.getByRole("heading", { name: "รายการพิจารณาอนุมัติ OT" });
    expect(summaryHeading.compareDocumentPosition(approvalHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(await screen.findByText("ยอดงบประมาณ OT ที่อนุมัติ")).toBeInTheDocument();
    expect(screen.getAllByText("4,500.00 บาท").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ยอดค่า OT ที่อนุมัติ").length).toBeGreaterThan(0);
    expect(screen.queryByText("ฐานเงินเดือน")).not.toBeInTheDocument();
    expect(screen.queryByText(/เรท OT/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "อนุมัติ" })).toBeInTheDocument();
  });

  it("hides self-service OT request actions when ot.request.self permission is disabled", async () => {
    mockContext = {
      role: "employee",
      permissions: encodePermissionsForStorage(["work.view", "ot.view_self"]),
      employeeId: "emp-1",
      email: "emp@example.com",
      isSystemAdmin: false,
    };
    stubOtFetch();

    render(<OTModule />);

    expect(await screen.findAllByText("งานเร่งด่วน")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "ยื่นคำขอ OT" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "การดำเนินการ" })).not.toBeInTheDocument();
  });
});
