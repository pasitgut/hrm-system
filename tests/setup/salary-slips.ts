import ExcelJS from "exceljs";
import type { SlipData } from "@/lib/salary-slips/model";
export function fixtureData(overrides: Partial<SlipData> = {}): SlipData {
  return { code: "0001", name: "ทดสอบ สลิป", department: "บัญชี", year: 2026, month: 1, bank: "กสิกรไทย", bankAccount: "0012345678",
    incomes: { salary: 1000000, ot: 0, attendance_bonus: 0, compensation: 0, bonus: 0, housing: 0, license: 0, phone: 0 },
    deductions: { leave: 0, late: 0, absence: 0, provident_fund: 10000, loan: 0, social_security: 50000, tax: 10000 },
    incomeTotal: 1000000, deductionTotal: 70000, netPay: 930000, ...overrides };
}
export async function fixtureWorkbook(edit?: (sheet: ExcelJS.Worksheet) => void) {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Payroll");
  sheet.getCell("A9").value = "บัญชี";
  sheet.getCell("B10").value = 1; sheet.getCell("B10").numFmt = "0000";
  sheet.getCell("C10").value = "ทดสอบ สลิป"; sheet.getCell("E10").value = "31/01/2569";
  sheet.getCell("G10").value = 10000; sheet.getCell("AD10").value = 10000;
  sheet.getCell("AE10").value = 100; sheet.getCell("AF10").value = 500; sheet.getCell("AJ10").value = 100;
  sheet.getCell("AL10").value = 700; sheet.getCell("AM10").value = 9300;
  sheet.getCell("AO10").value = "กสิกรไทย"; sheet.getCell("AP10").value = "0012345678";
  edit?.(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
