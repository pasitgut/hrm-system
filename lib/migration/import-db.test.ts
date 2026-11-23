import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  assetRequests,
  employees,
  leaveRequests,
  lineCalendarEvents,
  overtimeRequests,
  users,
  workTrackingRecords,
} from "@/lib/db/schema";
import {
  parseAppSheetWorkbook,
  SHEET_ASSETS,
  SHEET_EMPLOYEES,
  SHEET_LEAVE,
  SHEET_OVERTIME,
  SHEET_WORK,
  SheetMigrationError,
} from "@/lib/migration/appsheet";
import { replaceDatabaseFromSheetMigration } from "@/lib/migration/import-db";
import { closeDb, db, resetDb } from "@/tests/setup/db";
import { createEmployee, createLeaveRequest, createOvertimeRequest, createUser } from "@/tests/setup/factories";

async function buildMigrationWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const emp = wb.addWorksheet(SHEET_EMPLOYEES);
  emp.addRow([
    "ชื่อพนักงาน", "รหัสพนักงาน", "แผนก", "รูป", "อีเมล", "ตำแหน่ง", "เบอร์โทร",
    "วันหยุดประจำ", "เริ่มทำงาน", "col9", "col10", "LINE UID", "col12", "col13",
    "col14", "col15", "วันเกิด", "คำนำหน้าชื่อ", "ประเภทว่าจ้าง", "สถานะ",
  ]);
  emp.addRow([
    "กิตติ พร้อมเมล", "1001", "Engineering", null, "Kitti.Import@example.com", "Backend Engineer", null,
    null, new Date("2025-01-10T00:00:00Z"), null, null, null, null, null,
    null, null, null, "นาย", "ประจำ", "ปฏิบัติงาน",
  ]);
  emp.addRow([
    "สมชาย ไม่มีเมล", "1002", "Engineering", null, null, "QA Engineer", null,
    null, new Date("2025-02-01T00:00:00Z"), null, null, null, null, null,
    null, null, null, "นาย", "ประจำ", "ปฏิบัติงาน",
  ]);
  emp.addRow([
    "สมหญิง พ้นสภาพ", "1003", "People", null, "former@example.com", "Coordinator", null,
    null, new Date("2023-03-01T00:00:00Z"), null, null, null, null, null,
    null, null, null, "นางสาว", "ประจำ", "พ้นสภาพ",
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("replaceDatabaseFromSheetMigration", () => {
  it("provisions active employees with valid emails, skips missing emails and former employees, and preserves LINE calendar on re-import", async () => {
    const buffer = await buildMigrationWorkbook();
    const parsed = await parseAppSheetWorkbook(buffer);
    expect(parsed.errors).toEqual([]);

    const firstSummary = await replaceDatabaseFromSheetMigration(parsed);
    expect(firstSummary.usersProvisioned).toBe(1);
    expect(firstSummary.usersSkippedNoEmail).toBe(1);

    const allEmployees = await db.select().from(employees);
    const activeWithEmail = allEmployees.find((row) => row.code === "1001")!;
    const activeNoEmail = allEmployees.find((row) => row.code === "1002")!;
    const former = allEmployees.find((row) => row.code === "1003")!;

    expect(activeWithEmail.deletedAt).toBeNull();
    expect(activeNoEmail.deletedAt).toBeNull();
    expect(former.deletedAt).not.toBeNull();

    const allUsers = await db.select().from(users);
    expect(allUsers).toHaveLength(1);
    expect(allUsers[0]).toMatchObject({
      employeeId: activeWithEmail.id,
      email: "kitti.import@example.com",
      role: "employee",
      isActive: true,
      mustChangePassword: true,
    });
    expect(await verifyPassword("1001", allUsers[0].passwordHash)).toBe(true);
    expect(allUsers.find((row) => row.employeeId === activeNoEmail.id)).toBeUndefined();
    expect(allUsers.find((row) => row.employeeId === former.id)).toBeUndefined();

    // Seed LINE calendar event referencing employee + leave request, then verify employees-only re-import keeps both cleanly.
    const [leave] = await db
      .insert(leaveRequests)
      .values({
        employeeId: activeWithEmail.id,
        leaveTypeCode: "sick",
        startOn: "2026-10-01",
        endOn: "2026-10-01",
      })
      .returning();
    await db.insert(lineCalendarEvents).values({
      employeeId: activeWithEmail.id,
      leaveRequestId: leave.id,
      title: "ลาป่วย - กิตติ",
      startOn: "2026-10-01",
      endOn: "2026-10-01",
    });

    const secondSummary = await replaceDatabaseFromSheetMigration(parsed, { sections: ["employees"] });
    expect(secondSummary.employeesUpdated).toBe(3);
    expect(secondSummary.usersExistingKept).toBe(1);
    expect(await db.select().from(lineCalendarEvents)).toHaveLength(1);
    const [reimportedUser] = await db.select().from(users).where(eq(users.email, "kitti.import@example.com"));
    expect(reimportedUser).toBeDefined();
  });

  it("imports ONLY overtime while preserving live employees, custom users/roles, leave, assets, and work tracking", async () => {
    const customHash = await hashPassword("MySecretPass99!");
    const emp = await createEmployee({
      code: "2001",
      firstName: "อลิสา",
      lastName: "พนักงาน",
      email: "alisa@example.com",
      baseSalary: 45000,
    });
    const { user: alisaUser } = await createUser({
      employeeId: emp.id,
      email: "alisa@example.com",
      role: "hr",
      passwordHash: customHash,
      mustChangePassword: false,
      permissions: ["ot.approve", "users.permissions.manage"],
    });
    const existingLeave = await createLeaveRequest({ employeeId: emp.id, reason: "ลาที่มีอยู่แล้ว" });
    await createOvertimeRequest({ employeeId: emp.id, reason: "OT เก่าที่ต้องถูกแทนที่" });

    await db.insert(workTrackingRecords).values({
      houseNo: "88/1",
      round: "1",
      eventDate: "2026-10-01",
      projectText: "โครงการเดิม",
      detail: "ตรวจงาน",
      status: "in_progress",
    });

    const wb = new ExcelJS.Workbook();
    const ot = wb.addWorksheet(SHEET_OVERTIME);
    ot.addRow(["วันที่", "เวลาเริ่ม", "เวลาเลิก", "col3", "ชื่อพนักงาน", "หมายเหตุ", "สถานะ", "col7", "อนุมัติโดย", "ความเห็นหัวหน้า"]);
    ot.addRow(["15/11/2026", "18:00", "21:00", null, "อลิสา พนักงาน", "OT ใหม่จากชีต", "อนุมัติแล้ว", null, "อลิสา พนักงาน", "ok"]);

    const parsed = await parseAppSheetWorkbook(Buffer.from(await wb.xlsx.writeBuffer()), {
      existingEmployees: [
        { code: "2001", firstName: "อลิสา", lastName: "พนักงาน", email: "alisa@example.com", department: null, isFormer: false },
      ],
    });

    const result = await replaceDatabaseFromSheetMigration(parsed, { sections: ["overtime"] });
    expect(result.importedSections).toEqual(["overtime"]);
    expect(result.overtimeRequests).toBe(1);

    const otRows = await db.select().from(overtimeRequests);
    expect(otRows).toHaveLength(1);
    expect(otRows[0]).toMatchObject({ employeeId: emp.id, reason: "OT ใหม่จากชีต", statusCode: "approved", decidedByEmployeeId: emp.id });

    // Live data in other tables stays untouched
    const [preservedEmp] = await db.select().from(employees).where(eq(employees.id, emp.id));
    expect(preservedEmp.baseSalary).toBe(45000);
    const [preservedUser] = await db.select().from(users).where(eq(users.id, alisaUser.id));
    expect(preservedUser.passwordHash).toBe(customHash);
    expect(preservedUser.role).toBe("hr");
    expect(preservedUser.mustChangePassword).toBe(false);
    expect(preservedUser.permissions).toEqual(["ot.approve", "users.permissions.manage"]);

    const leavesAfter = await db.select().from(leaveRequests);
    expect(leavesAfter).toHaveLength(1);
    expect(leavesAfter[0].id).toBe(existingLeave.id);
    expect(await db.select().from(workTrackingRecords)).toHaveLength(1);
  });

  it("imports ONLY leave while keeping standalone calendar events, OT, and employees intact", async () => {
    const { employee } = await createUser({ role: "employee" });
    await db.update(employees).set({ code: "3001", firstName: "ปิติ", lastName: "ลางาน" }).where(eq(employees.id, employee!.id));
    const oldLeave = await createLeaveRequest({ employeeId: employee!.id, reason: "ลาเก่า" });
    await createOvertimeRequest({ employeeId: employee!.id, reason: "OT เดิม" });

    // 1 leave-linked calendar event (should be cleared) + 1 standalone calendar event (must be preserved)
    await db.insert(lineCalendarEvents).values([
      { employeeId: employee!.id, leaveRequestId: oldLeave.id, title: "ลาเก่า", startOn: "2026-09-15", endOn: "2026-09-15" },
      { employeeId: employee!.id, leaveRequestId: null, title: "ประชุมทีม", startOn: "2026-10-05", endOn: "2026-10-05" },
    ]);

    const wb = new ExcelJS.Workbook();
    const leaveWs = wb.addWorksheet(SHEET_LEAVE);
    leaveWs.addRow(["ชื่อ", "ประเภท", "ช่วง", "เริ่ม", "สิ้นสุด", "เหตุผล", "แนบ", "สถานะ", "รหัส", "col9", "ผู้อนุมัติ", "หมายเหตุ"]);
    leaveWs.addRow(["ปิติ ลางาน", "ลาป่วย", "เต็มวัน", "10/11/2026", "10/11/2026", "ไข้หวัด", null, "อนุมัติแล้ว", "3001", null, null, null]);

    const parsed = await parseAppSheetWorkbook(Buffer.from(await wb.xlsx.writeBuffer()), {
      existingEmployees: [
        { code: "3001", firstName: "ปิติ", lastName: "ลางาน", email: employee!.email, department: null, isFormer: false },
      ],
    });

    const result = await replaceDatabaseFromSheetMigration(parsed, { sections: ["leave"] });
    expect(result.importedSections).toEqual(["leave"]);
    expect(result.leaveRequests).toBe(1);

    const leaves = await db.select().from(leaveRequests);
    expect(leaves).toHaveLength(1);
    expect(leaves[0].reason).toBe("ไข้หวัด");

    const calEvents = await db.select().from(lineCalendarEvents);
    expect(calEvents).toHaveLength(1);
    expect(calEvents[0].title).toBe("ประชุมทีม");

    expect(await db.select().from(overtimeRequests)).toHaveLength(1);
  });

  it("upserts employees safely without overwriting salaries, passwords, roles, or linked emails when sheet email is blank", async () => {
    const customHash = await hashPassword("CustomLivePassword123!");
    const existingEmp = await createEmployee({
      code: "4001",
      firstName: "สมศักดิ์",
      lastName: "ชื่อเดิม",
      email: "somsak@example.com",
      baseSalary: 60000,
    });
    const { user: existingUser } = await createUser({
      employeeId: existingEmp.id,
      email: "somsak@example.com",
      role: "executive",
      passwordHash: customHash,
      mustChangePassword: false,
      permissions: ["leave.approve"],
    });
    const offboardingEmp = await createEmployee({
      code: "4002",
      firstName: "นารี",
      lastName: "กำลังออก",
      email: "naree@example.com",
    });
    await createUser({
      employeeId: offboardingEmp.id,
      email: "naree@example.com",
      role: "employee",
    });

    const wb = new ExcelJS.Workbook();
    const empWs = wb.addWorksheet(SHEET_EMPLOYEES);
    empWs.addRow([
      "ชื่อพนักงาน", "รหัสพนักงาน", "แผนก", "รูป", "อีเมล", "ตำแหน่ง", "เบอร์โทร",
      "วันหยุดประจำ", "เริ่มทำงาน", "col9", "col10", "LINE UID", "col12", "col13",
      "col14", "col15", "วันเกิด", "คำนำหน้าชื่อ", "ประเภทว่าจ้าง", "สถานะ",
    ]);
    // Existing employee with updated name and blank email in sheet -> keep existing email + password + role + salary
    empWs.addRow([
      "สมศักดิ์ ชื่อใหม่", "4001", "People", null, null, "Director", null,
      null, new Date("2024-01-01T00:00:00Z"), null, null, null, null, null,
      null, null, null, "นาย", "ประจำ", "ปฏิบัติงาน",
    ]);
    // Existing employee marked former -> soft-delete + deactivate user
    empWs.addRow([
      "นารี กำลังออก", "4002", "People", null, "naree@example.com", "Staff", null,
      null, new Date("2024-01-01T00:00:00Z"), null, null, null, null, null,
      null, null, null, "นางสาว", "ประจำ", "พ้นสภาพ",
    ]);
    // Brand new active employee -> insert + provision user
    empWs.addRow([
      "ธนา มาใหม่", "4003", "Engineering", null, "thana@example.com", "Engineer", null,
      null, new Date("2026-01-01T00:00:00Z"), null, null, null, null, null,
      null, null, null, "นาย", "ประจำ", "ปฏิบัติงาน",
    ]);

    const parsed = await parseAppSheetWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    const result = await replaceDatabaseFromSheetMigration(parsed, { sections: ["employees"] });

    expect(result).toMatchObject({
      importedSections: ["employees"],
      employeesUpdated: 2,
      employeesInserted: 1,
      usersExistingKept: 2,
      usersProvisioned: 1,
    });

    const [updated4001] = await db.select().from(employees).where(eq(employees.id, existingEmp.id));
    expect(updated4001.firstName).toBe("สมศักดิ์");
    expect(updated4001.lastName).toBe("ชื่อใหม่");
    expect(updated4001.email).toBe("somsak@example.com");
    expect(updated4001.baseSalary).toBe(60000);

    const [user4001] = await db.select().from(users).where(eq(users.id, existingUser.id));
    expect(user4001.passwordHash).toBe(customHash);
    expect(user4001.role).toBe("executive");
    expect(user4001.permissions).toEqual(["leave.approve"]);
    expect(user4001.isActive).toBe(true);

    const [emp4002] = await db.select().from(employees).where(eq(employees.id, offboardingEmp.id));
    expect(emp4002.deletedAt).not.toBeNull();
    const [user4002] = await db.select().from(users).where(eq(users.employeeId, offboardingEmp.id));
    expect(user4002.isActive).toBe(false);

    const [emp4003] = await db.select().from(employees).where(eq(employees.code, "4003"));
    const [user4003] = await db.select().from(users).where(eq(users.employeeId, emp4003.id));
    expect(user4003).toMatchObject({ email: "thana@example.com", role: "employee", mustChangePassword: true, isActive: true });
    expect(await verifyPassword("4003", user4003.passwordHash)).toBe(true);
  });

  it("supports assets-only and workTracking-only imports independently and rejects missing active employee codes", async () => {
    const emp = await createEmployee({ code: "5001", firstName: "วีระ", lastName: "ยืมของ" });
    await createOvertimeRequest({ employeeId: emp.id, reason: "OT อยู่ครบ" });

    // Assets-only import
    const assetWb = new ExcelJS.Workbook();
    const assetWs = assetWb.addWorksheet(SHEET_ASSETS);
    assetWs.addRow(new Array(24).fill("col"));
    const assetRow = new Array(24).fill(null);
    assetRow[0] = "11111111-1111-4111-8111-111111111111";
    assetRow[1] = new Date("2026-10-01T08:00:00Z");
    assetRow[2] = "วีระ ยืมของ";
    assetRow[4] = "5001";
    assetRow[6] = new Date("2026-10-01T00:00:00Z");
    assetRow[8] = "โน้ตบุ๊ก (1)";
    assetRow[10] = "อนุมัติแล้ว";
    assetWs.addRow(assetRow);

    const parsedAsset = await parseAppSheetWorkbook(Buffer.from(await assetWb.xlsx.writeBuffer()), {
      existingEmployees: [
        { code: "5001", firstName: "วีระ", lastName: "ยืมของ", email: emp.email, department: null, isFormer: false },
      ],
    });
    const assetRes = await replaceDatabaseFromSheetMigration(parsedAsset, { sections: ["assets"] });
    expect(assetRes.importedSections).toEqual(["assets"]);
    expect(await db.select().from(assetRequests)).toHaveLength(1);
    expect(await db.select().from(overtimeRequests)).toHaveLength(1);

    // Work-tracking-only import
    const workWb = new ExcelJS.Workbook();
    const workWs = workWb.addWorksheet(SHEET_WORK);
    workWs.addRow(["วันที่", "เลขที่บ้าน", "รอบที่", "ชื่อโครงการ", "สถานะ", "สถานะย่อย", "ผู้ปฏิบัติงาน"]);
    workWs.addRow(["20/11/2026", "12/34", "1", "โครงการ X", "completed", "[]", "{}"]);
    const parsedWork = await parseAppSheetWorkbook(Buffer.from(await workWb.xlsx.writeBuffer()));
    const workRes = await replaceDatabaseFromSheetMigration(parsedWork, { sections: ["workTracking"] });
    expect(workRes.importedSections).toEqual(["workTracking"]);
    expect(await db.select().from(workTrackingRecords)).toHaveLength(1);
    expect(await db.select().from(assetRequests)).toHaveLength(1);

    // Missing active employee code when importing OT without employees section
    const badWb = new ExcelJS.Workbook();
    const badEmpWs = badWb.addWorksheet(SHEET_EMPLOYEES);
    badEmpWs.addRow([
      "ชื่อพนักงาน", "รหัสพนักงาน", "แผนก", "รูป", "อีเมล", "ตำแหน่ง", "เบอร์โทร",
      "วันหยุดประจำ", "เริ่มทำงาน", "col9", "col10", "LINE UID", "col12", "col13",
      "col14", "col15", "วันเกิด", "คำนำหน้าชื่อ", "ประเภทว่าจ้าง", "สถานะ",
    ]);
    badEmpWs.addRow([
      "พนักงาน ยังไม่มีในระบบ", "9999", "Engineering", null, "9999@example.com", "Dev", null,
      null, new Date("2026-01-01T00:00:00Z"), null, null, null, null, null,
      null, null, null, "นาย", "ประจำ", "ปฏิบัติงาน",
    ]);
    const badOtWs = badWb.addWorksheet(SHEET_OVERTIME);
    badOtWs.addRow(["วันที่", "เวลาเริ่ม", "เวลาเลิก", "col3", "ชื่อพนักงาน", "หมายเหตุ", "สถานะ", "col7", "อนุมัติโดย", "ความเห็นหัวหน้า"]);
    badOtWs.addRow(["20/11/2026", "18:00", "20:00", null, "พนักงาน ยังไม่มีในระบบ", "OT", "อนุมัติแล้ว", null, null, null]);

    const parsedMissing = await parseAppSheetWorkbook(Buffer.from(await badWb.xlsx.writeBuffer()));
    await expect(
      replaceDatabaseFromSheetMigration(parsedMissing, { sections: ["overtime"] }),
    ).rejects.toThrow(SheetMigrationError);
  });
});
