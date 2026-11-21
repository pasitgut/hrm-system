import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { employees, users, leaveTypes, leaveRequests, lineBotStates, lineLinkCodes, lineWebhookEvents, lineCalendarEvents } from "@/lib/db/schema";
import { hasPermission } from "@/lib/auth/permissions";
import { createLeave, decideLeave, cancelLeave } from "@/lib/leave/commands";
import { parseLeaveInput } from "@/app/api/leave/_shared";
import { enqueue, type Transaction } from "@/lib/line/outbox";
import type { LineEvent } from "@/lib/line/webhook";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (value: string) => ({ type: "text", text: value.slice(0, 4900) });
export async function issueLinkCode(userId: string) {
  return db.transaction(async (tx) => {
    const [account] = await tx.select({ employeeId: users.employeeId, active: users.isActive, firstLogin: users.mustChangePassword, deletedAt: employees.deletedAt }).from(users).innerJoin(employees, eq(users.employeeId, employees.id)).where(eq(users.id, userId)).for("update", { of: users });
    if (!account?.active || account.firstLogin || account.deletedAt) throw new Error("Inactive HRM account");
    const code = randomBytes(16).toString("base64url");
    const expiresAt = new Date(Date.now() + 600_000);
    await tx.insert(lineLinkCodes).values({ employeeId: account.employeeId, codeHash: hash(code), expiresAt }).onConflictDoUpdate({ target: lineLinkCodes.employeeId, set: { codeHash: hash(code), expiresAt } });
    return { code, expiresAt: expiresAt.toISOString() };
  });
}
async function actorFor(tx: Transaction, uid: string) {
  const [actor] = await tx.select({ employeeId: employees.id, userId: users.id, permissions: users.permissions, firstName: employees.firstName }).from(employees).innerJoin(users, eq(users.employeeId, employees.id)).where(and(eq(employees.lineUid, uid), eq(users.isActive, true), eq(users.mustChangePassword, false), isNull(employees.deletedAt))).for("share", { of: users });
  return actor;
}
function datePicker(action: string, label: string, draft: string) {
  return { type: "template", altText: label, template: { type: "buttons", text: label, actions: [{ type: "datetimepicker", label, data: JSON.stringify({ action, draft }), mode: "datetime" }] } };
}
function choice(label: string, action: string, data: Record<string, string> = {}) {
  return { type: "postback", label: label.slice(0, 20), data: JSON.stringify({ action, ...data }) };
}
function buttons(label: string, actions: object[]) {
  return { type: "template", altText: label.slice(0, 200), template: { type: "buttons", text: label.slice(0, 160), actions: actions.slice(0, 4) } };
}
async function processEvent(tx: Transaction, event: LineEvent) {
  const uid = event.source.userId!;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${uid}, 12012026))`);
  const [receipt] = await tx.select().from(lineWebhookEvents).where(eq(lineWebhookEvents.eventId, event.webhookEventId)).for("update");
  if (!receipt || receipt.status !== "processing" || !receipt.requestPayload) return;
  if (event.timestamp < Date.now() - 1_800_000 || event.timestamp > Date.now() + 300_000) {
    await tx.update(lineWebhookEvents).set({ status: "ignored", errorCode: "EVENT_EXPIRED", requestPayload: null, updatedAt: new Date() }).where(eq(lineWebhookEvents.eventId, event.webhookEventId));
    return;
  }
  await tx.insert(lineBotStates).values({ lineUid: uid }).onConflictDoNothing();
  const [saved] = await tx.select().from(lineBotStates).where(eq(lineBotStates.lineUid, uid)).for("update");
  if (event.timestamp < saved.lastEventAt) {
    await tx.update(lineWebhookEvents).set({ status: "ignored", errorCode: "STALE_EVENT", requestPayload: null, updatedAt: new Date() }).where(eq(lineWebhookEvents.eventId, event.webhookEventId));
    return;
  }
  let step = saved.expiresAt.getTime() > Date.now() ? saved.step : "idle";
  let data: Record<string, string> = step === "idle" ? {} : { ...saved.data };
  const messages: object[] = [];
  const say = (value: string) => messages.push(text(value));
  const msg = event.type === "message" && event.message?.type === "text" ? event.message.text?.trim() || "" : "";
  let action: Record<string, unknown> = {};
  if (event.type === "postback") {
    try { const value = JSON.parse(event.postback?.data || "{}"); if (value && typeof value === "object" && !Array.isArray(value)) action = value; } catch { say("ข้อมูลปุ่มไม่ถูกต้อง กรุณาเริ่มใหม่"); }
  }
  const actor = await actorFor(tx, uid);
  const stateful = ["select_type", "pick_start", "pick_end", "submit_leave", "event_pick_start", "event_pick_end"];
  if (["ยกเลิก", "ออก", "กลับ"].includes(msg)) {
    step = "idle"; data = {}; say("ยกเลิกรายการแล้ว");
  } else if (stateful.includes(String(action.action)) && (!data.draft || action.draft !== data.draft)) {
    say("ปุ่มนี้หมดอายุ กรุณาใช้ปุ่มจากรายการล่าสุดหรือเริ่มใหม่");
  } else if (event.linkProofHash || msg.startsWith("ลงทะเบียน ") || (step === "link" && msg)) {
    const now = new Date();
    const inWindow = now.getTime() - saved.linkWindowAt.getTime() < 600_000;
    const attempts = inWindow ? saved.linkAttempts : 0;
    const code = msg.startsWith("ลงทะเบียน ") ? msg.slice("ลงทะเบียน ".length).trim() : msg;
    if (actor) say("บัญชี LINE นี้เชื่อมกับ HRM แล้ว");
    else if (attempts >= 5) say("ลองรหัสเกินจำนวนที่กำหนด กรุณารอ 10 นาที");
    else {
      const [link] = await tx.select().from(lineLinkCodes).where(eq(lineLinkCodes.codeHash, event.linkProofHash || hash(code))).for("update");
      if (!link || link.expiresAt <= now) say("รหัสไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่จาก HRM");
      else {
        const [account] = await tx.select({ id: employees.id, uid: employees.lineUid, active: users.isActive, firstLogin: users.mustChangePassword, deletedAt: employees.deletedAt }).from(employees).innerJoin(users, eq(users.employeeId, employees.id)).where(eq(employees.id, link.employeeId)).for("update");
        if (!account?.active || account.firstLogin || account.deletedAt || account.uid) say("ไม่สามารถเชื่อมบัญชีนี้ได้ กรุณาติดต่อ HR");
        else {
          await tx.update(employees).set({ lineUid: uid, updatedAt: now }).where(eq(employees.id, account.id));
          await tx.delete(lineLinkCodes).where(eq(lineLinkCodes.employeeId, account.id));
          say("ลงทะเบียนสำเร็จ เชื่อมบัญชี LINE กับ HRM แล้ว"); step = "idle"; data = {};
        }
      }
      await tx.update(lineBotStates).set({ linkAttempts: attempts + 1, linkWindowAt: inWindow ? saved.linkWindowAt : now }).where(eq(lineBotStates.lineUid, uid));
    }
  } else if (msg === "ลงทะเบียน") {
    step = "link"; say("เข้าสู่ HRM เพื่อขอรหัสเชื่อม LINE แล้วส่ง: ลงทะเบียน <รหัส>\nรหัสพนักงานเพียงอย่างเดียวใช้ยืนยันบัญชีไม่ได้");
  } else if (!actor) {
    say("กรุณาเชื่อมบัญชี LINE ผ่าน HRM ก่อนใช้งาน หรือให้ HR ตรวจสอบสถานะบัญชี");
  } else if (["ยกเลิก", "ออก", "กลับ"].includes(msg)) {
    step = "idle"; data = {}; say("ยกเลิกรายการแล้ว");
  } else if (msg === "ส่งคำขอลางาน") {
    if (!hasPermission(actor.permissions, "leave.request.self")) say("ไม่มีสิทธิ์ยื่นคำขอลา");
    else {
      const types = await tx.select({ code: leaveTypes.code, name: leaveTypes.name }).from(leaveTypes).where(eq(leaveTypes.isActive, true));
      step = "leave_type"; data = { draft: randomBytes(16).toString("base64url") };
      if (types.length) messages.push({ type: "text", text: "เลือกประเภทการลา", quickReply: { items: types.slice(0, 13).map((t) => ({ type: "action", action: choice(t.name, "select_type", { type: t.code, draft: data.draft }) })) } });
      else say("ยังไม่มีประเภทลาที่เปิดใช้งาน กรุณาติดต่อ HR");
    }
  } else if (action.action === "select_type" && step === "leave_type" && typeof action.type === "string") {
    const [type] = await tx.select({ code: leaveTypes.code }).from(leaveTypes).where(and(eq(leaveTypes.code, action.type), eq(leaveTypes.isActive, true)));
    if (!type) say("ประเภทลาไม่พร้อมใช้งาน");
    else { data.type = type.code; step = "leave_start"; messages.push(datePicker("pick_start", "เลือกวันเริ่มลา", data.draft)); }
  } else if (action.action === "pick_start" && step === "leave_start") {
    const value = event.postback?.params?.datetime?.slice(0, 10);
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) say("วันเริ่มไม่ถูกต้อง");
    else { data.start = value; step = "leave_end"; messages.push(datePicker("pick_end", "เลือกวันสิ้นสุดลา", data.draft)); }
  } else if (action.action === "pick_end" && step === "leave_end") {
    const value = event.postback?.params?.datetime?.slice(0, 10);
    const parsed = parseLeaveInput({ leaveTypeCode: data.type, startOn: data.start, endOn: value, session: "full" });
    if (parsed.ok === false) say(parsed.message);
    else { data.end = value!; step = "leave_reason"; say("พิมพ์เหตุผลการลา หรือ ไม่ระบุเหตุผล"); }
  } else if (step === "leave_reason" && msg) {
    data.reason = msg === "ไม่ระบุเหตุผล" ? "" : msg;
    step = "leave_confirm"; messages.push(buttons(`ยืนยันลา ${data.start} ถึง ${data.end}`, [choice("ยืนยันส่งคำขอลา", "submit_leave", { draft: data.draft })]));
  } else if (action.action === "submit_leave" && step === "leave_confirm") {
    const parsed = parseLeaveInput({ leaveTypeCode: data.type, startOn: data.start, endOn: data.end, reason: data.reason, session: "full" });
    if (parsed.ok === false) say(parsed.message);
    else {
      const result = await createLeave(tx, actor, parsed.value);
      if ("error" in result) say(result.error);
      else { messages.push(buttons("ส่งคำขอลาแล้ว รอผู้อนุมัติพิจารณา", [choice("ยกเลิกคำขอนี้", "cancel_leave_by_user", { id: result.id })])); step = "idle"; data = {}; }
    }
  } else if (["approve_leave", "reject_leave", "cancel_leave_by_user"].includes(String(action.action))) {
    const id = z.string().uuid().safeParse(action.id);
    if (!id.success || (action.action !== "cancel_leave_by_user" && typeof action.version !== "string")) say("ปุ่มนี้หมดอายุ กรุณาเปิดรายการใน HRM เพื่อทำรายการต่อ");
    else {
      const result = action.action === "cancel_leave_by_user" ? await cancelLeave(tx, actor, id.data) : await decideLeave(tx, actor, id.data, action.action === "approve_leave" ? "approved" : "rejected", null, String(action.version));
      say("error" in result ? result.error : "บันทึกผลใน HRM แล้ว");
    }
  } else if (msg === "สร้างนัดหมาย") {
    step = "event_title"; data = { draft: randomBytes(16).toString("base64url") }; say("พิมพ์ชื่อนัดหมาย");
  } else if (step === "event_title" && msg) {
    data.title = msg.slice(0, 200); step = "event_start"; messages.push(datePicker("event_pick_start", "เลือกเวลาเริ่มนัดหมาย", data.draft));
  } else if (action.action === "event_pick_start" && step === "event_start") {
    const value = event.postback?.params?.datetime;
    if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}:00+07:00`))) say("เวลาไม่ถูกต้อง");
    else { data.start = `${value}:00+07:00`; step = "event_end"; messages.push(datePicker("event_pick_end", "เลือกเวลาสิ้นสุดนัดหมาย", data.draft)); }
  } else if (action.action === "event_pick_end" && step === "event_end") {
    const value = event.postback?.params?.datetime;
    const end = `${value}:00+07:00`;
    if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !(Date.parse(end) > Date.parse(data.start))) say("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
    else { data.end = end; step = "event_location"; say("พิมพ์สถานที่/ลิงก์ หรือ ไม่ระบุสถานที่"); }
  } else if (step === "event_location" && msg) {
    const [eventRow] = await tx.insert(lineCalendarEvents).values({ employeeId: actor.employeeId, title: data.title, startAt: new Date(data.start), endAt: new Date(data.end), location: msg === "ไม่ระบุสถานที่" ? null : msg }).returning();
    await enqueue(tx, `event:${eventRow.id}:create`, "calendar.upsert", { eventId: eventRow.id });
    step = "idle"; data = {}; say("รับนัดหมายแล้ว กำลังบันทึกใน Google Calendar");
  } else if (msg === "ดูนัดหมาย" || msg === "ลบนัดหมาย" || action.action === "list_events") {
    // shortcut: list only mapped events owned by this employee; expand after legacy Calendar ownership is reconciled.
    const deleting = msg === "ลบนัดหมาย" || action.mode === "delete";
    const offset = action.action === "list_events" && /^\d{1,5}$/.test(String(action.offset)) ? Number(action.offset) : 0;
    const startTime = sql`coalesce(${lineCalendarEvents.startAt}, ${lineCalendarEvents.startOn}::timestamp at time zone 'Asia/Bangkok')`;
    const endTime = sql`coalesce(${lineCalendarEvents.endAt}, (${lineCalendarEvents.endOn} + 1)::timestamp at time zone 'Asia/Bangkok')`;
    const rows = await tx.select().from(lineCalendarEvents).where(and(eq(lineCalendarEvents.employeeId, actor.employeeId), sql`${lineCalendarEvents.status} not in ('deleted', 'deleting')`, sql`${endTime} > now()`, ...(deleting ? [isNull(lineCalendarEvents.leaveRequestId)] : [sql`${startTime} < now() + interval '7 days'`]))).orderBy(startTime, asc(lineCalendarEvents.id)).offset(offset).limit(5);
    if (!rows.length) say("ไม่มีนัดหมายที่บันทึกผ่าน bot ในช่วงนี้ ดูรายการทั้งหมดได้ที่ Google Calendar");
    for (const row of rows.slice(0, 4)) messages.push(buttons(`${row.title}\n${row.startOn || row.startAt?.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`, row.leaveRequestId ? [choice("ดูรายการ", "help")] : [choice("ยืนยันลบนัดหมาย", "delete_event", { id: row.id })]));
    if (rows.length > 4) messages.push({ type: "text", text: "มีรายการเพิ่มเติม", quickReply: { items: [{ type: "action", action: choice("หน้าถัดไป", "list_events", { offset: String(offset + 4), mode: deleting ? "delete" : "view" }) }] } });
  } else if (action.action === "delete_event") {
    const id = z.string().uuid().safeParse(action.id);
    if (!id.success) say("รายการไม่ถูกต้อง");
    else {
      const [row] = await tx.select().from(lineCalendarEvents).where(and(eq(lineCalendarEvents.id, id.data), eq(lineCalendarEvents.employeeId, actor.employeeId))).for("update");
      if (!row || row.leaveRequestId || ["deleted", "deleting"].includes(row.status)) say("ไม่มีสิทธิ์ลบหรือรายการถูกลบแล้ว");
      else { await tx.update(lineCalendarEvents).set({ status: "deleting" }).where(eq(lineCalendarEvents.id, row.id)); await enqueue(tx, `event:${row.id}:delete`, "calendar.delete", { eventId: row.id }); say("รับคำขอลบนัดหมายแล้ว"); }
    }
  } else {
    say("คำสั่ง: ลงทะเบียน, ส่งคำขอลางาน, สร้างนัดหมาย, ดูนัดหมาย, ลบนัดหมาย หรือ ยกเลิก\nหากปุ่มเดิมหมดอายุ กรุณาเริ่มทำรายการใหม่");
  }
  const now = new Date();
  await tx.update(lineBotStates).set({ step, data, lastEventAt: event.timestamp, expiresAt: new Date(event.timestamp + 1_800_000) }).where(eq(lineBotStates.lineUid, uid));
  if (messages.length) await enqueue(tx, `reply:${event.webhookEventId}`, "line.message", { to: uid, ...(actor ? { employeeId: actor.employeeId } : {}), messages: messages.slice(0, 5), replyToken: event.replyToken, replyUntil: receipt.createdAt.getTime() + 40_000 });
  await tx.update(lineWebhookEvents).set({ status: "completed", requestPayload: null, responsePayload: { accepted: true }, leaseUntil: null, errorCode: null, updatedAt: now }).where(eq(lineWebhookEvents.eventId, event.webhookEventId));
}
export async function processPendingEvents(limit = 20, deadline = Date.now() + 45_000) {
  const rows = await db.select().from(lineWebhookEvents).where(and(eq(lineWebhookEvents.status, "processing"), sql`${lineWebhookEvents.requestPayload} is not null`, sql`(${lineWebhookEvents.leaseUntil} is null or ${lineWebhookEvents.leaseUntil} <= now())`)).orderBy(sql`(${lineWebhookEvents.requestPayload}->>'timestamp')::bigint`, asc(lineWebhookEvents.createdAt)).limit(limit);
  for (const row of rows) {
    if (Date.now() + 10_000 >= deadline) break;
    try { await db.transaction(async (tx) => { await tx.execute(sql`set local lock_timeout = '5s'`); await tx.execute(sql`set local statement_timeout = '10s'`); await processEvent(tx, row.requestPayload as LineEvent); }); }
    catch {
      await db.update(lineWebhookEvents).set({ attempts: sql`${lineWebhookEvents.attempts} + 1`, status: row.attempts >= 6 ? "failed_unnotified" : "processing", leaseUntil: new Date(Date.now() + 60_000 * 2 ** Math.min(row.attempts - 1, 4)), errorCode: "BOT_PROCESSING_FAILED", updatedAt: new Date() }).where(and(eq(lineWebhookEvents.eventId, row.eventId), eq(lineWebhookEvents.status, "processing")));
    }
  }
}
