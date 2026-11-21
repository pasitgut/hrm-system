import { timingSafeEqual } from "node:crypto";
import { runPendingWork } from "@/lib/line/jobs";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.LINE_INTEGRATION_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new Response(null, { status: 401 });
  return Response.json(await runPendingWork());
}
