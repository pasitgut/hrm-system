import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees, employeeDocuments } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { isSystemAdminSession } from "@/lib/auth/admin";
import {
  canShareEmployeeDocuments,
  canUploadEmployeeDocuments,
  canViewAllEmployeeDocuments,
  canViewEmployeeDocuments,
} from "@/lib/auth/permissions";
import { isUuid, MAX_EMPLOYEE_DOCUMENT_BYTES, MAX_EMPLOYEE_DOCUMENT_MB, sanitizeDocumentName, validateEmployeeDocument } from "@/lib/employee-documents";
import { employeeDocumentError as jsonError } from "@/lib/employee-documents-api";
import {
  deleteEmployeeDocumentFromDrive,
  GoogleDriveError,
  isGoogleDriveConfigured,
  uploadEmployeeDocumentToDrive,
} from "@/lib/google-drive";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  if (!canViewEmployeeDocuments(user.permissions)) return jsonError(403, "ไม่มีสิทธิ์ดูเอกสารพนักงาน");
  const canViewAll = canViewAllEmployeeDocuments(user.permissions);
  const canShare = canShareEmployeeDocuments(user.permissions);

  const { id: employeeId } = await context.params;
  if (!isUuid(employeeId)) return jsonError(404, "ไม่พบพนักงาน");

  const [employee] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee) return jsonError(404, "ไม่พบพนักงาน");

  const documents = await db
    .select({
      id: employeeDocuments.id,
      employeeId: employeeDocuments.employeeId,
      fileName: employeeDocuments.fileName,
      mimeType: employeeDocuments.mimeType,
      fileSize: employeeDocuments.fileSize,
      uploadedByUserId: employeeDocuments.uploadedByUserId,
      sharedWithUserIds: employeeDocuments.sharedWithUserIds,
      createdAt: employeeDocuments.createdAt,
    })
    .from(employeeDocuments)
    .where(eq(employeeDocuments.employeeId, employeeId))
    .orderBy(desc(employeeDocuments.createdAt));

  const items = documents
    .filter((document) => canViewAll || document.sharedWithUserIds.includes(user.sub))
    .map(({ sharedWithUserIds, ...document }) => ({
      ...document,
      sharedWithUserIds: canShare ? sharedWithUserIds : undefined,
      sharedUserCount: canShare ? sharedWithUserIds.length : undefined,
    }));

  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  if (!canUploadEmployeeDocuments(user.permissions)) return jsonError(403, "ไม่มีสิทธิ์อัปโหลดเอกสารพนักงาน");

  const { id: employeeId } = await context.params;
  if (!isUuid(employeeId)) return jsonError(404, "ไม่พบพนักงาน");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "อ่านไฟล์ที่ส่งมาไม่สำเร็จ");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return jsonError(400, "กรุณาเลือกเอกสารที่ต้องการอัปโหลด");
  if (file.size <= 0) return jsonError(400, "ไฟล์เอกสารว่างเปล่า");
  if (file.size > MAX_EMPLOYEE_DOCUMENT_BYTES) return jsonError(400, `ไฟล์เอกสารต้องมีขนาดไม่เกิน ${MAX_EMPLOYEE_DOCUMENT_MB} MB`);

  const fileName = sanitizeDocumentName(file.name);
  const fileData = Buffer.from(await file.arrayBuffer());
  const validation = validateEmployeeDocument(fileName, file.type, fileData);
  if (validation.ok === false) return jsonError(400, validation.message);

  const [employee] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee) return jsonError(404, "ไม่พบพนักงาน");
  if (!isGoogleDriveConfigured()) {
    return jsonError(503, "ยังไม่ได้ตั้งค่าการเชื่อมต่อ Google Drive");
  }

  const documentId = randomUUID();
  let driveFileId: string;
  try {
    driveFileId = await uploadEmployeeDocumentToDrive(fileName, validation.mimeType, fileData, documentId);
  } catch (error) {
    const status = error instanceof GoogleDriveError && error.status === 503 ? 503 : 502;
    return jsonError(status, "อัปโหลดไป Google Drive ไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าและลองอีกครั้ง");
  }

  let savedItem;
  try {
    [savedItem] = await db
      .insert(employeeDocuments)
      .values({
        id: documentId,
        employeeId,
        fileName,
        mimeType: validation.mimeType,
        fileSize: fileData.byteLength,
        driveFileId,
        sharedWithUserIds: isSystemAdminSession(user) ? [] : [user.sub],
        uploadedByUserId: isSystemAdminSession(user) ? null : user.sub,
      })
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
  } catch {
    await deleteEmployeeDocumentFromDrive(driveFileId).catch(() => undefined);
    return jsonError(500, "บันทึกข้อมูลเอกสารไม่สำเร็จ");
  }

  if (!savedItem) {
    await deleteEmployeeDocumentFromDrive(driveFileId).catch(() => undefined);
    return jsonError(500, "บันทึกข้อมูลเอกสารไม่สำเร็จ");
  }
  const item = { ...savedItem, sharedUserCount: savedItem.sharedWithUserIds.length };
  return NextResponse.json({ item }, { status: 201 });
});
