import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { assetAgreementSchema } from "@/asset-borrowing/domain/asset";
import {
  deterministicUuid,
  parseAppSheetWorkbook,
  SHEET_ASSETS,
  SHEET_EMPLOYEES,
  SHEET_LEAVE,
  SHEET_OVERTIME,
  SHEET_WORK,
  SheetMigrationError,
  type ParsedAssetAgreement,
} from "@/lib/migration/appsheet";

const AGREEMENT_STATUS_TO_DOMAIN = {
  waiting_handover: "waitingHandover",
  waiting_employee: "waitingEmployee",
  waiting_admin: "waitingAdmin",
  completed: "completed",
} as const;

function toDomainAgreement(agreement: ParsedAssetAgreement) {
  return assetAgreementSchema.parse({
    templateId: null,
    type: agreement.type === "asset_form" ? "assetForm" : "borrow",
    title: agreement.title,
    header: agreement.headerHtml,
    body: agreement.bodyHtml,
    footer: agreement.footerHtml,
    status: AGREEMENT_STATUS_TO_DOMAIN[agreement.status],
    createdBy: agreement.createdByName,
    createdByCode: agreement.createdByRawCode,
    returnCondition: agreement.returnCondition,
    documentDate: new Date(`${agreement.documentDate}T00:00:00Z`),
    updatedAt: agreement.updatedAtIso ? new Date(agreement.updatedAtIso) : null,
    signatureBoxes: agreement.signers.map((s) => ({
      id: s.boxId,
      label: s.label,
      role: s.role,
      name: s.signerName,
      signer: s.signerKind,
      position: s.layoutPosition,
      ...(s.page ? { page: s.page } : {}),
      ...(s.xPercent !== null ? { x: Number(s.xPercent) } : {}),
      ...(s.yPercent !== null ? { y: Number(s.yPercent) } : {}),
      ...(s.signatureData ? { signatureData: s.signatureData } : {}),
      ...(s.returnSignatureData ? { returnSignatureData: s.returnSignatureData } : {}),
      ...(s.returnSignedAtIso ? { returnSignedAt: s.returnSignedAtIso } : {}),
      status: s.signatureStatus,
      signedAt: s.signedAtIso,
    })),
  });
}

async function buildSyntheticWorkbook(
  options: { duplicateEmail?: boolean; omitWorkSheet?: boolean } = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const emp = wb.addWorksheet(SHEET_EMPLOYEES);
  emp.addRow([
    "ชื่อพนักงาน", "รหัสพนักงาน", "แผนก", "รูป", "อีเมล", "ตำแหน่ง", "เบอร์โทร",
    "วันหยุดประจำ", "เริ่มทำงาน", "col9", "col10", "LINE UID", "col12", "col13",
    "col14", "col15", "วันเกิด", "คำนำหน้าชื่อ", "ประเภทว่าจ้าง", "สถานะ",
  ]);
  emp.addRow([
    "กิตติ ทดสอบ", 2633, "Engineering",
    { text: "https://res.cloudinary.com/demo/image/upload/a.jpg", hyperlink: "https://res.cloudinary.com/demo/image/upload/a.jpg" },
    { text: "Kitti@example.com", hyperlink: "mailto:Kitti@example.com" },
    "Backend Engineer", "0812345678", "Saturday,Sunday",
    new Date("2025-03-01T00:00:00Z"), null, null, "U_LINE_001", null, null, null, null,
    new Date("1995-05-12T00:00:00Z"), "นาย", "ประจำ", "ปฏิบัติงาน",
  ]);
  emp.addRow([
    "มานี อนุมัติ", "1904", "People", null,
    options.duplicateEmail ? "kitti@example.com" : "manee@example.com",
    "HR Lead", "0890001111", "Sunday",
    new Date("2024-01-15T00:00:00Z"), null, null, "U_LINE_002", null, null, null, null,
    null, "น.ส.", "สัญญา", null,
  ]);
  emp.addRow([
    "สมหญิง ย้ายออก", "2101", "People", null,
    "somying@example.com", "Coordinator", null, "Sunday",
    new Date("2023-05-01T00:00:00Z"), null, null, null, null, null, null, null,
    null, "นางสาว", "ประจำ", "พ้นสภาพ",
  ]);
  emp.addRow([
    "บัญชี ทดสอบ", "7777", "Engineering", null, "test7777@example.com",
    "Tester", null, null, new Date("2025-01-01T00:00:00Z"),
  ]);

  const ot = wb.addWorksheet(SHEET_OVERTIME);
  ot.addRow([
    "วันที่", "เวลาเริ่ม", "เวลาเลิก", "col3", "ชื่อพนักงาน", "หมายเหตุ", "สถานะ", "col7", "อนุมัติโดย", "ความเห็นหัวหน้า",
  ]);
  ot.addRow([
    new Date("2026-09-10T00:00:00Z"),
    new Date("1899-12-30T18:00:00Z"),
    new Date("1899-12-30T21:00:00Z"),
    null, "กิตติ ทดสอบ", "ส่งมอบงาน", "อนุมัติแล้ว", null, "มานี อนุมัติ", "ผ่าน",
  ]);
  // Exact duplicate OT row (should be skipped with warning)
  ot.addRow([
    new Date("2026-09-10T00:00:00Z"),
    new Date("1899-12-30T18:00:00Z"),
    new Date("1899-12-30T21:00:00Z"),
    null, "กิตติ ทดสอบ", "ส่งมอบงาน", "อนุมัติแล้ว", null, "มานี อนุมัติ", "ผ่าน",
  ]);
  // Overnight shift OT row for a former employee who only appears in OT + Leave
  ot.addRow([
    new Date("2026-08-02T00:00:00Z"),
    0.9583333333333334, // 23:00
    0.08333333333333333, // 02:00 next day
    null, "สมศักดิ์ เก่า", "", "ยังไม่ได้ยืนยัน",
  ]);

  const leave = wb.addWorksheet(SHEET_LEAVE);
  leave.addRow([
    "ชื่อ", "ประเภท", "ระยะเวลา", "เริ่ม", "สิ้นสุด", "เหตุผล", "รูป(ลา)", "สถานะ", "รหัสพนักงาน", "col9", "อนุมัติโดย", "หมายเหตุ",
  ]);
  leave.addRow([
    "กิตติ ทดสอบ", "ลากิจ", "ลาครึ่งวัน",
    new Date("2026-09-15T00:00:00Z"), new Date("2026-09-15T00:00:00Z"),
    "ครึ่งบ่าย ไปธนาคาร", "https://res.cloudinary.com/demo/image/upload/doc.jpg",
    "อนุมัติแล้ว", 2633, null, "มานี อนุมัติ|14/09/2026|manee@example.com", "รับทราบ",
  ]);
  leave.addRow([
    "สมศักดิ์ เก่า", "ลาป่วย", "ลาเต็มวัน",
    new Date("2026-07-20T00:00:00Z"), new Date("2026-07-21T00:00:00Z"),
    "ไม่สบาย", null, "รออนุมัติ", "2426",
  ]);

  const assets = wb.addWorksheet(SHEET_ASSETS);
  assets.addRow([
    "ID", "วันที่ออกฟอร์ม", "ชื่อพนักงาน", "ตำแหน่ง", "รหัสพนักงาน", "เหตุที่ยืม", "ตั้งแต่วันที่", "ถึงวันที่",
    "รายการ/จำนวน", "หมายเหตุ", "สถานะ", "อนุมัติยืมโดย", "ผู้ตรวจคืน", "อนุมัติคืนโดย", "รูปใบยืม",
    "TEST", "รูปของที่ยืม", "col17", "หัวข้อ agreement", "รายละเอียด agreement", "ตำแหน่งลายเซ็น",
    "updated_at", "agreement_updated_at", "department",
  ]);

  const assetRowId1 = "11111111-2222-4333-8444-555555555555";
  const agreementMeta1 = {
    signatureBoxes: [
      {
        id: "employee",
        label: "พนักงานผู้รับมอบ",
        role: "พนักงานผู้รับมอบ",
        name: "กิตติ ทดสอบ",
        signer: "employee",
        position: "bottom-left",
        page: 3,
        x: 10,
        y: 72,
        signatureData: "https://i.ibb.co/demo/emp-sig.jpg",
        status: "signed",
        signedAt: "2026-09-18T09:40:11.409Z",
      },
      {
        id: "handover",
        label: "ผู้ส่งมอบ",
        role: "ผู้ส่งมอบ",
        name: "มานี อนุมัติ",
        signer: "other",
        position: "bottom-right",
        page: 3,
        x: 60,
        y: 72,
        signatureData: "https://i.ibb.co/demo/handover-sig.jpg",
        status: "signed",
        signedAt: "2026-09-18T01:39:22.107Z",
      },
      {
        id: "admin",
        label: "ผู้มีอำนาจอนุมัติ",
        role: "ผู้มีอำนาจอนุมัติ",
        name: "มานี อนุมัติ",
        signer: "admin",
        position: "lower-right",
        page: 3,
        x: 60,
        y: 82,
        signatureData: "https://i.ibb.co/demo/admin-sig.png",
        status: "signed",
        signedAt: "2026-09-19T06:51:01.809Z",
      },
    ],
    header: "<p>หัวข้อบริษัท</p>",
    footer: "<p>หมายเหตุท้ายกระดาษ</p>",
    status: "completed",
    createdBy: "ฝึกงาน",
    createdByCode: "7777",
    returnCondition: null,
  };

  assets.addRow([
    assetRowId1,
    new Date("2026-09-18T10:30:00Z"),
    "กิตติ ทดสอบ", "Backend Engineer", "2633", "ออกหน้างาน",
    new Date("2026-09-18T00:00:00Z"), new Date("2026-09-20T00:00:00Z"),
    "กล้องวัดระยะ|2|พร้อมถ่าน\nขาตั้งกล้อง|1|", "ดูแลดี", "คืนแล้ว", "มานี อนุมัติ",
    "มานี อนุมัติ", "กิตติ ทดสอบ",
    "https://i.ibb.co/demo/req-form.jpg",
    "seen",
    "https://i.ibb.co/demo/extra-1.jpg\nhttps://i.ibb.co/demo/extra-2.jpg",
    null,
    "หนังสือรับทราบเงื่อนไขการรับมอบอุปกรณ์",
    "<p>รายละเอียดสัญญาสำหรับ <strong>{{employeeName}}</strong></p>",
    JSON.stringify(agreementMeta1),
    new Date("2026-09-18T10:40:00Z"),
    new Date("2026-09-19T13:51:02Z"),
    "Engineering",
  ]);

  // Row 2: RichText + Hyperlink wrapper regression + legacy item syntax fallback
  const assetRowId2 = "22222222-3333-4444-8555-666666666666";
  const adminSignUrl = "https://i.ibb.co/Vc898yfR/sign.png";
  const agreementJson2 = JSON.stringify({
    signatureBoxes: [
      {
        id: "employee",
        label: "พนักงานผู้รับมอบ",
        role: "พนักงานผู้รับมอบ",
        name: "กิตติ ทดสอบ",
        signer: "employee",
        position: "bottom-left",
        page: 3,
        x: 10,
        y: 72,
        signatureData: "https://i.ibb.co/demo/emp2.jpg",
        status: "signed",
        signedAt: "2026-09-20T08:00:00.000Z",
      },
      {
        id: "admin",
        label: "ผู้อนุมัติ",
        role: "ผู้อนุมัติ",
        name: "มานี อนุมัติ",
        signer: "admin",
        position: "lower-right",
        page: 3,
        x: 60,
        y: 82,
        signatureData: adminSignUrl,
        status: "signed",
        signedAt: "2026-09-20T09:00:00.000Z",
      },
    ],
    header: "",
    footer: "",
    status: "completed",
    createdBy: "มานี อนุมัติ",
    createdByCode: "1904",
    returnCondition: null,
  });
  const [prefixJson, suffixJson] = agreementJson2.split(adminSignUrl);

  assets.addRow([
    assetRowId2,
    new Date("2026-09-20T08:00:00Z"),
    "กิตติ ทดสอบ", "Backend Engineer", "2633", "",
    new Date("2026-09-20T00:00:00Z"), null,
    "หมวกนิรภัย (2)", "", "รอ", "มานี อนุมัติ",
    null, null, null, "seen", null, null,
    "สัญญาฉบับที่ 2",
    "<p>เนื้อหาสัญญาฉบับที่ 2</p>",
    {
      text: {
        richText: [
          { text: prefixJson },
          { text: adminSignUrl },
          { text: suffixJson },
        ],
      },
      hyperlink: adminSignUrl,
    },
    null, null, "Engineering",
  ]);

  if (!options.omitWorkSheet) {
    const work = wb.addWorksheet(SHEET_WORK);
    work.addRow([
      "วันที่", "เลขที่บ้าน", "รอบที่", "ชื่อโครงการ", "สถานะ", "สถานะย่อย", "ผู้ปฏิบัติงาน",
    ]);
    // Row 2: Primary block (DD/MM/YYYY + "in progress") + Shifted secondary block cols 7..13
    work.addRow([
      "14/07/2026",
      "99/31",
      "2",
      "โครงการทดสอบ A",
      "in progress",
      JSON.stringify([{ detail: "ภายนอก", status: "in progress" }, { detail: "ชั้น 2", status: "completed" }]),
      JSON.stringify({ "2633": [{ date: "14/07/2026", time: "09:00-12:00", name: "กิตติ ทดสอบ", items: ["99/31 รอบ 2"] }] }),
      new Date("2026-07-26T00:00:00Z"),
      "50/170",
      "1",
      "โครงการเสริม B",
      "completed",
      JSON.stringify([{ detail: "ทั้งหมด", status: "completed", reportStatuses: { main: "done" } }]),
      JSON.stringify({ "2633": [{ date: "26/07/2026", time: "14:00-17:00", name: "กิตติ ทดสอบ", items: ["50/170 รอบ 1"] }] }),
    ]);
    // Row 3: Excel auto-date house number (1/8 -> Date 2026-08-01), matched via worker items
    work.addRow([
      "2026-08-02",
      new Date("2026-08-01T00:00:00Z"),
      1,
      "โครงการทดสอบ C",
      "delivered",
      JSON.stringify([{ detail: "-", status: "delivered" }, { detail: "ชั้น 1", status: "delivered" }]),
      JSON.stringify({ "2633": [{ date: "02/08/2026", time: "08:00-17:00", name: "กิตติ ทดสอบ", items: ["1/8 รอบ1 ทำเสร็จ"] }] }),
    ]);
    // Row 4: Duplicate key matching 50/170 | round 1 | 2026-07-26 -> merges cleanly
    work.addRow([
      "26/07/2026",
      "50/170",
      "1",
      "โครงการเสริม B",
      "completed",
      JSON.stringify([{ detail: "ตรวจซ้ำ", status: "completed" }]),
      JSON.stringify({ "1904": [{ date: "26/07/2026", time: "17:00-18:00", name: "มานี อนุมัติ", items: ["50/170 เก็บตก"] }] }),
    ]);
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("lib/migration/appsheet", () => {
  it("parses all 5 AppSheet sheets including Agreements/Signers, Work Tracking recovery, and deterministic UUIDs", async () => {
    const buffer = await buildSyntheticWorkbook();
    const parsed = await parseAppSheetWorkbook(buffer);

    expect(parsed.errors).toEqual([]);
    expect(parsed.sheetsFound).toEqual([
      SHEET_EMPLOYEES,
      SHEET_ASSETS,
      SHEET_OVERTIME,
      SHEET_LEAVE,
      SHEET_WORK,
    ]);
    expect(parsed.sheetsMissing).toEqual([]);
    expect(parsed.summary).toEqual({
      employeesActive: 2,
      employeesFormerStubs: 2,
      employeesTotal: 4,
      usersProvisioned: 2,
      usersSkippedNoEmail: 0,
      departments: 2,
      positions: 3,
      overtimeRequests: 2,
      leaveRequests: 2,
      assetRequests: 2,
      assetItems: 3,
      assetAgreements: 2,
      assetAgreementSigners: 5,
      assetAttachments: 3,
      workTrackingRecords: 3,
      hasWorkSheet: true,
    });

    const kitti = parsed.data.employees.find((e) => e.code === "2633");
    expect(kitti).toMatchObject({
      code: "2633",
      prefix: "นาย",
      firstName: "กิตติ",
      lastName: "ทดสอบ",
      email: "kitti@example.com",
      weeklyHolidays: [0, 6],
      startDate: "2025-03-01",
      birthDate: "1995-05-12",
      lineUid: "U_LINE_001",
      employmentTypeCode: "full_time",
      isFormerStub: false,
    });

    const manee = parsed.data.employees.find((e) => e.code === "1904");
    expect(manee?.prefix).toBe("นางสาว"); // normalized from น.ส.
    expect(manee?.employmentTypeCode).toBe("contract");

    const formerSheetEmp = parsed.data.employees.find((e) => e.code === "2101");
    expect(formerSheetEmp?.isFormerStub).toBe(true);

    const stub = parsed.data.employees.find((e) => e.code === "2426");
    expect(stub).toMatchObject({
      code: "2426",
      firstName: "สมศักดิ์",
      lastName: "เก่า",
      startDate: "2026-07-20",
      employmentTypeCode: null,
      isFormerStub: true,
    });

    // Overnight shift on 2026-08-02 23:00+07 -> 2026-08-03 02:00+07
    const overnightOt = parsed.data.overtime.find((r) => r.employeeCode === "2426");
    expect(overnightOt?.reason).toBe("ไม่ระบุ");
    expect(new Date(overnightOt!.endAtIso).getTime() - new Date(overnightOt!.startAtIso).getTime()).toBe(3 * 3_600_000);

    // Leave row with half-day pm, attachment stored on attachmentUrl column, decidedAt parsed in Bangkok midday
    const kittiLeave = parsed.data.leave.find((r) => r.employeeCode === "2633");
    expect(kittiLeave).toMatchObject({
      leaveTypeCode: "personal",
      session: "pm",
      status: "approved",
      decidedByCode: "1904",
      reason: "ครึ่งบ่าย ไปธนาคาร",
      attachmentUrl: "https://res.cloudinary.com/demo/image/upload/doc.jpg",
    });
    expect(kittiLeave?.decidedAtIso).toBe("2026-09-14T05:00:00.000Z");

    // Asset request 1: items, attachments, return actors, agreement + signers, UTC signedAt preservation
    const asset1 = parsed.data.assets[0];
    expect(asset1.items).toEqual([
      { name: "กล้องวัดระยะ", quantity: 2, note: "พร้อมถ่าน" },
      { name: "ขาตั้งกล้อง", quantity: 1, note: "" },
    ]);
    expect(asset1.status).toBe("returned");
    expect(asset1.returnInspectorCode).toBe("1904");
    expect(asset1.approvedReturnByCode).toBe("2633");
    expect(asset1.requestAttachments).toEqual(["https://i.ibb.co/demo/req-form.jpg"]);
    expect(asset1.additionalAttachments).toEqual([
      "https://i.ibb.co/demo/extra-1.jpg",
      "https://i.ibb.co/demo/extra-2.jpg",
    ]);
    expect(asset1.borrowerSignatureData).toBe("https://i.ibb.co/demo/emp-sig.jpg");
    expect(asset1.approvedBorrowSignatureData).toBe("https://i.ibb.co/demo/admin-sig.png");
    expect(asset1.approvedBorrowAtIso).toBe("2026-09-19T06:51:01.809Z");
    expect(asset1.agreement).not.toBeNull();
    expect(asset1.agreement?.createdByCode).toBeNull(); // 7777 is excluded, only raw code saved
    expect(asset1.agreement?.createdByRawCode).toBe("7777");
    expect(asset1.agreement?.signers).toHaveLength(3);
    expect(asset1.agreement?.signers[0]).toMatchObject({
      boxId: "employee",
      participant: "employee",
      signerKind: "employee",
      page: 3,
      xPercent: "10",
      yPercent: "72",
      signatureStatus: "signed",
      signedByCode: "2633",
      signedAtIso: "2026-09-18T09:40:11.409Z",
    });
    expect(asset1.agreement?.signers[1].signedByCode).toBe("1904");
    expect(toDomainAgreement(asset1.agreement!).signatureBoxes).toHaveLength(3);

    // Asset request 2: RichText+Hyperlink unwrapped cleanly + legacy "หมวกนิรภัย (2)" parsed
    const asset2 = parsed.data.assets[1];
    expect(asset2.status).toBe("pending");
    expect(asset2.items).toEqual([{ name: "หมวกนิรภัย", quantity: 2, note: "" }]);
    expect(asset2.agreement?.createdByCode).toBe("1904");
    expect(asset2.agreement?.signers).toHaveLength(2);
    expect(asset2.agreement?.signers[1].signatureData).toBe("https://i.ibb.co/Vc898yfR/sign.png");
    expect(toDomainAgreement(asset2.agreement!).status).toBe("completed");

    // Work tracking: 99/31 (round 2 -> +3d, "in progress" -> "in_progress"), 50/170 (shifted + dup merged), 1/8 (recovered date house, round 1 -> +5d)
    const work99 = parsed.data.workTracking.find((w) => w.houseNo === "99/31");
    expect(work99).toMatchObject({
      houseNo: "99/31",
      round: "2",
      eventDate: "2026-07-14",
      deliveredDate: "2026-07-17",
      status: "in_progress",
      detail: "ภายนอก, ชั้น 2",
    });

    const work50 = parsed.data.workTracking.find((w) => w.houseNo === "50/170");
    expect(work50).toMatchObject({
      houseNo: "50/170",
      round: "1",
      eventDate: "2026-07-26",
      deliveredDate: "2026-07-31",
      status: "completed",
      reportStatuses: { main: "done" },
    });
    expect(Object.keys(work50!.workers).sort()).toEqual(["1904", "2633"]);
    expect(work50!.subStatuses).toHaveLength(2);

    const workRecovered = parsed.data.workTracking.find((w) => w.houseNo === "1/8");
    expect(workRecovered).toMatchObject({
      houseNo: "1/8",
      round: "1",
      eventDate: "2026-08-02",
      deliveredDate: "2026-08-07",
      status: "delivered",
      detail: "ชั้น 1",
    });

    // Deterministic UUID across re-parses
    const parsedAgain = await parseAppSheetWorkbook(buffer);
    expect(parsedAgain.data.overtime.map((o) => o.id)).toEqual(parsed.data.overtime.map((o) => o.id));
    expect(parsedAgain.data.leave.map((l) => l.id)).toEqual(parsed.data.leave.map((l) => l.id));
    expect(parsedAgain.data.workTracking.map((w) => w.id)).toEqual(parsed.data.workTracking.map((w) => w.id));
    expect(deterministicUuid("test", 123)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("marks work tracking as preserved when the work sheet is omitted", async () => {
    const buffer = await buildSyntheticWorkbook({ omitWorkSheet: true });
    const parsed = await parseAppSheetWorkbook(buffer);

    expect(parsed.sheetsMissing).toEqual([SHEET_WORK]);
    expect(parsed.summary.hasWorkSheet).toBe(false);
    expect(parsed.summary.workTrackingRecords).toBe(0);
  });

  it("reports duplicate employee emails as blocking errors", async () => {
    const buffer = await buildSyntheticWorkbook({ duplicateEmail: true });
    const parsed = await parseAppSheetWorkbook(buffer);

    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.errors[0]).toContain("kitti@example.com");
  });

  it("throws a 400 SheetMigrationError when no supported sheet exists in the workbook", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("OtherSheet");
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    await expect(parseAppSheetWorkbook(buffer)).rejects.toThrow(SheetMigrationError);
  });

  it("parses an OT-only workbook without an employees sheet when existingEmployees are supplied", async () => {
    const wb = new ExcelJS.Workbook();
    const ot = wb.addWorksheet(SHEET_OVERTIME);
    ot.addRow(["วันที่", "เวลาเริ่ม", "เวลาเลิก", "col3", "ชื่อพนักงาน", "หมายเหตุ", "สถานะ", "col7", "อนุมัติโดย", "ความเห็นหัวหน้า"]);
    ot.addRow(["20/11/2026", "18:00", "20:30", null, "กิตติ ทดสอบ", "งานเร่งด่วน", "อนุมัติแล้ว", null, "มานี อนุมัติ", "โอเค"]);

    const parsed = await parseAppSheetWorkbook(Buffer.from(await wb.xlsx.writeBuffer()), {
      existingEmployees: [
        { code: "2633", firstName: "กิตติ", lastName: "ทดสอบ", email: "kitti@example.com", department: "Engineering", isFormer: false },
        { code: "1904", firstName: "มานี", lastName: "อนุมัติ", email: "manee@example.com", department: "People", isFormer: false },
      ],
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.sheetsFound).toEqual([SHEET_OVERTIME]);
    expect(parsed.data.overtime).toHaveLength(1);
    expect(parsed.data.overtime[0]).toMatchObject({
      employeeCode: "2633",
      employeeName: "กิตติ ทดสอบ",
      status: "approved",
      reason: "งานเร่งด่วน",
      decidedByCode: "1904",
      decisionNote: "โอเค",
    });
    // Existing DB-only employees must not leak into parsed.data.employees or summary counts
    expect(parsed.data.employees).toEqual([]);
    expect(parsed.summary.employeesTotal).toBe(0);
    expect(parsed.summary.usersProvisioned).toBe(0);
  });

  it("counts active employees without valid emails as skipped users with warnings while ignoring former employees", async () => {
    const wb = new ExcelJS.Workbook();
    const emp = wb.addWorksheet(SHEET_EMPLOYEES);
    const makeRow = (name: string, code: string, email: string | null, status: string) => {
      const row = new Array(20).fill(null);
      row[0] = name;
      row[1] = code;
      row[4] = email;
      row[8] = new Date("2025-01-01T00:00:00Z");
      row[19] = status;
      return row;
    };
    emp.addRow(makeRow("ชื่อพนักงาน", "รหัสพนักงาน", "อีเมล", "สถานะ"));
    emp.addRow(makeRow("มีเมล ถูกต้อง", "1001", "valid@example.com", "ปฏิบัติงาน"));
    emp.addRow(makeRow("ไม่มี เมล", "1002", null, "ปฏิบัติงาน"));
    emp.addRow(makeRow("เมล ผิดรูป", "1003", "not-an-email", "ปฏิบัติงาน"));
    emp.addRow(makeRow("พ้นสภาพ ไม่มีเมล", "1004", null, "พ้นสภาพ"));

    const parsed = await parseAppSheetWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));

    expect(parsed.errors).toEqual([]);
    expect(parsed.summary.employeesActive).toBe(3);
    expect(parsed.summary.employeesFormerStubs).toBe(1);
    expect(parsed.summary.usersProvisioned).toBe(1);
    expect(parsed.summary.usersSkippedNoEmail).toBe(2);
    expect(parsed.warnings.filter((w) => w.startsWith("[users]"))).toHaveLength(2);
    expect(parsed.warnings.some((w) => w.includes("1002") && w.includes("ไม่มีอีเมล"))).toBe(true);
    expect(parsed.warnings.some((w) => w.includes("1003") && w.includes("รูปแบบไม่ถูกต้อง"))).toBe(true);
    expect(parsed.warnings.some((w) => w.includes("1004"))).toBe(false);
  });
});
