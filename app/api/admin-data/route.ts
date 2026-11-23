import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api/response";
import { requireAdminDataApiUser, withApiAuth } from "@/lib/auth/dal";
import { AdminDataError, listAdminResources } from "@/lib/admin-data/service";

export const GET = withApiAuth(async (request: NextRequest) => {
  await requireAdminDataApiUser(request);
  try {
    return NextResponse.json(await listAdminResources());
  } catch (error) {
    if (error instanceof AdminDataError) return jsonError(error.status, error.message);
    throw error;
  }
});
