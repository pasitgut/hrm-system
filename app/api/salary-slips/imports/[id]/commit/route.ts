import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth/dal";
import { commitImport } from "@/lib/salary-slips/service";
import { idSchema, salaryRoute, selectionSchema } from "../../../_shared";

export const POST = salaryRoute(async (request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireApiPermission(request, "salary_slips.import");
  await requireApiPermission(request, "salary_slips.view");
  const id = idSchema.parse((await context.params).id);
  const body = z.object({ selections: z.array(selectionSchema).min(1).max(10000), reason: z.string().max(1000).default("") }).parse(await request.json());
  return NextResponse.json(await commitImport(id, body.selections, body.reason, user));
});
