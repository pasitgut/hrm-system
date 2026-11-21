import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db, resetDb, closeDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";
import { employees, users, leaveRequests, lineWebhookEvents, lineBotStates, lineIntegrationJobs, lineCalendarEvents } from "@/lib/db/schema";
import { createLeave as createLeaveCommand } from "@/lib/leave/commands";
import { receiveWebhook } from "@/lib/line/webhook";
import { processPendingEvents, issueLinkCode } from "@/lib/line/bot";
import { POST as createLeave } from "@/app/api/leave/route";
import { PATCH as decideLeave } from "@/app/api/leave/[id]/decision/route";
import { COOKIE_NAME, createSessionToken } from "@/lib/auth/session";

const uid = "U11111111111111111111111111111111";
let seq = 0;
let draft = "";
function message(text: string, userId = uid) {
  return { type: "message", webhookEventId: `bot-event-${++seq}`, timestamp: Date.now() + seq, source: { type: "user", userId }, replyToken: `reply-${seq}`, message: { type: "text", text } };
}
function postback(data: object, params?: object) {
  return { ...message(""), type: "postback", postback: { data: JSON.stringify({ draft, ...data }), params } };
}
async function accept(...events: object[]) {
  const body = JSON.stringify({ events });
  const signature = createHmac("sha256", "test-channel-secret").update(body).digest("base64");
  const response = await receiveWebhook(new Request("http://localhost/api/line/webhook", { method: "POST", headers: { "x-line-signature": signature }, body }));
  expect(response.status).toBe(200);
}
async function send(...events: object[]) {
  await accept(...events);
  await processPendingEvents();
  draft = (await db.select().from(lineBotStates).where(eq(lineBotStates.lineUid, uid)))[0]?.data.draft || "";
}
async function linked(role: "employee" | "hr" = "employee", lineUid = uid) {
  const account = await createUser({ role });
  await db.update(employees).set({ lineUid }).where(eq(employees.id, account.employee.id));
  return account;
}
beforeEach(async () => {
  await resetDb();
  await db.delete(lineIntegrationJobs);
  await db.delete(lineBotStates);
  process.env.LINE_CHANNEL_SECRET = "test-channel-secret";
  process.env.LINE_BOT_ENABLED = "true";
  draft = "";
});
afterAll(closeDb);

describe("LINE webhook and shared HRM workflows", () => {
  it("rejects invalid signatures without storing untrusted events", async () => {
    const response = await receiveWebhook(new Request("http://localhost/api/line/webhook", { method: "POST", body: JSON.stringify({ events: [message("hi")] }), headers: { "x-line-signature": "bad" } }));
    expect(response.status).toBe(401);
    expect(await db.select().from(lineWebhookEvents)).toHaveLength(0);
  });
  it("accepts empty verification batches and stores every signed event once", async () => {
    await linked();
    await send();
    const first = message("วิธีใช้งาน");
    await send(first, message("วิธีใช้งาน"));
    await send(first);
    expect(await db.select().from(lineWebhookEvents)).toHaveLength(2);
    expect(await db.select().from(lineIntegrationJobs)).toHaveLength(2);
  });
  it("creates exactly one HRM leave from a conversation despite duplicate submit", async () => {
    const account = await linked();
    await send(message("ส่งคำขอลางาน"));
    await send(postback({ action: "select_type", type: "sick" }));
    await send(postback({ action: "pick_start" }, { datetime: "2026-12-01T09:00" }));
    await send(postback({ action: "pick_end" }, { datetime: "2026-12-02T18:00" }));
    await send(message("พบแพทย์"));
    const submit = postback({ action: "submit_leave" });
    await send(submit);
    await send(submit);
    const rows = await db.select().from(leaveRequests);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ employeeId: account.employee.id, leaveTypeCode: "sick", startOn: "2026-12-01", endOn: "2026-12-02", session: "full", statusCode: "pending", reason: "พบแพทย์" });
  });
  it("does not submit stale or expired conversation data", async () => {
    await linked();
    await send(message("ส่งคำขอลางาน"));
    await db.update(lineBotStates).set({ expiresAt: new Date(0) }).where(eq(lineBotStates.lineUid, uid));
    await send(postback({ action: "submit_leave" }));
    expect(await db.select().from(leaveRequests)).toHaveLength(0);
  });
  it("links using a one-use HRM-issued code, never just an employee code", async () => {
    const account = await createUser({ role: "employee" });
    await send(message(`ลงทะเบียน ${account.employee.code}`));
    expect((await db.select().from(employees).where(eq(employees.id, account.employee.id)))[0].lineUid).toBeNull();
    const { code } = await issueLinkCode(account.user.id);
    await send(message(`ลงทะเบียน ${code}`));
    expect((await db.select().from(employees).where(eq(employees.id, account.employee.id)))[0].lineUid).toBe(uid);
    await send(message(`ลงทะเบียน ${code}`, "U22222222222222222222222222222222"));
    expect((await db.select().from(employees).where(eq(employees.id, account.employee.id)))[0].lineUid).toBe(uid);
  });
  it("uses the same transactional notifications and Calendar jobs for web decisions", async () => {
    const account = await linked();
    const admin = await linked("hr", "U22222222222222222222222222222222");
    const token = await createSessionToken({ sub: account.user.id, employeeId: account.employee.id, email: account.user.email, role: "employee" });
    const response = await createLeave(new NextRequest("http://localhost/api/leave", { method: "POST", headers: { cookie: `${COOKIE_NAME}=${token}` }, body: JSON.stringify({ leaveTypeCode: "sick", startOn: "2026-12-01", endOn: "2026-12-01", session: "full" }) }));
    const { item } = await response.json();
    const adminToken = await createSessionToken({ sub: admin.user.id, employeeId: admin.employee.id, email: admin.user.email, role: "hr" });
    const result = await decideLeave(new NextRequest(`http://localhost/api/leave/${item.id}/decision`, { method: "PATCH", headers: { cookie: `${COOKIE_NAME}=${adminToken}` }, body: JSON.stringify({ decision: "approved" }) }), { params: Promise.resolve({ id: item.id }) });
    expect(result.status).toBe(200);
    const jobs = await db.select().from(lineIntegrationJobs);
    expect(jobs.filter((j) => j.kind === "calendar.upsert")).toHaveLength(1);
    expect(jobs.filter((j) => j.kind === "line.message").length).toBeGreaterThanOrEqual(2);
  });
  it("checks current permissions on approval and never alters another employee's leave", async () => {
    const account = await linked();
    const [leave] = await db.insert(leaveRequests).values({ employeeId: account.employee.id, leaveTypeCode: "sick", startOn: "2026-12-01", endOn: "2026-12-01" }).returning();
    await send(postback({ action: "approve_leave", id: leave.id }));
    expect((await db.select().from(leaveRequests))[0].statusCode).toBe("pending");
  });
  it("does not change work-tracking receipts that the new handler does not own", async () => {
    await db.insert(lineWebhookEvents).values({ eventId: "external-work-event", sourceId: uid, status: "committed", sheetCommitted: true, responsePayload: { original: true } });
    await processPendingEvents();
    expect((await db.select().from(lineWebhookEvents))[0]).toMatchObject({ status: "committed", sheetCommitted: true, responsePayload: { original: true } });
  });
  it("lets only the request owner cancel a pending leave", async () => {
    const account = await linked();
    const other = await createUser({ role: "employee" });
    const [leave] = await db.insert(leaveRequests).values({ employeeId: other.employee.id, leaveTypeCode: "sick", startOn: "2026-12-01", endOn: "2026-12-01" }).returning();
    await send(postback({ action: "cancel_leave_by_user", id: leave.id }));
    expect((await db.select().from(leaveRequests))[0].statusCode).toBe("pending");
    expect(account.employee.id).not.toBe(leave.employeeId);
  });
  it("serializes duplicate event processors and creates only one response job", async () => {
    await linked();
    const event = message("วิธีใช้งาน");
    await db.insert(lineWebhookEvents).values({ eventId: event.webhookEventId, sourceId: uid, status: "processing", requestPayload: event });
    await Promise.all([processPendingEvents(), processPendingEvents()]);
    expect(await db.select().from(lineIntegrationJobs)).toHaveLength(1);
    expect((await db.select().from(lineWebhookEvents))[0].status).toBe("completed");
  });
  it("blocks a deactivated approver even if they still have an old approval button", async () => {
    const account = await linked("hr");
    const [leave] = await db.insert(leaveRequests).values({ employeeId: account.employee.id, leaveTypeCode: "sick", startOn: "2026-12-01", endOn: "2026-12-01" }).returning();
    const { users } = await import("@/lib/db/schema");
    await db.update(users).set({ isActive: false }).where(eq(users.id, account.user.id));
    await send(postback({ action: "approve_leave", id: leave.id }));
    expect((await db.select().from(leaveRequests))[0].statusCode).toBe("pending");
  });
  it("preserves appointment location and Bangkok times through the old LINE flow", async () => {
    const account = await linked();
    await send(message("สร้างนัดหมาย")); await send(message("ประชุมทีม"));
    await send(postback({ action: "event_pick_start" }, { datetime: "2026-12-01T09:00" }));
    await send(postback({ action: "event_pick_end" }, { datetime: "2026-12-01T10:00" }));
    await send(message("ห้องประชุม"));
    const { lineCalendarEvents } = await import("@/lib/db/schema");
    const [event] = await db.select().from(lineCalendarEvents);
    expect(event).toMatchObject({ employeeId: account.employee.id, title: "ประชุมทีม", location: "ห้องประชุม" });
    expect(event.startAt?.toISOString()).toBe("2026-12-01T02:00:00.000Z");
    expect(event.endAt?.toISOString()).toBe("2026-12-01T03:00:00.000Z");
  });
  it("rejects a confirmation from another draft instead of filing the current draft", async () => {
    await linked();
    async function prepare(reason: string) {
      await send(message("ส่งคำขอลางาน")); await send(postback({ action: "select_type", type: "sick" }));
      await send(postback({ action: "pick_start" }, { datetime: "2026-12-01T09:00" }));
      await send(postback({ action: "pick_end" }, { datetime: "2026-12-01T18:00" })); await send(message(reason));
    }
    await prepare("draft A"); const oldButton = postback({ action: "submit_leave" });
    await prepare("draft B"); oldButton.timestamp = Date.now() + ++seq;
    await send(oldButton);
    expect(await db.select().from(leaveRequests)).toHaveLength(0);
  });
  it("does not reconstruct a draft from a conversation queued more than 30 minutes ago", async () => {
    await linked();
    const event = message("ส่งคำขอลางาน"); event.timestamp = Date.now() - 3_600_000;
    await send(event);
    expect((await db.select().from(lineWebhookEvents))[0]).toMatchObject({ status: "ignored", errorCode: "EVENT_EXPIRED" });
    expect(await db.select().from(lineBotStates)).toHaveLength(0);
  });
  it("stores only minimal ignored receipts and a digest of redeemable link proofs", async () => {
    const account = await createUser({ role: "employee" }); const { code } = await issueLinkCode(account.user.id);
    const group = { ...message("private group details"), source: { type: "group", userId: uid } };
    await accept(group, message(`ลงทะเบียน ${code}`));
    const rows = await db.select().from(lineWebhookEvents);
    expect(rows.find((r) => r.eventId === group.webhookEventId)?.requestPayload).toBeNull();
    expect(JSON.stringify(rows)).not.toContain(code);
    await processPendingEvents();
    expect((await db.select().from(employees))[0].lineUid).toBe(uid);
  });
  it("does not approve edited dates using an old approval card", async () => {
    const account = await linked(); const admin = await linked("hr", "U22222222222222222222222222222222");
    const result = await db.transaction((tx) => createLeaveCommand(tx, { employeeId: account.employee.id, permissions: account.user.permissions }, { leaveTypeCode: "sick", startOn: "2026-12-01", endOn: "2026-12-01", session: "full", reason: null }));
    if ("error" in result) throw new Error(result.error);
    const card = (await db.select().from(lineIntegrationJobs)).find((j) => j.payload.permission === "leave.approve")!;
    const action = JSON.parse(card.payload.messages[0].template.actions[0].data);
    await db.update(leaveRequests).set({ startOn: "2026-12-02", endOn: "2026-12-02", updatedAt: new Date(Date.now() + 1000) }).where(eq(leaveRequests.id, result.id));
    const event = { ...postback(action), source: { type: "user", userId: "U22222222222222222222222222222222" } };
    await send(event);
    expect((await db.select().from(leaveRequests))[0].statusCode).toBe("pending");
    expect(admin.employee.id).not.toBe(account.employee.id);
  });
  it("approves the exact revision shown on a current card only once", async () => {
    const admin = await linked("hr");
    const [leave] = await db.insert(leaveRequests).values({ employeeId: admin.employee.id, leaveTypeCode: "sick", startOn: "2026-12-01", endOn: "2026-12-01" }).returning();
    const [revision] = await db.select({ value: sql<string>`extract(epoch from ${leaveRequests.updatedAt})::text` }).from(leaveRequests).where(eq(leaveRequests.id, leave.id));
    await send(postback({ action: "approve_leave", id: leave.id, version: revision.value }));
    await send(postback({ action: "approve_leave", id: leave.id, version: revision.value }));
    expect((await db.select().from(leaveRequests))[0].statusCode).toBe("approved");
    expect((await db.select().from(lineIntegrationJobs)).filter((j) => j.kind === "calendar.upsert")).toHaveLength(1);
  });
  it("paginates deletable appointments so every owned appointment is reachable", async () => {
    const account = await linked(); const start = Date.now() + 86_400_000;
    for (let n = 0; n < 5; n++) await db.insert(lineCalendarEvents).values({ employeeId: account.employee.id, title: `appointment-${n}`, startAt: new Date(start + n * 60_000), endAt: new Date(start + n * 60_000 + 3_600_000) });
    await send(message("ลบนัดหมาย"));
    await send(postback({ action: "list_events", offset: "4", mode: "delete" }));
    const replies = await db.select().from(lineIntegrationJobs);
    expect(JSON.stringify(replies[replies.length - 1].payload.messages)).toContain("appointment-4");
  });
  it("allows cancellation before interpreting a registration code", async () => {
    await send(message("ลงทะเบียน")); await send(message("ยกเลิก"));
    expect((await db.select().from(lineBotStates))[0].step).toBe("idle");
  });
});
