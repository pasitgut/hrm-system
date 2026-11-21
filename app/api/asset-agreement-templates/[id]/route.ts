import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { assetAgreementTemplateInputSchema } from "@/asset-borrowing/domain/agreementTemplate";
import { jsonError, requestId } from "@/app/api/asset-requests/_shared";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { assetAgreementTemplates } from "@/lib/db/schema";
import { migrateHtmlImgbbUrlsToCloudinary } from "@/lib/cloudinary";
import { healAgreementTemplateImgbbUrls } from "@/lib/cloudinary-migration";

type RouteContext = { params: Promise<{ id: string }> };

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

async function authorized(request: NextRequest, id: string) {
  await requireApiPermission(request, "assets.templates.manage");
  if (!requestId(id)) return { response: jsonError(400, "Invalid Agreement template id") } as const;
  const [template] = await db.select().from(assetAgreementTemplates).where(eq(assetAgreementTemplates.id, id));
  if (!template) return { response: jsonError(404, "Agreement template not found") } as const;
  return { template } as const;
}

export const GET = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params;
  const auth = await authorized(request, id);
  if ("response" in auth) return auth.response;
  const healed = await healAgreementTemplateImgbbUrls(auth.template);
  return NextResponse.json({ item: templateDto(healed) });
});

export const PATCH = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params;
  const auth = await authorized(request, id);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError(400, "Invalid JSON body"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError(400, "Invalid request body");
  const parsed = assetAgreementTemplateInputSchema.partial().safeParse(body);
  if (!parsed.success) return jsonError(400, "ตรวจสอบข้อมูล Agreement อีกครั้ง");
  if (parsed.data.type && parsed.data.type !== "borrow") return jsonError(400, "Agreement template type is invalid");
  const [headerHtml, bodyHtml, footerHtml] = await Promise.all([
    parsed.data.header !== undefined ? migrateHtmlImgbbUrlsToCloudinary(parsed.data.header, "agreement").then((res) => res.html) : Promise.resolve(undefined),
    parsed.data.body !== undefined ? migrateHtmlImgbbUrlsToCloudinary(parsed.data.body, "agreement").then((res) => res.html) : Promise.resolve(undefined),
    parsed.data.footer !== undefined ? migrateHtmlImgbbUrlsToCloudinary(parsed.data.footer, "agreement").then((res) => res.html) : Promise.resolve(undefined),
  ]);
  const [updated] = await db.update(assetAgreementTemplates).set({
    ...(headerHtml !== undefined ? { headerHtml } : {}),
    ...(bodyHtml !== undefined ? { bodyHtml } : {}),
    ...(footerHtml !== undefined ? { footerHtml } : {}),
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    updatedAt: new Date(),
    version: sql`${assetAgreementTemplates.version} + 1`,
  }).where(eq(assetAgreementTemplates.id, id)).returning();
  return updated ? NextResponse.json({ item: templateDto(updated) }) : jsonError(404, "Agreement template not found");
});

export const DELETE = withApiAuth(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params;
  const auth = await authorized(request, id);
  if ("response" in auth) return auth.response;
  const [updated] = await db.update(assetAgreementTemplates).set({
    isActive: false,
    updatedAt: new Date(),
    version: sql`${assetAgreementTemplates.version} + 1`,
  }).where(eq(assetAgreementTemplates.id, id)).returning();
  return updated ? NextResponse.json({ item: templateDto(updated) }) : jsonError(404, "Agreement template not found");
});
