import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPdf } from "@/lib/salary-slips/documents";
import { fixtureData } from "@/tests/setup/salary-slips";
import { withCumulative } from "@/lib/salary-slips/model";

const qaDirectory = process.env.PDFMAKE_QA_DIR ?? process.argv[2];
const outputDirectory = qaDirectory
  ? path.join(path.resolve(qaDirectory), "salary-slips")
  : path.join(process.cwd(), "output", "pdf", "salary-slip-fixtures");
const items = withCumulative([{
  id: "pdfmake-fixture",
  employeeId: "pdfmake-fixture-employee",
  revision: 1,
  data: fixtureData({ code: "PDF01", name: "สมชาย ใจดี", department: "สำนักงาน", month: 10 }),
}]);
const pdf = await createPdf(items);
await mkdir(outputDirectory, { recursive: true });
const destination = path.join(outputDirectory, "salary-slip.pdf");
await writeFile(destination, pdf);
assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
const pageCount = pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
assert.equal(pageCount, 1, "A single salary slip should fit on one page");
process.stdout.write(`Salary slip PDFMake fixture: ${pdf.byteLength} bytes, ${pageCount} page -> ${path.relative(process.cwd(), destination)}\n`);
