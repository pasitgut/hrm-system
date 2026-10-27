export async function createOtReportPdf(report) {
  if (typeof window === "undefined") throw new Error("PDF export requires a browser");
  if (!report || typeof report !== "object" || !report.model || !report.variant) {
    throw new Error("The OT report response is incomplete");
  }

  const [pdfMakeModule, { createOtReportPdfDefinition, OT_PDF_TABLE_LAYOUT }] = await Promise.all([
    import("pdfmake/build/pdfmake.js"),
    import("@/lib/reports/ot/pdfmake"),
  ]);
  const pdfMake = pdfMakeModule.default ?? pdfMakeModule;
  if (!pdfMake.createPdf || !pdfMake.addFonts || !pdfMake.addTableLayouts) {
    throw new Error("PDF generation could not be initialized");
  }

  const regularFont = new URL("/THSarabunNew.ttf", window.location.origin).href;
  const boldFont = new URL("/THSarabunNew-Bold.ttf", window.location.origin).href;
  pdfMake.addFonts({
    THSarabunNew: {
      normal: regularFont,
      bold: boldFont,
      italics: regularFont,
      bolditalics: boldFont,
    },
  });
  pdfMake.addTableLayouts({ otGrid: OT_PDF_TABLE_LAYOUT });

  const definition = createOtReportPdfDefinition(report);
  return pdfMake.createPdf(definition).getBlob();
}
