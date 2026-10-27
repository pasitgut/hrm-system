import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { salarySlipImports } from "@/lib/db/schema";
import { requireApiPermission } from "@/lib/auth/dal";
import { parseWorkbook } from "@/lib/salary-slips/parser";
import { removeSource, saveSource } from "@/lib/salary-slips/storage";
import { duplicateSourceRows, previewImport, SlipError } from "@/lib/salary-slips/service";
import type { ImportFile, ImportRow } from "@/lib/salary-slips/model";
import { salaryRoute } from "../_shared";

export const runtime = "nodejs";
export const POST = salaryRoute(async (request) => {
  const user = await requireApiPermission(request, "salary_slips.import");
  await requireApiPermission(request, "salary_slips.view");
  if (Number(request.headers.get("content-length") ?? 0) > 25 * 1024 * 1024) throw new SlipError("ไฟล์รวมต้องไม่เกิน 25 MB", 413);
  const form = await request.formData();
  const uploads = form.getAll("files");
  if (!uploads.length || uploads.length > 12 || uploads.some((file) => !(file instanceof File))) throw new SlipError("เลือกไฟล์ Excel 1–12 ไฟล์");
  const files: ImportFile[] = [], rows: ImportRow[] = [];
  let persisted = false, size = 0;
  try {
    for (const [index, upload] of (uploads as File[]).entries()) {
      size += upload.size;
      if (!/\.xlsx$/i.test(upload.name) || upload.size > 10 * 1024 * 1024 || size > 25 * 1024 * 1024) throw new SlipError("รองรับ .xlsx ไม่เกิน 10 MB ต่อไฟล์ และรวมไม่เกิน 25 MB", 413);
      const buffer = Buffer.from(await upload.arrayBuffer());
      try { rows.push(...await parseWorkbook(buffer, upload.name, index)); }
      catch (error) { throw new SlipError(`${upload.name}: ${(error as Error).message}`); }
      files.push(await saveSource(upload.name, buffer));
    }
    duplicateSourceRows(rows);
    const [batch] = await db.insert(salarySlipImports).values({ createdBy: user.sub, files, rows }).returning();
    persisted = true;
    return NextResponse.json(await previewImport(batch.id), { status: 201, headers: { "Cache-Control": "no-store" } });
  } finally {
    if (!persisted) await Promise.allSettled(files.map((file) => removeSource(file.path)));
  }
});
