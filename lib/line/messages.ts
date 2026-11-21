// Flex payloads ported from docs/legacy/google-apps-script/line_messaging.gs.
// Keep visible fields unchanged; only hidden DB IDs, revisions and draft tokens differ.

export function buildTextMessages(value: string) {
  const messages: { type: "text"; text: string }[] = [];
  let chunk = "";
  for (const character of value) {
    if (chunk.length + character.length > 4900) { messages.push({ type: "text", text: chunk }); chunk = ""; }
    chunk += character;
  }
  if (chunk) messages.push({ type: "text", text: chunk });
  return messages;
}

export function formatDateTime(value: Date | string, style: "iso" | "display" = "iso") {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (key: string) => parts.find((item) => item.type === key)!.value;
  const day = style === "display" ? `${part("day")}/${part("month")}/${part("year")}` : `${part("year")}-${part("month")}-${part("day")}`;
  return `${day} ${part("hour")}:${part("minute")}`;
}
function formatDate(value: Date | string) { return formatDateTime(value).slice(0, 10); }
function withDraft<T>(message: T, draft: string): T {
  function visit(value: any) {
    if (!value || typeof value !== "object") return;
    if (["postback", "datetimepicker"].includes(value.type) && value.data && draft) value.data = JSON.stringify({ ...JSON.parse(value.data), draft });
    Object.values(value).forEach((item) => Array.isArray(item) ? item.forEach(visit) : visit(item));
  }
  visit(message); return message;
}

export function getLeaveTypeFlex(draft = "") {
  return withDraft({
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
  }, draft);
}

export function getDateTimePickerFlex(draft = "") {
  return withDraft({
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
  }, draft);
}

export function getEventDateTimeFlex(draft = "") {
  return withDraft({
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
  }, draft);
}

export function getLeaveConfirmationFlex(input: { type: string; start: string; end: string; reason: string }, draft = "") {
  const { type, start, end, reason } = input;
  const startDateStr = formatDateTime(start, "display");
  const endDateStr = formatDateTime(end, "display");

  return withDraft({
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
  }, draft);
}

export function buildUserLeaveSuccessFlex( type, startDateStr, endDateStr, channel, remark, cancelData) {
  return {
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
  };
}

export type LeaveStatistics = { sick: string; personal: string; birthday: string };
export function buildAdminLeaveRequestFlex(input: { reference: string; id: string; version: string; name: string; type: string; start: string; end: string; session: string; reason: string; employeeCode: string; channel: string; year: string; stats: LeaveStatistics }) {
  const { reference: row, name, type, start, end, session: leaveHalfDay, reason: leaveRemark, employeeCode: empCode, channel: notifyChannel, year: currentYear, stats } = input;
  const startDateStr = start.split('T')[0];
  const endDateStr = end.split('T')[0];
  const approveData = JSON.stringify({ action: "approve_leave", id: input.id, version: input.version });
  const rejectData = JSON.stringify({ action: "reject_leave", id: input.id, version: input.version });

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

  return payload;
}

export function buildLeaveResultFlex( status, type, userName, start, end, adminName) {
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
  return payload;
}

export function createEventCard(event) {
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
