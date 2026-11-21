import { optimizeImageFile } from "@/lib/client/optimize-image";

export async function uploadImage(
  file,
  {
    scope = "asset",
    maxBytes = 10 * 1024 * 1024,
    maxDimension = 2400,
    outputType,
    quality = 0.86,
    alwaysResize = false,
  } = {},
) {
  const prepared = await optimizeImageFile(file, {
    maxBytes,
    maxDimension,
    outputType,
    quality,
    alwaysResize,
  });

  const signResponse = await fetch("/api/media/signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  const signPayload = await signResponse.json().catch(() => ({}));
  if (!signResponse.ok || !signPayload.uploadUrl) {
    throw new Error(signPayload.error || "ไม่สามารถเตรียมการอัปโหลดรูปภาพได้");
  }

  const formData = new FormData();
  formData.append("file", prepared, prepared.name || "image");
  formData.append("api_key", String(signPayload.apiKey));
  formData.append("timestamp", String(signPayload.timestamp));
  formData.append("folder", String(signPayload.folder));
  formData.append("signature", String(signPayload.signature));
  if (signPayload.publicId) {
    formData.append("public_id", String(signPayload.publicId));
  }

  const uploadResponse = await fetch(signPayload.uploadUrl, {
    method: "POST",
    body: formData,
  });
  const uploadPayload = await uploadResponse.json().catch(() => ({}));
  const url = typeof uploadPayload.secure_url === "string" ? uploadPayload.secure_url.trim() : "";
  if (!uploadResponse.ok || !/^https:\/\//i.test(url)) {
    throw new Error(uploadPayload.error?.message || "อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
  }
  return url;
}
