import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { lineWebhookEvents } from "@/lib/db/schema";

const eventSchema = z.object({ webhookEventId: z.string().min(1).max(128), timestamp: z.number().int().nonnegative(), type: z.string(), source: z.object({ type: z.string(), userId: z.string().max(64).optional() }).passthrough(), replyToken: z.string().optional(), message: z.object({ type: z.string(), text: z.string().max(5000).optional() }).passthrough().optional(), postback: z.object({ data: z.string().max(1000), params: z.object({ datetime: z.string().optional(), date: z.string().optional() }).optional() }).optional() });
const webhookSchema = z.object({ events: z.array(eventSchema).max(100) });
export type LineEvent = z.infer<typeof eventSchema>;
export async function receiveWebhook(request: Request): Promise<Response> {
  if (process.env.LINE_BOT_ENABLED !== "true" || !process.env.LINE_CHANNEL_SECRET) return Response.json({ error: "LINE bot is not configured" }, { status: 503 });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1_048_576) { await reader.cancel(); return new Response(null, { status: 413 }); } chunks.push(value); }
  }
  const body = Buffer.concat(chunks);
  const actual = Buffer.from(request.headers.get("x-line-signature") ?? "", "base64");
  const expected = createHmac("sha256", process.env.LINE_CHANNEL_SECRET).update(body).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new Response(null, { status: 401 });
  let value: unknown;
  try { value = JSON.parse(body.toString("utf8")); }
  catch { return new Response(null, { status: 400 }); }
  const parsed = webhookSchema.safeParse(value);
  if (parsed.success === false) return new Response(null, { status: 400 });
  const events = parsed.data.events;
  try {
    if (events.length) await db.transaction(async (tx) => {
      for (const incoming of events) {
        const supported = incoming.source.type === "user" && incoming.source.userId && ["message", "postback"].includes(incoming.type);
        const event: LineEvent = { ...incoming };
        await tx.insert(lineWebhookEvents).values({ eventId: event.webhookEventId, sourceId: supported ? event.source.userId : null, status: supported ? "processing" : "ignored", requestPayload: supported ? event : null }).onConflictDoNothing({ target: lineWebhookEvents.eventId });
      }
    });
    return Response.json({ status: "ok" });
  } catch { return Response.json({ error: "Could not persist webhook" }, { status: 503 }); }
}
