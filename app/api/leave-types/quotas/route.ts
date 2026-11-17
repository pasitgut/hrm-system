import { eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { jsonError } from "@/lib/api/response";
import { leaveTypes } from "@/lib/db/schema";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";

const QUOTA_CODES = ["personal", "sick", "birthday", "vacation"] as const;
const MAX_QUOTA_DAYS = 2_147_483_647;

export const PATCH = withApiAuth(async (request: NextRequest) => {
  await requireApiPermission(request, "leave.quotas.manage");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonError(400, "Invalid request body");
  }

  const quotas = (body as Record<string, unknown>).quotas;
  if (typeof quotas !== "object" || quotas === null || Array.isArray(quotas)) {
    return jsonError(400, "quotas must include personal, sick, birthday, and vacation");
  }

  const values = quotas as Record<string, unknown>;
  if (QUOTA_CODES.some((code) => !Object.hasOwn(values, code))) {
    return jsonError(400, "quotas must include personal, sick, birthday, and vacation");
  }

  for (const code of QUOTA_CODES) {
    const value = values[code];
    if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_QUOTA_DAYS)) {
      return jsonError(400, `${code} quota must be an integer from 0 to ${MAX_QUOTA_DAYS}, or null`);
    }
  }

  const items = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ code: leaveTypes.code })
      .from(leaveTypes)
      .where(inArray(leaveTypes.code, [...QUOTA_CODES]));

    if (existing.length !== QUOTA_CODES.length) return null;

    const updatedItems = [];
    for (const code of QUOTA_CODES) {
      const [item] = await tx
        .update(leaveTypes)
        .set({ annualQuotaDays: values[code] as number | null })
        .where(eq(leaveTypes.code, code))
        .returning({
          code: leaveTypes.code,
          name: leaveTypes.name,
          annualQuotaDays: leaveTypes.annualQuotaDays,
          isActive: leaveTypes.isActive,
        });
      if (!item) throw new Error(`Leave type ${code} disappeared while updating quotas`);
      updatedItems.push(item);
    }
    return updatedItems;
  });

  if (!items) return jsonError(409, "The four built-in leave types must exist before quotas can be saved");
  return NextResponse.json({ items });
});
