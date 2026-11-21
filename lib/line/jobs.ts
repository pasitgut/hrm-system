import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { employees, users, lineIntegrationJobs, lineCalendarEvents, lineBotStates, lineLinkCodes } from "@/lib/db/schema";
import { hasPermission, canViewOwnLeaveRequests } from "@/lib/auth/permissions";
import { calendarEventId, calendarRequest, upsertCalendarEvent, ProviderError } from "@/lib/line/calendar";
import { processPendingEvents } from "@/lib/line/bot";

async function deliverLine(job: typeof lineIntegrationJobs.$inferSelect) {
  const payload = job.payload;
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) throw new ProviderError("LINE is not configured", 503);
  if (payload.employeeId) {
    const [recipient] = await db.select({ employeeId: employees.id, uid: employees.lineUid, deletedAt: employees.deletedAt, active: users.isActive, firstLogin: users.mustChangePassword, permissions: users.permissions }).from(employees).innerJoin(users, eq(users.employeeId, employees.id)).where(eq(employees.id, payload.employeeId));
    if (!recipient?.active || recipient.firstLogin || recipient.deletedAt || recipient.uid !== payload.to || (payload.permission && !hasPermission(recipient.permissions, payload.permission)) || (payload.leaveReadRequired && !canViewOwnLeaveRequests(recipient.permissions))) throw new ProviderError("LINE recipient access revoked", 403);
  }
  const reply = payload.replyToken && Date.now() < Number(payload.replyUntil);
  // Conservatively bound the provider's 24-hour retry-key window by job creation.
  if (!reply && job.attempts > 1 && Date.now() - job.createdAt.getTime() >= 23 * 3_600_000) {
    throw new ProviderError("LINE push retry window expired", 598);
  }
  if (reply) {
    // Reply has no provider retry key: a lost response must never become a duplicate push.
    await db.update(lineIntegrationJobs).set({ status: "sending_reply" }).where(and(eq(lineIntegrationJobs.id, job.id), eq(lineIntegrationJobs.leaseToken, job.leaseToken!)));
  }
  const response = await fetch(`https://api.line.me/v2/bot/message/${reply ? "reply" : "push"}`, { method: "POST", headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json", ...(!reply ? { "X-Line-Retry-Key": job.retryKey } : {}) }, body: JSON.stringify({ ...(reply ? { replyToken: payload.replyToken } : { to: payload.to }), messages: payload.messages }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok && !(response.status === 409 && !reply && response.headers.has("x-line-accepted-request-id"))) throw new ProviderError("LINE message request failed", response.status, Number(response.headers.get("retry-after")) || 0);
}
async function deliverCalendar(job: typeof lineIntegrationJobs.$inferSelect) {
  const [event] = await db.select().from(lineCalendarEvents).where(eq(lineCalendarEvents.id, job.payload.eventId));
  if (!event) throw new ProviderError("Calendar event not found", 404);
  if (job.kind === "calendar.delete") {
    if (event.status !== "deleting" && event.status !== "deleted") return;
    const remoteId = event.googleEventId || calendarEventId(event.id);
    try {
      const remote = await calendarRequest("GET", `events/${remoteId}`);
      if (remote.extendedProperties?.private?.application !== "hrm-line" || remote.extendedProperties?.private?.internalEventId !== event.id) throw new ProviderError("Calendar ownership mismatch", 409);
      await calendarRequest("DELETE", `events/${remoteId}`);
    }
    catch (error) { if (!(error instanceof ProviderError) || ![404, 410].includes(error.status)) throw error; }
    await db.update(lineCalendarEvents).set({ status: "deleted" }).where(eq(lineCalendarEvents.id, event.id));
    return;
  }
  if (event.status === "deleted") return;
  const id = await upsertCalendarEvent(event.id, { title: event.title, startOn: event.startOn || undefined, endOn: event.endOn || undefined, session: job.payload.session, startAt: event.startAt?.toISOString(), endAt: event.endAt?.toISOString(), location: event.location || undefined });
  // A delete may have been requested while the Google call was in flight.
  await db.update(lineCalendarEvents).set({ googleEventId: id, status: "synced" }).where(and(eq(lineCalendarEvents.id, event.id), sql`${lineCalendarEvents.status} not in ('deleting', 'deleted')`));
}
export async function runPendingWork(limit = 5) {
  if (process.env.LINE_BOT_ENABLED !== "true") return { completed: 0, failed: 0 };
  const deadline = Date.now() + 45_000;
  await processPendingEvents(limit, deadline);
  const result = { completed: 0, failed: 0 };
  await db.delete(lineIntegrationJobs).where(and(eq(lineIntegrationJobs.status, "completed"), sql`${lineIntegrationJobs.updatedAt} < now() - interval '7 days'`));
  await db.delete(lineLinkCodes).where(sql`${lineLinkCodes.expiresAt} < now()`);
  await db.delete(lineBotStates).where(sql`${lineBotStates.expiresAt} < now() - interval '7 days'`);
  // An abandoned reply cannot be retried safely; keep it visible for reconciliation.
  await db.update(lineIntegrationJobs).set({ status: "unknown", errorCode: "REPLY_RESULT_UNKNOWN", updatedAt: new Date() }).where(and(eq(lineIntegrationJobs.status, "sending_reply"), sql`${lineIntegrationJobs.leaseUntil} < now()`));
  for (let count = 0; count < Math.min(20, limit) && Date.now() + 20_000 < deadline; count++) {
    const token = randomUUID();
    const job = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(lineIntegrationJobs).where(and(sql`(${lineIntegrationJobs.status} = 'pending' or (${lineIntegrationJobs.status} = 'processing' and ${lineIntegrationJobs.leaseUntil} < now()))`, sql`${lineIntegrationJobs.nextAttemptAt} <= now()`)).orderBy(lineIntegrationJobs.createdAt).limit(1).for("update", { skipLocked: true });
      if (!row) return null;
      if (row.kind.startsWith("calendar.") && typeof row.payload.eventId === "string") {
        // Serialize claims, not network calls, so create/delete cannot overtake each other.
        await tx.execute(sql`set local lock_timeout = '5s'`);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${row.payload.eventId}, 711))`);
        const [busy] = await tx.select({ id: lineIntegrationJobs.id }).from(lineIntegrationJobs).where(and(sql`${lineIntegrationJobs.id} <> ${row.id}`, eq(lineIntegrationJobs.status, "processing"), sql`${lineIntegrationJobs.leaseUntil} > now()`, sql`${lineIntegrationJobs.payload}->>'eventId' = ${row.payload.eventId}`)).limit(1);
        if (busy) return null;
      }
      const [claimed] = await tx.update(lineIntegrationJobs).set({ status: "processing", leaseToken: token, leaseUntil: new Date(Date.now() + 60_000), attempts: row.attempts + 1, updatedAt: new Date() }).where(eq(lineIntegrationJobs.id, row.id)).returning();
      return claimed;
    });
    if (!job) break;
    try {
      if (job.kind === "line.message") await deliverLine(job);
      else if (["calendar.upsert", "calendar.delete"].includes(job.kind)) await deliverCalendar(job);
      else throw new ProviderError("Unsupported integration job", 400);
      await db.update(lineIntegrationJobs).set({ status: "completed", errorCode: null, leaseUntil: null, updatedAt: new Date() }).where(and(eq(lineIntegrationJobs.id, job.id), eq(lineIntegrationJobs.leaseToken, token)));
      result.completed++;
    } catch (error) {
      const [current] = await db.select({ status: lineIntegrationJobs.status }).from(lineIntegrationJobs).where(eq(lineIntegrationJobs.id, job.id));
      const status = error instanceof ProviderError ? error.status : 0;
      const transient = status === 0 || status === 429 || status >= 500;
      const unknownReply = current?.status === "sending_reply" && transient;
      const expiredPush = status === 598;
      const retry = transient && job.attempts <= 5 && !unknownReply && !expiredPush;
      const delay = Math.max(60 * 2 ** Math.min(job.attempts - 1, 4), error instanceof ProviderError ? error.retryAfter : 0);
      await db.update(lineIntegrationJobs).set({ status: unknownReply || expiredPush ? "unknown" : retry ? "pending" : "failed", errorCode: unknownReply ? "REPLY_RESULT_UNKNOWN" : expiredPush ? "PUSH_RETRY_WINDOW_EXPIRED" : `PROVIDER_${status || "NETWORK"}`, nextAttemptAt: new Date(Date.now() + delay * 1000), leaseUntil: null, updatedAt: new Date() }).where(and(eq(lineIntegrationJobs.id, job.id), eq(lineIntegrationJobs.leaseToken, token)));
      result.failed++;
    }
  }
  return result;
}
