import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { employeeDocuments } from "@/lib/db/schema";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { canViewAllEmployeeDocuments, canViewEmployeeDocuments } from "@/lib/auth/permissions";
import { contentDisposition, isUuid } from "@/lib/employee-documents";
import { employeeDocumentError as jsonError } from "@/lib/employee-documents-api";
import { downloadEmployeeDocumentFromDrive, GoogleDriveError } from "@/lib/google-drive";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const user = await requireApiUser(request);
  if (!canViewEmployeeDocuments(user.permissions)) return jsonError(403, "ไม่มีสิทธิ์ดาวน์โหลดเอกสารพนักงาน");

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError(404, "ไม่พบเอกสาร");

  const [item] = await db
    .select({
      fileName: employeeDocuments.fileName,
      mimeType: employeeDocuments.mimeType,
      fileData: employeeDocuments.fileData,
      fileSize: employeeDocuments.fileSize,
      driveFileId: employeeDocuments.driveFileId,
      sharedWithUserIds: employeeDocuments.sharedWithUserIds,
    })
    .from(employeeDocuments)
    .where(eq(employeeDocuments.id, id))
    .limit(1);
  if (!item) return jsonError(404, "ไม่พบเอกสาร");
  if (!canViewAllEmployeeDocuments(user.permissions) && !item.sharedWithUserIds.includes(user.sub)) {
    return jsonError(403, "บัญชีนี้ไม่มีสิทธิ์เข้าถึงเอกสาร");
  }

  let body: BodyInit;
  if (item.driveFileId) {
    let response: Response;
    try {
      response = await downloadEmployeeDocumentFromDrive(item.driveFileId);
    } catch (error) {
      if (error instanceof GoogleDriveError && error.status === 404) return jsonError(404, "ไม่พบไฟล์ใน Google Drive");
      const status = error instanceof GoogleDriveError && error.status === 503 ? 503 : 502;
      return jsonError(status, "ดาวน์โหลดไฟล์จาก Google Drive ไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
    if (!response.body) return jsonError(502, "Google Drive ไม่ส่งเนื้อหาไฟล์กลับมา");
    body = response.body;
  } else if (item.fileData) {
    body = new Uint8Array(item.fileData);
  } else {
    return jsonError(404, "ไม่พบเนื้อหาเอกสาร");
  }

  return new Response(body, {
    headers: {
      "Content-Type": item.mimeType,
      "Content-Disposition": contentDisposition(item.fileName),
      "Content-Length": String(item.fileSize),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
