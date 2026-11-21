import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api/response";
import { canUploadMediaScope } from "@/lib/api/media-auth";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import {
  CloudinaryError,
  isCloudinaryConfigured,
  isCloudinaryScope,
  uploadImageToCloudinary,
} from "@/lib/cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "ไฟล์รูปไม่ถูกต้อง");
  }

  const rawScope = formData.get("scope") ?? "asset";
  if (!isCloudinaryScope(rawScope)) {
    return jsonError(400, "หมวดหมู่รูปภาพไม่ถูกต้อง");
  }

  if (!canUploadMediaScope(user.permissions, rawScope)) {
    return jsonError(403, "ไม่มีสิทธิ์อัปโหลดรูปภาพในหมวดนี้");
  }

  if (!isCloudinaryConfigured()) {
    return jsonError(503, "ยังไม่ได้ตั้งค่าการเชื่อมต่อ Cloudinary");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return jsonError(400, "กรุณาเลือกไฟล์รูปภาพ");
  if (!file.type.startsWith("image/")) return jsonError(400, "รองรับเฉพาะไฟล์รูปภาพ");
  if (file.size <= 0) return jsonError(400, "ไฟล์รูปภาพว่างเปล่า");
  if (file.size > MAX_IMAGE_BYTES) return jsonError(400, "ไฟล์รูปภาพต้องมีขนาดไม่เกิน 32 MB");

  try {
    const uploaded = await uploadImageToCloudinary(file, {
      scope: rawScope,
      fileName: file.name || "image",
    });
    return NextResponse.json({ url: uploaded.url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof CloudinaryError ? error.status : 502;
    const message = error instanceof CloudinaryError ? error.message : "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่";
    return jsonError(status, message);
  }
});
