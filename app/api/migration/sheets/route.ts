import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { classifyDatabaseError } from "@/lib/db/auto-migrate";
import {
  MAX_MIGRATION_FILE_BYTES,
  parseAppSheetWorkbook,
  SheetMigrationError,
} from "@/lib/migration/appsheet";
import { replaceDatabaseFromSheetMigration } from "@/lib/migration/import-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

export const POST = withApiAuth(async (request: NextRequest) => {
  await requireApiPermission(request, "users.permissions.manage");

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_MIGRATION_FILE_BYTES) {
    return jsonError(413, "ไฟล์ต้องมีขนาดไม่เกิน 25 MB");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "กรุณาส่งข้อมูลแบบ multipart/form-data พร้อมไฟล์ .xlsx");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError(400, "กรุณาเลือกไฟล์ Excel (.xlsx) ที่ต้องการนำเข้า");
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return jsonError(400, "รองรับเฉพาะไฟล์ .xlsx ที่ส่งออกจาก Google Sheet เท่านั้น");
  }
  if (file.size <= 0) {
    return jsonError(400, "ไฟล์ว่างเปล่า กรุณาเลือกไฟล์ใหม่");
  }
  if (file.size > MAX_MIGRATION_FILE_BYTES) {
    return jsonError(413, "ไฟล์ต้องมีขนาดไม่เกิน 25 MB");
  }

  const mode = form.get("mode") === "import" ? "import" : "preview";
  const confirmReplace = form.get("confirmReplace") === "true";

  if (mode === "import" && !confirmReplace) {
    return jsonError(400, "กรุณายืนยันการลบและบันทึกข้อมูลทับใหม่ทั้งหมดก่อนนำเข้า");
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseAppSheetWorkbook(buffer);

    if (mode === "preview") {
      return NextResponse.json(
        {
          mode: "preview",
          fileName: file.name,
          sheetsFound: parsed.sheetsFound,
          sheetsMissing: parsed.sheetsMissing,
          summary: parsed.summary,
          warnings: parsed.warnings,
          errors: parsed.errors,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (parsed.errors.length > 0) {
      return jsonError(400, "พบข้อผิดพลาดในไฟล์ ไม่สามารถนำเข้าได้", {
        errors: parsed.errors,
        warnings: parsed.warnings,
        summary: parsed.summary,
      });
    }

    const imported = await replaceDatabaseFromSheetMigration(parsed);
    return NextResponse.json(
      {
        mode: "import",
        fileName: file.name,
        sheetsFound: parsed.sheetsFound,
        sheetsMissing: parsed.sheetsMissing,
        imported,
        warnings: parsed.warnings,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof SheetMigrationError) {
      return jsonError(error.status, error.message);
    }
    const status = classifyDatabaseError(error, process.env.DATABASE_URL);
    console.error("Sheet migration failed:", status.reason, error instanceof Error ? error.message : "");
    return jsonError(500, status.hint ? `${status.message} — ${status.hint}` : (status.message ?? "นำเข้าข้อมูลไม่สำเร็จ"));
  }
});
