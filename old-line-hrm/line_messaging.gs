// @ts-nocheck

function reply(token, msg) {
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + LINE_TOKEN },
      payload: JSON.stringify({ replyToken: token, messages: [{ type: 'text', text: msg }] })
    });
  } catch (e) { console.error("Reply Error: " + e); }
}

function push(uid, msg) {
  if (!uid || uid === '') return;
  const messagePayload = typeof msg === 'string' ? [{ type: 'text', text: msg }] : [msg];
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + LINE_TOKEN },
      payload: JSON.stringify({ to: uid, messages: messagePayload })
    });
  } catch (e) { console.error(`Push Error (UID: ${uid}): ` + e); }
}

function replyFlex(token, messages) {
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + LINE_TOKEN },
      payload: JSON.stringify({ replyToken: token, messages: Array.isArray(messages) ? messages : [messages] })
    });
  } catch (e) { console.error("ReplyFlex Error: " + e); }
}

function getLeaveTypeFlex() {
  return {
    type: 'flex', altText: 'เลือกประเภทการลา',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        contents: [{ type: 'text', text: 'เลือกประเภทการลา', weight: 'bold', size: 'lg', color: '#000000' }]
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', 
        contents: ['ลากิจ', 'ลาป่วย', 'ลาวันเกิด'].map(t => ({
          type: 'button', style: 'primary', color: '#6c5ce7', height: 'md',
          action: { type: 'postback', label: t, data: JSON.stringify({ action: 'select_type', type: t }) }
        }))
      }
    }
  };
}

function getDateTimePickerFlex() {
  return {
    type: 'flex', altText: 'เลือกวันและเวลา',
    contents: {
      type: 'bubble', body: {
        type: 'box', layout: 'vertical', spacing: 'md', contents: [
          { type: 'text', text: '📅 เลือกเวลาเริ่มและสิ้นสุด', weight: 'bold' },
          { type: 'button', style: 'primary', color: "#b5b5b5", action: { type: 'datetimepicker', label: 'เวลาเริ่มลา', data: JSON.stringify({ action: 'pick_start' }), mode: 'datetime' } },
          { type: 'button', style: 'primary', color: "#b5b5b5", action: { type: 'datetimepicker', label: 'เวลาสิ้นสุดลา', data: JSON.stringify({ action: 'pick_end' }), mode: 'datetime' } }
        ]
      }
    }
  };
}

function getLeaveConfirmationFlex(uid) {
  const props = PropertiesService.getUserProperties();
  const type = props.getProperty(uid + '_leave_type');
  const start = props.getProperty(uid + '_leave_start');
  const end = props.getProperty(uid + '_leave_end');
  const reason = props.getProperty(uid + '_leave_reason');

  const startDateStr = Utilities.formatDate(new Date(start), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  const endDateStr = Utilities.formatDate(new Date(end), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");

  return {
    type: 'flex', altText: 'ตรวจสอบข้อมูลการลาของคุณ',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: '🔍 ตรวจสอบความถูกต้องข้อมูล', weight: 'bold', size: 'md' },
          { type: "separator" },
          {
            type: "box", layout: "vertical", spacing: "xs", contents: [
              { type: 'text', text: `• ประเภท: ${type}`, size: 'sm' },
              { type: 'text', text: `• เริ่มลา: ${startDateStr} น.`, size: 'sm' },
              { type: 'text', text: `• สิ้นสุด: ${endDateStr} น.`, size: 'sm' },
              { type: 'text', text: `• เหตุผล: ${reason}`, size: 'sm', wrap: true }
            ]
          },
          { type: 'button', style: 'secondary', color: "#61e761", action: { type: 'postback', label: '🚀 ยืนยันส่งคำขอลา', data: JSON.stringify({ action: 'submit_leave' }) } }
        ]
      }
    }
  };
}

function sendUserLeaveSuccessFlex(replyToken, type, startDateStr, endDateStr, channel, remark, cancelData) {
  replyFlex(replyToken, {
    type: "flex", altText: `📝 ยื่นคำขอลาสำเร็จเรียบร้อยแล้ว!`,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", paddingAll: "20px",
        contents: [
          { type: "text", text: "📝 ยื่นคำขอลาสำเร็จ", weight: "bold", size: "lg", color: "#222222" },
          {
            type: "box", layout: "horizontal", margin: "md", contents: [
              { type: "text", text: "สถานะ:", size: "sm", color: "#888888", flex: 3 },
              { type: "text", text: "รอการอนุมัติ", size: "sm", weight: "bold", color: "#f39c12", flex: 7 }
            ]
          },
          { type: "separator", margin: "md" },
          {
            type: "box", layout: "vertical", margin: "md", spacing: "sm",
            contents: [
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ประเภท:", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: String(type), size: "sm", color: "#333333", flex: 7 }] },
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "วันที่ลา:", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: `${startDateStr} ถึง ${endDateStr}`, size: "sm", color: "#333333", flex: 7 }] },
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ช่องทางแจ้ง:", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: String(channel), size: "sm", color: "#333333", flex: 7 }] },
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "หมายเหตุ:", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: String(remark), size: "sm", color: "#333333", flex: 7, wrap: true }] }
            ]
          },
          { type: "separator", margin: "md" },
          { type: "text", text: "ระบบได้ส่งใบลาของคุณไปยังหัวหน้าเรียบร้อยแล้ว หากต้องการยกเลิกคำขอนี้ สามารถกดปุ่มด้านล่างได้ทันทีครับ", size: "xs", color: "#777777", wrap: true, margin: "md" }
        ]
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{ type: "button", style: "secondary", color: "#ff4d4d", height: "sm", action: { type: "postback", label: "❌ ยกเลิกคำขอลาคราวนี้", data: cancelData } }]
      }
    }
  });
}

function notifyAdminLeaveRequest(row, name, type, start, end) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ข้อมูลการลา');
  if (!sheet) return;

  // ดึงข้อมูลแถวนั้นมาทั้งหมด 13 คอลัมน์ (เพื่อเอาถึงคอลัมน์ M)
  const values = sheet.getRange(row, 1, 1, 13).getValues()[0];
  const leaveHalfDay = values[2] || "ลาเต็มวัน";
  const leaveRemark = values[5] || "ไม่ได้ระบุเหตุผล"; // เหตุผลลาถูกย้ายมาเรียกเก็บเป็นหมายเหตุแทน
  const empCode = values[8];
  const notifyChannel = values[12] || "Line"; // ดึงข้อมูลคอลัมน์ M (Index 12)

  const currentYear = "2026";
  const stats = getLeaveStatistics(empCode, currentYear);

  const startDateStr = (start instanceof Date) ? formatDate(start) : String(start).split('T')[0];
  const endDateStr = (end instanceof Date) ? formatDate(end) : String(end).split('T')[0];

  const approveData = '{"action":"approve_leave","row":' + row + '}';
  const rejectData = '{"action":"reject_leave","row":' + row + '}';

  const payload = {
    type: "flex", altText: "📩 ใบลาใหม่รออนุมัติ: " + name,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", paddingAll: "20px",
        contents: [
          { type: "box", layout: "horizontal", contents: [{ type: "text", text: "📝 ใบลาใหม่รออนุมัติ", weight: "bold", size: "lg", color: "#222222", flex: 0 }, { type: "text", text: "(L" + row + ")", size: "xs", color: "#888888", align: "end", gravity: "bottom" }] },
          { type: "separator", margin: "md" },
          { type: "box", layout: "vertical", margin: "md", contents: [{ type: "text", text: String(name), weight: "bold", size: "md", color: "#111111" }, { type: "text", text: "รหัส: " + String(empCode), size: "sm", color: "#777777" }] },
          { type: "separator", margin: "md" },
          {
            type: "box", layout: "vertical", margin: "md", spacing: "sm",
            contents: [
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "วันที่", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: startDateStr + " - " + endDateStr, size: "sm", color: "#333333", flex: 7 }] },
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ประเภท", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: String(type), size: "sm", color: "#333333", flex: 7 }] },
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ระยะเวลา", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: String(leaveHalfDay), size: "sm", color: "#333333", flex: 7 }] },
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ช่องทางแจ้ง", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: String(notifyChannel), size: "sm", color: "#333333", flex: 7 }] },
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "หมายเหตุ", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: String(leaveRemark), size: "sm", color: "#333333", flex: 7, wrap: true }] }
            ]
          },
          { type: "separator", margin: "md" },
          {
            type: "box", layout: "vertical", margin: "md", spacing: "xs",
            contents: [
              { type: "text", text: "สถิติลาปีนี้ (" + currentYear + ")", weight: "bold", size: "sm", color: "#555555" },
              { type: "box", layout: "horizontal", margin: "xs", contents: [{ type: "text", text: "ลาป่วย", size: "sm", color: "#666666" }, { type: "text", text: String(stats.sick), size: "sm", color: "#222222", align: "end" }] },
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ลากิจ", size: "sm", color: "#666666" }, { type: "text", text: String(stats.personal), size: "sm", color: "#222222", align: "end" }] },
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ลาวันเกิด", size: "sm", color: "#666666" }, { type: "text", text: String(stats.birthday), size: "sm", color: "#222222", align: "end" }] }
            ]
          }
        ]
      },
      footer: {
        type: "box", layout: "horizontal", spacing: "md",
        contents: [
          { type: "button", style: "primary", color: "#56e670", height: "sm", action: { type: "postback", label: "อนุมัติ", data: approveData } },
          { type: "button", style: "primary", color: "#cdcdcd", height: "sm", action: { type: "postback", label: "ปฏิเสธ", data: rejectData } }
        ]
      }
    }
  };

  try { ADMIN_IDS.forEach(adminId => { push(adminId, payload); }); } catch (e) { console.error("Notify Admin Error: " + e); }
}

function sendLeaveResultFlex(toUid, status, type, userName, start, end, adminName) {
  const isApproved = (status === 'อนุมัติแล้ว');
  const statusColor = isApproved ? '#2ecc71' : '#e74c3c';
  const statusIcon = isApproved ? '✅' : '❌';

  const startDateStr = (start instanceof Date) ? formatDate(start) : String(start).split('T')[0];
  const endDateStr = (end instanceof Date) ? formatDate(end) : String(end).split('T')[0];

  const payload = {
    type: "flex", altText: `${statusIcon} ผลการลางานของคุณ: ${status}`,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", paddingAll: "20px",
        contents: [
          { type: "text", text: `${statusIcon} แจ้งผลการลางาน`, weight: "bold", size: "lg", color: "#222222" },
          { type: "box", layout: "horizontal", margin: "md", contents: [{ type: "text", text: "สถานะ:", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: status, size: "sm", weight: "bold", color: statusColor, flex: 7 }] },
          { type: "separator", margin: "md" },
          {
            type: "box", layout: "vertical", margin: "md", spacing: "sm",
            contents: [
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ผู้ขอลา", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: String(userName), size: "sm", color: "#333333", flex: 7 }] },
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ประเภท", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: String(type), size: "sm", color: "#333333", flex: 7 }] },
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "วันที่ลา", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: `${startDateStr} ถึง ${endDateStr}`, size: "sm", color: "#333333", flex: 7 }] },
              { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ผู้ดำเนินการ", size: "sm", color: "#888888", flex: 3 }, { type: "text", text: String(adminName), size: "sm", color: "#333333", flex: 7 }] }
            ]
          }
        ]
      }
    }
  };
  try { push(toUid, payload); } catch (e) { console.error("Send Leave Result Flex Error: " + e); }
}

function getEventDateTimeFlex() {
  return {
    type: 'flex', altText: 'เลือกเวลานัดหมาย',
    contents: {
      type: 'bubble', body: {
        type: 'box', layout: 'vertical', spacing: 'md', contents: [
          { type: 'text', text: '📅 เลือกเวลานัดหมาย', weight: 'bold' },
          { type: 'button', style: 'primary', color: "#b5b5b5", action: { type: 'datetimepicker', label: 'เวลาเริ่ม', data: JSON.stringify({ action: 'event_pick_start' }), mode: 'datetime' } },
          { type: 'button', style: 'primary', color: "#b5b5b5", action: { type: 'datetimepicker', label: 'เวลาจบ', data: JSON.stringify({ action: 'event_pick_end' }), mode: 'datetime' } },
          // { type: 'button', style: 'secondary', color: "#61e761", action: { type: 'postback', label: 'บันทึกนัดหมาย', data: JSON.stringify({ action: 'event_submit' }) } }
        ]
      }
    }
  };
}



function createEventCard(event) {
  return {
    type: "bubble", size: "deca", body: {
      type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "text", text: `${event.title}`, weight: "bold" },
        { type: "text", text: `⏰ เริ่ม: ${formatDateTime(event.start)}`, size: "sm" },
        { type: "text", text: `⏰ จบ: ${formatDateTime(event.end)}`, size: "sm" },
        { type: "button", style: "primary", color: "#ff5555", action: { type: "message", label: "ลบ", text: `ลบ : ${event.title}` } }
      ]
    }
  };
}