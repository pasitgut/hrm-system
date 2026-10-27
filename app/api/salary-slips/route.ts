import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { salarySlips } from "@/lib/db/schema";
import { requireApiPermission } from "@/lib/auth/dal";
import { employeeOptions } from "@/lib/salary-slips/service";
import { salaryRoute } from "./_shared";

export const GET = salaryRoute(async (request) => {
  await requireApiPermission(request, "salary_slips.view");
  const items = await db.select().from(salarySlips).orderBy(asc(salarySlips.year), asc(salarySlips.month));
  return NextResponse.json({ items, employees: await employeeOptions() }, { headers: { "Cache-Control": "no-store" } });
});
