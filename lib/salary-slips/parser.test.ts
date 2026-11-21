import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseMoney, parsePeriod, parseWorkbook } from "./parser";
import { withCumulative } from "./model";
import { fixtureData, fixtureWorkbook } from "@/tests/setup/salary-slips";
describe("salary slip parser", () => {
  it("preserves formatted employee codes, bank zeros, and department sections", async () => {
    const [row] = await parseWorkbook(await fixtureWorkbook(), "payroll.xlsx", 0);
    expect(row.errors).toEqual([]); expect(row.data).toEqual(fixtureData());
  });
  it("reports totals that disagree rather than silently replacing amounts", async () => {
    const [row] = await parseWorkbook(await fixtureWorkbook((sheet) => { sheet.getCell("AM10").value = 9000; }), "bad.xlsx", 0);
    expect(row.errors).toContain("เงินสุทธิไม่ตรงกับรายได้ลบรายหัก");
  });
  it("rejects invalid money and formulas with no saved result", async () => {
    const [row] = await parseWorkbook(await fixtureWorkbook((sheet) => { sheet.getCell("G10").value = { formula: "1+2" }; }), "bad.xlsx", 0);
    expect(row.errors.join()).toContain("สูตรไม่มีผลลัพธ์");
    expect(() => parseMoney("oops")).toThrow(); expect(() => parseMoney(null, true)).toThrow();
    expect(parseMoney("1,234.565")).toBe(123457); expect(parseMoney("-0.005")).toBe(-1);
  });
  it("supports Buddhist years, Excel serial dates, leap years, and rejects invalid dates", () => {
    expect(parsePeriod("29/02/2567")).toEqual({ year: 2024, month: 2 });
    expect(parsePeriod(new Date("2026-01-31T00:00:00Z"))).toEqual({ year: 2026, month: 1 });
    expect(parsePeriod(46053)).toEqual({ year: 2026, month: 1 });
    expect(() => parsePeriod("31/02/2569")).toThrow(); expect(() => parsePeriod(null)).toThrow();
  });
  it("flags rows with a missing code and doesn't treat them as empty rows", async () => {
    const [row] = await parseWorkbook(await fixtureWorkbook((sheet) => { sheet.getCell("B10").value = null; }), "bad.xlsx", 0);
    expect(row.errors).toContain("ไม่พบรหัสพนักงาน");
  });
  it("ignores header and total rows but rejects unrelated spreadsheets", async () => {
    const rows = await parseWorkbook(await fixtureWorkbook((sheet) => { sheet.getCell("A11").value = "รวม"; sheet.getCell("B11").value = "บัญชี"; }), "input.xlsx", 0);
    expect(rows).toHaveLength(1);
    const book = new ExcelJS.Workbook(); book.addWorksheet("other").getCell("A1").value = "other";
    await expect(parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()), "other.xlsx", 0)).rejects.toThrow("โครงสร้าง");
  });
});
describe("salary history", () => {
  it("resets at year boundaries, excludes future months and separates employees", () => {
    const make = (id: string, year: number, month: number, employeeId = "a") => ({ id, employeeId, revision: 1, data: fixtureData({ year, month }) });
    const items = withCumulative([make("old", 2025, 12), make("jan", 2026, 1), make("mar", 2026, 3), make("apr", 2026, 4), make("b", 2026, 1, "b")]);
    const march = items.find((item) => item.id === "mar")!;
    expect(march.cumulative).toEqual({ income: 2000000, tax: 20000, social: 100000, provident: 20000 }); expect(march.missingMonths).toEqual([2]);
    expect(items.find((item) => item.id === "b")!.cumulative.income).toBe(1000000);
  });
});
