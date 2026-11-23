import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission, withApiAuth } from "@/lib/auth/dal";
import { provisionMissingUserAccounts } from "@/lib/auth/provision-users";

export const POST = withApiAuth(async (request: NextRequest) => {
  await requireApiPermission(request, "users.permissions.manage");
  const result = await provisionMissingUserAccounts();
  return NextResponse.json(result);
});
