import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/dal";
import {
  MAX_TOTAL_BYTES,
  parseSalaryWorkbookBatch,
  SlipError,
} from "@/lib/salary-slips/stateless";
import { salaryRoute } from "../_shared";

export const runtime = "nodejs";

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

  const rows = await parseSalaryWorkbookBatch(uploaded);
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
});
