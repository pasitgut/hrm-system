import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, resetDb, closeDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";
import { employees, leaveTypes, leaveRequests, lineIntegrationJobs } from "@/lib/db/schema";
import { getLeaveStatistics } from "@/lib/line/statistics";
import { createLeave, decideLeave, cancelLeave } from "@/lib/leave/commands";

beforeEach(async () => { await resetDb(); process.env.LINE_BOT_ENABLED = "true"; });
afterAll(closeDb);
async function fixture() {
  const owner = await createUser({ role: "employee" });
  const admin = await createUser({ role: "hr" });
  await db.update(employees).set({ code: "0012", lineUid: "Uowner" }).where(eq(employees.id, owner.employee.id));
  await db.update(employees).set({ lineUid: "Uadmin" }).where(eq(employees.id, admin.employee.id));
  return { owner, admin };
}
describe("legacy notification data from the HRM database", () => {
  it("shows approved annual usage and HRM quotas in the original three statistics fields", async () => {
    const { owner } = await fixture();
    await db.insert(leaveTypes).values([{ code: "personal", name: "ลากิจ", annualQuotaDays: 6 }, { code: "birthday", name: "ลาวันเกิด", annualQuotaDays: 1 }]);
    await db.insert(leaveRequests).values([
      { employeeId: owner.employee.id, leaveTypeCode: "sick", startOn: "2026-01-01", endOn: "2026-01-02", statusCode: "approved" },
      { employeeId: owner.employee.id, leaveTypeCode: "personal", startOn: "2026-02-01", endOn: "2026-02-01", statusCode: "approved" },
      { employeeId: owner.employee.id, leaveTypeCode: "personal", startOn: "2026-03-01", endOn: "2026-03-01", statusCode: "pending" },
    ]);
    expect(await db.transaction((tx) => getLeaveStatistics(tx, owner.employee.id, 2026))).toEqual({ sick: "2 วัน", personal: "1 / 6 วัน", birthday: "0 / 1 วัน" });
    expect(await db.transaction((tx) => getLeaveStatistics(tx, owner.employee.id, 2027))).toEqual({ sick: "0 วัน", personal: "0 / 6 วัน", birthday: "0 / 1 วัน" });
  });
  it("includes employee code, reason, duration, source, dates and statistics in the admin Flex", async () => {
    const { owner } = await fixture();
    await db.transaction((tx) => createLeave(tx, { employeeId: owner.employee.id, permissions: owner.user.permissions }, { leaveTypeCode: "sick", startOn: "2026-12-01", endOn: "2026-12-02", session: "full", reason: "พบแพทย์" }, "Line"));
    const jobs = await db.select().from(lineIntegrationJobs);
    expect(jobs).toHaveLength(1);
    const message = jobs[0].payload.messages[0];
    expect(message).toMatchObject({ type: "flex", altText: expect.stringContaining("ใบลาใหม่รออนุมัติ") });
    for (const value of ["0012", "พบแพทย์", "ลาเต็มวัน", "Line", "2026-12-01 - 2026-12-02", "สถิติลาปีนี้", "ลาป่วย", "ลากิจ", "ลาวันเกิด"]) expect(JSON.stringify(message)).toContain(value);
  });
  it("sends the full result Flex to both employee and deciding administrator and includes Calendar audit details", async () => {
    const { owner, admin } = await fixture();
    const created = await db.transaction((tx) => createLeave(tx, { employeeId: owner.employee.id, permissions: owner.user.permissions }, { leaveTypeCode: "sick", startOn: "2026-12-01", endOn: "2026-12-01", session: "full", reason: "พบแพทย์" }, "Line"));
    if ("error" in created) throw new Error(created.error);
    await db.transaction((tx) => decideLeave(tx, { employeeId: admin.employee.id, permissions: admin.user.permissions }, created.id, "approved"));
    const jobs = await db.select().from(lineIntegrationJobs);
    const results = jobs.filter((job) => job.operationKey.includes(":approved:"));
    expect(results.map((job) => job.payload.to).sort()).toEqual(["Uadmin", "Uowner"]);
    for (const result of results) {
      expect(result.payload.messages[0].type).toBe("flex");
      expect(JSON.stringify(result.payload.messages)).toContain(`${admin.employee.firstName} ${admin.employee.lastName}`);
      expect(JSON.stringify(result.payload.messages)).toContain("ผู้ดำเนินการ");
    }
    expect(jobs.find((job) => job.kind === "calendar.upsert")?.payload.description).toContain(`อนุมัติโดย: ${admin.employee.firstName} ${admin.employee.lastName}`);
  });
  it("notifies all eligible administrators when the employee cancels", async () => {
    const { owner } = await fixture();
    const [leave] = await db.insert(leaveRequests).values({ employeeId: owner.employee.id, leaveTypeCode: "sick", startOn: "2026-12-01", endOn: "2026-12-01" }).returning();
    await db.transaction((tx) => cancelLeave(tx, { employeeId: owner.employee.id, permissions: owner.user.permissions }, leave.id));
    const jobs = await db.select().from(lineIntegrationJobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload.to).toBe("Uadmin");
    expect(jobs[0].payload.messages[0].text).toContain("ได้ถูกผู้ขอยกเลิกรายการแล้ว");
  });
});
