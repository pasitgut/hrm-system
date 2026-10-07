import { and, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employeeDocuments, users } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canDeleteEmployeeDocuments, canShareEmployeeDocuments } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/employee-documents";
import { employeeDocumentError as jsonError } from "@/lib/employee-documents-api";
import { deleteEmployeeDocumentFromDrive, GoogleDriveError } from "@/lib/google-drive";

type RouteContext = { params: Promise<{ id: string }> };

export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  if (!canDeleteEmployeeDocuments(user.permissions)) return jsonError(403, "ไม่มีสิทธิ์ลบเอกสารพนักงาน");

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError(404, "ไม่พบเอกสาร");

  const [item] = await db
    .select({ driveFileId: employeeDocuments.driveFileId })
    .from(employeeDocuments)
    .where(eq(employeeDocuments.id, id))
    .limit(1);
  if (!item) return jsonError(404, "ไม่พบเอกสาร");

  if (item.driveFileId) {
    try {
      await deleteEmployeeDocumentFromDrive(item.driveFileId);
    } catch (error) {
      const status = error instanceof GoogleDriveError && error.status === 503 ? 503 : 502;
      return jsonError(status, "ลบไฟล์จาก Google Drive ไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  }

  await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id));
  return NextResponse.json({ ok: true });
});

export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  if (!canShareEmployeeDocuments(user.permissions)) return jsonError(403, "ไม่มีสิทธิ์จัดการสิทธิ์เอกสารพนักงาน");

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError(404, "ไม่พบเอกสาร");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "ข้อมูลสิทธิ์เอกสารไม่ถูกต้อง");
  }
  if (typeof body !== "object" || body === null || !Array.isArray((body as Record<string, unknown>).sharedWithUserIds)) {
    return jsonError(400, "กรุณาระบุบัญชีที่มีสิทธิ์ดูเอกสาร");
  }

  const rawIds = (body as { sharedWithUserIds: unknown[] }).sharedWithUserIds;
  if (rawIds.length > 200 || rawIds.some((value) => typeof value !== "string" || !isUuid(value))) {
    return jsonError(400, "รายชื่อบัญชีที่เลือกไม่ถูกต้อง");
  }
  const sharedWithUserIds = [...new Set(rawIds as string[])];

  if (sharedWithUserIds.length > 0) {
    const eligibleAccounts = await db
      .select({ id: users.id, permissions: users.permissions })
      .from(users)
      .where(and(eq(users.isActive, true), inArray(users.id, sharedWithUserIds)));
    const eligibleIds = new Set(eligibleAccounts
      .filter((account) => canViewEmployeeDocuments(account.permissions))
      .map((account) => account.id));
    if (eligibleIds.size !== sharedWithUserIds.length) {
      return jsonError(400, "บัญชีที่เลือกต้องเปิดสิทธิ์ดูเอกสารพนักงานก่อน");
    }
  }

  const [savedItem] = await db
    .update(employeeDocuments)
    .set({ sharedWithUserIds })
    .where(eq(employeeDocuments.id, id))
    .returning({
      id: employeeDocuments.id,
      employeeId: employeeDocuments.employeeId,
      fileName: employeeDocuments.fileName,
      mimeType: employeeDocuments.mimeType,
      fileSize: employeeDocuments.fileSize,
      uploadedByUserId: employeeDocuments.uploadedByUserId,
      sharedWithUserIds: employeeDocuments.sharedWithUserIds,
      createdAt: employeeDocuments.createdAt,
    });
  if (!savedItem) return jsonError(404, "ไม่พบเอกสาร");
  const item = { ...savedItem, sharedUserCount: savedItem.sharedWithUserIds.length };
  return NextResponse.json({ item });
});
