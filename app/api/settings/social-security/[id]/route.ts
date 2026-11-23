import { count, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { socialSecurityRates } from "@/lib/db/schema";
import { canManageSocialSecurity } from "@/lib/auth/rolePermissionAccess";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  ensureDefaultSocialSecurityRates,
  resolveSocialSecurityRuleForDate,
} from "@/lib/settings/socialSecuritySettings";

export const runtime = "nodejs";

const uuidSchema = z.string().uuid();

const updateRateSchema = z
  .object({
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่มีผลบังคับใช้ต้องอยู่ในรูปแบบ YYYY-MM-DD"),
    label: z.string().trim().min(1, "กรุณาระบุชื่อช่วงอัตราประกันสังคม").max(120),
    employeeRatePercent: z.number().finite().min(0).max(100),
    employerRatePercent: z.number().finite().min(0).max(100),
    minWageBase: z.number().finite().min(0).max(1_000_000),
    maxWageBase: z.number().finite().min(0).max(1_000_000),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((data) => data.maxWageBase >= data.minWageBase, {
    message: "เพดานค่าจ้างสูงสุดต้องมากกว่าหรือเท่ากับฐานค่าจ้างขั้นต่ำ",
    path: ["maxWageBase"],
  });

export const PATCH = withApiAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(request);
  if (!canManageSocialSecurity(user)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ตั้งค่าอัตราประกันสังคม" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "รหัสรายการไม่ถูกต้อง" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูล JSON ไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = updateRateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(socialSecurityRates)
      .set({
        effectiveFrom: parsed.data.effectiveFrom,
        label: parsed.data.label,
        employeeRatePercent: parsed.data.employeeRatePercent,
        employerRatePercent: parsed.data.employerRatePercent,
        minWageBase: parsed.data.minWageBase,
        maxWageBase: parsed.data.maxWageBase,
        note: parsed.data.note ?? null,
        updatedAt: new Date(),
      })
      .where(eq(socialSecurityRates.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "ไม่พบรายการอัตราประกันสังคม" }, { status: 404 });
    }

    const items = await ensureDefaultSocialSecurityRates();
    const activeRule = resolveSocialSecurityRuleForDate(new Date().toISOString().slice(0, 10), items);
    return NextResponse.json({ item: updated, items, activeRule });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "วันที่มีผลบังคับใช้นี้มีรายการอยู่แล้ว" }, { status: 409 });
    }
    throw error;
  }
});

export const DELETE = withApiAuth(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(request);
  if (!canManageSocialSecurity(user)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ตั้งค่าอัตราประกันสังคม" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "รหัสรายการไม่ถูกต้อง" }, { status: 400 });
  }

  const [{ total }] = await db.select({ total: count() }).from(socialSecurityRates);
  if (total <= 1) {
    return NextResponse.json({ error: "ต้องมีอัตราประกันสังคมอย่างน้อย 1 รายการ" }, { status: 409 });
  }

  const [deleted] = await db
    .delete(socialSecurityRates)
    .where(eq(socialSecurityRates.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "ไม่พบรายการอัตราประกันสังคม" }, { status: 404 });
  }

  const items = await ensureDefaultSocialSecurityRates();
  const activeRule = resolveSocialSecurityRuleForDate(new Date().toISOString().slice(0, 10), items);
  return NextResponse.json({ items, activeRule });
});
