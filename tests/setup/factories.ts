import { db } from "@/tests/setup/db";
import {
  departments,
  employees,
  leaveRequests,
  leaveTypes,
  overtimeRequests,
  positions,
  users,
  type userRoleEnum,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { permissionsForRole } from "@/tests/setup/permissions";
import { eq } from "drizzle-orm";

type Role = (typeof userRoleEnum.enumValues)[number];

let employeeCodeCounter = 0;
async function firstDepartmentId(): Promise<number> {
  const [row] = await db.select({ id: departments.id }).from(departments).limit(1);
  if (!row) throw new Error("No department seeded — call resetDb()/seedReferenceData() first");
  return row.id;
}

async function firstPositionId(): Promise<number> {
  const [row] = await db.select({ id: positions.id }).from(positions).limit(1);
  if (!row) throw new Error("No position seeded — call resetDb()/seedReferenceData() first");
  return row.id;
}

async function firstLeaveTypeCode(): Promise<string> {
  const [row] = await db.select({ code: leaveTypes.code }).from(leaveTypes).limit(1);
  if (!row) throw new Error("No leave type seeded — call resetDb()/seedReferenceData() first");
  return row.code;
}

export async function createEmployee(overrides: Partial<typeof employees.$inferInsert> = {}) {
  employeeCodeCounter += 1;
  const departmentId = overrides.departmentId ?? (await firstDepartmentId());
  const positionId = overrides.positionId ?? (await firstPositionId());

  const [employee] = await db
    .insert(employees)
    .values({
      code: `E${String(employeeCodeCounter).padStart(3, "0")}`,
      firstName: "ทดสอบ",
      lastName: `คนที่${employeeCodeCounter}`,
      email: `test.employee.${employeeCodeCounter}@example.com`,
      startDate: "2024-01-01",
      departmentId,
      positionId,
      employmentStatusId: 1,
      employmentTypeId: 1,
      ...overrides,
    })
    .returning();

  return employee;
}

export async function createUser(overrides: Partial<typeof users.$inferInsert> & { role?: Role; plainPassword?: string } = {}) {
  const { plainPassword = "Password123!", passwordHash: overrideHash, employeeId, email, role, ...rest } = overrides;
  const employee = employeeId ? null : await createEmployee();
  const passwordHash = overrideHash ?? (await hashPassword(plainPassword));

  const [user] = await db
    .insert(users)
    .values({
      employeeId: employeeId ?? employee!.id,
      email: email ?? employee?.email ?? `test.user.${Date.now()}@example.com`,
      passwordHash,
      role: role ?? "employee",
      // Permissions, not roles, gate the API: managers get the manager grants unless a test overrides them.
      permissions: permissionsForRole(role),
      ...rest,
    })
    .returning();

  return { user, employee, plainPassword };
}

export async function createOvertimeRequest(overrides: Partial<typeof overtimeRequests.$inferInsert> = {}) {
  const employeeId = overrides.employeeId ?? (await createEmployee()).id;

  const [request] = await db
    .insert(overtimeRequests)
    .values({
      employeeId,
      startAt: new Date("2026-09-10T11:00:00Z"), // 18:00 Asia/Bangkok
      endAt: new Date("2026-09-10T13:00:00Z"), // 20:00 Asia/Bangkok
      reason: "ทดสอบการทำ OT",
      ...overrides,
    })
    .returning();

  return request;
}

export async function findEmployeeByEmail(email: string) {
  const [row] = await db.select().from(employees).where(eq(employees.email, email)).limit(1);
  return row ?? null;
}

export async function createLeaveRequest(overrides: Partial<typeof leaveRequests.$inferInsert> = {}) {
  const employeeId = overrides.employeeId ?? (await createEmployee()).id;
  const leaveTypeCode = overrides.leaveTypeCode ?? (await firstLeaveTypeCode());

  const [request] = await db
    .insert(leaveRequests)
    .values({
      employeeId,
      leaveTypeCode,
      startOn: "2026-09-15",
      endOn: "2026-09-15",
      reason: "ทดสอบการลา",
      ...overrides,
    })
    .returning();

  return request;
}
