import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { jsonError } from "@/app/api/asset-requests/_shared";
import { canCreateOwnAssetRequests, canManageAssets } from "@/lib/auth/permissions";
import { CloudinaryError, isCloudinaryConfigured, uploadImageToCloudinary } from "@/lib/cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canCreateOwnAssetRequests(user.permissions) && !canManageAssets(user.permissions)) {
    return jsonError(403, "Asset request permission required");
  }
  if (!isCloudinaryConfigured()) {
    return jsonError(503, "การอัปโหลดรูปยังไม่ได้ตั้งค่า Cloudinary");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "ไฟล์รูปไม่ถูกต้อง");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return jsonError(400, "กรุณาเลือกไฟล์รูปภาพ");
  if (!file.type.startsWith("image/")) return jsonError(400, "รองรับเฉพาะไฟล์รูปภาพ");
  if (file.size <= 0) return jsonError(400, "ไฟล์รูปภาพว่างเปล่า");
  if (file.size > MAX_IMAGE_BYTES) return jsonError(400, "ไฟล์รูปภาพต้องมีขนาดไม่เกิน 32 MB");

  const rawScope = formData.get("scope");
  const scope = rawScope === "signature" ? "signature" : "asset";

  try {
    const uploaded = await uploadImageToCloudinary(file, {
      scope,
      fileName: file.name || "asset-image",
    });
    return NextResponse.json({ url: uploaded.url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof CloudinaryError ? error.status : 502;
    const message = error instanceof CloudinaryError ? error.message : "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่";
    return jsonError(status, message);
  }
});
