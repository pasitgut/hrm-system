import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employees } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canUploadEmployeeDocuments } from "@/lib/auth/permissions";
import {
  isUuid,
  MAX_EMPLOYEE_DOCUMENT_BYTES,
  MAX_EMPLOYEE_DOCUMENT_MB,
  resolveEmployeeDocumentMimeType,
  sanitizeDocumentName,
  validateEmployeeDocumentHeader,
} from "@/lib/employee-documents";
import { employeeDocumentError as jsonError } from "@/lib/employee-documents-api";
import {
  DRIVE_UPLOAD_CHUNK_BYTES,
  GoogleDriveError,
  isGoogleDriveConfigured,
  startEmployeeDocumentResumableUpload,
} from "@/lib/google-drive";
import { createDriveUploadToken } from "@/lib/upload-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  if (!canUploadEmployeeDocuments(user.permissions)) {
    return jsonError(403, "ไม่มีสิทธิ์อัปโหลดเอกสารพนักงาน");
  }

  const { id: employeeId } = await context.params;
  if (!isUuid(employeeId)) return jsonError(404, "ไม่พบพนักงาน");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "ข้อมูลคำขออัปโหลดไม่ถูกต้อง");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "ข้อมูลคำขออัปโหลดไม่ถูกต้อง");
  }

  const payload = body as Record<string, unknown>;
  const rawFileName = typeof payload.fileName === "string" ? payload.fileName : "";
  const declaredMimeType = typeof payload.mimeType === "string" ? payload.mimeType : "";
  const fileSize = payload.fileSize;
  const headerBase64 = typeof payload.headerBase64 === "string" ? payload.headerBase64 : undefined;

  if (!rawFileName.trim()) return jsonError(400, "กรุณาเลือกเอกสารที่ต้องการอัปโหลด");
  if (typeof fileSize !== "number" || !Number.isInteger(fileSize) || fileSize <= 0) {
    return jsonError(400, "ไฟล์เอกสารว่างเปล่า");
  }
  if (fileSize > MAX_EMPLOYEE_DOCUMENT_BYTES) {
    return jsonError(400, `ไฟล์เอกสารต้องมีขนาดไม่เกิน ${MAX_EMPLOYEE_DOCUMENT_MB} MB`);
  }

  const fileName = sanitizeDocumentName(rawFileName);
  let validation: { ok: true; mimeType: string } | { ok: false; message: string };
  if (headerBase64 !== undefined) {
    if (headerBase64.length > 128) {
      return jsonError(400, "ส่วนหัวไฟล์ไม่ถูกต้อง");
    }
    const headerBytes = Buffer.from(headerBase64, "base64").subarray(0, 32);
    validation = validateEmployeeDocumentHeader(fileName, declaredMimeType, headerBytes);
  } else {
    validation = resolveEmployeeDocumentMimeType(fileName, declaredMimeType);
  }
  if (validation.ok === false) return jsonError(400, validation.message);

  const [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!employee) return jsonError(404, "ไม่พบพนักงาน");
  if (!isGoogleDriveConfigured()) {
    return jsonError(503, "ยังไม่ได้ตั้งค่าการเชื่อมต่อ Google Drive");
  }

  const documentId = randomUUID();
  let uploadUrl: string;
  try {
    uploadUrl = await startEmployeeDocumentResumableUpload({
      fileName,
      mimeType: validation.mimeType,
      fileSize,
      employeeDocumentId: documentId,
    });
  } catch (error) {
    const status = error instanceof GoogleDriveError && error.status === 503 ? 503 : 502;
    return jsonError(status, "เชื่อมต่อ Google Drive เพื่อเริ่มอัปโหลดไม่สำเร็จ กรุณาลองอีกครั้ง");
  }

  const uploadToken = await createDriveUploadToken({
    uploadUrl,
    documentId,
    employeeId,
    userId: user.sub,
    fileName,
    mimeType: validation.mimeType,
    fileSize,
  });

  return NextResponse.json(
    {
      uploadToken,
      chunkSize: DRIVE_UPLOAD_CHUNK_BYTES,
      maxBytes: MAX_EMPLOYEE_DOCUMENT_BYTES,
    },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
});
