import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createOtReportMarkup, type OtReportDocument } from "./ot/template";

export class PdfRendererUnavailableError extends Error {
  constructor() {
    super("PDF renderer is not installed");
    this.name = "PdfRendererUnavailableError";
  }
}

function publicAsset(name: string) {
  return path.join(process.cwd(), "public", name);
}

export async function renderOtReportPdf(report: OtReportDocument): Promise<Buffer> {
  const regularPath = publicAsset("NotoSansThai-Regular.ttf");
  const boldPath = publicAsset("NotoSansThai-Bold.ttf");
  if (!existsSync(regularPath) || !existsSync(boldPath)) {
    throw new Error("Thai PDF font files are missing");
  }
  const [regularFont, boldFont] = await Promise.all([readFile(regularPath), readFile(boldPath)]);
  const markup = createOtReportMarkup(report, regularFont.toString("base64"), boldFont.toString("base64"));
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
      return document.fonts.check("9px Thai") && document.fonts.check("700 9px Thai");
    });
    if (!fontsReady) throw new Error("Thai fonts did not load in the PDF renderer");
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: markup.headerTemplate,
      footerTemplate: markup.footerTemplate,
      margin: { top: "16mm", right: "10mm", bottom: "14mm", left: "10mm" },
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
