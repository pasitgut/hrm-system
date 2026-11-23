import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { socialSecurityRates } from "@/lib/db/schema";
import { canManageSocialSecurity } from "@/lib/auth/rolePermissionAccess";
import {
  DEFAULT_SOCIAL_SECURITY_RATES,
  ensureDefaultSocialSecurityRates,
  resolveSocialSecurityRuleForDate,
} from "@/lib/settings/socialSecuritySettings";

export const runtime = "nodejs";

const rateSchema = z
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

export const GET = withApiAuth(async (request: NextRequest) => {
  await requireApiUser(request);
  const items = await ensureDefaultSocialSecurityRates();
  const today = new Date().toISOString().slice(0, 10);
  const activeRule = resolveSocialSecurityRuleForDate(today, items);
  return NextResponse.json({ items, activeRule }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canManageSocialSecurity(user)) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ตั้งค่าอัตราประกันสังคม" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูล JSON ไม่ถูกต้อง" }, { status: 400 });
  }

  // Optional reset action to restore statutory tiers (พ.ศ. 2563–2575+)
  if (body && typeof body === "object" && (body as Record<string, unknown>).action === "reset_defaults") {
    const now = new Date();
    for (const item of DEFAULT_SOCIAL_SECURITY_RATES) {
      await db
        .insert(socialSecurityRates)
        .values({
          effectiveFrom: item.effectiveFrom,
          label: item.label,
          employeeRatePercent: item.employeeRatePercent,
          employerRatePercent: item.employerRatePercent,
          minWageBase: item.minWageBase,
          maxWageBase: item.maxWageBase,
          note: item.note ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: socialSecurityRates.effectiveFrom,
          set: {
            label: item.label,
            employeeRatePercent: item.employeeRatePercent,
            employerRatePercent: item.employerRatePercent,
            minWageBase: item.minWageBase,
            maxWageBase: item.maxWageBase,
            note: item.note ?? null,
            updatedAt: now,
          },
        });
    }
    const items = await ensureDefaultSocialSecurityRates();
    const activeRule = resolveSocialSecurityRuleForDate(new Date().toISOString().slice(0, 10), items);
    return NextResponse.json({ items, activeRule });
  }

  const parsed = rateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  await ensureDefaultSocialSecurityRates();
  const now = new Date();
  const [saved] = await db
    .insert(socialSecurityRates)
    .values({
      effectiveFrom: parsed.data.effectiveFrom,
      label: parsed.data.label,
      employeeRatePercent: parsed.data.employeeRatePercent,
      employerRatePercent: parsed.data.employerRatePercent,
      minWageBase: parsed.data.minWageBase,
      maxWageBase: parsed.data.maxWageBase,
      note: parsed.data.note ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: socialSecurityRates.effectiveFrom,
      set: {
        label: parsed.data.label,
        employeeRatePercent: parsed.data.employeeRatePercent,
        employerRatePercent: parsed.data.employerRatePercent,
        minWageBase: parsed.data.minWageBase,
        maxWageBase: parsed.data.maxWageBase,
        note: parsed.data.note ?? null,
        updatedAt: now,
      },
    })
    .returning();

  const items = await ensureDefaultSocialSecurityRates();
  const activeRule = resolveSocialSecurityRuleForDate(new Date().toISOString().slice(0, 10), items);
  return NextResponse.json({ item: saved, items, activeRule }, { status: 201 });
});
