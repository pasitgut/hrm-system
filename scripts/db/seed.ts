import { sql } from "drizzle-orm";
import { db, sqlClient } from "@/lib/db/client";
import {
  departments,
  employmentStatuses,
  employmentTypes,
  leaveTypes,
  positions,
  requestStatuses,
} from "@/lib/db/schema";
import { getAdminConfig } from "@/lib/auth/admin";
import { assertSafeToRewriteData } from "./guard";

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
      line_integration_jobs, line_bot_states, line_link_codes, line_calendar_events,
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

  const admin = getAdminConfig();
  console.log("\nSeed complete.");
  console.log(`Built-in admin login: ${admin.username} / ${admin.isDefaultPassword ? "admin (default)" : "(from ADMIN_PASSWORD env)"}`);

  await sqlClient.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
