import { count, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { canAccessPage } from "@/lib/auth/page-access";
import { classifyDatabaseError } from "@/lib/db/auto-migrate";
import { db } from "@/lib/db/client";
import {
  assetRequests,
  departments,
  employees,
  leaveRequests,
  overtimeRequests,
  users,
  workTrackingRecords,
} from "@/lib/db/schema";
import {
  MAX_MIGRATION_FILE_BYTES,
  MIGRATION_SECTIONS,
  parseAppSheetWorkbook,
  parseMigrationSections,
  SHEET_BY_SECTION,
  SheetMigrationError,
} from "@/lib/migration/appsheet";
import { replaceDatabaseFromSheetMigration } from "@/lib/migration/import-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiPermission(request, "users.permissions.manage");
  if (!canAccessPage(user.permissions, "import")) {
    return jsonError(403, "Forbidden");
  }

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
    return jsonError(400, "กรุณายืนยันข้อมูลส่วนที่เลือกก่อนนำเข้า");
  }

  const rawSections = form.getAll("sections");
  const { sections: selectedSections, invalid: invalidSections } = parseMigrationSections(rawSections);
  if (invalidSections.length > 0) {
    return jsonError(400, "ส่วนข้อมูลที่เลือกไม่ถูกต้อง");
  }
  if (mode === "import" && selectedSections.length === 0) {
    return jsonError(400, "กรุณาเลือกอย่างน้อย 1 ส่วนที่ต้องการนำเข้า");
  }

  try {
    const existingEmployeeRows = await db
      .select({
        code: employees.code,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        department: departments.name,
        deletedAt: employees.deletedAt,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id));

    const existingEmployees = existingEmployeeRows.map((row) => ({
      code: row.code,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      department: row.department,
      isFormer: row.deletedAt !== null,
    }));

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseAppSheetWorkbook(buffer, { existingEmployees });
    const availableSections = MIGRATION_SECTIONS.filter((section) =>
      parsed.sheetsFound.includes(SHEET_BY_SECTION[section]),
    );

    if (mode === "preview") {
      const [empCount, userCount, otCount, leaveCount, assetCount, workCount] = await Promise.all([
        db.select({ value: count() }).from(employees),
        db.select({ value: count() }).from(users),
        db.select({ value: count() }).from(overtimeRequests),
        db.select({ value: count() }).from(leaveRequests),
        db.select({ value: count() }).from(assetRequests),
        db.select({ value: count() }).from(workTrackingRecords),
      ]);

      const existingCodeSet = new Set(existingEmployeeRows.map((row) => row.code));
      const formerStubCodeSet = new Set(
        parsed.data.employees.filter((emp) => emp.isFormerStub).map((emp) => emp.code),
      );
      const missingCodesFor = (codes: string[]) =>
        [...new Set(codes)].filter((code) => !existingCodeSet.has(code) && !formerStubCodeSet.has(code)).sort();

      return NextResponse.json(
        {
          mode: "preview",
          fileName: file.name,
          sheetsFound: parsed.sheetsFound,
          sheetsMissing: parsed.sheetsMissing,
          availableSections,
          summary: parsed.summary,
          warnings: parsed.warnings,
          errors: parsed.errors,
          existingDbCounts: {
            employees: Number(empCount[0]?.value ?? 0),
            users: Number(userCount[0]?.value ?? 0),
            overtime: Number(otCount[0]?.value ?? 0),
            leave: Number(leaveCount[0]?.value ?? 0),
            assets: Number(assetCount[0]?.value ?? 0),
            workTracking: Number(workCount[0]?.value ?? 0),
          },
          missingDbEmployeeCodesBySection: {
            overtime: missingCodesFor(parsed.data.overtime.map((row) => row.employeeCode)),
            leave: missingCodesFor(parsed.data.leave.map((row) => row.employeeCode)),
            assets: missingCodesFor(parsed.data.assets.map((row) => row.employeeCode)),
          },
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (selectedSections.includes("employees") && parsed.errors.length > 0) {
      return jsonError(400, "พบข้อผิดพลาดในไฟล์ ไม่สามารถนำเข้าได้", {
        errors: parsed.errors,
        warnings: parsed.warnings,
        summary: parsed.summary,
      });
    }

    const imported = await replaceDatabaseFromSheetMigration(parsed, {
      sections: selectedSections,
    });
    return NextResponse.json(
      {
        mode: "import",
        fileName: file.name,
        sheetsFound: parsed.sheetsFound,
        sheetsMissing: parsed.sheetsMissing,
        selectedSections,
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
