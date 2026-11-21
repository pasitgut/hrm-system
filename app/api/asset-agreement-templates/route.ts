import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { assetAgreementTemplateInputSchema } from "@/asset-borrowing/domain/agreementTemplate";
import { jsonError } from "@/app/api/asset-requests/_shared";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { isSystemAdminSession, SYSTEM_ADMIN_DISPLAY_NAME } from "@/lib/auth/admin";
import { db } from "@/lib/db/client";
import { assetAgreementTemplates, employees } from "@/lib/db/schema";
import { migrateHtmlImgbbUrlsToCloudinary } from "@/lib/cloudinary";
import { healAgreementTemplateImgbbUrls } from "@/lib/cloudinary-migration";

function templateDto(row: typeof assetAgreementTemplates.$inferSelect) {
  return {
    id: row.id,
    type: row.type === "asset_form" ? "assetForm" : "borrow",
    title: row.title,
    header: row.headerHtml,
    body: row.bodyHtml,
    footer: row.footerHtml,
    isActive: row.isActive,
    createdBy: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const GET = withApiAuth(async (request: NextRequest) => {
  await requireApiPermission(request, "assets.templates.manage");
  const rows = await db.select().from(assetAgreementTemplates).orderBy(desc(assetAgreementTemplates.updatedAt));
  const healed = await Promise.all(rows.map((row) => healAgreementTemplateImgbbUrls(row)));
  return NextResponse.json({ items: healed.map(templateDto) });
});

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiPermission(request, "assets.templates.manage");
  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError(400, "Invalid JSON body"); }
  const parsed = assetAgreementTemplateInputSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "ตรวจสอบชื่อและเนื้อหา Agreement อีกครั้ง");
  if (parsed.data.type !== "borrow") return jsonError(400, "Agreement template type is invalid");

  const [headerRes, bodyRes, footerRes] = await Promise.all([
    migrateHtmlImgbbUrlsToCloudinary(parsed.data.header, "agreement"),
    migrateHtmlImgbbUrlsToCloudinary(parsed.data.body, "agreement"),
    migrateHtmlImgbbUrlsToCloudinary(parsed.data.footer, "agreement"),
  ]);

  const isAdmin = isSystemAdminSession(user);
  const [actor] = isAdmin
    ? []
    : await db.select({ name: employees.firstName, lastName: employees.lastName })
      .from(employees).where(eq(employees.id, user.employeeId));
  const [created] = await db.insert(assetAgreementTemplates).values({
    type: "borrow",
    title: parsed.data.title,
    headerHtml: headerRes.html,
    bodyHtml: bodyRes.html,
    footerHtml: footerRes.html,
    isActive: parsed.data.isActive,
    createdByEmployeeId: isAdmin ? null : user.employeeId,
    createdByName: isAdmin ? SYSTEM_ADMIN_DISPLAY_NAME : `${actor?.name ?? ""} ${actor?.lastName ?? ""}`.trim(),
  }).returning();
  if (!created) return jsonError(500, "Unable to create Agreement template");
  return NextResponse.json({ item: templateDto(created) }, { status: 201 });
});
