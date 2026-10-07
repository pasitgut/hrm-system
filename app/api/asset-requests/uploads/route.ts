import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { jsonError } from "@/app/api/asset-requests/_shared";
import { canCreateOwnAssetRequests, canManageAssets } from "@/lib/auth/permissions";

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 15_000;

type ImgbbResponse = { success?: boolean; data?: { url?: string } };

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canCreateOwnAssetRequests(user.permissions) && !canManageAssets(user.permissions)) {
    return jsonError(403, "Asset request permission required");
  }
  const apiKey = process.env.IMGBB_API_KEY?.trim();
  if (!apiKey) return jsonError(503, "การอัปโหลดรูปยังไม่ได้ตั้งค่า IMGBB_API_KEY");

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return jsonError(400, "ไฟล์รูปไม่ถูกต้อง");
  }
  if (!(file instanceof File)) return jsonError(400, "กรุณาเลือกไฟล์รูปภาพ");
  if (!file.type.startsWith("image/")) return jsonError(400, "รองรับเฉพาะไฟล์รูปภาพ");
  if (file.size > MAX_IMAGE_BYTES) return jsonError(400, "ไฟล์รูปภาพต้องมีขนาดไม่เกิน 32 MB");

  const upstream = new FormData();
  upstream.append("image", file, file.name || "asset-image");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      body: upstream,
      signal: controller.signal,
    });
    if (!response.ok) return jsonError(502, "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
    const payload = await response.json() as ImgbbResponse;
    const url = payload.success && payload.data?.url?.trim();
    if (!url || !/^https:\/\//i.test(url)) return jsonError(502, "บริการอัปโหลดไม่ส่ง URL รูปกลับมา");
    return NextResponse.json({ url });
  } catch {
    return jsonError(controller.signal.aborted ? 504 : 502, controller.signal.aborted
      ? "อัปโหลดรูปใช้เวลานานเกินไป กรุณาลองใหม่"
      : "เชื่อมต่อบริการอัปโหลดรูปไม่สำเร็จ");
  } finally {
    clearTimeout(timeoutId);
  }
});
