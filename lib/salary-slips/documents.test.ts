import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createExcel, createPdf, createSalarySlipPdfDefinition } from "./documents";
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
  it("creates native PDFMake documents with employee, bank and cumulative information", async () => {
    const selected = withCumulative([
      { ...items[0], data: fixtureData({ name: "<script>alert(1)</script>" }) },
      items[1],
    ]);
    const definition = createSalarySlipPdfDefinition(selected, "data:image/png;base64,AA==");
    const document = JSON.stringify(definition);
    expect(definition.pageSize).toBe("A4");
    expect(definition.pageOrientation).toBe("landscape");
    expect(definition.defaultStyle.font).toBe("NotoSansThai");
    expect(definition.content).toHaveLength(2);
    expect(definition.content[1].pageBreak).toBe("before");
    expect(document).toContain("<script>alert(1)</script>");
    expect(document).toContain("001-2-3456-78");
    expect(document).toContain("ภาษีสะสมต่อปี");
    expect(document).toContain("บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด");

    const pdf = await createPdf([selected[0]]);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
