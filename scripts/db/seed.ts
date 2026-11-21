import { sql } from "drizzle-orm";
import { db, sqlClient } from "@/lib/db/client";
import {
  departments,
  employees,
  employmentStatuses,
  employmentTypes,
  leaveTypes,
  positions,
  requestStatuses,
  users,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { MANAGER_PERMISSIONS } from "@/lib/auth/permissions";
import { assertSafeToRewriteData } from "./guard";

const ADMIN_EMAIL = "admin@peopleos.co";
const ADMIN_PASSWORD = "admin";

async function main() {
  assertSafeToRewriteData("db:seed");
  console.log("Resetting database...");
  await db.execute(sql`
    TRUNCATE TABLE
      users, overtime_requests, leave_requests,
      asset_agreement_signers, asset_agreements, asset_agreement_templates,
      asset_request_events, asset_request_reads, asset_request_attachments,
      asset_request_items, asset_requests,
      work_tracking_activities, work_tracking_requests, work_tracking_records, line_webhook_events,
      employees, leave_types, request_statuses,
      employment_types, employment_statuses, positions, departments
    RESTART IDENTITY CASCADE
  `);

  console.log("Seeding lookup tables...");
  await db.insert(departments).values(
    ["People", "Engineering", "Design", "Operations", "Growth"].map((name) => ({ name })),
  );

  await db.insert(positions).values(
    [
      "People Operations Lead",
      "Product Designer",
      "Frontend Engineer",
      "Customer Success",
      "Backend Engineer",
      "Marketing Specialist",
      "Account Executive",
      "QA Engineer",
      "Mobile Engineer",
      "Office Manager",
      "Data Analyst",
      "DevOps Engineer",
    ].map((name) => ({ name })),
  );

  await db.insert(employmentStatuses).values(
    ["ปฏิบัติงาน", "พ้นสภาพ"].map((name) => ({ name })),
  );

  await db.insert(employmentTypes).values([
    { code: "full_time", name: "ประจำ" },
    { code: "contract", name: "สัญญา" },
    { code: "daily", name: "รายวัน" },
    { code: "probation", name: "ทดลองงาน" },
  ]);

  await db.insert(requestStatuses).values([
    { code: "pending", name: "รอจัดการ" },
    { code: "approved", name: "อนุมัติแล้ว" },
    { code: "rejected", name: "ไม่อนุมัติ" },
    { code: "cancelled", name: "ยกเลิก" },
  ]);

  await db.insert(leaveTypes).values([
    { code: "sick", name: "ลาป่วย", annualQuotaDays: 30 },
    { code: "personal", name: "ลากิจ", annualQuotaDays: 6, quotaBasis: "tenure" },
    { code: "birthday", name: "ลาวันเกิด", annualQuotaDays: 1 },
    { code: "vacation", name: "ลาพักร้อน", annualQuotaDays: 6 },
  ]);

  const allDepartments = await db.select().from(departments);
  const allPositions = await db.select().from(positions);
  const deptByName = Object.fromEntries(allDepartments.map((d) => [d.name, d.id]));
  const posByName = Object.fromEntries(allPositions.map((p) => [p.name, p.id]));

  console.log("Seeding the admin account...");
  const [adminEmployee] = await db
    .insert(employees)
    .values({
      code: "2603",
      firstName: "ผู้ดูแล",
      lastName: "ระบบ",
      nickname: "Admin",
      email: ADMIN_EMAIL,
      startDate: "2026-09-24",
      departmentId: deptByName.People,
      positionId: posByName["People Operations Lead"],
      employmentStatusId: 1,
      employmentTypeId: 1,
    })
    .returning();

  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  await db.insert(users).values({
    employeeId: adminEmployee.id,
    email: ADMIN_EMAIL,
    passwordHash,
    role: "hr",
    permissions: [...MANAGER_PERMISSIONS],
  });

  console.log("\nSeed complete.");
  console.log(`Admin login: admin / ${ADMIN_PASSWORD}`);
  console.log(`Admin email: ${ADMIN_EMAIL}`);

  await sqlClient.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
