import { type NextRequest } from "next/server";
import { requireApiUser, withApiAuth } from "@/lib/auth/dal";
import { issueLinkCode } from "@/lib/line/bot";
export const POST = withApiAuth(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (request.headers.get("origin") !== request.nextUrl.origin) return new Response(null, { status: 403 });
  if (process.env.LINE_BOT_ENABLED !== "true") return new Response(null, { status: 503 });
  return Response.json(await issueLinkCode(user.sub), { headers: { "Cache-Control": "no-store" } });
});
