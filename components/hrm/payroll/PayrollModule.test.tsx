// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PayrollModule from "@/components/hrm/payroll/PayrollModule";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PayrollModule (Excel-first salary slips)", () => {
  it("renders Excel salary-slip workflow and does not call /api/payroll on mount", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [
          {
            key: "file.xlsx::0001::2026-10",
            file: "payroll-oct.xlsx",
            sheet: "Sheet1",
            row: 2,
            data: {
              code: "0001",
              name: "ทดสอบ พนักงาน",
              department: "บัญชี",
              year: 2026,
              month: 10,
              bank: "KBANK",
              bankAccount: "1234567890",
              incomes: { salary: 2500000 },
              deductions: { social_security: 75000 },
              incomeTotal: 2500000,
              deductionTotal: 75000,
              netPay: 2425000,
            },
            errors: [],
            warnings: [],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PayrollModule permissions={["salary_slips.view", "employees.compensation.view", "salary_slips.export"]} />);

    expect(screen.getByRole("heading", { name: "สลิปเงินเดือน" })).toBeInTheDocument();
    expect(screen.getByText(/ไฟล์ Excel เงินเดือนที่อัปโหลด/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    const excelFile = new File(["dummy"], "payroll-oct.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    fireEvent.change(fileInput, { target: { files: [excelFile] } });

    const previewButton = screen.getByRole("button", { name: "ตรวจสอบไฟล์ก่อนออกสลิป" });
    fireEvent.click(previewButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/salary-slips/parse");
    expect(await screen.findByText("ทดสอบ พนักงาน")).toBeInTheDocument();
    expect(screen.getByText("24,250.00 บาท")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]: [string]) => String(url).includes("/api/payroll"))).toBe(false);
  });
});
