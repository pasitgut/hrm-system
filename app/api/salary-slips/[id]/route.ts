import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { salarySlips, salarySlipVersions, users } from "@/lib/db/schema";
import { requireApiPermission } from "@/lib/auth/dal";
import { slipsWithCumulative, SlipError } from "@/lib/salary-slips/service";
import { idSchema, salaryRoute } from "../_shared";

export const GET = salaryRoute(async (request, context: { params: Promise<{ id: string }> }) => {
  await requireApiPermission(request, "salary_slips.view");
  const id = idSchema.parse((await context.params).id);
  const [slip] = await db.select().from(salarySlips).where(eq(salarySlips.id, id));
  if (!slip) throw new SlipError("ไม่พบสลิป", 404);
  const item = (await slipsWithCumulative(slip.year)).find((item) => item.id === id);
  const versions = await db.select({ id: salarySlipVersions.id, revision: salarySlipVersions.revision, data: salarySlipVersions.data, reason: salarySlipVersions.reason,
    createdAt: salarySlipVersions.createdAt, createdBy: users.email }).from(salarySlipVersions).innerJoin(users, eq(users.id, salarySlipVersions.createdBy))
    .where(eq(salarySlipVersions.slipId, id)).orderBy(desc(salarySlipVersions.revision));
  return NextResponse.json({ item, versions }, { headers: { "Cache-Control": "no-store" } });
});
