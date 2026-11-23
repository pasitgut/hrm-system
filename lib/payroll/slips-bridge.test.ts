import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { createDefaultEmployeePayrollData } from "@/lib/employees/payroll-data";
import { buildPayrollRow, summarizePayroll } from "./calculate";
import {
  createBankTransferTxt,
  createBankTransferWorkbook,
  createGlJournalCsv,
  createKt20kWorkbook,
  createPnd1kWorkbook,
  createPnd1Workbook,
  createSso110Workbook,
} from "./exports";
import { buildHrmExportSlips, payrollRowToSlipData } from "./slips-bridge";
import {
  buildPayrollSummarySheetModel,
  createPayrollSummarySheetPdf,
  createPayrollSummarySheetWorkbook,
} from "./summary-sheet";
import type { Payroll } from "./types";

function makePeriodPayroll(month: number, baseSalary = 30000): Payroll {
  const payrollData = createDefaultEmployeePayrollData();
  payrollData.bankName = "KBANK";
  payrollData.accountNumber = "0012345678";
  payrollData.incomeItems = [
    { code: "INT003", label: "เบี้ยขยัน", amount: 1500, unit: "period", enabled: true },
  ];
  payrollData.deductionItems = [
    { code: "SYS002", label: "ภาษี", amount: 500, unit: "period", enabled: true },
    { code: "SYS001", label: "ประกันสังคม", amount: 750, unit: "period", enabled: true },
    { code: "DDT006", label: "กองทุนสำรองเลี้ยงชีพ", amount: 900, unit: "period", enabled: true },
  ];

  const row = buildPayrollRow(
    {
      employeeId: "11111111-1111-1111-1111-111111111111",
      code: "0001",
      prefix: "นาย",
      firstName: "สมชาย",
      lastName: "ใจดี",
      citizenId: "1100500999888",
      avatarUrl: null,
      startDate: "2024-01-01",
      endDate: null,
      department: "วิศวกรรม",
      baseSalary,
      payrollData,
      weekdayMultiplier: 1.5,
      holidayMultiplier: 3,
      workHoursPerDay: 8,
      weeklyHolidays: [0],
    },
    { weekday: 2, holiday: 0, pending: 0, pendingCount: 0 },
    [],
    { periodStart: `2026-${String(month).padStart(2, "0")}-01`, periodEnd: `2026-${String(month).padStart(2, "0")}-28` },
  );

  return {
    year: 2026,
    month,
    periodStart: `2026-${String(month).padStart(2, "0")}-01`,
    periodEnd: `2026-${String(month).padStart(2, "0")}-28`,
    payDate: `2026-${String(month).padStart(2, "0")}-28`,
    companyName: "บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด",
    rows: [row],
    summary: summarizePayroll([row]),
    workflow: {
      status: "locked",
      verifiedEmployeeIds: [],
      hasSnapshot: true,
      overrides: {},
      settings: {},
      submittedByName: null,
      submittedAt: null,
      approvedByName: null,
      approvedAt: null,
      lockedByName: null,
      lockedAt: null,
      paidByName: null,
      paidAt: null,
      note: null,
    },
  };
}

describe("HRM payroll to salary slip bridge and statutory exports", () => {
  it("converts PayrollRow into satang SlipData and accumulates YTD across months", () => {
    const jan = makePeriodPayroll(1);
    const feb = makePeriodPayroll(2);
    const slipData = payrollRowToSlipData(feb.rows[0], 2026, 2);

    expect(slipData.incomeTotal - slipData.deductionTotal).toBe(slipData.netPay);
    expect(slipData.incomes.salary).toBe(3000000);
    expect(slipData.incomes.ot).toBe(37500);
    expect(slipData.incomes.attendance_bonus).toBe(150000);
    expect(slipData.deductions.tax).toBe(50000);
    expect(slipData.deductions.social_security).toBe(75000);
    expect(slipData.deductions.provident_fund).toBe(90000);

    const febSlips = buildHrmExportSlips([jan, feb], 2026, 2);
    expect(febSlips).toHaveLength(1);
    expect(febSlips[0].cumulative).toEqual({
      income: slipData.incomeTotal * 2,
      tax: 100000,
      social: 150000,
      provident: 180000,
    });
    expect(febSlips[0].missingMonths).toEqual([]);
  });

  it("generates balanced GL Journal CSV, Bank Transfer TXT, ภ.ง.ด.1 and สปส.1-10 workbooks", async () => {
    const payroll = makePeriodPayroll(9);

    const csv = createGlJournalCsv(payroll).toString("utf8");
    const dataLines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/).slice(1);
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of dataLines) {
      const cols = line.split(",");
      totalDebit += Number(cols[4]);
      totalCredit += Number(cols[5]);
    }
    expect(Math.round(totalDebit * 100)).toBe(Math.round(totalCredit * 100));

    const txt = createBankTransferTxt(payroll).toString("utf8");
    expect(txt).toContain("D|0001|0001|KBANK|0012345678|สมชาย ใจดี|");

    const pnd1Buffer = Buffer.from(await createPnd1Workbook(payroll).xlsx.writeBuffer());
    const pnd1Loaded = new ExcelJS.Workbook();
    await pnd1Loaded.xlsx.load(pnd1Buffer as never);
    const pnd1Sheet = pnd1Loaded.getWorksheet("ภ.ง.ด.1")!;
    expect(pnd1Sheet.getCell("B3").value).toBe("1100500999888");
    expect(pnd1Sheet.getCell("J3").value).toBe(500);

    const ssoBuffer = Buffer.from(await createSso110Workbook(payroll).xlsx.writeBuffer());
    const ssoLoaded = new ExcelJS.Workbook();
    await ssoLoaded.xlsx.load(ssoBuffer as never);
    expect(ssoLoaded.worksheets.map((sheet) => sheet.name)).toEqual(["สปส.1-10 ส่วนที่ 1", "สปส.1-10 ส่วนที่ 2"]);
    expect(ssoLoaded.getWorksheet("สปส.1-10 ส่วนที่ 2")!.getCell("B3").value).toBe("1100500999888");

    const bankBuffer = Buffer.from(await createBankTransferWorkbook(payroll).xlsx.writeBuffer());
    const bankLoaded = new ExcelJS.Workbook();
    await bankLoaded.xlsx.load(bankBuffer as never);
    expect(bankLoaded.getWorksheet("นำส่งเงินเดือนธนาคาร")!.getCell("G3").value).toBe(payroll.rows[0].netPay);

    const jan = makePeriodPayroll(1);
    const feb = makePeriodPayroll(2);
    const kt20kBuffer = Buffer.from(await createKt20kWorkbook([jan, feb]).xlsx.writeBuffer());
    const kt20kLoaded = new ExcelJS.Workbook();
    await kt20kLoaded.xlsx.load(kt20kBuffer as never);
    expect(kt20kLoaded.getWorksheet("กท.20 ก")!.getCell("Q3").value).toBe((jan.rows[0].incomeTotal ?? 0) * 2);

    const pnd1kBuffer = Buffer.from(await createPnd1kWorkbook([jan, feb]).xlsx.writeBuffer());
    const pnd1kLoaded = new ExcelJS.Workbook();
    await pnd1kLoaded.xlsx.load(pnd1kBuffer as never);
    expect(pnd1kLoaded.getWorksheet("ภ.ง.ด.1ก")!.getCell("I3").value).toBe(1000);
  });

  it("generates grouped TJARUSCH_PAYROLL summary sheet in both XLSX and PDF with cash deduction", async () => {
    const payroll = makePeriodPayroll(9);
    const cashData = createDefaultEmployeePayrollData();
    cashData.bankName = "";
    cashData.accountNumber = "";
    cashData.deductionItems = [
      { code: "SYS001", label: "ประกันสังคม", amount: 500, unit: "period", enabled: true },
    ];
    const cashRow = buildPayrollRow(
      {
        employeeId: "22222222-2222-2222-2222-222222222222",
        code: "2424",
        prefix: "น.ส.",
        firstName: "ฟองมะณี",
        lastName: "อองสีหาลาด",
        citizenId: "",
        avatarUrl: null,
        startDate: "2024-01-01",
        endDate: null,
        department: "ออฟฟิศ",
        baseSalary: 10000,
        payrollData: cashData,
        weekdayMultiplier: 1.5,
        holidayMultiplier: 2,
        workHoursPerDay: 8,
        weeklyHolidays: [0],
      },
      undefined,
      [],
      { periodStart: "2026-09-01", periodEnd: "2026-09-30" },
    );

    const combined: Payroll = {
      ...payroll,
      rows: [...payroll.rows, cashRow],
      summary: summarizePayroll([...payroll.rows, cashRow]),
    };

    const model = buildPayrollSummarySheetModel(combined);
    expect(model.title).toBe("TJARUSCH_PAYROLL_2026-09-01");
    expect(model.groups).toHaveLength(2);
    expect(model.cashDeductedTotal).toBe(9500);
    expect(model.directPayrollTotal).toBe(combined.rows[0].netPay);

    const xlsxBuffer = Buffer.from(await createPayrollSummarySheetWorkbook(combined).xlsx.writeBuffer());
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(xlsxBuffer as never);
    const sheet = loaded.getWorksheet("TJARUSCH_PAYROLL_2026-09")!;
    expect(sheet.getCell("A1").value).toBe("TJARUSCH_PAYROLL_2026-09-01");
    expect(sheet.getCell("D2").value).toBe("รายการเงินได้");
    expect(sheet.getCell("O2").value).toBe("รายการหัก");
    expect(sheet.getCell("Q2").value).toBe("จ่ายเงินสุทธิ");

    const pdfBuffer = await createPayrollSummarySheetPdf(combined);
    expect(pdfBuffer.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(pdfBuffer.byteLength).toBeGreaterThan(2000);
  });
});
