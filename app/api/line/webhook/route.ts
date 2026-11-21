import { after } from "next/server";
import { receiveWebhook } from "@/lib/line/webhook";
import { runPendingWork } from "@/lib/line/jobs";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const response = await receiveWebhook(request);
  if (response.ok) after(() => runPendingWork());
  return response;
}
