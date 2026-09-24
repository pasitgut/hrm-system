import { sql } from "drizzle-orm";
import { db as testDb, sqlClient } from "@/lib/db/client";
import {
  assetCategories,
  departments,
  employmentStatuses,
  employmentTypes,
  leaveTypes,
  positions,
  requestStatuses,
} from "@/lib/db/schema";

export const db = testDb;

export async function resetDb(): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      users, overtime_requests, leave_requests, employee_skills,
      asset_loans, assets, asset_categories,
      employees, skills, leave_types, request_statuses,
      employment_types, employment_statuses, positions, departments
    RESTART IDENTITY CASCADE
  `);
  await seedReferenceData();
}

// Minimal lookup-table rows most tests/factories depend on to satisfy FK
// constraints. Tests needing more than this insert their own rows directly.
export async function seedReferenceData(): Promise<void> {
  await db.insert(requestStatuses).values([
    { code: "pending", name: "รอจัดการ" },
    { code: "approved", name: "อนุมัติแล้ว" },
    { code: "rejected", name: "ไม่อนุมัติ" },
    { code: "cancelled", name: "ยกเลิก" },
  ]);
  await db.insert(employmentStatuses).values([{ name: "ปฏิบัติงาน" }]);
  await db.insert(employmentTypes).values([{ code: "full_time", name: "พนักงานประจำ" }]);
  await db.insert(departments).values([{ name: "Engineering" }]);
  await db.insert(positions).values([{ name: "Software Engineer" }]);
  await db.insert(leaveTypes).values([
    { code: "sick", name: "ลาป่วย", annualQuotaDays: 30 },
    { code: "annual", name: "ลาพักร้อน", annualQuotaDays: 10 },
  ]);
  await db.insert(assetCategories).values([{ name: "คอมพิวเตอร์" }]);
}

export async function closeDb(): Promise<void> {
  await sqlClient.end();
}
