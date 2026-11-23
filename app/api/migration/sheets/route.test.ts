import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/migration/sheets/route";
import { SYSTEM_ADMIN_USER_ID } from "@/lib/auth/admin";
import { COOKIE_NAME, createSessionToken } from "@/lib/auth/session";
import { employees, leaveRequests, overtimeRequests, users } from "@/lib/db/schema";
import { SHEET_EMPLOYEES, SHEET_OVERTIME } from "@/lib/migration/constants";
import { closeDb, db, resetDb } from "@/tests/setup/db";
import { createEmployee, createLeaveRequest, createOvertimeRequest, createUser } from "@/tests/setup/factories";

async function makeAdminToken() {
  return createSessionToken({
    sub: SYSTEM_ADMIN_USER_ID,
    employeeId: "",
    email: "admin@peopleos.co",
    role: "hr",
    isSystemAdmin: true,
  });
}

function migrationRequest(formData: FormData, token: string) {
  return new NextRequest("http://localhost/api/migration/sheets", {
    method: "POST",
    headers: { cookie: `${COOKIE_NAME}=${token}` },
    body: formData,
  });
}

async function makeOtOnlyWorkbook(employeeName: string): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ot = wb.addWorksheet(SHEET_OVERTIME);
  ot.addRow(["วันที่", "เวลาเริ่ม", "เวลาเลิก", "col3", "ชื่อพนักงาน", "หมายเหตุ", "สถานะ", "col7", "อนุมัติโดย", "ความเห็นหัวหน้า"]);
  ot.addRow(["22/11/2026", "18:00", "20:00", null, employeeName, "ปิดงานหน้างาน", "อนุมัติแล้ว", null, employeeName, null]);
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer], "ot-only.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("POST /api/migration/sheets selective import", () => {
  it("previews existingDbCounts + missingDbEmployeeCodesBySection and imports OT-only without touching live users/leave", async () => {
    const token = await makeAdminToken();
    const emp = await createEmployee({ code: "6001", firstName: "ชัยวัฒน์", lastName: "ตรวจงาน", email: "chaiwat@example.com" });
    await createUser({ employeeId: emp.id, email: "chaiwat@example.com", role: "hr" });
    await createLeaveRequest({ employeeId: emp.id, reason: "ลาพักร้อนเดิม" });
    await createOvertimeRequest({ employeeId: emp.id, reason: "OT เดิม" });

    const otFile = await makeOtOnlyWorkbook("ชัยวัฒน์ ตรวจงาน");

    // Preview
    const previewForm = new FormData();
    previewForm.append("file", otFile);
    previewForm.append("mode", "preview");
    const previewRes = await POST(migrationRequest(previewForm, token));
    expect(previewRes.status).toBe(200);
    const previewBody = await previewRes.json();
    expect(previewBody.availableSections).toEqual(["overtime"]);
    expect(previewBody.existingDbCounts).toMatchObject({
      employees: 1,
      users: 1,
      overtime: 1,
      leave: 1,
    });
    expect(previewBody.missingDbEmployeeCodesBySection.overtime).toEqual([]);

    // Reject import with no sections selected
    const emptySectionForm = new FormData();
    emptySectionForm.append("file", otFile);
    emptySectionForm.append("mode", "import");
    emptySectionForm.append("confirmReplace", "true");
    const emptyRes = await POST(migrationRequest(emptySectionForm, token));
    expect(emptyRes.status).toBe(400);

    // Import OT-only
    const importForm = new FormData();
    importForm.append("file", otFile);
    importForm.append("mode", "import");
    importForm.append("confirmReplace", "true");
    importForm.append("sections", "overtime");
    const importRes = await POST(migrationRequest(importForm, token));
    expect(importRes.status).toBe(200);
    const importBody = await importRes.json();
    expect(importBody.selectedSections).toEqual(["overtime"]);
    expect(importBody.imported.overtimeRequests).toBe(1);

    const otRows = await db.select().from(overtimeRequests);
    expect(otRows).toHaveLength(1);
    expect(otRows[0].reason).toBe("ปิดงานหน้างาน");
    expect(await db.select().from(employees)).toHaveLength(1);
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(leaveRequests)).toHaveLength(1);
  });

  it("reports missing DB employee codes when importing OT from a multi-sheet file without selecting employees", async () => {
    const token = await makeAdminToken();
    const wb = new ExcelJS.Workbook();
    const empWs = wb.addWorksheet(SHEET_EMPLOYEES);
    empWs.addRow([
      "ชื่อพนักงาน", "รหัสพนักงาน", "แผนก", "รูป", "อีเมล", "ตำแหน่ง", "เบอร์โทร",
      "วันหยุดประจำ", "เริ่มทำงาน", "col9", "col10", "LINE UID", "col12", "col13",
      "col14", "col15", "วันเกิด", "คำนำหน้าชื่อ", "ประเภทว่าจ้าง", "สถานะ",
    ]);
    empWs.addRow([
      "คนใหม่ ยังไม่อยู่ในระบบ", "8888", "Engineering", null, "new8888@example.com", "Dev", null,
      null, new Date("2026-01-01T00:00:00Z"), null, null, null, null, null,
      null, null, null, "นาย", "ประจำ", "ปฏิบัติงาน",
    ]);
    const otWs = wb.addWorksheet(SHEET_OVERTIME);
    otWs.addRow(["วันที่", "เวลาเริ่ม", "เวลาเลิก", "col3", "ชื่อพนักงาน", "หมายเหตุ", "สถานะ", "col7", "อนุมัติโดย", "ความเห็นหัวหน้า"]);
    otWs.addRow(["22/11/2026", "18:00", "20:00", null, "คนใหม่ ยังไม่อยู่ในระบบ", "OT", "อนุมัติแล้ว", null, null, null]);

    const file = new File([await wb.xlsx.writeBuffer()], "multi.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const previewForm = new FormData();
    previewForm.append("file", file);
    previewForm.append("mode", "preview");
    const previewRes = await POST(migrationRequest(previewForm, token));
    expect(previewRes.status).toBe(200);
    const previewBody = await previewRes.json();
    expect(previewBody.availableSections).toEqual(["employees", "overtime"]);
    expect(previewBody.missingDbEmployeeCodesBySection.overtime).toEqual(["8888"]);
  });
});
