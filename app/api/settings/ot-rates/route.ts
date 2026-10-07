import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { otRateSettings } from "@/lib/db/schema";
import { canManageOtRates } from "@/lib/auth/rolePermissionAccess";
import { DEFAULT_OT_RATE_SETTINGS, getOtRateSettings } from "@/lib/settings/otRateSettings";

function parseMultiplier(value: unknown): number | null {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 10 ? parsed : null;
}

export const GET = withApiAuth(async (request: NextRequest) => {
  await requireApiUser(request);
  const item = await getOtRateSettings();
  return NextResponse.json({ item });
});

export const PATCH = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!canManageOtRates(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid settings body" }, { status: 400 });
  }

  const values = body as Record<string, unknown>;
  const weekdayMultiplier = parseMultiplier(values.weekdayMultiplier);
  const holidayMultiplier = parseMultiplier(values.holidayMultiplier);
  if (weekdayMultiplier === null || holidayMultiplier === null) {
    return NextResponse.json({ error: "OT multipliers must be greater than 0 and no more than 10" }, { status: 400 });
  }

  const now = new Date();
  const [item] = await db
    .insert(otRateSettings)
    .values({ id: 1, weekdayMultiplier, holidayMultiplier, updatedAt: now })
    .onConflictDoUpdate({
      target: otRateSettings.id,
      set: { weekdayMultiplier, holidayMultiplier, updatedAt: now },
    })
    .returning({
      weekdayMultiplier: otRateSettings.weekdayMultiplier,
      holidayMultiplier: otRateSettings.holidayMultiplier,
    });

  return NextResponse.json({ item: item ?? DEFAULT_OT_RATE_SETTINGS });
});
