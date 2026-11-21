import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth/dal";
import { createExcel, createPdf } from "@/lib/salary-slips/documents";
import {
  buildStatelessExportSlips,
  MAX_TOTAL_BYTES,
  parseUploadedSalaryWorkbooks,
  SlipError,
} from "@/lib/salary-slips/stateless";
import { salaryRoute } from "../_shared";

export const runtime = "nodejs";

const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
    z.number().int().min(min).max(max).optional(),
  );

const exportFormSchema = z.object({
  format: z.enum(["pdf", "xlsx"]),
  year: optionalInt(1900, 2200),
  month: optionalInt(1, 12),
  acknowledgeMissing: z.preprocess(
    (value) => value === true || value === "true" || value === "1",
    z.boolean(),
  ),
});

// Stateless salary slip export: HR uploads .xlsx files covering start-of-year
// through the target month, and receives generated .pdf or .xlsx directly
// without persisting files to /tmp or rows to the database.
export const POST = salaryRoute(async (request) => {
  await requireApiPermission(request, "salary_slips.view");
  await requireApiPermission(request, "salary_slips.export");

  if (Number(request.headers.get("content-length") ?? 0) > MAX_TOTAL_BYTES) {
    throw new SlipError("ไฟล์รวมต้องไม่เกิน 25 MB", 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new SlipError("กรุณาส่งข้อมูลแบบ multipart/form-data พร้อมไฟล์ .xlsx", 400);
  }

  const parsed = exportFormSchema.parse({
    format: form.get("format"),
    year: form.get("year"),
    month: form.get("month"),
    acknowledgeMissing: form.get("acknowledgeMissing"),
  });

  const rawFiles = form.getAll("files");
  if (!rawFiles.length || rawFiles.some((entry) => !(entry instanceof File))) {
    throw new SlipError("กรุณาเลือกไฟล์ Excel (.xlsx) อย่างน้อย 1 ไฟล์", 400);
  }

  const uploaded = await Promise.all(
    (rawFiles as File[]).map(async (file) => ({
      name: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
    })),
  );

  const rows = await parseUploadedSalaryWorkbooks(uploaded);
  const { year, month, items } = buildStatelessExportSlips(rows, {
    year: parsed.year,
    month: parsed.month,
  });

  if (items.some((item) => item.missingMonths.length) && !parsed.acknowledgeMissing) {
    return NextResponse.json(
      {
        error: "ไฟล์ที่อัปโหลดยังขาดบางเดือนตั้งแต่ต้นปี ยอดสะสมจะรวมเฉพาะเดือนที่มีในไฟล์",
        missing: items
          .filter((item) => item.missingMonths.length)
          .map((item) => ({
            code: item.data.code,
            name: item.data.name,
            month: item.data.month,
            missingMonths: item.missingMonths,
          })),
      },
      { status: 409 },
    );
  }

  const buffer: Buffer = parsed.format === "pdf" ? await createPdf(items) : await createExcel(items);
  const monthSuffix = month !== null ? `-${String(month).padStart(2, "0")}` : "";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": parsed.format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="salary-slips-${year}${monthSuffix}.${parsed.format}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
