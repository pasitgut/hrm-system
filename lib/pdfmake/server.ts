import pdfMake from "pdfmake";
import path from "node:path";
import { OT_PDF_TABLE_LAYOUT } from "@/lib/reports/ot/pdfmake";

type PdfMakeServer = {
  addFonts(fonts: Record<string, unknown>): void;
  addTableLayouts(layouts: Record<string, unknown>): void;
  setLocalAccessPolicy(callback: (target: string) => boolean): void;
  setUrlAccessPolicy(callback: () => boolean): void;
  createPdf(definition: unknown): { getBuffer(): Promise<Uint8Array> };
};

const engine = pdfMake as unknown as PdfMakeServer;
let configured = false;

export const LEAVE_PDF_TABLE_LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => "#bdbdbd",
  vLineColor: () => "#bdbdbd",
  paddingLeft: () => 2.5,
  paddingRight: () => 2.5,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

export const SALARY_SLIP_PDF_TABLE_LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => "#cfd5dc",
  vLineColor: () => "#cfd5dc",
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

export const SALARY_SLIP_PDF_BOX_LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => "#cfd5dc",
  vLineColor: () => "#cfd5dc",
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

export const PAYROLL_SHEET_PDF_TABLE_LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => "#404040",
  vLineColor: () => "#404040",
  paddingLeft: () => 2,
  paddingRight: () => 2,
  paddingTop: () => 2,
  paddingBottom: () => 2,
};

function configurePdfMake() {
  if (configured) return;

  const publicDirectory = path.resolve(process.cwd(), "public");
  const publicPrefix = `${publicDirectory}${path.sep}`;
  engine.setLocalAccessPolicy((target) => {
    const resolved = path.resolve(target);
    return resolved === publicDirectory || resolved.startsWith(publicPrefix);
  });
  engine.setUrlAccessPolicy(() => false);
  engine.addFonts({
    THSarabunNew: {
      normal: path.join(publicDirectory, "THSarabunNew.ttf"),
      bold: path.join(publicDirectory, "THSarabunNew-Bold.ttf"),
      italics: path.join(publicDirectory, "THSarabunNew-Italic.ttf"),
      bolditalics: path.join(publicDirectory, "THSarabunNew-BoldItalic.ttf"),
    },
    NotoSansThai: {
      normal: path.join(publicDirectory, "NotoSansThai-Regular.ttf"),
      bold: path.join(publicDirectory, "NotoSansThai-Bold.ttf"),
      italics: path.join(publicDirectory, "NotoSansThai-Regular.ttf"),
      bolditalics: path.join(publicDirectory, "NotoSansThai-Bold.ttf"),
    },
  });
  engine.addTableLayouts({
    otGrid: OT_PDF_TABLE_LAYOUT,
    leaveGrid: LEAVE_PDF_TABLE_LAYOUT,
    salarySlipGrid: SALARY_SLIP_PDF_TABLE_LAYOUT,
    salarySlipBox: SALARY_SLIP_PDF_BOX_LAYOUT,
    payrollSheetGrid: PAYROLL_SHEET_PDF_TABLE_LAYOUT,
  });
  configured = true;
}

export async function createPdfMakeBuffer(definition: unknown): Promise<Buffer> {
  configurePdfMake();
  const bytes = await engine.createPdf(definition).getBuffer();
  return Buffer.from(bytes);
}
