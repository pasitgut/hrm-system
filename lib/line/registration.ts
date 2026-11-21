import { and, eq, isNull } from "drizzle-orm";
import { employees, users } from "@/lib/db/schema";
import type { Transaction } from "@/lib/line/outbox";

// Port of helpers.gs registerUserByEmpCode; keep employee codes as strings.
export async function registerUserByEmpCode(tx: Transaction, uid: string, employeeCode: string) {
  const nameOf = (employee: { firstName: string; lastName: string }) => `${employee.firstName} ${employee.lastName}`.trim();
  const [registered] = await tx.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.lineUid, uid));
  if (registered) return { success: false, alreadyRegistered: true, name: nameOf(registered) };
  if (!employeeCode || employeeCode.length > 4) return { success: false };
  const [employee] = await tx.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, lineUid: employees.lineUid, active: users.isActive, firstLogin: users.mustChangePassword }).from(employees).innerJoin(users, eq(users.employeeId, employees.id)).where(and(eq(employees.code, employeeCode), isNull(employees.deletedAt))).for("update", { of: employees });
  if (!employee) return { success: false };
  if (!employee.active || employee.firstLogin) return { success: false, unavailable: true };
  if (employee.lineUid) return { success: false, alreadyLinked: true };
  await tx.update(employees).set({ lineUid: uid, updatedAt: new Date() }).where(and(eq(employees.id, employee.id), isNull(employees.lineUid)));
  return { success: true, name: nameOf(employee) };
}
