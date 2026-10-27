import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth/dal";
import { previewImport } from "@/lib/salary-slips/service";
import { idSchema, salaryRoute } from "../../_shared";

export const GET = salaryRoute(async (request, context: { params: Promise<{ id: string }> }) => {
  await requireApiPermission(request, "salary_slips.view");
  await requireApiPermission(request, "salary_slips.import");
  const id = idSchema.parse((await context.params).id);
  return NextResponse.json(await previewImport(id), { headers: { "Cache-Control": "no-store" } });
});
export const POST = salaryRoute(async (request, context: { params: Promise<{ id: string }> }) => {
  await requireApiPermission(request, "salary_slips.view");
  await requireApiPermission(request, "salary_slips.import");
  const id = idSchema.parse((await context.params).id);
  const body = z.object({ selections: z.array(z.object({ key: z.string(), employeeId: z.union([z.uuid(), z.literal("")]) })).max(10000) }).parse(await request.json());
  return NextResponse.json(await previewImport(id, body.selections.map((item) => ({ key: item.key, employeeId: item.employeeId ?? "" }))));
});
