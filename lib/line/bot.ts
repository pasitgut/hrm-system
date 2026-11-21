import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql, asc, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { employees, users, leaveTypes, leaveRequests, lineBotStates, lineWebhookEvents, lineCalendarEvents } from "@/lib/db/schema";
import { hasPermission } from "@/lib/auth/permissions";
import { createLeave, decideLeave, cancelLeave } from "@/lib/leave/commands";
import { parseLeaveInput } from "@/app/api/leave/_shared";
import { enqueue, type Transaction } from "@/lib/line/outbox";
import type { LineEvent } from "@/lib/line/webhook";
import { registerUserByEmpCode } from "@/lib/line/registration";
import { getLeaveTypeFlex, getDateTimePickerFlex, getLeaveConfirmationFlex, buildUserLeaveSuccessFlex, getEventDateTimeFlex, createEventCard, formatDateTime } from "@/lib/line/messages";

const text = (value: string) => ({ type: "text", text: value.slice(0, 4900) });
async function actorFor(tx: Transaction, uid: string) {
  const [actor] = await tx.select({ employeeId: employees.id, userId: users.id, permissions: users.permissions, firstName: employees.firstName }).from(employees).innerJoin(users, eq(users.employeeId, employees.id)).where(and(eq(employees.lineUid, uid), eq(users.isActive, true), eq(users.mustChangePassword, false), isNull(employees.deletedAt))).for("share", { of: users });
  return actor;
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
  let actor = await actorFor(tx, uid);
  const startLeaveFlow = () => { step = "leave_type"; data = { draft: randomBytes(16).toString("base64url") }; messages.push(getLeaveTypeFlex(data.draft)); };
  const dateTime = (value: string | undefined) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
    const result = `${value}:00+07:00`;
    return Number.isFinite(Date.parse(result)) && formatDateTime(result).replace(" ", "T") === value ? result : null;
  };
  const stateful = ["select_type", "pick_start", "pick_end", "submit_leave", "event_pick_start", "event_pick_end"];
  if (["ยกเลิก", "ออก", "กลับ"].includes(msg)) {
    step = "idle"; data = {}; say("✅ ยกเลิกรายการแล้ว");
  } else if (stateful.includes(String(action.action)) && (!data.draft || action.draft !== data.draft)) {
    say("ปุ่มนี้หมดอายุ กรุณาใช้ปุ่มจากรายการล่าสุดหรือเริ่มใหม่");
  } else if (step === "register" && msg || msg.startsWith("ลงทะเบียน ")) {
    const now = new Date();
    const inWindow = now.getTime() - saved.linkWindowAt.getTime() < 600_000;
    const attempts = inWindow ? saved.linkAttempts : 0;
    const empCode = msg.startsWith("ลงทะเบียน ") ? msg.slice("ลงทะเบียน ".length).trim() : msg;
    if (attempts >= 5) say("ลองรหัสเกินจำนวนที่กำหนด กรุณารอ 10 นาที");
    else {
      const result = await registerUserByEmpCode(tx, uid, empCode);
      await tx.update(lineBotStates).set({ linkAttempts: attempts + 1, linkWindowAt: inWindow ? saved.linkWindowAt : now }).where(eq(lineBotStates.lineUid, uid));
      if (result.success) {
        const pendingAction = data.pendingAction;
        step = "idle"; data = {};
        say(`✅ ลงทะเบียนสำเร็จ!\n👤 คุณ ${result.name}\n🆔 รหัสพนักงาน: ${empCode}`);
        actor = await actorFor(tx, uid);
        if (pendingAction === "start_leave" && actor && hasPermission(actor.permissions, "leave.request.self")) startLeaveFlow();
      } else if (result.alreadyRegistered) {
        step = "idle"; data = {};
        say(`⚠️ LINE Account นี้ได้ลงทะเบียนไว้แล้ว\n👤 ชื่อ: ${result.name}`);
      } else if (result.alreadyLinked) say("⚠️ รหัสพนักงานนี้เชื่อมกับ LINE อื่นแล้ว กรุณาติดต่อ HR เพื่อเปลี่ยนบัญชี");
      else if (result.unavailable) say("⚠️ บัญชีพนักงานยังไม่พร้อมใช้งาน กรุณาติดต่อ HR");
      else say(`❌ ไม่พบรหัสพนักงาน "${empCode}" ในระบบ\n\nกรุณาตรวจสอบรหัสและพิมพ์ใหม่อีกครั้ง\nหรือพิมพ์ "ยกเลิก"`);
    }
  } else if (msg === "ลงทะเบียน") {
    step = "register"; data = { pendingAction: "manual_register" };
    say('📌 กรุณาพิมพ์ "รหัสพนักงาน" ของคุณ เพื่อลงทะเบียน');
  } else if (!actor && msg === "ส่งคำขอลางาน") {
    step = "register"; data = { pendingAction: "start_leave" };
    say('⚠️ ยังไม่พบข้อมูลการลงทะเบียนของคุณ\n\n📌 กรุณาพิมพ์ "รหัสพนักงาน" ของคุณเพื่อเชื่อมต่อบัญชี LINE ก่อนครับ');
  } else if (!actor) {
    say("กรุณาลงทะเบียนด้วยรหัสพนักงานก่อนใช้งาน หรือให้ HR ตรวจสอบสถานะบัญชี");
  } else if (msg === "ส่งคำขอลางาน") {
    if (!hasPermission(actor.permissions, "leave.request.self")) say("ไม่มีสิทธิ์ยื่นคำขอลา");
    else startLeaveFlow();
  } else if (action.action === "select_type" && step === "leave_type" && typeof action.type === "string") {
    const [type] = await tx.select({ code: leaveTypes.code, name: leaveTypes.name }).from(leaveTypes).where(and(or(eq(leaveTypes.code, action.type), eq(leaveTypes.name, action.type), ...(action.type === "ลาวันเกิด" ? [eq(leaveTypes.name, "Birthday Leave")] : [])), eq(leaveTypes.isActive, true)));
    if (!type) say("ประเภทลาไม่พร้อมใช้งาน");
    else { data.type = type.code; data.typeLabel = type.name; step = "leave_dates"; messages.push(getDateTimePickerFlex(data.draft)); }
  } else if (action.action === "pick_start" && ["leave_dates", "leave_reason"].includes(step)) {
    const value = dateTime(event.postback?.params?.datetime);
    if (!value) say("วันเริ่มไม่ถูกต้อง");
    else { data.start = value; say(`✅ บันทึกเวลาเริ่มลาแล้ว\n📅 วันเวลาที่เลือก: ${formatDateTime(value, "display")} น.`); }
  } else if (action.action === "pick_end" && ["leave_dates", "leave_reason"].includes(step)) {
    const value = dateTime(event.postback?.params?.datetime);
    const parsed = parseLeaveInput({ leaveTypeCode: data.type, startOn: data.start?.slice(0, 10), endOn: value?.slice(0, 10), session: "full" });
    if (parsed.ok === false) say(parsed.message);
    else {
      data.end = value!; step = "leave_reason";
      messages.push(text(`✅ บันทึกเวลาสิ้นสุดลาแล้ว\n📅 วันเวลาที่เลือก: ${formatDateTime(value!, "display")} น.`), { type: 'text', text: '📝 กรุณาพิมพ์ "เหตุผลการลา" ของคุณส่งกลับมาในแชทนี้ครับ', quickReply: { items: [{ type: "action", action: { type: "message", label: "❌ ไม่ระบุเหตุผล", text: "ไม่ระบุเหตุผล" } }] } });
    }
  } else if (step === "leave_reason" && msg) {
    data.reason = msg === "ไม่ระบุเหตุผล" ? "ไม่ได้ระบุเหตุผล" : msg;
    step = "leave_confirm"; messages.push(getLeaveConfirmationFlex({ type: data.typeLabel, start: data.start, end: data.end, reason: data.reason }, data.draft));
  } else if (action.action === "submit_leave" && step === "leave_confirm") {
    const parsed = parseLeaveInput({ leaveTypeCode: data.type, startOn: data.start?.slice(0, 10), endOn: data.end?.slice(0, 10), reason: data.reason, session: "full" });
    if (parsed.ok === false) say(parsed.message);
    else {
      const result = await createLeave(tx, actor, parsed.value, "Line");
      if ("error" in result) say(result.error);
      else { messages.push(buildUserLeaveSuccessFlex(data.typeLabel, data.start.slice(0, 10), data.end.slice(0, 10), "Line", data.reason || "ไม่ได้ระบุเหตุผล", JSON.stringify({ action: "cancel_leave_by_user", id: result.id }))); step = "idle"; data = {}; }
    }
  } else if (["approve_leave", "reject_leave", "cancel_leave_by_user"].includes(String(action.action))) {
    const id = z.string().uuid().safeParse(action.id);
    if (!id.success || (action.action !== "cancel_leave_by_user" && typeof action.version !== "string")) say("ปุ่มนี้หมดอายุ กรุณาเปิดรายการใน HRM เพื่อทำรายการต่อ");
    else {
      const result = action.action === "cancel_leave_by_user" ? await cancelLeave(tx, actor, id.data) : await decideLeave(tx, actor, id.data, action.action === "approve_leave" ? "approved" : "rejected", null, String(action.version));
      if ("error" in result) say(result.error);
      else if (action.action === "cancel_leave_by_user") say("✅ ยกเลิกคำขอลาเรียบร้อยแล้วครับ");
    }
  } else if (msg === "สร้างนัดหมาย") {
    step = "event_title"; data = { draft: randomBytes(16).toString("base64url") }; say("📌 พิมพ์ชื่อนัดหมายของคุณ เช่น:\nประชุมงบประมาณ");
  } else if (step === "event_title" && msg) {
    data.title = msg.slice(0, 200); step = "event_dates"; messages.push(getEventDateTimeFlex(data.draft));
  } else if (action.action === "event_pick_start" && step === "event_dates") {
    const value = dateTime(event.postback?.params?.datetime);
    if (!value) say("เวลาไม่ถูกต้อง");
    else { data.start = value; say(`✅ บันทึกเวลาเริ่มนัดหมายแล้ว\n📅 วันเวลาที่เลือก: ${formatDateTime(value, "display")} น.`); }
  } else if (action.action === "event_pick_end" && step === "event_dates") {
    const end = dateTime(event.postback?.params?.datetime);
    if (!end || !data.start || Date.parse(end) <= Date.parse(data.start)) say("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
    else {
      data.end = end; step = "event_location";
      messages.push(text(`✅ บันทึกเวลาสิ้นสุดนัดหมายแล้ว\n📅 วันเวลาที่เลือก: ${formatDateTime(end, "display")} น.`), { type: 'text', text: '📝 กรุณาพิมพ์ "ชื่อสถานที่ หรือ Link" ของคุณส่งกลับมาในแชทนี้ครับ', quickReply: { items: [{ type: "action", action: { type: "message", label: "❌ ไม่ระบุสถานที่", text: "ไม่ระบุสถานที่" } }] } });
    }
  } else if (step === "event_location" && msg) {
    const [eventRow] = await tx.insert(lineCalendarEvents).values({ employeeId: actor.employeeId, title: data.title, startAt: new Date(data.start), endAt: new Date(data.end), location: msg === "ไม่ระบุสถานที่" ? null : msg }).returning();
    let successMessage = `📅 บันทึกนัดหมายสำเร็จเรียบร้อยแล้วครับ\n\n📝 กิจกรรม: ${data.title}\n⏳ เริ่ม: ${formatDateTime(data.start, "display")} น.\n⌛ สิ้นสุด: ${formatDateTime(data.end, "display")} น.`;
    if (msg !== "ไม่ระบุสถานที่") successMessage += `\n📍 สถานที่: ${msg}`;
    await enqueue(tx, `event:${eventRow.id}:create`, "calendar.upsert", { eventId: eventRow.id, notifyTo: uid, employeeId: actor.employeeId, successMessage });
    step = "idle"; data = {};
  } else if (msg === "ดูนัดหมาย" || msg === "ลบนัดหมาย") {
    // shortcut: list only mapped events owned by this employee; expand after legacy Calendar ownership is reconciled.
    const deleting = msg === "ลบนัดหมาย";
    const startTime = sql`coalesce(${lineCalendarEvents.startAt}, ${lineCalendarEvents.startOn}::timestamp at time zone 'Asia/Bangkok')`;
    const endTime = sql`coalesce(${lineCalendarEvents.endAt}, (${lineCalendarEvents.endOn} + 1)::timestamp at time zone 'Asia/Bangkok')`;
    const rows = await tx.select().from(lineCalendarEvents).where(and(eq(lineCalendarEvents.employeeId, actor.employeeId), eq(lineCalendarEvents.status, "synced"), sql`${endTime} > now()`, sql`${startTime} < now() + ${deleting ? 365 : 7} * interval '1 day'`)).orderBy(startTime, asc(lineCalendarEvents.id)).limit(deleting ? 100 : 10);
    if (!rows.length) say(deleting ? "📭 ไม่มีนัดหมายในปีนี้" : "📭 ไม่มีนัดหมายใน 7 วันถัดไป");
    else if (deleting) {
      const lines = rows.map((row) => `• ${row.title} (${row.startOn || formatDateTime(row.startAt!).slice(0, 10)})`);
      say(`📅 รายชื่อนัดหมายทั้งหมด:\n\n${lines.join('\n')}\n\n📝 พิมพ์ชื่อพร้อมวันที่ เช่น:\nประชุมงบประมาณ 2025-07-06`);
      step = "await_delete_event"; data = {};
    } else {
      messages.push({ type: "flex", altText: "นัดหมาย 7 วันถัดไป", contents: { type: "carousel", contents: rows.map((row) => createEventCard({ title: row.title, start: row.startAt || new Date(`${row.startOn}T00:00:00+07:00`), end: row.endAt || new Date(new Date(`${row.endOn}T00:00:00+07:00`).getTime() + 86_400_000) })) } });
    }
  } else if (msg.startsWith("ลบ :") || step === "await_delete_event" && msg) {
    const direct = msg.startsWith("ลบ :");
    const match = direct ? null : /^(.+)\s+(\d{4}-\d{2}-\d{2})$/.exec(msg);
    if (!direct && !match) say("❌ รูปแบบไม่ถูกต้อง: ชื่อกิจกรรม วันที่ (เช่น ประชุมงบประมาณ 2025-07-06)");
    else {
      const title = direct ? msg.slice("ลบ :".length).trim() : match![1].trim();
      const startDate = sql`coalesce(to_char(${lineCalendarEvents.startAt} at time zone 'Asia/Bangkok', 'YYYY-MM-DD'), ${lineCalendarEvents.startOn}::text)`;
      const rows = await tx.select().from(lineCalendarEvents).where(and(eq(lineCalendarEvents.employeeId, actor.employeeId), eq(lineCalendarEvents.title, title), eq(lineCalendarEvents.status, "synced"), isNull(lineCalendarEvents.leaveRequestId), ...(!direct ? [sql`${startDate} = ${match![2]}`] : []))).limit(2).for("update");
      if (!rows.length) say(direct ? `❌ ไม่พบนัดหมาย "${title}"` : `❌ ไม่พบนัดหมาย "${title}" ในวันที่ ${match![2]}`);
      else if (rows.length > 1) say("⚠️ พบนัดหมายชื่อซ้ำ กรุณาพิมพ์ ลบนัดหมาย แล้วระบุชื่อพร้อมวันที่ให้ชัดเจน");
      else {
        const row = rows[0];
        await tx.update(lineCalendarEvents).set({ status: "deleting" }).where(eq(lineCalendarEvents.id, row.id));
        await enqueue(tx, `event:${row.id}:delete`, "calendar.delete", { eventId: row.id, notifyTo: uid, employeeId: actor.employeeId, successMessage: `✅ ลบนัดหมาย "${row.title}" เรียบร้อยแล้ว` });
        step = "idle"; data = {};
      }
    }
  } else if (action.action === "delete_event") {
    const id = z.string().uuid().safeParse(action.id);
    if (!id.success) say("รายการไม่ถูกต้อง");
    else {
      const [row] = await tx.select().from(lineCalendarEvents).where(and(eq(lineCalendarEvents.id, id.data), eq(lineCalendarEvents.employeeId, actor.employeeId))).for("update");
      if (!row || row.leaveRequestId || ["deleted", "deleting"].includes(row.status)) say("ไม่มีสิทธิ์ลบหรือรายการถูกลบแล้ว");
      else { await tx.update(lineCalendarEvents).set({ status: "deleting" }).where(eq(lineCalendarEvents.id, row.id)); await enqueue(tx, `event:${row.id}:delete`, "calendar.delete", { eventId: row.id }); say("รับคำขอลบนัดหมายแล้ว"); }
    }
  } else if (msg === "วิธีใช้งาน") {
    say("📌 วิธีใช้งาน:\n1.ลงทะเบียนก่อน\n2.กดเมนูลางาน หรือสร้างนัดหมายตามขั้นตอนบน Rich Menu ครับ");
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
