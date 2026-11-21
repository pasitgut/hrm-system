// @ts-nocheck

function clearState(uid) {
  const props = PropertiesService.getUserProperties();

  props.deleteProperty(uid);

  props.deleteProperty(uid + '_leave_type');
  props.deleteProperty(uid + '_leave_start');
  props.deleteProperty(uid + '_leave_end');
  props.deleteProperty(uid + '_leave_reason');
  props.deleteProperty(uid + '_is_submitting');

  props.deleteProperty(uid + '_pending_action');
}

function handleCancelCommand(msg, replyToken, uid) {
  const cancelWords = ['ยกเลิก', 'ออก', 'กลับ'];
  if (cancelWords.includes(msg.toLowerCase().trim())) {
    clearState(uid);
    reply(replyToken, '✅ ยกเลิกรายการแล้ว');
    return true;
  }
  return false;
}

function registerUserByEmpCode(uid, empCode) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ข้อมูลพนักงาน');
  if (!sheet) return { success: false };

  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][11] === uid) {
      return { success: false, alreadyRegistered: true, name: values[i][0] };
    }
  }

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1]) === String(empCode)) {
      sheet.getRange(i + 1, 12).setValue(uid);
      return { success: true, name: values[i][0] };
    }
  }
  return { success: false };
}

function getUserName(uid) {
  const employee = getEmployeeByLineUid(uid);

  if (employee) {
    return employee.name;
  }

  const regSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('register');

  if (regSheet) {
    const values = regSheet.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === uid) {
        return values[i][1];
      }
    }
  }

  return "ผู้ใช้ (" + uid.substring(0, 5) + ")";
}
function getEmpCode(uid) {
  const employee = getEmployeeByLineUid(uid);
  return employee ? employee.empCode : null;
}

function getUpcomingEvents(days) {
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  const now = new Date();
  const end = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
  return calendar.getEvents(now, end).map(event => ({
    title: event.getTitle(),
    start: event.getStartTime(),
    end: event.getEndTime()
  }));
}

function getLineUidByEmpCode(empCode) {
  if (String(empCode).startsWith('U') && String(empCode).length > 20) return empCode;
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ข้อมูลพนักงาน');
  if (!sheet) return null;
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] == empCode) {
      const lineId = values[i][11];
      if (lineId && String(lineId).startsWith('U')) return lineId;
    }
  }
  return null;
}

function getAdminEmail(uid) {
  const empSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ข้อมูลพนักงาน');
  if (empSheet) {
    const values = empSheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][11] === uid) {
        const email = values[i][4];
        if (email && email.toString().trim() !== '') return email;
      }
    }
  }
  return 'LINE-Bot';
}


function getEmployeeByLineUid(uid) {
  const sheet = SpreadsheetApp
    .openById(SHEET_ID)
    .getSheetByName('ข้อมูลพนักงาน');

  if (!sheet) return null;

  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    const lineId = String(values[i][11] || '').trim();

    if (lineId === String(uid).trim()) {
      return {
        row: i + 1,
        name: values[i][0],
        empCode: values[i][1],
        email: values[i][4],
        lineId: values[i][11]
      };
    }
  }

  return null;
}

function isRegistered(uid) {
  return getEmployeeByLineUid(uid) !== null;
}


function requestRegistration(uid, replyToken, pendingAction) {
  const props = PropertiesService.getUserProperties();

  props.setProperty(uid, 'await_register_emp_code');

  if (pendingAction) {
    props.setProperty(uid + '_pending_action', pendingAction);
  }

  reply(
    replyToken,
    '⚠️ ยังไม่พบข้อมูลการลงทะเบียนของคุณ\n\n' +
    '📌 กรุณาพิมพ์ "รหัสพนักงาน" ของคุณเพื่อเชื่อมต่อบัญชี LINE ก่อนครับ'
  );
}


function startLeaveFlow(uid) {
  push(uid, getLeaveTypeFlex());
}

function formatDateTime(date) { return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"); }
function formatDate(date) { return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd"); }