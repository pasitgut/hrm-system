import { NextResponse } from "next/server";
import { z } from "zod";
import { bufferToReadableStream } from "@/lib/api/stream";
import { requireApiPermission } from "@/lib/auth/dal";
import { createExcel, createPdf } from "@/lib/salary-slips/documents";
import type { ImportRow } from "@/lib/salary-slips/model";
import {
  buildStatelessExportSlips,
  MAX_TOTAL_BYTES,
  parseUploadedSalaryWorkbooks,
  SlipError,
  validateCombinedSalaryRows,
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

const slipDataSchema = z.object({
  code: z.string(),
  name: z.string(),
  department: z.string(),
  year: z.number().int().min(1900).max(2200),
  month: z.number().int().min(1).max(12),
  bank: z.string(),
  bankAccount: z.string(),
  incomes: z.record(z.string(), z.number()),
  deductions: z.record(z.string(), z.number()),
  incomeTotal: z.number(),
  deductionTotal: z.number(),
  netPay: z.number(),
});

const importRowSchema = z.object({
  key: z.string(),
  file: z.string(),
  sheet: z.string(),
  row: z.number().int(),
  data: slipDataSchema.nullable(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

const exportJsonSchema = z.object({
  format: z.enum(["pdf", "xlsx"]),
  year: z.number().int().min(1900).max(2200).optional(),
  month: z.number().int().min(1).max(12).optional(),
  acknowledgeMissing: z.boolean().default(false),
  rows: z.array(importRowSchema).min(1).max(10_000),
});

// Stateless salary slip export: HR uploads .xlsx files covering start-of-year
// through the target month (directly or pre-parsed via /api/salary-slips/parse),
// and receives streamed .pdf or .xlsx directly without persisting to DB.
export const POST = salaryRoute(async (request) => {
  await requireApiPermission(request, "salary_slips.view");
  await requireApiPermission(request, "salary_slips.export");

  const contentType = request.headers.get("content-type") ?? "";
  let parsed: { format: "pdf" | "xlsx"; year?: number; month?: number; acknowledgeMissing: boolean };
  let rows: ImportRow[];

  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new SlipError("รูปแบบข้อมูล JSON ไม่ถูกต้อง", 400);
    }
    const jsonPayload = exportJsonSchema.parse(body);
    parsed = {
      format: jsonPayload.format,
      year: jsonPayload.year,
      month: jsonPayload.month,
      acknowledgeMissing: Boolean(jsonPayload.acknowledgeMissing),
    };
    rows = validateCombinedSalaryRows(
      jsonPayload.rows.map((row) => ({
        key: row.key,
        file: row.file,
        sheet: row.sheet,
        row: row.row,
        data: row.data ?? null,
        errors: row.errors ?? [],
        warnings: row.warnings ?? [],
      })) as ImportRow[],
    );
  } else {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_TOTAL_BYTES) {
      throw new SlipError("ไฟล์รวมต้องไม่เกิน 25 MB", 413);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new SlipError("กรุณาส่งข้อมูลแบบ multipart/form-data พร้อมไฟล์ .xlsx", 400);
    }

    const formParsed = exportFormSchema.parse({
      format: form.get("format"),
      year: form.get("year"),
      month: form.get("month"),
      acknowledgeMissing: form.get("acknowledgeMissing"),
    });
    parsed = {
      format: formParsed.format,
      year: formParsed.year,
      month: formParsed.month,
      acknowledgeMissing: Boolean(formParsed.acknowledgeMissing),
    };

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

    rows = await parseUploadedSalaryWorkbooks(uploaded);
  }

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

  return new Response(bufferToReadableStream(buffer), {
    headers: {
      "Content-Type": parsed.format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="salary-slips-${year}${monthSuffix}.${parsed.format}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
