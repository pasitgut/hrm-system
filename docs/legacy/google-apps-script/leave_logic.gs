// @ts-nocheck

function handlePostback(event) {
  const uid = event.source.userId;
  const data = JSON.parse(event.postback.data);
  const props = PropertiesService.getUserProperties();

  if (data.action === 'cancel_leave_by_user') {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ข้อมูลการลา');
    if (sheet) {
      const currentRowStatus = sheet.getRange(data.row, 8).getValue();

      if (currentRowStatus === 'อนุมัติแล้ว' || currentRowStatus === 'ไม่อนุมัติ') {
        reply(event.replyToken, `⚠️ กรุณาทำรายการใหม่ เนื่องจากแอดมินได้ทำการ "${currentRowStatus}" ใบลาใบนี้ไปเรียบร้อยแล้วครับ`);
        return;
      }

      if (currentRowStatus === 'ยกเลิกแล้ว') {
        reply(event.replyToken, `⚠️ ใบลาใบนี้ถูกยกเลิกไปก่อนหน้านี้แล้วครับ`);
        return;
      }

      sheet.getRange(data.row, 8).setValue('ยกเลิกแล้ว');
      const cancelTimeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm น.");
      sheet.getRange(data.row, 11).setValue(`พนักงานยกเลิกเอง|${cancelTimeStr}`);

      reply(event.replyToken, `✅ ยกเลิกคำขอลาเรียบร้อยแล้วครับ`);

      ADMIN_IDS.forEach(adminId => {
        push(adminId, `🔔 ใบลาแถวที่ (L${data.row}) ของคุณ ${getUserName(uid)} ได้ถูกผู้ขอยกเลิกรายการแล้ว`);
      });
    }
    return;
  }

  if (data.action === 'select_type') {
    props.setProperty(uid + '_leave_type', data.type);
    push(uid, getDateTimePickerFlex());
  }

  if (data.action === 'pick_start') {
    const selectedDateTime = event.postback.params.datetime;
    props.setProperty(uid + '_leave_start', selectedDateTime);

    const formattedDate = Utilities.formatDate(new Date(selectedDateTime), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm น.");
    reply(event.replyToken, `✅ บันทึกเวลาเริ่มลาแล้ว\n📅 วันเวลาที่เลือก: ${formattedDate}`);
  }

  if (data.action === 'pick_end') {
    const selectedDateTime = event.postback.params.datetime;
    props.setProperty(uid + '_leave_end', selectedDateTime);

    const formattedDate = Utilities.formatDate(new Date(selectedDateTime), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm น.");
    replyFlex(event.replyToken, [
      {
        type: 'text',
        text: `✅ บันทึกเวลาสิ้นสุดลาแล้ว\n📅 วันเวลาที่เลือก: ${formattedDate}`
      },
      {
        type: 'text',
        text: `📝 กรุณาพิมพ์ "เหตุผลการลา" ของคุณส่งกลับมาในแชทนี้ครับ`,
        quickReply: {
          items: [
            {
              type: "action",
              action: {
                type: "message",
                label: "❌ ไม่ระบุเหตุผล",
                text: "ไม่ระบุเหตุผล"
              }
            }
          ]
        }
      }
    ])
    props.setProperty(uid, 'await_leave_reason');
  }

  if (data.action === 'submit_leave') {
    if (props.getProperty(uid + '_is_submitting') === 'true') {
      reply(event.replyToken, '⏳ ระบบกำลังประมวลผลคำขอของคุณ กรุณารอสักครู่ครับ...');
      return;
    }

    const type = props.getProperty(uid + '_leave_type');
    const start = props.getProperty(uid + '_leave_start');
    const end = props.getProperty(uid + '_leave_end');
    const reason = props.getProperty(uid + '_leave_reason') || 'ไม่ได้ระบุเหตุผล';

    if (!type || !start || !end) {
      reply(event.replyToken, '❌ ไม่พบข้อมูลการลา หรือคุณอาจจะส่งคำขอไปแล้ว กรุณาเริ่มทำรายการใหม่อีกครั้งครับ');
      return;
    }

    props.setProperty(uid + '_is_submitting', 'true');

    try {
      const name = getUserName(uid);
      const empCode = getEmpCode(uid);
      const startDate = new Date(start);
      const endDate = new Date(end);
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ข้อมูลการลา');
      const row = sheet.getLastRow() + 1;

      sheet.appendRow([
        name, type, 'ลาเต็มวัน', Utilities.formatDate(new Date(startDate), Session.getScriptTimeZone(), "d/MM/yyyy"), Utilities.formatDate(new Date(endDate), Session.getScriptTimeZone(), "d/MM/yyyy"),
        reason, '', 'ยังไม่ได้ยืนยัน', empCode, 'unseen', '', '', 'Line'
      ]);

      notifyAdminLeaveRequest(row, name, type, start, end);

      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);
      const cancelData = JSON.stringify({ action: "cancel_leave_by_user", row: row });

      sendUserLeaveSuccessFlex(event.replyToken, type, startDateStr, endDateStr, 'Line', reason, cancelData);

    } catch (error) {
      console.error("Submit Leave Error: " + error);
      reply(event.replyToken, '⚠️ เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
    } finally {
      clearState(uid);
    }
    return;
  }

  if (data.action === 'event_submit') {
    const start = props.getProperty(uid + '_event_start');
    const end = props.getProperty(uid + '_event_end');
    const title = props.getProperty(uid + '_event_title');
    CalendarApp.getCalendarById(CALENDAR_ID).createEvent(title, new Date(start), new Date(end));
    reply(event.replyToken, `📅 บันทึกนัดหมาย "${title}" แล้ว`);
    props.deleteProperty(uid + '_event_start');
    props.deleteProperty(uid + '_event_end');
    props.deleteProperty(uid + '_event_title');
  }

  // if (data.action === 'event_pick_start') { props.setProperty(uid + '_event_start', event.postback.params.datetime); reply(event.replyToken, `✅ บันทึกเวลาเริ่มนัดหมายแล้ว`); }
  // if (data.action === 'event_pick_end') { props.setProperty(uid + '_event_end', event.postback.params.datetime); reply(event.replyToken, `✅ บันทึกเวลาสิ้นสุดนัดหมายแล้ว`); }
  if (data.action === 'event_pick_start') {
    const selectedDateTime = event.postback.params.datetime;
    props.setProperty(uid + '_event_start', selectedDateTime); // แก้จาก _event_end เป็น _event_start
    const formattedDate = Utilities.formatDate(new Date(selectedDateTime), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm น.");
    reply(event.replyToken, `✅ บันทึกเวลาเริ่มนัดหมายแล้ว\n📅 วันเวลาที่เลือก: ${formattedDate}`);
  }
  if (data.action === 'event_pick_end') {
    const selectedDateTime = event.postback.params.datetime;
    props.setProperty(uid + '_event_end', selectedDateTime);
    const formattedDate = Utilities.formatDate(new Date(selectedDateTime), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm น.");

    replyFlex(event.replyToken, [
      {
        type: 'text',
        text: `✅ บันทึกเวลาสิ้นสุดนัดหมายแล้ว\n📅 วันเวลาที่เลือก: ${formattedDate}`
      },
      {
        type: 'text',
        text: `📝 กรุณาพิมพ์ "ชื่อสถานที่ หรือ Link" ของคุณส่งกลับมาในแชทนี้ครับ`,
        quickReply: {
          items: [
            {
              type: "action",
              action: {
                type: "message",
                label: "❌ ไม่ระบุสถานที่",
                text: "ไม่ระบุสถานที่"
              }
            }
          ]
        }
      }
    ]);
    // ย้ายมากำหนด State ตรงนี้ เพื่อบอกระบบว่า ข้อความถัดไปที่ผู้ใช้พิมพ์คือ สถานที่
    props.setProperty(uid, 'await_event_location');
  }
}

function approveLeave(row, adminId) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ข้อมูลการลา');
  if (!sheet) return;

  const currentStatus = sheet.getRange(row, 8).getValue();
  if (currentStatus === 'ยกเลิกแล้ว') {
    push(adminId, `⚠️ ไม่สามารถอนุมัติได้: พนักงานได้ทำการ "ยกเลิกคำขอลา" ใบนี้ไปเรียบร้อยแล้ว`);
    return;
  }
  if (currentStatus === 'อนุมัติแล้ว' || currentStatus === 'ไม่อนุมัติ') {
    push(adminId, `⚠️ รายการนี้เคยได้รับการพิจารณาไปแล้ว (สถานะปัจจุบัน: ${currentStatus})`);
    return;
  }

  const adminName = getUserName(adminId);
  const adminEmail = getAdminEmail(adminId);
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  const approvalTimeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm น.");
  const approverInfo = `${adminName}|${dateStr}|${adminEmail}`;

  sheet.getRange(row, 8).setValue('อนุมัติแล้ว');
  sheet.getRange(row, 11).setValue(approverInfo);

  const data = sheet.getRange(row, 1, 1, 9).getValues()[0];
  const [userName, type, , start, end, , , , empCode] = data;

  const eventDescription = `ประเภทการลา: ${type}\nผู้ลา: ${userName}\nสถานะ: อนุมัติแล้ว\nอนุมัติโดย: ${adminName}\nเวลาอนุมัติ: ${approvalTimeStr}`;
  const startDate = new Date(start);
  const endDate = new Date(end);
  endDate.setDate(endDate.getDate() + 1);
  try {
    CalendarApp.getCalendarById(CALENDAR_ID).createAllDayEvent(
      `${type} - ${userName}`,
      startDate,
      endDate,
      { description: eventDescription }
    );
  } catch (e) {
    console.error("Calendar Error: " + e);
  }


  const targetUid = getLineUidByEmpCode(empCode);

  if (targetUid) sendLeaveResultFlex(targetUid, 'อนุมัติแล้ว', type, userName, start, end, adminName);
  sendLeaveResultFlex(adminId, 'อนุมัติแล้ว', type, userName, start, end, adminName);
}

function rejectLeave(row, adminId) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ข้อมูลการลา');
  if (!sheet) return;

  const currentStatus = sheet.getRange(row, 8).getValue();
  if (currentStatus === 'ยกเลิกแล้ว') {
    push(adminId, `⚠️ ไม่สามารถปฏิเสธได้: พนักงานได้ทำการ "ยกเลิกคำขอลา" ใบนี้ไปเรียบร้อยแล้ว`);
    return;
  }
  if (currentStatus === 'อนุมัติแล้ว' || currentStatus === 'ไม่อนุมัติ') {
    push(adminId, `⚠️ รายการนี้เคยได้รับการพิจารณาไปแล้ว (สถานะปัจจุบัน: ${currentStatus})`);
    return;
  }

  const adminName = getUserName(adminId);
  const adminEmail = getAdminEmail(adminId);
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  const approverInfo = `${adminName}|${dateStr}|${adminEmail}`;

  sheet.getRange(row, 8).setValue('ไม่อนุมัติ');
  sheet.getRange(row, 11).setValue(approverInfo);

  const data = sheet.getRange(row, 1, 1, 9).getValues()[0];
  const [userName, type, , start, end, , , , empCode] = data;

  const targetUid = getLineUidByEmpCode(empCode);

  if (targetUid) sendLeaveResultFlex(targetUid, 'ไม่อนุมัติ', type, userName, start, end, adminName);
  sendLeaveResultFlex(adminId, 'ไม่อนุมัติ', type, userName, start, end, adminName);
}

function getLeaveStatistics(empCode, year) {
  let sickDays = 0;
  let personalDays = 0;
  let birthdayDays = 0;

  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ข้อมูลการลา');
    if (!sheet) return { sick: "0 วัน", personal: "0 / 6 วัน", birthday: "0 / 1 วัน" };

    const values = sheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
      if (!values[i][8] || !values[i][3]) continue;

      const rowEmpCode = String(values[i][8]).trim();
      const status = String(values[i][7]).trim();
      const leaveType = String(values[i][1]).trim();

      let rowYear = "";
      if (values[i][3] instanceof Date) {
        rowYear = values[i][3].getFullYear().toString();
      } else {
        rowYear = String(values[i][3]);
      }

      if (rowEmpCode === String(empCode).trim() && status === 'อนุมัติแล้ว' && rowYear.includes(year)) {
        let durationDays = 1;

        if (values[i][3] instanceof Date && values[i][4] instanceof Date) {
          const startDate = values[i][3];
          const endDate = values[i][4];
          const timeDiff = endDate.getTime() - startDate.getTime();
          const diffDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
          durationDays = diffDays >= 0 ? diffDays + 1 : 1;
        }

        // สะสมจำนวนวันตามประเภทการลา
        if (leaveType === 'ลาป่วย') {
          sickDays += durationDays;
        }
        if (leaveType === 'ลากิจ') {
          personalDays += durationDays;
        }
        if (leaveType === 'ลาวันเกิด' || leaveType === 'Birthday Leave') {
          birthdayDays += durationDays;
        }
      }
    }
  } catch (e) {
    console.error("สถิติขัดข้อง: " + e);
  }

  // 🌟 ปรับ Format ผลลัพธ์ตามที่ระบุ
  return {
    sick: `${sickDays} วัน`,
    personal: `${personalDays} / 6 วัน`,
    birthday: `${birthdayDays} / 1 วัน`
  };
}