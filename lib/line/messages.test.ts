import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as messages from "@/lib/line/messages";

function legacy() {
  const captured: any[] = [];
  const context = vm.createContext({
    Date, JSON, String, console, ADMIN_IDS: ["admin"],
    formatDate: (date: Date) => date.toISOString().slice(0, 10),
    formatDateTime: (date: Date) => date.getUTCHours() === 2 ? "2026-12-01 09:00" : "2026-12-01 10:00",
    Session: { getScriptTimeZone: () => "Asia/Bangkok" },
    Utilities: { formatDate: (date: Date) => date.getUTCDate() === 1 ? "01/12/2026 09:00" : "02/12/2026 18:00" },
    PropertiesService: { getUserProperties: () => ({ getProperty: (key: string) => ({ user_leave_type: "ลาป่วย", user_leave_start: "2026-12-01T09:00:00+07:00", user_leave_end: "2026-12-02T18:00:00+07:00", user_leave_reason: "พบแพทย์" })[key] }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => ({ getRange: () => ({ getValues: () => [["สมชาย ใจดี", "ลาป่วย", "ลาเต็มวัน", "2026-12-01", "2026-12-02", "พบแพทย์", "", "pending", "0012", "", "", "", "Line"]] }) }) }) },
    SHEET_ID: "test", getLeaveStatistics: () => ({ sick: "2 วัน", personal: "1 / 6 วัน", birthday: "0 / 1 วัน" }),
    UrlFetchApp: { fetch: (_url: string, options: any) => { captured.push(...JSON.parse(options.payload).messages); } }, LINE_TOKEN: "dummy-test-token",
  });
  vm.runInContext(readFileSync(new URL("../../docs/legacy/google-apps-script/line_messaging.gs", import.meta.url), "utf8"), context);
  return { context, captured };
}
function comparable(value: any): any {
  const result = JSON.parse(JSON.stringify(value));
  function visit(node: any) {
    if (!node || typeof node !== "object") return;
    if (node.type === "postback" || node.type === "datetimepicker") {
      const data = JSON.parse(node.data); delete data.draft; delete data.version;
      if (data.id) { data.row = data.id; delete data.id; }
      if (data.row != null) data.row = String(data.row);
      node.data = JSON.stringify(data);
    }
    Object.values(node).forEach((item) => Array.isArray(item) ? item.forEach(visit) : visit(item));
  }
  visit(result); return result;
}
describe("Apps Script Flex payload parity", () => {
  it("keeps long appointment notices complete without exceeding LINE text limits or splitting emoji", () => {
    const notice = "📅 บันทึกนัดหมายสำเร็จ\n📍 สถานที่: " + "ก".repeat(4890) + "😀".repeat(100);
    const chunks = messages.buildTextMessages(notice);
    expect(chunks.map((message) => message.text).join("")).toBe(notice);
    expect(chunks.every((message) => message.text.length <= 4900)).toBe(true);
    expect(chunks.every((message) => !/[\uD800-\uDBFF]$/.test(message.text))).toBe(true);
  });
  it("preserves the exact leave-type and combined date/time picker layout", () => {
    const { context } = legacy();
    expect(comparable(messages.getLeaveTypeFlex("draft"))).toEqual(comparable(vm.runInContext("getLeaveTypeFlex()", context)));
    expect(comparable(messages.getDateTimePickerFlex("draft"))).toEqual(comparable(vm.runInContext("getDateTimePickerFlex()", context)));
    expect(comparable(messages.getEventDateTimeFlex("draft"))).toEqual(comparable(vm.runInContext("getEventDateTimeFlex()", context)));
  });
  it("preserves every confirmation field, label, color and spacing", () => {
    const { context } = legacy();
    expect(comparable(messages.getLeaveConfirmationFlex({ type: "ลาป่วย", start: "2026-12-01T09:00:00+07:00", end: "2026-12-02T18:00:00+07:00", reason: "พบแพทย์" }, "draft"))).toEqual(comparable(vm.runInContext('getLeaveConfirmationFlex("user")', context)));
  });
  it("preserves the user's success card including channel, reason and cancellation", () => {
    const { context, captured } = legacy();
    vm.runInContext(`sendUserLeaveSuccessFlex("token", "ลาป่วย", "2026-12-01", "2026-12-02", "Line", "พบแพทย์", JSON.stringify({action:"cancel_leave_by_user",row:"23"}))`, context);
    expect(comparable(messages.buildUserLeaveSuccessFlex("ลาป่วย", "2026-12-01", "2026-12-02", "Line", "พบแพทย์", JSON.stringify({ action: "cancel_leave_by_user", id: "23" })))).toEqual(comparable(captured[0]));
  });
  it("preserves admin details and all three annual statistics", () => {
    const { context, captured } = legacy();
    vm.runInContext('notifyAdminLeaveRequest("23", "สมชาย ใจดี", "ลาป่วย", "2026-12-01", "2026-12-02")', context);
    expect(comparable(messages.buildAdminLeaveRequestFlex({ reference: "23", name: "สมชาย ใจดี", type: "ลาป่วย", start: "2026-12-01", end: "2026-12-02", session: "ลาเต็มวัน", reason: "พบแพทย์", employeeCode: "0012", channel: "Line", year: "2026", stats: { sick: "2 วัน", personal: "1 / 6 วัน", birthday: "0 / 1 วัน" }, id: "23", version: "revision" }))).toEqual(comparable(captured[0]));
  });
  it.each(["อนุมัติแล้ว", "ไม่อนุมัติ"])("preserves the %s result card including the deciding administrator", (status) => {
    const { context, captured } = legacy();
    vm.runInContext(`sendLeaveResultFlex("user", ${JSON.stringify(status)}, "ลาป่วย", "สมชาย ใจดี", "2026-12-01", "2026-12-02", "หัวหน้า")`, context);
    expect(messages.buildLeaveResultFlex(status, "ลาป่วย", "สมชาย ใจดี", "2026-12-01", "2026-12-02", "หัวหน้า")).toEqual(captured[0]);
  });
  it("preserves the appointment bubble and original delete message action", () => {
    const { context } = legacy();
    const event = { title: "ประชุมทีม", start: new Date("2026-12-01T02:00:00Z"), end: new Date("2026-12-01T03:00:00Z") };
    context.event = event;
    expect(messages.createEventCard(event)).toEqual(JSON.parse(JSON.stringify(vm.runInContext("createEventCard(event)", context))));
  });
});
