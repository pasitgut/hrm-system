import { sql } from "drizzle-orm";
import { db as testDb, sqlClient } from "@/lib/db/client";
import {
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
      users, overtime_requests, leave_requests,
      asset_request_events, asset_request_reads, asset_agreement_signers,
      asset_request_attachments, asset_request_items, asset_requests, asset_agreements,
      work_tracking_activities, work_tracking_requests, work_tracking_records, line_webhook_events,
      employees, leave_types, request_statuses,
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
}

export async function closeDb(): Promise<void> {
  await sqlClient.end();
}
