# Mapping ฟังก์ชัน Google Apps Script ไปยังระบบใหม่

ต้นฉบับครบ 5 ไฟล์อยู่ใน [google-apps-script](legacy/google-apps-script/README.md) โดยไฟล์ config ลบค่าลับแล้ว ตารางนี้ครอบคลุมฟังก์ชันเดิมทั้ง 33 ฟังก์ชัน รวมฟังก์ชัน debug ที่ไม่ได้เป็น flow ผู้ใช้

คำว่า “ย้ายแล้ว” ไม่ได้หมายความว่า Google API, สิทธิ์, legacy data และ transport มีพฤติกรรมเหมือนเดิมทุกจุด รายละเอียดที่ยังต่างอยู่ใน [เอกสารแยก](line-bot-differences.md)

## Webhook

| ฟังก์ชันเดิม | ตำแหน่งใหม่ | สถานะและการเปลี่ยน |
|---|---|---|
| [doGet](legacy/google-apps-script/webhook.gs#L4) | [commands.ts](../lib/leave/commands.ts), [outbox.ts](../lib/line/outbox.ts) | แทนด้วย business commands ของ HRM; ไม่เปิด GET ที่เปลี่ยนข้อมูล/แจ้งผลโดยไม่ตรวจสิทธิ์ |
| [doPost](legacy/google-apps-script/webhook.gs#L53) | [webhook.ts](../lib/line/webhook.ts) receiveWebhook และ [bot.ts](../lib/line/bot.ts) processPendingEvents/processEvent | รับ signed webhook, persist และ route message/postback แทน Apps Script doPost |

## Logic การลา

| ฟังก์ชันเดิม | ตำแหน่งใหม่ | สถานะและการเปลี่ยน |
|---|---|---|
| [handlePostback](legacy/google-apps-script/leave_logic.gs#L3) | [bot.ts](../lib/line/bot.ts) processEvent | type/date/confirm/cancel/event picker ย้ายมาที่ state machine; hidden draft/UUID/revision กันปุ่มเก่าทำงานผิดรายการ |
| [approveLeave](legacy/google-apps-script/leave_logic.gs#L178) | [commands.ts](../lib/leave/commands.ts) decideLeave + enqueueLeaveChange | approved transaction, แจ้งผล Flex ถึงพนักงานและผู้พิจารณา, Calendar job พร้อมรายละเอียดอนุมัติ |
| [rejectLeave](legacy/google-apps-script/leave_logic.gs#L226) | [commands.ts](../lib/leave/commands.ts) decideLeave | rejected transaction และ Flex ผลพิจารณาแบบเดิม |
| [getLeaveStatistics](legacy/google-apps-script/leave_logic.gs#L257) | [statistics.ts](../lib/line/statistics.ts) getLeaveStatistics | นับ approved ตามปีจาก leave_requests; ใช้ leave_types/entitledQuotaDays ของ HRM สำหรับโควตา |

## Helpers

| ฟังก์ชันเดิม | ตำแหน่งใหม่ | สถานะและการเปลี่ยน |
|---|---|---|
| [clearState](legacy/google-apps-script/helpers.gs#L3) | [bot.ts](../lib/line/bot.ts) processEvent | reset step/data ใน line_bot_states ภายใน transaction |
| [handleCancelCommand](legacy/google-apps-script/helpers.gs#L17) | [bot.ts](../lib/line/bot.ts) global cancel branch | ยกเลิก/ออก/กลับ ก่อนตรวจรหัสหรือ state พร้อมข้อความเดิม |
| [registerUserByEmpCode](legacy/google-apps-script/helpers.gs#L27) | [registration.ts](../lib/line/registration.ts) registerUserByEmpCode | ค้น employees.code แบบข้อความแล้วบันทึก employees.line_uid; ไม่ขอ OTP จาก HRM |
| [getUserName](legacy/google-apps-script/helpers.gs#L48) | [registration.ts](../lib/line/registration.ts), [outbox.ts](../lib/line/outbox.ts) | ประกอบ first_name/last_name จาก employees; ไม่อ่าน register Sheet fallback อีก |
| [getEmpCode](legacy/google-apps-script/helpers.gs#L69) | [outbox.ts](../lib/line/outbox.ts), [registration.ts](../lib/line/registration.ts) | ใช้ employees.code และ FK employee_id ไม่แปลงรหัสเป็นตัวเลข |
| [getUpcomingEvents](legacy/google-apps-script/helpers.gs#L74) | [bot.ts](../lib/line/bot.ts) calendar listing | ย้ายบางส่วน: รายการที่มี mapping และเป็นของ caller เท่านั้น ยังไม่ใช่ทั้ง Google Calendar เดิม |
| [getLineUidByEmpCode](legacy/google-apps-script/helpers.gs#L85) | [outbox.ts](../lib/line/outbox.ts) | resolve ผ่าน employee_id ไป employees.line_uid; ไม่ยอมรับ arbitrary UID ที่ส่งใน request |
| [getAdminEmail](legacy/google-apps-script/helpers.gs#L99) | [commands.ts](../lib/leave/commands.ts), employees | แทน audit string ด้วย decided_by_employee_id/decided_at; email อยู่ใน employees ไม่ต้องทำ helper ส่งอีเมล |
| [getEmployeeByLineUid](legacy/google-apps-script/helpers.gs#L114) | [bot.ts](../lib/line/bot.ts) actorFor | join employees.line_uid กับ users และอ่านสิทธิ์ปัจจุบัน |
| [isRegistered](legacy/google-apps-script/helpers.gs#L140) | [registration.ts](../lib/line/registration.ts), actorFor | ตรวจ link เดิมและ eligibility ของบัญชี HRM เพิ่มเติม |
| [requestRegistration](legacy/google-apps-script/helpers.gs#L145) | [bot.ts](../lib/line/bot.ts) unregistered leave branch | ถามรหัสพนักงานด้วยข้อความเดิม เก็บ pendingAction=start_leave |
| [startLeaveFlow](legacy/google-apps-script/helpers.gs#L162) | [bot.ts](../lib/line/bot.ts) startLeaveFlow | คืน Flex ประเภทลาเดิม รวมการกลับมาทำต่อหลังลงทะเบียน |
| [formatDateTime](legacy/google-apps-script/helpers.gs#L166) | [messages.ts](../lib/line/messages.ts) formatDateTime | Intl parts ใน Asia/Bangkok, รูปแบบ YYYY-MM-DD HH:mm และ dd/MM/yyyy HH:mm แบบ ค.ศ. |
| [formatDate](legacy/google-apps-script/helpers.gs#L167) | [messages.ts](../lib/line/messages.ts) formatDate และ date slice | Asia/Bangkok และ YYYY-MM-DD แทน Utilities/Session |

## ข้อความและ Flex

| ฟังก์ชันเดิม | ตำแหน่งใหม่ | สถานะและการเปลี่ยน |
|---|---|---|
| [reply](legacy/google-apps-script/line_messaging.gs#L3) | [outbox.ts](../lib/line/outbox.ts) enqueue + [jobs.ts](../lib/line/jobs.ts) deliverLine | replyToken ผ่าน durable job; ไม่เรียก UrlFetchApp |
| [push](legacy/google-apps-script/line_messaging.gs#L13) | [jobs.ts](../lib/line/jobs.ts) deliverLine | Messaging API push พร้อม retry key และตรวจสิทธิ์ก่อนส่ง |
| [replyFlex](legacy/google-apps-script/line_messaging.gs#L25) | enqueue + deliverLine | ส่ง messages array แบบเดิม รองรับ text/Flex/quickReply |
| [getLeaveTypeFlex](legacy/google-apps-script/line_messaging.gs#L35) | [messages.ts](../lib/line/messages.ts) getLeaveTypeFlex | คง bubble/header/3 ปุ่ม/ข้อความ/สี/ขนาดเดิม เพิ่ม hidden draft |
| [getDateTimePickerFlex](legacy/google-apps-script/line_messaging.gs#L55) | [messages.ts](../lib/line/messages.ts) getDateTimePickerFlex | คืนสองปุ่มเริ่ม/สิ้นสุดใน Flex ใบเดียวตามเดิม |
| [getLeaveConfirmationFlex](legacy/google-apps-script/line_messaging.gs#L70) | [messages.ts](../lib/line/messages.ts) getLeaveConfirmationFlex | เปลี่ยน PropertiesService เป็น input แต่คงทุก visible field |
| [sendUserLeaveSuccessFlex](legacy/google-apps-script/line_messaging.gs#L104) | [messages.ts](../lib/line/messages.ts) buildUserLeaveSuccessFlex + processEvent | builder คืน payload เดิม; handler enqueue แทนส่งตรง มีประเภท/วันที่/ช่องทาง/หมายเหตุ/ปุ่มยกเลิกครบ |
| [notifyAdminLeaveRequest](legacy/google-apps-script/line_messaging.gs#L141) | buildAdminLeaveRequestFlex + [outbox.ts](../lib/line/outbox.ts) enqueueLeaveChange | คืน layout เดิมพร้อมรหัสพนักงาน เหตุผล ระยะเวลา ช่องทาง สถิติ 3 ชนิด และปุ่มพิจารณา |
| [sendLeaveResultFlex](legacy/google-apps-script/line_messaging.gs#L207) | buildLeaveResultFlex + enqueueLeaveChange | คืนผลอนุมัติ/ปฏิเสธแบบเดิม รวมชื่อผู้ดำเนินการ; ส่งถึง owner และ decider |
| [getEventDateTimeFlex](legacy/google-apps-script/line_messaging.gs#L241) | [messages.ts](../lib/line/messages.ts) getEventDateTimeFlex | คืนสองปุ่มเวลาเริ่ม/จบใน Flex เดิม |
| [createEventCard](legacy/google-apps-script/line_messaging.gs#L259) | [messages.ts](../lib/line/messages.ts) createEventCard | คง bubble deca, เวลาเริ่ม/จบ และ message action ลบ : ชื่อ |

## Config และ debug

| ฟังก์ชันเดิม | ตำแหน่งใหม่ | สถานะและการเปลี่ยน |
|---|---|---|
| isAdmin ใน [config.gs](legacy/google-apps-script/config.gs) | [permissions.ts](../lib/auth/permissions.ts) hasPermission | ใช้ leave.approve จาก users.permissions แทน ADMIN_IDS hardcode |
| getLineProfile ใน [config.gs](legacy/google-apps-script/config.gs) | ไม่มี runtime counterpart | เป็น helper debug profile เดิม เก็บ source redacted ไว้แต่ไม่เปิด endpoint ใหม่โดยไม่จำเป็น |

## หลักฐานเปรียบเทียบ

[messages.test.ts](../lib/line/messages.test.ts) รัน builder ของต้นฉบับใน VM เฉพาะตอนทดสอบ แล้วเทียบ JSON ของ builder ใหม่ด้วยข้อมูลเดียวกัน ครอบคลุมทั้ง 8 builder รวมอนุมัติ/ปฏิเสธ โดย normalize เฉพาะ hidden draft, revision และ row/UUID เท่านั้น สี ข้อความ label ขนาด margin/padding และ visible details ไม่ถูกตัดออกจากการเปรียบเทียบ

ผลนี้พิสูจน์ความเหมือนของ payload สำหรับข้อมูลเดียวกัน ไม่ได้อ้างว่าตรวจ render บน LINE ทุกอุปกรณ์แล้ว หรือว่ารายการจากฐานใหม่มีรหัสอ้างอิง/โควตาเหมือน Sheets เดิมโดยไม่ต้องย้ายข้อมูล
