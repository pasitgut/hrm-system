export const ADMIN_TABLE_KEYS = [
  "employees",
  "users",
  "overtime_requests",
  "leave_requests",
  "asset_requests",
  "work_tracking_records",
  "work_tracking_requests",
  "work_tracking_activities",
  "employee_documents",
  "departments",
  "positions",
  "employment_statuses",
  "employment_types",
  "leave_types",
  "asset_agreement_templates",
  "asset_agreements",
  "line_calendar_events",
  "line_integration_jobs",
  "line_bot_states",
  "line_webhook_events",
] as const;

export type AdminTableKey = (typeof ADMIN_TABLE_KEYS)[number];

export type AdminTableGroup = "บุคลากรและบัญชี" | "คำขอและการทำงาน" | "ข้อมูลหลัก" | "ระบบ LINE & Sync";

export type AdminFieldType =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "textarea"
  | "boolean"
  | "password"
  | "select"
  | "readonly";

export type AdminLookupKey =
  | "employees"
  | "departments"
  | "positions"
  | "employmentStatuses"
  | "employmentTypes"
  | "leaveTypes"
  | "requestStatuses"
  | "roles";

export type AdminFieldDef = {
  key: string;
  label: string;
  type: AdminFieldType;
  required?: boolean;
  nullable?: boolean;
  creatable?: boolean;
  editable?: boolean;
  showInTable?: boolean;
  displayKey?: string;
  lookup?: AdminLookupKey;
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
};

export type AdminTableDef = {
  key: AdminTableKey;
  label: string;
  group: AdminTableGroup;
  primaryKey: string;
  description: string;
  creatable: boolean;
  editable: boolean;
  deletable: boolean;
  requireCodeConfirm?: boolean;
  cascadeWarning?: string;
  fields: readonly AdminFieldDef[];
};

const OVERTIME_SOURCE_OPTIONS = [
  { value: "hrm", label: "HRM เว็บไซต์" },
  { value: "line_bot", label: "LINE Bot" },
] as const;

const LEAVE_SESSION_OPTIONS = [
  { value: "full", label: "เต็มวัน" },
  { value: "am", label: "ครึ่งวันเช้า" },
  { value: "pm", label: "ครึ่งวันบ่าย" },
] as const;

const ASSET_REQUEST_STATUS_OPTIONS = [
  { value: "pending", label: "รออนุมัติ" },
  { value: "approved", label: "กำลังยืม" },
  { value: "rejected", label: "ไม่อนุมัติ" },
  { value: "return_pending", label: "รอตรวจรับคืน" },
  { value: "returned", label: "คืนแล้ว" },
  { value: "unknown", label: "ไม่ทราบสถานะ" },
] as const;

const WORK_STATUS_OPTIONS = [
  { value: "in_progress", label: "กำลังดำเนินการ" },
  { value: "completed", label: "เสร็จแล้ว" },
  { value: "delivered", label: "ส่งมอบแล้ว" },
] as const;

const QUOTA_BASIS_OPTIONS = [
  { value: "fixed", label: "คงที่รายปี" },
  { value: "tenure", label: "ตามอายุงาน" },
] as const;

const AGREEMENT_TYPE_OPTIONS = [
  { value: "borrow", label: "สัญญายืมทรัพย์สิน" },
  { value: "asset_form", label: "แบบฟอร์มทรัพย์สิน" },
] as const;

const AGREEMENT_STATUS_OPTIONS = [
  { value: "waiting_handover", label: "รอส่งมอบ" },
  { value: "waiting_employee", label: "รอพนักงานลงนาม" },
  { value: "waiting_admin", label: "รอผู้ดูแลลงนาม" },
  { value: "completed", label: "เสร็จสมบูรณ์" },
] as const;

export const ADMIN_TABLES: readonly AdminTableDef[] = [
  {
    key: "employees",
    label: "พนักงาน",
    group: "บุคลากรและบัญชี",
    primaryKey: "id",
    description: "เพิ่ม แก้ไข กู้คืนจากสถานะพ้นสภาพ หรือลบพนักงานถาวรพร้อมข้อมูลที่ผูกอยู่",
    creatable: true,
    editable: true,
    deletable: true,
    requireCodeConfirm: true,
    cascadeWarning: "การลบพนักงานถาวรจะลบบัญชีผู้ใช้ คำขอ OT คำขอลา คำขอยืมทรัพย์สิน เอกสาร และกิจกรรมปฏิทินที่ผูกกับพนักงานคนนี้ทั้งหมด",
    fields: [
      { key: "code", label: "รหัสพนักงาน (4 หลัก)", type: "text", required: true, creatable: true, editable: true, showInTable: true, placeholder: "เช่น 1001" },
      { key: "prefix", label: "คำนำหน้า", type: "text", nullable: true, creatable: true, editable: true },
      { key: "firstName", label: "ชื่อ", type: "text", required: true, creatable: true, editable: true, showInTable: true },
      { key: "lastName", label: "นามสกุล", type: "text", required: true, creatable: true, editable: true, showInTable: true },
      { key: "nickname", label: "ชื่อเล่น", type: "text", nullable: true, creatable: true, editable: true },
      { key: "email", label: "อีเมล", type: "text", nullable: true, creatable: true, editable: true, showInTable: true },
      { key: "phone", label: "เบอร์โทร", type: "text", nullable: true, creatable: true, editable: true },
      { key: "citizenId", label: "เลขบัตรประชาชน", type: "text", nullable: true, creatable: true, editable: true },
      { key: "lineUid", label: "LINE UID", type: "text", nullable: true, creatable: true, editable: true },
      { key: "startDate", label: "วันเริ่มงาน", type: "date", required: true, creatable: true, editable: true, showInTable: true },
      { key: "endDate", label: "วันสิ้นสุดงาน", type: "date", nullable: true, creatable: true, editable: true },
      { key: "baseSalary", label: "ฐานเงินเดือน", type: "number", nullable: true, creatable: true, editable: true },
      { key: "departmentId", label: "แผนก", type: "select", nullable: true, lookup: "departments", displayKey: "departmentName", creatable: true, editable: true, showInTable: true },
      { key: "positionId", label: "ตำแหน่ง", type: "select", nullable: true, lookup: "positions", displayKey: "positionName", creatable: true, editable: true },
      { key: "employmentStatusId", label: "สถานะการทำงาน", type: "select", nullable: true, lookup: "employmentStatuses", displayKey: "employmentStatusName", creatable: true, editable: true },
      { key: "employmentTypeId", label: "ประเภทการจ้าง", type: "select", nullable: true, lookup: "employmentTypes", displayKey: "employmentTypeName", creatable: true, editable: true },
      { key: "isActive", label: "สถานะปฏิบัติงาน", type: "boolean", creatable: false, editable: true, showInTable: true, hint: "ปิดไว้ = พ้นสภาพ (soft deleted); เปิดไว้ = ปฏิบัติงานปกติ" },
    ],
  },
  {
    key: "users",
    label: "บัญชีผู้ใช้",
    group: "บุคลากรและบัญชี",
    primaryKey: "id",
    description: "จัดการบัญชีเข้าสู่ระบบ รีเซ็ตรหัสผ่าน เปลี่ยนบทบาท เปิด/ปิดการใช้งาน หรือลบบัญชี",
    creatable: true,
    editable: true,
    deletable: true,
    fields: [
      { key: "employeeId", label: "พนักงานที่ผูก", type: "select", required: true, lookup: "employees", displayKey: "employeeDisplay", creatable: true, editable: false, showInTable: true },
      { key: "email", label: "อีเมลเข้าสู่ระบบ", type: "text", required: true, creatable: true, editable: true, showInTable: true },
      { key: "role", label: "บทบาท", type: "select", required: true, lookup: "roles", displayKey: "roleLabel", creatable: true, editable: true, showInTable: true },
      { key: "newPassword", label: "รหัสผ่าน (กรอกเมื่อตั้งใหม่/รีเซ็ต)", type: "password", nullable: true, creatable: true, editable: true, hint: "ปล่อยว่างตอนแก้ไขหากไม่ต้องการเปลี่ยนรหัสผ่าน" },
      { key: "isActive", label: "เปิดใช้งาน", type: "boolean", creatable: true, editable: true, showInTable: true },
      { key: "mustChangePassword", label: "บังคับเปลี่ยนรหัสครั้งแรก", type: "boolean", creatable: true, editable: true, showInTable: true },
    ],
  },
  {
    key: "overtime_requests",
    label: "คำขอ OT",
    group: "คำขอและการทำงาน",
    primaryKey: "id",
    description: "ตรวจสอบ แก้ไขสถานะ เพิ่ม หรือลบรายการคำขอ OT โดยตรง",
    creatable: true,
    editable: true,
    deletable: true,
    fields: [
      { key: "employeeId", label: "พนักงาน", type: "select", required: true, lookup: "employees", displayKey: "employeeDisplay", creatable: true, editable: true, showInTable: true },
      { key: "startAt", label: "เวลาเริ่ม (ไทย UTC+7)", type: "datetime", required: true, displayKey: "startAtDisplay", creatable: true, editable: true, showInTable: true },
      { key: "endAt", label: "เวลาสิ้นสุด (ไทย UTC+7)", type: "datetime", required: true, displayKey: "endAtDisplay", creatable: true, editable: true, showInTable: true },
      { key: "reason", label: "รายละเอียดงาน", type: "textarea", required: true, creatable: true, editable: true, showInTable: true },
      { key: "statusCode", label: "สถานะ", type: "select", required: true, lookup: "requestStatuses", displayKey: "statusName", creatable: true, editable: true, showInTable: true },
      { key: "source", label: "แหล่งที่มา", type: "select", required: true, options: OVERTIME_SOURCE_OPTIONS, creatable: true, editable: true, showInTable: true },
      { key: "decisionNote", label: "หมายเหตุผู้อนุมัติ", type: "textarea", nullable: true, creatable: true, editable: true },
    ],
  },
  {
    key: "leave_requests",
    label: "คำขอวันลา",
    group: "คำขอและการทำงาน",
    primaryKey: "id",
    description: "จัดการคำขอวันลาทุกสถานะ (ลบคำขอวันลาจะลบกิจกรรมปฏิทิน LINE ที่เชื่อมกันด้วย)",
    creatable: true,
    editable: true,
    deletable: true,
    cascadeWarning: "หากคำขอวันลามีข้อมูลปฏิทิน LINE เชื่อมอยู่ ระบบจะลบรายการปฏิทินที่เชื่อมกันออกด้วย",
    fields: [
      { key: "employeeId", label: "พนักงาน", type: "select", required: true, lookup: "employees", displayKey: "employeeDisplay", creatable: true, editable: true, showInTable: true },
      { key: "leaveTypeCode", label: "ประเภทการลา", type: "select", required: true, lookup: "leaveTypes", displayKey: "leaveTypeName", creatable: true, editable: true, showInTable: true },
      { key: "startOn", label: "ตั้งแต่วันที่", type: "date", required: true, creatable: true, editable: true, showInTable: true },
      { key: "endOn", label: "ถึงวันที่", type: "date", required: true, creatable: true, editable: true, showInTable: true },
      { key: "session", label: "ช่วงเวลา", type: "select", required: true, options: LEAVE_SESSION_OPTIONS, creatable: true, editable: true },
      { key: "reason", label: "เหตุผล", type: "textarea", nullable: true, creatable: true, editable: true, showInTable: true },
      { key: "statusCode", label: "สถานะ", type: "select", required: true, lookup: "requestStatuses", displayKey: "statusName", creatable: true, editable: true, showInTable: true },
      { key: "decisionNote", label: "หมายเหตุผู้อนุมัติ", type: "textarea", nullable: true, creatable: true, editable: true },
    ],
  },
  {
    key: "asset_requests",
    label: "คำขอยืมทรัพย์สิน",
    group: "คำขอและการทำงาน",
    primaryKey: "id",
    description: "แก้ไขสถานะหรือลบคำขอยืมทรัพย์สิน พร้อมประวัติเหตุการณ์และไฟล์แนบที่เกี่ยวข้อง",
    creatable: false,
    editable: true,
    deletable: true,
    cascadeWarning: "การลบคำขอยืมทรัพย์สินจะลบรายการสิ่งของ ไฟล์แนบ และประวัติเหตุการณ์ (events) ของคำขอนี้ออกทั้งหมด",
    fields: [
      { key: "borrowerEmployeeCode", label: "รหัสผู้ยืม", type: "readonly", showInTable: true },
      { key: "borrowerName", label: "ชื่อผู้ยืม", type: "readonly", showInTable: true },
      { key: "fromDate", label: "วันที่เริ่มยืม", type: "date", required: true, editable: true, showInTable: true },
      { key: "toDate", label: "วันที่คืน", type: "date", nullable: true, editable: true, showInTable: true },
      { key: "status", label: "สถานะ", type: "select", required: true, options: ASSET_REQUEST_STATUS_OPTIONS, editable: true, showInTable: true },
      { key: "reason", label: "เหตุผล", type: "textarea", editable: true, showInTable: true },
      { key: "remarks", label: "หมายเหตุ", type: "textarea", editable: true },
    ],
  },
  {
    key: "work_tracking_records",
    label: "บันทึกติดตามงาน",
    group: "คำขอและการทำงาน",
    primaryKey: "id",
    description: "ดู เพิ่ม แก้ไข หรือลบบันทึกงานตรวจบ้านรายแปลง",
    creatable: true,
    editable: true,
    deletable: true,
    fields: [
      { key: "houseNo", label: "บ้านเลขที่/แปลง", type: "text", required: true, creatable: true, editable: true, showInTable: true },
      { key: "round", label: "รอบตรวจ", type: "text", required: true, creatable: true, editable: true, showInTable: true },
      { key: "eventDate", label: "วันที่ตรวจ", type: "date", required: true, creatable: true, editable: true, showInTable: true },
      { key: "projectText", label: "โครงการ", type: "text", creatable: true, editable: true, showInTable: true },
      { key: "detail", label: "รายละเอียด", type: "textarea", creatable: true, editable: true },
      { key: "status", label: "สถานะ", type: "select", required: true, options: WORK_STATUS_OPTIONS, creatable: true, editable: true, showInTable: true },
      { key: "deliveredDate", label: "วันที่ส่งมอบ", type: "date", nullable: true, creatable: true, editable: true },
    ],
  },
  {
    key: "work_tracking_requests",
    label: "คำขอติดตามงาน LINE",
    group: "คำขอและการทำงาน",
    primaryKey: "requestId",
    description: "จัดการสถานะคำขอติดตามงานที่ซิงก์กับ LINE และ API Checker",
    creatable: false,
    editable: true,
    deletable: true,
    cascadeWarning: "การลบคำขอติดตามงานจะลบกิจกรรมย่อยที่ผูกอยู่ภายใต้คำขอนี้ทั้งหมด",
    fields: [
      { key: "requestId", label: "Request ID", type: "readonly", showInTable: true },
      { key: "houseNo", label: "บ้านเลขที่", type: "text", required: true, editable: true, showInTable: true },
      { key: "round", label: "รอบ", type: "text", required: true, editable: true, showInTable: true },
      { key: "eventDate", label: "Event Date", type: "date", required: true, editable: true },
      { key: "workDate", label: "วันที่ทำงาน", type: "date", required: true, editable: true, showInTable: true },
      { key: "projectShortName", label: "ชื่อย่อโครงการ", type: "text", editable: true, showInTable: true },
      { key: "developerNote", label: "โน้ตโครงการ", type: "textarea", editable: true },
      { key: "latestStatus", label: "สถานะล่าสุด", type: "select", required: true, options: WORK_STATUS_OPTIONS, editable: true, showInTable: true },
      { key: "latestAction", label: "กิจกรรมล่าสุด", type: "text", editable: true },
      { key: "isOt", label: "เป็นงาน OT", type: "boolean", editable: true, showInTable: true },
    ],
  },
  {
    key: "work_tracking_activities",
    label: "กิจกรรมติดตามงาน",
    group: "คำขอและการทำงาน",
    primaryKey: "activityId",
    description: "แก้ไขหรือลบบันทึกกิจกรรมงานรายครั้ง",
    creatable: false,
    editable: true,
    deletable: true,
    fields: [
      { key: "activityId", label: "Activity ID", type: "readonly", showInTable: true },
      { key: "houseNo", label: "บ้านเลขที่", type: "readonly", showInTable: true },
      { key: "employeeName", label: "พนักงาน", type: "readonly", showInTable: true },
      { key: "workDate", label: "วันที่ทำงาน", type: "date", required: true, editable: true, showInTable: true },
      { key: "startTime", label: "เริ่ม", type: "text", required: true, editable: true, showInTable: true },
      { key: "endTime", label: "สิ้นสุด", type: "text", required: true, editable: true, showInTable: true },
      { key: "action", label: "กิจกรรม", type: "text", editable: true },
      { key: "status", label: "สถานะ", type: "select", required: true, options: WORK_STATUS_OPTIONS, editable: true, showInTable: true },
      { key: "isOt", label: "งาน OT", type: "boolean", editable: true, showInTable: true },
    ],
  },
  {
    key: "employee_documents",
    label: "เอกสารพนักงาน",
    group: "คำขอและการทำงาน",
    primaryKey: "id",
    description: "แก้ชื่อไฟล์หรือลบข้อมูลเมตาของเอกสารพนักงานในฐานข้อมูล",
    creatable: false,
    editable: true,
    deletable: true,
    fields: [
      { key: "employeeDisplay", label: "พนักงาน", type: "readonly", showInTable: true },
      { key: "fileName", label: "ชื่อไฟล์", type: "text", required: true, editable: true, showInTable: true },
      { key: "mimeType", label: "ประเภทไฟล์", type: "readonly", showInTable: true },
      { key: "fileSize", label: "ขนาด (bytes)", type: "readonly", showInTable: true },
    ],
  },
  {
    key: "departments",
    label: "แผนก",
    group: "ข้อมูลหลัก",
    primaryKey: "id",
    description: "จัดการข้อมูลแผนกในระบบ",
    creatable: true,
    editable: true,
    deletable: true,
    fields: [
      { key: "name", label: "ชื่อแผนก", type: "text", required: true, creatable: true, editable: true, showInTable: true },
      { key: "isActive", label: "เปิดใช้งาน", type: "boolean", creatable: true, editable: true, showInTable: true },
    ],
  },
  {
    key: "positions",
    label: "ตำแหน่ง",
    group: "ข้อมูลหลัก",
    primaryKey: "id",
    description: "จัดการข้อมูลตำแหน่งงานในระบบ",
    creatable: true,
    editable: true,
    deletable: true,
    fields: [
      { key: "name", label: "ชื่อตำแหน่ง", type: "text", required: true, creatable: true, editable: true, showInTable: true },
      { key: "isActive", label: "เปิดใช้งาน", type: "boolean", creatable: true, editable: true, showInTable: true },
    ],
  },
  {
    key: "employment_statuses",
    label: "สถานะพนักงาน",
    group: "ข้อมูลหลัก",
    primaryKey: "id",
    description: "จัดการรายการสถานะพนักงาน",
    creatable: true,
    editable: true,
    deletable: true,
    fields: [
      { key: "name", label: "ชื่อสถานะ", type: "text", required: true, creatable: true, editable: true, showInTable: true },
      { key: "isActive", label: "เปิดใช้งาน", type: "boolean", creatable: true, editable: true, showInTable: true },
    ],
  },
  {
    key: "employment_types",
    label: "ประเภทการจ้างงาน",
    group: "ข้อมูลหลัก",
    primaryKey: "id",
    description: "จัดการรายการประเภทการจ้างงาน",
    creatable: true,
    editable: true,
    deletable: true,
    fields: [
      { key: "code", label: "รหัส", type: "text", required: true, creatable: true, editable: true, showInTable: true },
      { key: "name", label: "ชื่อประเภทการจ้าง", type: "text", required: true, creatable: true, editable: true, showInTable: true },
      { key: "isActive", label: "เปิดใช้งาน", type: "boolean", creatable: true, editable: true, showInTable: true },
    ],
  },
  {
    key: "leave_types",
    label: "ประเภทการลา",
    group: "ข้อมูลหลัก",
    primaryKey: "code",
    description: "เพิ่ม แก้ไข หรือลบประเภทการลา (หากมีคำขอลาอ้างอิงอยู่จะไม่สามารถลบได้)",
    creatable: true,
    editable: true,
    deletable: true,
    fields: [
      { key: "code", label: "รหัส (code)", type: "text", required: true, creatable: true, editable: false, showInTable: true },
      { key: "name", label: "ชื่อประเภทการลา", type: "text", required: true, creatable: true, editable: true, showInTable: true },
      { key: "description", label: "คำอธิบาย", type: "textarea", nullable: true, creatable: true, editable: true },
      { key: "annualQuotaDays", label: "โควตาต่อปี (วัน)", type: "number", nullable: true, creatable: true, editable: true, showInTable: true },
      { key: "quotaBasis", label: "เกณฑ์คำนวณโควตา", type: "select", required: true, options: QUOTA_BASIS_OPTIONS, creatable: true, editable: true, showInTable: true },
      { key: "isActive", label: "เปิดใช้งาน", type: "boolean", creatable: true, editable: true, showInTable: true },
    ],
  },
  {
    key: "asset_agreement_templates",
    label: "แม่แบบสัญญาทรัพย์สิน",
    group: "ข้อมูลหลัก",
    primaryKey: "id",
    description: "เปิด/ปิด แก้ไขชื่อ หรือลบแม่แบบเอกสารสัญญา",
    creatable: false,
    editable: true,
    deletable: true,
    fields: [
      { key: "title", label: "ชื่อแม่แบบ", type: "text", required: true, editable: true, showInTable: true },
      { key: "type", label: "ประเภท", type: "select", required: true, options: AGREEMENT_TYPE_OPTIONS, editable: true, showInTable: true },
      { key: "isActive", label: "เปิดใช้งาน", type: "boolean", editable: true, showInTable: true },
    ],
  },
  {
    key: "asset_agreements",
    label: "เอกสารสัญญาทรัพย์สิน",
    group: "ข้อมูลหลัก",
    primaryKey: "id",
    description: "แก้ไขสถานะ วันที่เอกสาร หรือลบเอกสารสัญญาทรัพย์สิน",
    creatable: false,
    editable: true,
    deletable: true,
    fields: [
      { key: "title", label: "ชื่อสัญญา", type: "text", required: true, editable: true, showInTable: true },
      { key: "status", label: "สถานะสัญญา", type: "select", required: true, options: AGREEMENT_STATUS_OPTIONS, editable: true, showInTable: true },
      { key: "documentDate", label: "วันที่เอกสาร", type: "date", required: true, editable: true, showInTable: true },
    ],
  },
  {
    key: "line_calendar_events",
    label: "กิจกรรมปฏิทิน LINE",
    group: "ระบบ LINE & Sync",
    primaryKey: "id",
    description: "จัดการบันทึกกิจกรรม Google Calendar ที่ซิงก์จาก LINE Bot",
    creatable: false,
    editable: true,
    deletable: true,
    fields: [
      { key: "employeeDisplay", label: "พนักงาน", type: "readonly", showInTable: true },
      { key: "title", label: "หัวข้อกิจกรรม", type: "text", required: true, editable: true, showInTable: true },
      { key: "status", label: "สถานะ", type: "text", required: true, editable: true, showInTable: true },
      { key: "startOn", label: "วันเริ่ม", type: "date", nullable: true, editable: true, showInTable: true },
      { key: "endOn", label: "วันสิ้นสุด", type: "date", nullable: true, editable: true },
      { key: "location", label: "สถานที่", type: "text", nullable: true, editable: true },
    ],
  },
  {
    key: "line_integration_jobs",
    label: "คิวงาน LINE Integration",
    group: "ระบบ LINE & Sync",
    primaryKey: "id",
    description: "ตรวจสอบ แก้ไขสถานะ retry หรือล้างคิวงานที่ค้างของ LINE Bot",
    creatable: false,
    editable: true,
    deletable: true,
    fields: [
      { key: "kind", label: "ประเภทงาน", type: "readonly", showInTable: true },
      { key: "operationKey", label: "Operation Key", type: "readonly", showInTable: true },
      { key: "status", label: "สถานะ", type: "text", required: true, editable: true, showInTable: true },
      { key: "attempts", label: "จำนวนครั้ง", type: "number", required: true, editable: true, showInTable: true },
      { key: "errorCode", label: "Error Code", type: "text", nullable: true, editable: true, showInTable: true },
    ],
  },
  {
    key: "line_bot_states",
    label: "สถานะสนทนา LINE Bot",
    group: "ระบบ LINE & Sync",
    primaryKey: "lineUid",
    description: "ดูหรือรีเซ็ตสถานะบทสนทนาของ LINE Bot รายผู้ใช้",
    creatable: false,
    editable: false,
    deletable: true,
    fields: [
      { key: "lineUid", label: "LINE UID", type: "readonly", showInTable: true },
      { key: "step", label: "ขั้นตอน", type: "readonly", showInTable: true },
      { key: "linkAttempts", label: "จำนวนครั้งผูกบัญชี", type: "readonly", showInTable: true },
      { key: "expiresAt", label: "หมดอายุ", type: "readonly", showInTable: true },
    ],
  },
  {
    key: "line_webhook_events",
    label: "ประวัติ Webhook LINE",
    group: "ระบบ LINE & Sync",
    primaryKey: "eventId",
    description: "ดูหรือลบประวัติ event ID ของ LINE Webhook",
    creatable: false,
    editable: false,
    deletable: true,
    fields: [
      { key: "eventId", label: "Event ID", type: "readonly", showInTable: true },
      { key: "sourceId", label: "Source ID", type: "readonly", showInTable: true },
      { key: "status", label: "สถานะ", type: "readonly", showInTable: true },
      { key: "attempts", label: "จำนวนครั้ง", type: "readonly", showInTable: true },
      { key: "errorCode", label: "Error Code", type: "readonly", showInTable: true },
    ],
  },
];

export const ADMIN_TABLE_GROUPS: readonly AdminTableGroup[] = [
  "บุคลากรและบัญชี",
  "คำขอและการทำงาน",
  "ข้อมูลหลัก",
  "ระบบ LINE & Sync",
];

const TABLE_BY_KEY = new Map<string, AdminTableDef>(ADMIN_TABLES.map((item) => [item.key, item]));

export function isAdminTableKey(value: unknown): value is AdminTableKey {
  return typeof value === "string" && TABLE_BY_KEY.has(value);
}

export function getAdminTableMeta(tableKey: AdminTableKey): AdminTableDef {
  const meta = TABLE_BY_KEY.get(tableKey);
  if (!meta) throw new Error(`Unknown admin table key: ${tableKey}`);
  return meta;
}
