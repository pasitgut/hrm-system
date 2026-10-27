import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createExcel, documentHtml } from "./documents";
import { withCumulative } from "./model";
import { fixtureData } from "@/tests/setup/salary-slips";
import JSZip from "jszip";

describe("salary slip documents", () => {
  const items = withCumulative([1, 2].map((month) => ({ id: String(month), employeeId: "a", revision: 1, data: fixtureData({ month }) })));
  it("exports only selected employees, all four cumulative totals and monthly page breaks", async () => {
    const buffer = await createExcel(items);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as never);
    expect(workbook.worksheets).toHaveLength(1);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell("D6").value).toBe("ทดสอบ สลิป");
    expect(sheet.getCell("B6").value).toBe("0001");
    expect(sheet.getCell("D7").value).toBe("");
    expect(sheet.getCell("A64").value).toBe(20000);
    expect(sheet.getCell("C64").value).toBe(200);
    expect(sheet.getCell("F64").value).toBe(1000);
    expect(sheet.getCell("H64").value).toBe(200);
    expect(sheet.getCell("K59").value).toBe(9300);
    // ExcelJS's reader does not restore rowBreaks; inspect the saved OOXML instead.
    const archive = await JSZip.loadAsync(buffer);
    expect(await archive.file("xl/worksheets/sheet1.xml")!.async("string")).toContain('<brk id="33"');
    expect(sheet.getImages()).toHaveLength(2);
  });
  it("escapes imported text and includes bank and cumulative values in HTML", async () => {
    const html = await documentHtml(withCumulative([{ ...items[0], data: fixtureData({ name: "<script>alert(1)</script>" }) }]));
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
    expect(html).toContain("001-2-3456-78"); expect(html).toContain("ภาษีสะสมต่อปี");
    expect(html).toContain("บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด");
  });
});
