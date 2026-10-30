import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  bigint,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { WorkTrackingRecordStatus, WorkTrackingSession, WorkTrackingSubStatus } from "@/lib/work-tracking/types";
import type { EmployeePayrollData } from "@/lib/employees/payroll-data";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// ---------- lookup tables ----------

export const departments = pgTable("departments", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const positions = pgTable("positions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employmentStatuses = pgTable("employment_statuses", {
  id: smallint("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
});

export const employmentTypes = pgTable("employment_types", {
  id: smallint("id").generatedByDefaultAsIdentity().primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
});

export const requestStatuses = pgTable("request_statuses", {
  code: varchar("code", { length: 20 }).primaryKey(),
  // Thai display text — the single source of truth for UI labels.
  // Application code must branch on `code`, never on `name`.
  name: varchar("name", { length: 100 }).notNull().unique(),
});

export const otRateSettings = pgTable("ot_rate_settings", {
  id: integer("id").primaryKey().default(1),
  weekdayMultiplier: numeric("weekday_multiplier", { precision: 5, scale: 2, mode: "number" }).notNull().default(1.5),
  holidayMultiplier: numeric("holiday_multiplier", { precision: 5, scale: 2, mode: "number" }).notNull().default(3),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("ot_rate_settings_single_row", sql`${t.id} = 1`),
  check("ot_rate_settings_weekday_multiplier_valid", sql`${t.weekdayMultiplier} > 0 AND ${t.weekdayMultiplier} <= 10`),
  check("ot_rate_settings_holiday_multiplier_valid", sql`${t.holidayMultiplier} > 0 AND ${t.holidayMultiplier} <= 10`),
]);

export const leaveTypes = pgTable("leave_types", {
  code: varchar("code", { length: 30 }).primaryKey().default(sql`nextval('leave_type_code_seq')::text`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  // Annual entitlement in days; null = uncapped.
  annualQuotaDays: integer("annual_quota_days"),
  isActive: boolean("is_active").notNull().default(true),
});

export const skills = pgTable("skills", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
});

// ---------- employees ----------

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 4 }).notNull().unique(),
    prefix: varchar("prefix", { length: 20 }),
    firstName: varchar("first_name", { length: 255 }).notNull(),
    lastName: varchar("last_name", { length: 255 }).notNull(),
    baseSalary: numeric("base_salary", { precision: 12, scale: 2, mode: "number" }),
    payrollData: jsonb("payroll_data").$type<EmployeePayrollData>().notNull().default(sql`'{}'::jsonb`),
    otWeekdayMultiplier: numeric("ot_weekday_multiplier", { precision: 5, scale: 2, mode: "number" }).notNull().default(1.5),
    otHolidayMultiplier: numeric("ot_holiday_multiplier", { precision: 5, scale: 2, mode: "number" }).notNull().default(3),
    workHoursPerDay: numeric("work_hours_per_day", { precision: 5, scale: 2, mode: "number" }).notNull().default(8),
    weeklyHolidays: integer("weekly_holidays").array().notNull().default(sql`'{}'::integer[]`),
    nickname: varchar("nickname", { length: 100 }),
    citizenId: varchar("citizen_id", { length: 20 }).unique(),
    firstNameEn: varchar("first_name_en", { length: 255 }),
    lastNameEn: varchar("last_name_en", { length: 255 }),
    birthDate: date("birth_date"),
    email: varchar("email", { length: 255 }).unique(),
    phone: varchar("phone", { length: 30 }),
    avatarUrl: text("avatar_url"),
    lineUid: varchar("line_uid", { length: 64 }).unique(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    departmentId: integer("department_id").references(() => departments.id, { onDelete: "set null" }),
    positionId: integer("position_id").references(() => positions.id, { onDelete: "set null" }),
    employmentStatusId: smallint("employment_status_id").references(() => employmentStatuses.id, { onDelete: "set null" }),
    employmentTypeId: smallint("employment_type_id").references(() => employmentTypes.id, { onDelete: "set null" }),
    // Display/org-chart only — approval routing stays flat (any supervisor/ceo
    // can decide any request), this is not wired into any permission check.
    managerId: uuid("manager_id").references((): AnyPgColumn => employees.id),
    // Soft delete (off-boarding): set instead of a hard DELETE so OT/leave
    // request history referencing this employee stays intact. Cascades to users.isActive.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("employees_weekly_holidays_valid", sql`${t.weeklyHolidays} <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]`),
    index("employees_department_id_idx").on(t.departmentId),
    index("employees_position_id_idx").on(t.positionId),
    index("employees_employment_status_id_idx").on(t.employmentStatusId),
    index("employees_employment_type_id_idx").on(t.employmentTypeId),
    index("employees_manager_id_idx").on(t.managerId),
  ],
);

export const employeeSkills = pgTable(
  "employee_skills",
  {
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id),
    // Allowed values: 1-5, enforced in application validation (no DB CHECK, matches init.sql).
    skillLevel: smallint("skill_level").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.employeeId, t.skillId] }),
    index("employee_skills_skill_id_idx").on(t.skillId),
  ],
);

// ---------- requests ----------

export const overtimeRequests = pgTable(
  "overtime_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    // start_at must be earlier than end_at (enforced in application code).
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    overtimeType: varchar("overtime_type", { length: 20 }),
    reason: text("reason").notNull(),
    statusCode: varchar("status_code", { length: 20 })
      .notNull()
      .default("pending")
      .references(() => requestStatuses.code),
    decidedByEmployeeId: uuid("decided_by_employee_id").references(() => employees.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    cancelledByEmployeeId: uuid("cancelled_by_employee_id").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("overtime_requests_employee_id_start_at_idx").on(t.employeeId, t.startAt),
    index("overtime_requests_status_code_start_at_idx").on(t.statusCode, t.startAt),
    index("overtime_requests_decided_by_employee_id_idx").on(t.decidedByEmployeeId),
  ],
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    leaveTypeCode: varchar("leave_type_code", { length: 30 })
      .notNull()
      .references(() => leaveTypes.code),
    // start_on <= end_on; sessions must be valid (enforced in application code).
    startOn: date("start_on").notNull(),
    endOn: date("end_on").notNull(),
    // "full" | "am" | "pm" — only meaningful when startOn === endOn (a single-day
    // half-day request); app-validated, not a DB enum/check.
    session: varchar("session", { length: 10 }).notNull().default("full"),
    reason: text("reason"),
    statusCode: varchar("status_code", { length: 20 })
      .notNull()
      .default("pending")
      .references(() => requestStatuses.code),
    decidedByEmployeeId: uuid("decided_by_employee_id").references(() => employees.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    cancelledByEmployeeId: uuid("cancelled_by_employee_id").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leave_requests_employee_id_start_on_end_on_idx").on(t.employeeId, t.startOn, t.endOn),
    index("leave_requests_status_code_start_on_idx").on(t.statusCode, t.startOn),
    index("leave_requests_leave_type_code_idx").on(t.leaveTypeCode),
    index("leave_requests_decided_by_employee_id_idx").on(t.decidedByEmployeeId),
  ],
);

// ---------- auth (new, not in init.sql) ----------

export const userRoleEnum = pgEnum("user_role", ["employee", "supervisor", "ceo"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id")
    .notNull()
    .unique()
    .references(() => employees.id),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  role: userRoleEnum("role").notNull().default("employee"),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Salary slips are independent of the payroll mockup and employee compensation.
export const salarySlipImports = pgTable("salary_slip_imports", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  files: jsonb("files").$type<import("@/lib/salary-slips/model").ImportFile[]>().notNull(),
  rows: jsonb("rows").$type<import("@/lib/salary-slips/model").ImportRow[]>().notNull(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const salarySlips = pgTable("salary_slips", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id),
  year: integer("year").notNull(),
  month: smallint("month").notNull(),
  revision: integer("revision").notNull().default(1),
  data: jsonb("data").$type<import("@/lib/salary-slips/model").SlipData>().notNull(),
  incomeTotal: numeric("income_total", { precision: 12, scale: 2 }).notNull(),
  deductionTotal: numeric("deduction_total", { precision: 12, scale: 2 }).notNull(),
  netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("salary_slips_employee_period_unique").on(t.employeeId, t.year, t.month),
  check("salary_slips_month_valid", sql`${t.month} BETWEEN 1 AND 12`),
  check("salary_slips_year_valid", sql`${t.year} BETWEEN 1900 AND 2200`),
  check("salary_slips_revision_valid", sql`${t.revision} > 0`),
]);
export const salarySlipVersions = pgTable("salary_slip_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  slipId: uuid("slip_id").notNull().references(() => salarySlips.id),
  importId: uuid("import_id").notNull().references(() => salarySlipImports.id),
  revision: integer("revision").notNull(),
  data: jsonb("data").$type<import("@/lib/salary-slips/model").SlipData>().notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("salary_slip_versions_revision_unique").on(t.slipId, t.revision)]);

export const employeeDocuments = pgTable(
  "employee_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mimeType: varchar("mime_type", { length: 127 }).notNull(),
    fileSize: integer("file_size").notNull(),
    // Existing records may still have a legacy database copy until the
    // Google Drive migration script moves them. New uploads only set driveFileId.
    fileData: bytea("file_data"),
    driveFileId: text("drive_file_id"),
    sharedWithUserIds: uuid("shared_with_user_ids").array().notNull().default(sql`'{}'::uuid[]`),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("employee_documents_employee_created_idx").on(t.employeeId, t.createdAt),
    uniqueIndex("employee_documents_drive_file_id_unique").on(t.driveFileId),
    check("employee_documents_file_size_valid", sql`${t.fileSize} > 0 and ${t.fileSize} <= 15728640`),
    check(
      "employee_documents_storage_location_valid",
      sql`(${t.driveFileId} is not null and ${t.fileData} is null) or (${t.driveFileId} is null and ${t.fileData} is not null)`,
    ),
  ],
);

// ---------- asset borrowing requests (ported from asset-borrowing) ----------

export const assetRequestStatusEnum = pgEnum("asset_request_status", [
  "pending",
  "approved",
  "rejected",
  "return_pending",
  "returned",
  "unknown",
]);
export const assetAgreementStatusEnum = pgEnum("asset_agreement_status", [
  "waiting_handover",
  "waiting_employee",
  "waiting_admin",
  "completed",
]);
export const assetAgreementTypeEnum = pgEnum("asset_agreement_type", ["borrow", "asset_form"]);
export const assetAgreementParticipantEnum = pgEnum("asset_agreement_participant", ["employee", "handover", "admin"]);
export const assetSignerKindEnum = pgEnum("asset_signer_kind", ["employee", "admin", "other"]);
export const assetSignatureStatusEnum = pgEnum("asset_signature_status", ["pending", "signed", "locked"]);
export const assetReturnConditionEnum = pgEnum("asset_return_condition", ["original", "damaged", "lost"]);
export const assetAttachmentKindEnum = pgEnum("asset_attachment_kind", ["request", "additional", "return"]);

export const assetRequests = pgTable(
  "asset_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agreementId: uuid("agreement_id").references(() => assetAgreements.id, { onDelete: "set null" }),
    legacySheetId: text("legacy_sheet_id").unique(),
    borrowerEmployeeId: uuid("borrower_employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
    // Snapshots preserve the form and agreement as submitted if employee details later change.
    borrowerEmployeeCode: varchar("borrower_employee_code", { length: 20 }).notNull(),
    borrowerName: varchar("borrower_name", { length: 255 }).notNull(),
    borrowerDepartment: varchar("borrower_department", { length: 255 }).notNull().default(""),
    borrowerPosition: varchar("borrower_position", { length: 255 }).notNull().default(""),
    formDate: timestamp("form_date", { withTimezone: true }).notNull().defaultNow(),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date"),
    reason: text("reason").notNull().default(""),
    remarks: text("remarks").notNull().default(""),
    status: assetRequestStatusEnum("status").notNull().default("pending"),
    approvedBorrowByEmployeeId: uuid("approved_borrow_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
    approvedBorrowByName: varchar("approved_borrow_by_name", { length: 255 }).notNull().default(""),
    approvedBorrowAt: timestamp("approved_borrow_at", { withTimezone: true }),
    borrowerSignatureData: text("borrower_signature_data").notNull().default(""),
    approvedBorrowSignatureData: text("approved_borrow_signature_data").notNull().default(""),
    returnInspectorEmployeeId: uuid("return_inspector_employee_id").references(() => employees.id, { onDelete: "set null" }),
    returnInspectorName: varchar("return_inspector_name", { length: 255 }).notNull().default(""),
    approvedReturnByEmployeeId: uuid("approved_return_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
    approvedReturnByName: varchar("approved_return_by_name", { length: 255 }).notNull().default(""),
    returnInspection: text("return_inspection"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByEmployeeId: uuid("deleted_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
  },
  (t) => [
    index("asset_requests_borrower_created_idx").on(t.borrowerEmployeeId, t.createdAt),
    index("asset_requests_status_created_idx").on(t.status, t.createdAt),
    uniqueIndex("asset_requests_agreement_id_unique").on(t.agreementId),
    check("asset_requests_date_order", sql`${t.toDate} IS NULL OR ${t.toDate} >= ${t.fromDate}`),
    check("asset_requests_version_positive", sql`${t.version} > 0`),
  ],
);

export const assetRequestItems = pgTable(
  "asset_request_items",
  {
    requestId: uuid("request_id").notNull().references(() => assetRequests.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    note: text("note").notNull().default(""),
  },
  (t) => [
    primaryKey({ columns: [t.requestId, t.position] }),
    check("asset_request_items_position_nonnegative", sql`${t.position} >= 0`),
    check("asset_request_items_quantity_positive", sql`${t.quantity} > 0`),
    check("asset_request_items_name_not_blank", sql`length(btrim(${t.name})) > 0`),
  ],
);

export const assetRequestAttachments = pgTable(
  "asset_request_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id").notNull().references(() => assetRequests.id, { onDelete: "cascade" }),
    kind: assetAttachmentKindEnum("kind").notNull(),
    position: smallint("position").notNull().default(0),
    url: text("url").notNull(),
    uploadedByEmployeeId: uuid("uploaded_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("asset_request_attachments_request_kind_idx").on(t.requestId, t.kind),
    uniqueIndex("asset_request_attachments_request_kind_position_unique").on(t.requestId, t.kind, t.position),
    check("asset_request_attachments_position_nonnegative", sql`${t.position} >= 0`),
    check("asset_request_attachments_url_not_blank", sql`length(btrim(${t.url})) > 0`),
  ],
);

export const assetAgreementTemplates = pgTable("asset_agreement_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: assetAgreementTypeEnum("type").notNull().default("borrow"),
  title: text("title").notNull(),
  headerHtml: text("header_html").notNull().default(""),
  bodyHtml: text("body_html").notNull(),
  footerHtml: text("footer_html").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdByEmployeeId: uuid("created_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
  createdByName: varchar("created_by_name", { length: 255 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
}, (t) => [
  index("asset_agreement_templates_active_type_idx").on(t.isActive, t.type),
  check("asset_agreement_templates_title_not_blank", sql`length(btrim(${t.title})) > 0`),
  check("asset_agreement_templates_body_not_blank", sql`length(btrim(${t.bodyHtml})) > 0`),
  check("asset_agreement_templates_version_positive", sql`${t.version} > 0`),
]);

export const assetAgreements = pgTable("asset_agreements", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateId: uuid("template_id").references(() => assetAgreementTemplates.id, { onDelete: "set null" }),
  type: assetAgreementTypeEnum("type").notNull().default("borrow"),
  title: text("title").notNull(),
  headerHtml: text("header_html").notNull().default(""),
  bodyHtml: text("body_html").notNull(),
  footerHtml: text("footer_html").notNull().default(""),
  status: assetAgreementStatusEnum("status").notNull(),
  createdByEmployeeId: uuid("created_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
  createdByName: varchar("created_by_name", { length: 255 }).notNull().default(""),
  createdByEmployeeCode: varchar("created_by_employee_code", { length: 20 }).notNull().default(""),
  returnCondition: assetReturnConditionEnum("return_condition"),
  documentDate: date("document_date").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  version: integer("version").notNull().default(1),
}, (t) => [check("asset_agreements_version_positive", sql`${t.version} > 0`)]);

export const assetAgreementSigners = pgTable(
  "asset_agreement_signers",
  {
    agreementId: uuid("agreement_id").notNull().references(() => assetAgreements.id, { onDelete: "cascade" }),
    boxId: varchar("box_id", { length: 100 }).notNull(),
    position: smallint("position").notNull(),
    participant: assetAgreementParticipantEnum("participant").notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    role: varchar("role", { length: 255 }).notNull(),
    signerKind: assetSignerKindEnum("signer_kind").notNull(),
    signerName: varchar("signer_name", { length: 255 }).notNull().default(""),
    layoutPosition: varchar("layout_position", { length: 30 }).notNull(),
    page: smallint("page"),
    xPercent: numeric("x_percent", { precision: 5, scale: 2 }),
    yPercent: numeric("y_percent", { precision: 5, scale: 2 }),
    signatureData: text("signature_data"),
    signatureStatus: assetSignatureStatusEnum("signature_status").notNull(),
    signedByEmployeeId: uuid("signed_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
    signedByName: varchar("signed_by_name", { length: 255 }).notNull().default(""),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    returnSignatureData: text("return_signature_data"),
    returnSignedByEmployeeId: uuid("return_signed_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
    returnSignedByName: varchar("return_signed_by_name", { length: 255 }).notNull().default(""),
    returnSignedAt: timestamp("return_signed_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.agreementId, t.boxId] }),
    index("asset_agreement_signers_participant_idx").on(t.participant, t.agreementId),
    check("asset_agreement_signers_position_nonnegative", sql`${t.position} >= 0`),
    check("asset_agreement_signers_page_valid", sql`${t.page} IS NULL OR ${t.page} IN (2, 3)`),
    check("asset_agreement_signers_x_valid", sql`${t.xPercent} IS NULL OR ${t.xPercent} BETWEEN 0 AND 100`),
    check("asset_agreement_signers_y_valid", sql`${t.yPercent} IS NULL OR ${t.yPercent} BETWEEN 0 AND 100`),
  ],
);

export const assetRequestReads = pgTable(
  "asset_request_reads",
  {
    requestId: uuid("request_id").notNull().references(() => assetRequests.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.employeeId] })],
);

export const assetRequestEvents = pgTable(
  "asset_request_events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    requestId: uuid("request_id").notNull().references(() => assetRequests.id, { onDelete: "restrict" }),
    actorEmployeeId: uuid("actor_employee_id").references(() => employees.id, { onDelete: "set null" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    fromStatus: assetRequestStatusEnum("from_status"),
    toStatus: assetRequestStatusEnum("to_status"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("asset_request_events_request_created_idx").on(t.requestId, t.createdAt),
    check("asset_request_events_details_object", sql`jsonb_typeof(${t.details}) = 'object'`),
  ],
);

export const workTrackingRecords = pgTable(
  "work_tracking_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    houseNo: varchar("house_no", { length: 120 }).notNull(),
    round: varchar("round", { length: 40 }).notNull(),
    eventDate: date("event_date").notNull(),
    projectText: text("project_text").notNull().default(""),
    detail: text("detail").notNull().default(""),
    status: varchar("status", { length: 20 }).$type<WorkTrackingRecordStatus>().notNull().default("in_progress"),
    deliveredDate: date("delivered_date"),
    reportStatuses: jsonb("report_statuses").$type<Record<string, string>>().notNull().default({}),
    subStatuses: jsonb("sub_statuses").$type<WorkTrackingSubStatus[]>().notNull().default([]),
    workers: jsonb("workers").$type<Record<string, WorkTrackingSession[]>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("work_tracking_records_house_round_date_unique").on(t.houseNo, t.round, t.eventDate),
    index("work_tracking_records_event_date_idx").on(t.eventDate),
    check("work_tracking_records_status_valid", sql`${t.status} IN ('in_progress', 'completed', 'delivered')`),
    check("work_tracking_records_report_statuses_object", sql`jsonb_typeof(${t.reportStatuses}) = 'object'`),
    check("work_tracking_records_sub_statuses_array", sql`jsonb_typeof(${t.subStatuses}) = 'array'`),
    check("work_tracking_records_workers_object", sql`jsonb_typeof(${t.workers}) = 'object'`),
  ],
);
