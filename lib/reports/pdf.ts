import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createOtReportMarkup, type OtReportDocument } from "./ot/template";
import { createLeaveReportMarkup, type LeaveReportDocument } from "./leave/template";

export class PdfRendererUnavailableError extends Error {
  constructor() {
    super("PDF renderer is not installed");
    this.name = "PdfRendererUnavailableError";
  }
}

function publicAsset(name: string) {
  return path.join(process.cwd(), "public", name);
}

async function reportFonts() {
  const regularPath = publicAsset("THSarabunNew.ttf");
  const boldPath = publicAsset("THSarabunNew-Bold.ttf");
  if (!existsSync(regularPath) || !existsSync(boldPath)) {
    throw new Error("TH Sarabun New PDF font files are missing");
  }
  const [regularFont, boldFont] = await Promise.all([readFile(regularPath), readFile(boldPath)]);
  return { regular: regularFont.toString("base64"), bold: boldFont.toString("base64") };
}

async function renderPdf(markup: { html: string; headerTemplate: string; footerTemplate: string }): Promise<Buffer> {
  const executable = chromium.executablePath();
  if (!existsSync(executable)) throw new PdfRendererUnavailableError();

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ locale: "th-TH" });
    await page.route("**/*", (route) => route.abort());
    await page.setContent(markup.html, { waitUntil: "load", timeout: 30_000 });
    await page.emulateMedia({ media: "print" });
    const fontsReady = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check("12px THSarabunNew") && document.fonts.check("700 12px THSarabunNew");
    });
    if (!fontsReady) throw new Error("Thai fonts did not load in the PDF renderer");
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: markup.headerTemplate,
      footerTemplate: markup.footerTemplate,
      margin: { top: "0.708333in", right: "0.277778in", bottom: "0.277778in", left: "0.277778in" },
      preferCSSPageSize: true,
    });
    return Buffer.from(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/executable.*doesn.t exist|browser.*not found|failed to launch/i.test(message)) {
      throw new PdfRendererUnavailableError();
    }
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

export async function renderOtReportPdf(report: OtReportDocument): Promise<Buffer> {
  const fonts = await reportFonts();
  return renderPdf(createOtReportMarkup(report, fonts.regular, fonts.bold));
}

export async function renderLeaveReportPdf(report: LeaveReportDocument): Promise<Buffer> {
  const fonts = await reportFonts();
  return renderPdf(createLeaveReportMarkup(report, fonts.regular, fonts.bold));
}
