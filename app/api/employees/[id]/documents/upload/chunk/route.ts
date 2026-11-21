import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employeeDocuments } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { isSystemAdminSession } from "@/lib/auth/admin";
import { canUploadEmployeeDocuments } from "@/lib/auth/permissions";
import { isUuid, validateEmployeeDocumentHeader } from "@/lib/employee-documents";
import { employeeDocumentError as jsonError } from "@/lib/employee-documents-api";
import {
  cancelEmployeeDocumentResumableUpload,
  deleteEmployeeDocumentFromDrive,
  DRIVE_CHUNK_ALIGNMENT_BYTES,
  DRIVE_UPLOAD_CHUNK_BYTES,
  GoogleDriveError,
  uploadEmployeeDocumentChunkToDrive,
} from "@/lib/google-drive";
import { verifyDriveUploadToken } from "@/lib/upload-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function parseNonNegativeInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export const PUT = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  if (!canUploadEmployeeDocuments(user.permissions)) {
    return jsonError(403, "ไม่มีสิทธิ์อัปโหลดเอกสารพนักงาน");
  }

  const { id: employeeId } = await context.params;
  if (!isUuid(employeeId)) return jsonError(404, "ไม่พบพนักงาน");

  const rawToken = request.headers.get("x-upload-token") ?? "";
  const token = rawToken ? await verifyDriveUploadToken(rawToken) : null;
  if (!token) return jsonError(401, "โทเคนอัปโหลดไม่ถูกต้องหรือหมดอายุ กรุณาลองอัปโหลดใหม่");
  if (token.userId !== user.sub || token.employeeId !== employeeId) {
    return jsonError(403, "โทเคนอัปโหลดนี้ไม่ตรงกับบัญชีหรือพนักงานที่เลือก");
  }

  const start = parseNonNegativeInt(request.headers.get("x-chunk-start"));
  const end = parseNonNegativeInt(request.headers.get("x-chunk-end"));
  if (start === null || end === null || end < start || end >= token.fileSize) {
    return jsonError(400, "ช่วงข้อมูลของชิ้นส่วนไฟล์ไม่ถูกต้อง");
  }

  const chunk = Buffer.from(await request.arrayBuffer());
  if (chunk.byteLength === 0) return jsonError(400, "ไม่พบข้อมูลชิ้นส่วนไฟล์");
  if (chunk.byteLength > DRIVE_UPLOAD_CHUNK_BYTES) {
    return jsonError(413, "ขนาดชิ้นส่วนไฟล์เกินกำหนด");
  }
  if (chunk.byteLength !== end - start + 1) {
    return jsonError(400, "ขนาดข้อมูลไม่ตรงกับช่วงที่ระบุ");
  }
  if (end + 1 < token.fileSize && chunk.byteLength % DRIVE_CHUNK_ALIGNMENT_BYTES !== 0) {
    return jsonError(400, "ขนาดชิ้นส่วนกลางไฟล์ต้องเป็นพหุคูณของ 256 KB");
  }

  if (start === 0) {
    const headerValidation = validateEmployeeDocumentHeader(token.fileName, token.mimeType, chunk.subarray(0, 16));
    if (headerValidation.ok === false) {
      await cancelEmployeeDocumentResumableUpload(token.uploadUrl);
      return jsonError(400, headerValidation.message);
    }
  }

  let result: { done: false; nextByte: number } | { done: true; driveFileId: string };
  try {
    result = await uploadEmployeeDocumentChunkToDrive({
      uploadUrl: token.uploadUrl,
      mimeType: token.mimeType,
      chunk,
      start,
      end,
      totalSize: token.fileSize,
    });
  } catch (error) {
    if (error instanceof GoogleDriveError) {
      if (error.status === 410) {
        return jsonError(410, "เซสชันอัปโหลด Google Drive หมดอายุ กรุณาเลือกไฟล์และอัปโหลดใหม่");
      }
      if (error.status === 503) {
        return jsonError(503, "ยังไม่ได้ตั้งค่าการเชื่อมต่อ Google Drive");
      }
    }
    return jsonError(502, "อัปโหลดไป Google Drive ไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าและลองอีกครั้ง");
  }

  if (!("driveFileId" in result)) {
    return NextResponse.json(
      { done: false, nextByte: result.nextByte },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (end + 1 !== token.fileSize) {
    await deleteEmployeeDocumentFromDrive(result.driveFileId).catch(() => undefined);
    return jsonError(400, "ข้อมูลไฟล์ยังไม่ครบถ้วน");
  }

  let savedItem;
  try {
    [savedItem] = await db
      .insert(employeeDocuments)
      .values({
        id: token.documentId,
        employeeId: token.employeeId,
        fileName: token.fileName,
        mimeType: token.mimeType,
        fileSize: token.fileSize,
        driveFileId: result.driveFileId,
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
    await deleteEmployeeDocumentFromDrive(result.driveFileId).catch(() => undefined);
    return jsonError(500, "บันทึกข้อมูลเอกสารไม่สำเร็จ");
  }

  if (!savedItem) {
    await deleteEmployeeDocumentFromDrive(result.driveFileId).catch(() => undefined);
    return jsonError(500, "บันทึกข้อมูลเอกสารไม่สำเร็จ");
  }

  const item = { ...savedItem, sharedUserCount: savedItem.sharedWithUserIds.length };
  return NextResponse.json(
    { done: true, item },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
});
