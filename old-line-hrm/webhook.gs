// @ts-nocheck

// 🌟 รับข้อมูลจาก Webapp ด้วย GET Request (แก้ปัญหา CORS)
function doGet(e) {
  if (!e.parameter) return ContentService.createTextOutput("System Online");

  if (e.parameter.action === 'notify_admin_from_web') {
    notifyAdminLeaveRequest(e.parameter.row, e.parameter.name, e.parameter.type, e.parameter.start, e.parameter.end);
    return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
  }

  if (e.parameter.action === 'notify_user_leave_result') {
    const empCode = e.parameter.empCode;
    const status = e.parameter.status;
    const adminName = e.parameter.adminName;
    const type = e.parameter.type;
    const userName = e.parameter.userName;
    const start = e.parameter.start;
    const end = e.parameter.end;

    const targetUid = getLineUidByEmpCode(empCode);
    if (targetUid) {
      if (status === 'อนุมัติแล้ว' || status === 'อนุมัติ') {
        push(targetUid, `✅ คำขอลาของคุณได้รับการอนุมัติจาก ${adminName} แล้ว`);
      } else if (status === 'ไม่อนุมัติ') {
        push(targetUid, `❌ คำขอลาของคุณไม่ได้รับการอนุมัติโดย ${adminName}`);
      }
    }

    if (status === 'อนุมัติแล้ว' || status === 'อนุมัติ') {
      try {
        const approvalTimeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm น.");
        const eventDescription = `ประเภทการลา: ${type}\nผู้ลา: ${userName}\nสถานะ: อนุมัติแล้ว\nอนุมัติโดย: ${adminName}\nเวลาอนุมัติ: ${approvalTimeStr}`;

        CalendarApp.getCalendarById(CALENDAR_ID).createEvent(
          `${type} - ${userName}`,
          new Date(start),
          new Date(end),
          { description: eventDescription }
        );
      } catch (err) {
        console.error("Calendar Error from Webhook: " + err);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput("System Online");
}

// === MAIN ENTRY POINT จาก LINE ===
function doPost(e) {
  if (!e.postData || !e.postData.contents) return;
  const data = JSON.parse(e.postData.contents);

  if (data.action === 'notify_admin_from_web') {
    notifyAdminLeaveRequest(data.row, data.name, data.type, data.start, data.end);
    return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
  }

  if (!data.events || data.events.length === 0) return;

  const event = data.events[0];
  const uid = event.source.userId;

  if (event.type === 'message' && event.message.type === 'text') {
    const msg = event.message.text.trim();
    const state = PropertiesService.getUserProperties().getProperty(uid);

    if (handleCancelCommand(msg, event.replyToken, uid)) return;

    // 🌟 เพิ่มสเตทดักรับสถานที่นัดหมาย
    if (state === 'await_event_location') {
      const locationMsg = (msg === 'ไม่ระบุสถานที่') ? '' : msg;
      const props = PropertiesService.getUserProperties();

      const title = props.getProperty(uid + '_event_title');
      const start = props.getProperty(uid + '_event_start');
      const end = props.getProperty(uid + '_event_end');

      if (!title || !start || !end) {
        reply(event.replyToken, '❌ ไม่พบข้อมูลนัดหมาย กรุณาทำรายการใหม่อีกครั้งครับ');
        clearState(uid);
        return;
      }

      try {
        // สร้างนัดหมายลง Calendar พร้อมระบุสถานที่ (Location)
        CalendarApp.getCalendarById(CALENDAR_ID).createEvent(
          title,
          new Date(start),
          new Date(end),
          { location: locationMsg }
        );

        const timeZone = Session.getScriptTimeZone();
        const formattedStart = Utilities.formatDate(new Date(start), timeZone, "dd/MM/yyyy HH:mm น.");
        const formattedEnd = Utilities.formatDate(new Date(end), timeZone, "dd/MM/yyyy HH:mm น.");
        let successMsg = `📅 บันทึกนัดหมายสำเร็จเรียบร้อยแล้วครับ\n\n`;
        successMsg += `📝 กิจกรรม: ${title}\n`;
        successMsg += `⏳ เริ่ม: ${formattedStart}\n`;
        successMsg += `⌛ สิ้นสุด: ${formattedEnd}`;

        if (locationMsg) {
          successMsg += `\n📍 สถานที่: ${locationMsg}`;
        }
        reply(event.replyToken, successMsg);
      } catch (err) {
        console.error("Create Event Error: " + err);
        reply(event.replyToken, '⚠️ เกิดข้อผิดพลาดในการบันทึกนัดหมาย');
      } finally {
        // เคลียร์ข้อมูลทั้งหมดหลังทำงานเสร็จ
        props.deleteProperty(uid + '_event_title');
        props.deleteProperty(uid + '_event_start');
        props.deleteProperty(uid + '_event_end');
        props.deleteProperty(uid);
      }
      return;
    }

    // ดักรับสเตทรับเหตุผลการลา
    if (state === 'await_leave_reason') {
      const finalMsg = (msg === 'ไม่ระบุเหตุผล') ? 'ไม่ได้ระบุเหตุผล' : msg;
      PropertiesService.getUserProperties().setProperty(uid + '_leave_reason', finalMsg);
      PropertiesService.getUserProperties().deleteProperty(uid);
      push(uid, getLeaveConfirmationFlex(uid));
      return;
    }

    if (msg === 'ลบนัดหมาย') {
      clearState(uid);
      const events = getUpcomingEvents(365);
      if (events.length === 0) {
        reply(event.replyToken, '📭 ไม่มีนัดหมายในปีนี้');
        return;
      }
      const lines = events.map(e => `• ${e.title} (${formatDate(e.start)})`);
      reply(event.replyToken, `📅 รายชื่อนัดหมายทั้งหมด:\n\n${lines.join('\n')}\n\n📝 พิมพ์ชื่อพร้อมวันที่ เช่น:\nประชุมงบประมาณ 2025-07-06`);
      PropertiesService.getUserProperties().setProperty(uid, 'await_delete_event');
      return;
    }

    if (state === 'await_delete_event') {
      const input = msg.trim();
      const match = input.match(/^(.+)\s+(\d{4}-\d{2}-\d{2})$/);
      if (!match) {
        reply(event.replyToken, '❌ รูปแบบไม่ถูกต้อง: ชื่อกิจกรรม วันที่ (เช่น ประชุมงบประมาณ 2025-07-06)');
        return;
      }
      const titleToDelete = match[1].trim();
      const dateToDelete = match[2];
      const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
      const start = new Date(dateToDelete + "T00:00:00");
      const end = new Date(dateToDelete + "T23:59:59");
      const events = calendar.getEvents(start, end);
      const matchEvent = events.find(e => e.getTitle() === titleToDelete);

      if (matchEvent) {
        matchEvent.deleteEvent();
        reply(event.replyToken, `✅ ลบนัดหมาย "${titleToDelete}" เรียบร้อยแล้ว`);
      } else {
        reply(event.replyToken, `❌ ไม่พบนัดหมาย "${titleToDelete}" ในวันที่ ${dateToDelete}`);
      }
      PropertiesService.getUserProperties().deleteProperty(uid);
      return;
    }

    if (msg.startsWith('ลบ :')) {
      const titleToDelete = msg.substring(5).trim();
      const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      const events = calendar.getEvents(start, end);
      const match = events.find(e => e.getTitle() === titleToDelete);
      if (match) {
        match.deleteEvent();
        reply(event.replyToken, `✅ ลบนัดหมาย "${titleToDelete}" เรียบร้อยแล้ว`);
      } else {
        reply(event.replyToken, `❌ ไม่พบนัดหมาย "${titleToDelete}"`);
      }
      return;
    }

    if (msg === 'ลงทะเบียน') {
      clearState(uid);

      const props = PropertiesService.getUserProperties();

      props.setProperty(uid, 'await_register_emp_code');
      props.setProperty(uid + '_pending_action', 'manual_register');

      reply(
        event.replyToken,
        '📌 กรุณาพิมพ์ "รหัสพนักงาน" ของคุณ เพื่อลงทะเบียน'
      );

      return;
    }

    if (state === 'await_register_emp_code') {
      const props = PropertiesService.getUserProperties();

      const empCode = msg.trim();
      const pendingAction =
        props.getProperty(uid + '_pending_action') || 'manual_register';

      const result = registerUserByEmpCode(uid, empCode);

      if (result.success) {

        // เคลียร์ state registration
        props.deleteProperty(uid);
        props.deleteProperty(uid + '_pending_action');

        reply(
          event.replyToken,
          `✅ ลงทะเบียนสำเร็จ!\n` +
          `👤 คุณ ${result.name}\n` +
          `🆔 รหัสพนักงาน: ${empCode}`
        );

        // --------------------------------
        // กลับไปทำ Flow เดิมโดยอัตโนมัติ
        // --------------------------------

        if (pendingAction === 'start_leave') {
          startLeaveFlow(uid);
          return;
        }

        return;
      }

      if (result.alreadyRegistered) {
        props.deleteProperty(uid);
        props.deleteProperty(uid + '_pending_action');

        reply(
          event.replyToken,
          `⚠️ LINE Account นี้ได้ลงทะเบียนไว้แล้ว\n` +
          `👤 ชื่อ: ${result.name}`
        );

        return;
      }

      reply(
        event.replyToken,
        `❌ ไม่พบรหัสพนักงาน "${empCode}" ในระบบ\n\n` +
        `กรุณาตรวจสอบรหัสและพิมพ์ใหม่อีกครั้ง\n` +
        `หรือพิมพ์ "ยกเลิก"`
      );

      return;
    }

    if (msg === 'ส่งคำขอลางาน') {
      clearState(uid);

      const employee = getEmployeeByLineUid(uid);

      // ยังไม่เคยลงทะเบียน
      if (!employee) {
        requestRegistration(
          uid,
          event.replyToken,
          'start_leave'
        );

        return;
      }

      startLeaveFlow(uid);
      return;
    }

    if (msg === 'สร้างนัดหมาย') {
      clearState(uid);
      reply(event.replyToken, '📌 พิมพ์ชื่อนัดหมายของคุณ เช่น:\nประชุมงบประมาณ');
      PropertiesService.getUserProperties().setProperty(uid, 'await_event_title');
      return;
    }

    if (state === 'await_event_title') {
      PropertiesService.getUserProperties().setProperty(uid + '_event_title', msg);
      PropertiesService.getUserProperties().deleteProperty(uid);
      push(uid, getEventDateTimeFlex());
      return;
    }

    if (msg === 'ดูนัดหมาย') {
      const events = getUpcomingEvents(7);
      if (events.length === 0) {
        reply(event.replyToken, '📭 ไม่มีนัดหมายใน 7 วันถัดไป');
        return;
      }
      const bubbles = events.map(event => createEventCard(event));
      replyFlex(event.replyToken, {
        type: "flex",
        altText: "นัดหมาย 7 วันถัดไป",
        contents: { type: "carousel", contents: bubbles.slice(0, 10) }
      });
      return;
    }

    if (msg === "วิธีใช้งาน") {
      reply(event.replyToken, "📌 วิธีใช้งาน:\n1.ลงทะเบียนก่อน\n2.กดเมนูลางาน หรือสร้างนัดหมายตามขั้นตอนบน Rich Menu ครับ");
      return;
    }
  }

  if (event.type === 'postback') {
    const data = JSON.parse(event.postback.data);
    const uid = event.source.userId;
    if (data.action === 'approve_leave') { approveLeave(data.row, uid); return; }
    if (data.action === 'reject_leave') { rejectLeave(data.row, uid); return; }
    handlePostback(event);
  }
}