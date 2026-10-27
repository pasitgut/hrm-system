import { createPdfMakeBuffer } from "@/lib/pdfmake/server";
import { createLeaveReportPdfDefinition } from "./leave/pdfmake";
import type { LeaveReportDocument } from "./leave/template";
import { createOtReportPdfPayload } from "./ot/pdf-payload";
import { createOtReportPdfDefinition } from "./ot/pdfmake";
import type { OtReportDocument } from "./ot/template";

export async function renderOtReportPdf(report: OtReportDocument): Promise<Buffer> {
  return createPdfMakeBuffer(createOtReportPdfDefinition(createOtReportPdfPayload(report)));
}

export async function renderLeaveReportPdf(report: LeaveReportDocument): Promise<Buffer> {
  return createPdfMakeBuffer(createLeaveReportPdfDefinition(report));
}
