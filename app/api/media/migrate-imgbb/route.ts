import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api/response";
import { requireApiAnyPermission, withApiAuth } from "@/lib/auth/dal";
import { isCloudinaryConfigured } from "@/lib/cloudinary";
import { migrateAllImgbbRecordsInDb } from "@/lib/cloudinary-migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiAuth(async (request: NextRequest) => {
  await requireApiAnyPermission(request, "users.permissions.manage", "assets.requests.manage");

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    }
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const dryRun = body.dryRun === true;
  const includeDataUrls = body.includeDataUrls === true;

  if (!dryRun && !isCloudinaryConfigured()) {
    return jsonError(503, "ยังไม่ได้ตั้งค่าการเชื่อมต่อ Cloudinary");
  }

  const summary = await migrateAllImgbbRecordsInDb({ dryRun, includeDataUrls });
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
});
