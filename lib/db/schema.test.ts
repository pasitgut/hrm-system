import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, resetDb, closeDb } from "@/tests/setup/db";
import { departments, employees, employmentStatuses, employmentTypes, overtimeRequests, positions, requestStatuses, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

beforeEach(resetDb);
afterAll(closeDb);

describe("schema", () => {
  it("seeds reference data with the expected Thai status labels", async () => {
    const rows = await db.select().from(requestStatuses).orderBy(requestStatuses.code);
    expect(rows.map((r) => [r.code, r.name])).toEqual([
      ["approved", "อนุมัติแล้ว"],
      ["cancelled", "ยกเลิก"],
      ["pending", "รอจัดการ"],
      ["rejected", "ไม่อนุมัติ"],
    ]);
  });

  it("inserts a full employee -> user -> overtime_request chain respecting FKs", async () => {
    const [department] = await db.select().from(departments).limit(1);
    const [position] = await db.select().from(positions).limit(1);
    const [status] = await db.select().from(employmentStatuses).limit(1);
    const [type] = await db.select().from(employmentTypes).limit(1);

    const [employee] = await db
      .insert(employees)
      .values({
        code: "E001",
        firstName: "ทดสอบ",
        lastName: "ระบบ",
        email: "schema-test@example.com",
        startDate: "2024-01-01",
        departmentId: department.id,
        positionId: position.id,
        employmentStatusId: status.id,
        employmentTypeId: type.id,
      })
      .returning();

    const [user] = await db
      .insert(users)
      .values({
        employeeId: employee.id,
        email: employee.email!,
        passwordHash: "not-a-real-hash",
        role: "employee",
      })
      .returning();

    expect(user.role).toBe("employee");

    const [request] = await db
      .insert(overtimeRequests)
      .values({
        employeeId: employee.id,
        startAt: new Date("2026-09-10T11:00:00Z"),
        endAt: new Date("2026-09-10T13:00:00Z"),
        reason: "ทดสอบ",
      })
      .returning();

    expect(request.statusCode).toBe("pending");

    const [readBack] = await db.select().from(overtimeRequests).where(eq(overtimeRequests.id, request.id));
    expect(readBack.employeeId).toBe(employee.id);
  });
});
