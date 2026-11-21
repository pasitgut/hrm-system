import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api/response";
import { canUploadMediaScope } from "@/lib/api/media-auth";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import {
  CloudinaryError,
  createCloudinaryDirectUploadParams,
  isCloudinaryConfigured,
  isCloudinaryScope,
} from "@/lib/cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    return jsonError(400, "ข้อมูลคำขออัปโหลดไม่ถูกต้อง");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "ข้อมูลคำขออัปโหลดไม่ถูกต้อง");
  }

  const rawScope = (body as Record<string, unknown>).scope ?? "asset";
  if (!isCloudinaryScope(rawScope)) {
    return jsonError(400, "หมวดหมู่รูปภาพไม่ถูกต้อง");
  }

  if (!canUploadMediaScope(user.permissions, rawScope)) {
    return jsonError(403, "ไม่มีสิทธิ์อัปโหลดรูปภาพในหมวดนี้");
  }

  if (!isCloudinaryConfigured()) {
    return jsonError(503, "ยังไม่ได้ตั้งค่าการเชื่อมต่อ Cloudinary");
  }

  try {
    const params = createCloudinaryDirectUploadParams(rawScope);
    return NextResponse.json(params, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error instanceof CloudinaryError ? error.status : 500;
    const message = error instanceof CloudinaryError ? error.message : "สร้างข้อมูลอัปโหลด Cloudinary ไม่สำเร็จ";
    return jsonError(status, message);
  }
});
