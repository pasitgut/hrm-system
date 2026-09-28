import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { assetAgreementTemplateInputSchema } from "@/asset-borrowing/domain/agreementTemplate";
import { jsonError, isManagerRole } from "@/app/api/asset-requests/_shared";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { assetAgreementTemplates, employees } from "@/lib/db/schema";

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
  const user = await requireApiUser(request);
  if (!isManagerRole(user.role)) return jsonError(403, "Only a supervisor or CEO can manage Agreements");
  const rows = await db.select().from(assetAgreementTemplates).orderBy(desc(assetAgreementTemplates.updatedAt));
  return NextResponse.json({ items: rows.map(templateDto) });
});

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!isManagerRole(user.role)) return jsonError(403, "Only a supervisor or CEO can create Agreements");
  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError(400, "Invalid JSON body"); }
  const parsed = assetAgreementTemplateInputSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "ตรวจสอบชื่อและเนื้อหา Agreement อีกครั้ง");
  if (parsed.data.type !== "borrow") return jsonError(400, "Agreement template type is invalid");

  const [actor] = await db.select({ name: employees.firstName, lastName: employees.lastName })
    .from(employees).where(eq(employees.id, user.employeeId));
  const [created] = await db.insert(assetAgreementTemplates).values({
    type: "borrow",
    title: parsed.data.title,
    headerHtml: parsed.data.header,
    bodyHtml: parsed.data.body,
    footerHtml: parsed.data.footer,
    isActive: parsed.data.isActive,
    createdByEmployeeId: user.employeeId,
    createdByName: `${actor?.name ?? ""} ${actor?.lastName ?? ""}`.trim(),
  }).returning();
  if (!created) return jsonError(500, "Unable to create Agreement template");
  return NextResponse.json({ item: templateDto(created) }, { status: 201 });
});
