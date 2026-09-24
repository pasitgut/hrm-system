import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

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

export const leaveTypes = pgTable("leave_types", {
  code: varchar("code", { length: 30 }).primaryKey(),
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
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- assets (new, not in init.sql) ----------

export const assetCategories = pgTable("asset_categories", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
});

export const assetStatusEnum = pgEnum("asset_status", ["available", "in_use", "maintenance", "retired"]);

export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => assetCategories.id),
  serialNumber: varchar("serial_number", { length: 100 }).unique(),
  status: assetStatusEnum("status").notNull().default("available"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assetLoans = pgTable(
  "asset_loans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    checkoutDate: date("checkout_date").notNull(),
    dueDate: date("due_date").notNull(),
    // "Returned" is derived as statusCode='approved' AND returnedAt IS NOT NULL
    // — not a separate status code, to reuse requestStatuses as-is.
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnNote: text("return_note"),
    purpose: text("purpose"),
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
    index("asset_loans_asset_id_idx").on(t.assetId),
    index("asset_loans_employee_id_idx").on(t.employeeId),
    index("asset_loans_status_code_idx").on(t.statusCode),
  ],
);
