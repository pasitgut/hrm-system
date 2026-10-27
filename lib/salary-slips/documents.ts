import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { deductionFields, incomeFields, formatMoney, periodLabel, type ExportSlip } from "./model";

const assetPath = (...parts: string[]) => path.join(process.cwd(), "lib", "salary-slips", "assets", ...parts);
const companyName = "บริษัท ต.จรัสชัย สากลก่อสร้าง จำกัด"; // Same company as the supplied Excel template.
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const bankAccount = (value: string) => /^\d{10}$/.test(value) ? `${value.slice(0, 3)}-${value[3]}-${value.slice(4, 8)}-${value.slice(8)}` : value;
const lastDay = (item: ExportSlip) => new Date(Date.UTC(item.data.year, item.data.month, 0)).getUTCDate();

export async function createExcel(items: ExportSlip[]): Promise<Buffer> {
  const source = new ExcelJS.Workbook();
  await source.xlsx.readFile(assetPath("template.xlsx"));
  const template = source.getWorksheet("สลิปเงินเดือน") ?? source.worksheets[0];
  const workbook = new ExcelJS.Workbook();
  const imageId = workbook.addImage({ buffer: await readFile(assetPath("logo.png")) as never, extension: "png" });
  const groups = new Map<string, ExportSlip[]>();
  for (const item of items) groups.set(item.employeeId, [...(groups.get(item.employeeId) ?? []), item]);
  const usedNames = new Set<string>();
  for (const [employeeId, records] of groups) {
    const base = `${records[0].data.name}`.replace(/[\\/*?:\[\]]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "พนักงาน";
    let name = base, suffix = 1;
    while (usedNames.has(name.toLowerCase())) name = `${base.slice(0, 25)}_${suffix++}`;
    usedNames.add(name.toLowerCase());
    const sheet = workbook.addWorksheet(name);
    for (let col = 1; col <= 12; col++) sheet.getColumn(col).width = template.getColumn(col).width;
    for (const [index, item] of records.sort((a, b) => a.data.month - b.data.month).entries()) {
      const offset = index * 33;
      for (let row = 1; row <= 33; row++) {
        sheet.getRow(row + offset).height = template.getRow(row).height;
        for (let col = 1; col <= 12; col++) {
          const original = template.getCell(row, col), cell = sheet.getCell(row + offset, col);
          if (original.isMerged && original.master.address !== original.address) continue;
          cell.value = original.value;
          cell.style = structuredClone(original.style);
        }
      }
      for (const range of (template.model.merges ?? [])) {
        const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)!;
        if (Number(match[4]) <= 33) sheet.mergeCells(`${match[1]}${Number(match[2]) + offset}:${match[3]}${Number(match[4]) + offset}`);
      }
      const put = (row: number, col: string, value: string | number) => { sheet.getCell(`${col}${row + offset}`).value = value; };
      const amount = (row: number, col: string, satang: number) => { put(row, col, satang / 100); sheet.getCell(`${col}${row + offset}`).numFmt = "#,##0.00"; };
      // Clear all variable areas, including English-name and sample cumulative cells.
      for (const [row, cols] of [[6, ["B", "D", "H", "J", "L"]], [7, ["B", "D", "H"]], [9, ["B", "E"]], [10, ["B", "E"]], [26, ["D", "I", "K"]], [31, ["A", "C", "F", "H", "J"]]] as [number, string[]][]) for (const col of cols) put(row, col, "");
      for (let row = 14; row <= 25; row++) for (const col of ["A", "C", "D", "F", "I", "K"]) put(row, col, "");
      put(1, "A", ""); put(4, "J", periodLabel(item.data.year, item.data.month));
      put(6, "B", item.data.code); put(6, "D", item.data.name); put(6, "H", item.data.department); put(6, "J", 1); put(6, "L", lastDay(item));
      put(9, "B", item.data.bank); put(9, "E", bankAccount(item.data.bankAccount));
      let incomeRow = 14, deductionRow = 14;
      for (const [key, label] of incomeFields) if (item.data.incomes[key]) {
        put(incomeRow, "A", label); put(incomeRow, "C", key === "salary" ? lastDay(item) : 1); amount(incomeRow++, "D", item.data.incomes[key]);
      }
      for (const [key, label] of deductionFields) if (item.data.deductions[key]) { put(deductionRow, "F", label); amount(deductionRow++, "I", item.data.deductions[key]); }
      put(14, "K", `${lastDay(item)} ${periodLabel(item.data.year, item.data.month)}`);
      amount(26, "D", item.data.incomeTotal); amount(26, "I", item.data.deductionTotal); amount(26, "K", item.data.netPay);
      amount(31, "A", item.cumulative.income); amount(31, "C", item.cumulative.tax); amount(31, "F", item.cumulative.social); amount(31, "H", item.cumulative.provident);
      if (item.missingMonths.length) sheet.getCell(`A${31 + offset}`).note = `ประวัติยังไม่มีเดือน ${item.missingMonths.join(", ")} ยอดสะสมรวมเฉพาะข้อมูลที่บันทึก`;
      sheet.addImage(imageId, { tl: { col: 0, row: offset }, ext: { width: 160, height: 80 } });
      if (index < records.length - 1) sheet.getRow(offset + 33).addPageBreak();
    }
    sheet.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      printArea: `A1:L${records.length * 33}`, margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 } };
    sheet.views = [{ state: "normal", showGridLines: false }];
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function documentHtml(items: ExportSlip[]): Promise<string> {
  const [font, bold, logo] = await Promise.all([
    readFile(path.join(process.cwd(), "public/NotoSansThai-Regular.ttf")),
    readFile(path.join(process.cwd(), "public/NotoSansThai-Bold.ttf")), readFile(assetPath("logo.png")),
  ]);
  const pages = items.map((item) => {
    const { data } = item;
    const income = incomeFields.filter(([key]) => data.incomes[key]);
    const deductions = deductionFields.filter(([key]) => data.deductions[key]);
    const rows = Array.from({ length: Math.max(income.length, deductions.length, 8) }, (_, i) => `<tr><td>${escape(income[i]?.[1] ?? "")}</td><td class="amount">${income[i] ? income[i][0] === "salary" ? lastDay(item) : 1 : ""}</td><td class="amount">${income[i] ? formatMoney(data.incomes[income[i][0]]) : ""}</td><td>${escape(deductions[i]?.[1] ?? "")}</td><td class="amount">${deductions[i] ? formatMoney(data.deductions[deductions[i][0]]) : ""}</td></tr>`).join("");
    return `<section><header><div><img src="data:image/png;base64,${logo.toString("base64")}" alt="โลโก้"><p>${escape(companyName)}</p></div><div><h1>สลิปเงินเดือน / ใบจ่ายเงินเดือน</h1><p>Pay Slip · ${escape(periodLabel(data.year, data.month))}</p></div></header>
      <div class="identity"><div>รหัสพนักงาน / Emp. Code<br><strong>${escape(data.code)}</strong></div><div>ชื่อ-สกุล / Name<br><strong>${escape(data.name)}</strong></div><div>แผนก / Dept<br><strong>${escape(data.department || "—")}</strong></div></div>
      <div class="identity"><div>ธนาคาร / Bank<br><strong>${escape(data.bank || "—")}</strong></div><div>เลขบัญชี / A/C No.<br><strong>${escape(bankAccount(data.bankAccount) || "—")}</strong></div><div>งวด 1–${lastDay(item)} · จ่าย ${lastDay(item)} ${escape(periodLabel(data.year, data.month))}</div></div>
      <table><thead><tr><th>รายได้ / Income</th><th>จำนวน</th><th class="amount">จำนวนเงิน</th><th>รายการหัก / Deduction</th><th class="amount">จำนวนเงิน</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="2">รวมรายได้</th><th class="amount">${formatMoney(data.incomeTotal)}</th><th>รวมรายหัก</th><th class="amount">${formatMoney(data.deductionTotal)}</th></tr></tfoot></table>
      <p class="net">รายได้สุทธิ / Net Income <strong>${formatMoney(data.netPay)} บาท</strong></p>
      <div class="cumulative">${[["รายได้สะสมต่อปี", item.cumulative.income], ["ภาษีสะสมต่อปี", item.cumulative.tax], ["ประกันสังคมสะสมต่อปี", item.cumulative.social], ["กองทุนสะสมต่อปี", item.cumulative.provident]].map(([label, amount]) => `<div>${label}<br><strong>${formatMoney(Number(amount))}</strong></div>`).join("")}<div>ลงชื่อพนักงาน<br><br>__________________</div></div>
      ${item.missingMonths.length ? `<p class="warning">ยอดสะสมรวมเฉพาะประวัติที่บันทึก ยังไม่มีข้อมูลเดือน ${item.missingMonths.join(", ")}</p>` : ""}</section>`;
  }).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
    @font-face{font-family:Thai;src:url(data:font/ttf;base64,${font.toString("base64")})} @font-face{font-family:Thai;font-weight:700;src:url(data:font/ttf;base64,${bold.toString("base64")})}
    @page{size:A4 landscape;margin:10mm} *{box-sizing:border-box} body{font-family:Thai,sans-serif;font-size:11px;color:#202a35;margin:0} section{break-after:page} section:last-child{break-after:auto} header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px} header img{width:135px;height:65px;object-fit:contain} h1{font-size:19px;margin:0} p{margin:4px 0}.identity{display:grid;grid-template-columns:1fr 2fr 1.3fr;gap:15px;margin:10px 0} table{width:100%;border-collapse:collapse;margin-top:15px;table-layout:fixed} th,td{border:1px solid #cfd5dc;padding:5px 8px;height:27px;text-align:left;overflow-wrap:anywhere} th{background:#f6f7f8} th:nth-child(2){width:9%} .amount{text-align:right;font-variant-numeric:tabular-nums}.net{display:flex;justify-content:space-between;border:1px solid #cfd5dc;padding:9px 12px;font-size:15px}.cumulative{display:grid;grid-template-columns:repeat(5,1fr);margin-top:16px;border:1px solid #cfd5dc}.cumulative>div{padding:8px;text-align:center;border-right:1px solid #cfd5dc}.cumulative>div:last-child{border:0}.warning{font-size:10px;margin-top:6px}
  </style></head><body>${pages}</body></html>`;
}
export async function createPdf(items: ExportSlip[]): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => route.abort()); // All fonts and images are embedded.
    await page.setContent(await documentHtml(items));
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({ format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true });
  } finally { await browser.close(); }
}
