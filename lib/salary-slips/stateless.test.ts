import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { fixtureWorkbook } from "@/tests/setup/salary-slips";
import { buildStatelessExportSlips, parseUploadedSalaryWorkbooks } from "./stateless";
import { createExcel, createPdf } from "./documents";

describe("stateless salary slip export", () => {
  it("computes YTD cumulative totals from Jan to selected month and exports only the selected month", async () => {
    const jan = await fixtureWorkbook((sheet) => { sheet.getCell("E10").value = "31/01/2569"; });
    const feb = await fixtureWorkbook((sheet) => { sheet.getCell("E10").value = "28/02/2569"; });
    const mar = await fixtureWorkbook((sheet) => { sheet.getCell("E10").value = "31/03/2569"; });

    const rows = await parseUploadedSalaryWorkbooks([
      { name: "jan.xlsx", buffer: jan },
      { name: "feb.xlsx", buffer: feb },
      { name: "mar.xlsx", buffer: mar },
    ]);

    const { year, month, items } = buildStatelessExportSlips(rows, { year: 2026, month: 3 });

    expect(year).toBe(2026);
    expect(month).toBe(3);
    expect(items).toHaveLength(1);
    expect(items[0].data.month).toBe(3);
    expect(items[0].missingMonths).toEqual([]);
    expect(items[0].cumulative).toEqual({
      income: 3000000,
      tax: 30000,
      social: 150000,
      provident: 30000,
    });

    const [excel, pdf] = await Promise.all([createExcel(items), createPdf(items)]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel as never);
    expect(workbook.worksheets).toHaveLength(1);
    expect(workbook.worksheets[0].getCell("A31").value).toBe(30000);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("reports missing earlier months when Jan..targetMonth is incomplete", async () => {
    const mar = await fixtureWorkbook((sheet) => { sheet.getCell("E10").value = "31/03/2569"; });
    const rows = await parseUploadedSalaryWorkbooks([{ name: "mar.xlsx", buffer: mar }]);
    const { items } = buildStatelessExportSlips(rows, { year: 2026, month: 3 });

    expect(items[0].missingMonths).toEqual([1, 2]);
  });

  it("rejects duplicate employee/month rows across uploaded files", async () => {
    const janA = await fixtureWorkbook((sheet) => { sheet.getCell("E10").value = "31/01/2569"; });
    const janB = await fixtureWorkbook((sheet) => { sheet.getCell("E10").value = "31/01/2569"; });

    await expect(parseUploadedSalaryWorkbooks([
      { name: "jan-a.xlsx", buffer: janA },
      { name: "jan-b.xlsx", buffer: janB },
    ])).rejects.toThrow("รหัสพนักงานและงวดซ้ำ");
  });

  it("rejects non-xlsx files and missing target period", async () => {
    await expect(parseUploadedSalaryWorkbooks([
      { name: "payroll.csv", buffer: Buffer.from("a,b,c") },
    ])).rejects.toThrow(".xlsx");

    const jan = await fixtureWorkbook((sheet) => { sheet.getCell("E10").value = "31/01/2569"; });
    const rows = await parseUploadedSalaryWorkbooks([{ name: "jan.xlsx", buffer: jan }]);
    expect(() => buildStatelessExportSlips(rows, { year: 2026, month: 5 })).toThrow("ไม่พบข้อมูลสลิปของเดือน 5/2569");
  });
});
