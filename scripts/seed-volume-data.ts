import { createHash } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { db, sqlClient } from "@/lib/db/client";
import {
  employees,
  leaveRequests,
  leaveTypes,
  overtimeRequests,
  requestStatuses,
} from "@/lib/db/schema";

const OT_COUNT = 600;
const LEAVE_COUNT = 150;
const STATUS_ORDER = ["pending", "approved", "rejected", "cancelled"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function seededUuid(table: string, index: number) {
  const hex = createHash("sha1").update("hrm-volume-seed:" + table + ":" + index).digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.slice(0, 12) + "5" + hex.slice(13, 16) + variant + hex.slice(17, 32);
  return value.slice(0, 8) + "-" + value.slice(8, 12) + "-" + value.slice(12, 16) + "-" +
    value.slice(16, 20) + "-" + value.slice(20);
}

function formatBytes(bytes: number) {
  const sign = bytes < 0 ? "-" : "";
  let value = Math.abs(bytes);
  const units = ["B", "KiB", "MiB", "GiB"];
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return sign + value.toFixed(unit === 0 ? 0 : 1) + " " + units[unit];
}

async function getSizes() {
  const [row] = await sqlClient.unsafe(
    "SELECT pg_database_size(current_database())::text AS database_bytes, " +
    "pg_total_relation_size('public.overtime_requests')::text AS overtime_bytes, " +
    "pg_total_relation_size('public.leave_requests')::text AS leave_bytes",
  );
  return {
    database: Number(row.database_bytes),
    overtime: Number(row.overtime_bytes),
    leave: Number(row.leave_bytes),
  };
}

function printSizes(label: string, sizes: Awaited<ReturnType<typeof getSizes>>) {
  console.log(
    label + " DB " + formatBytes(sizes.database) +
    " | OT " + formatBytes(sizes.overtime) +
    " | leave " + formatBytes(sizes.leave),
  );
}

async function main() {
  try {
    const [employeeRows, statusRows, leaveTypeRows] = await Promise.all([
      db.select({ id: employees.id }).from(employees).where(isNull(employees.deletedAt)),
      db.select({ code: requestStatuses.code }).from(requestStatuses),
      db.select({ code: leaveTypes.code }).from(leaveTypes).where(eq(leaveTypes.isActive, true)),
    ]);

    if (!employeeRows.length) throw new Error("No active employees found; seed employees first.");

    const availableStatuses = new Set(statusRows.map(({ code }) => code));
    const missingStatuses = ["pending", "approved", "rejected"].filter((code) => !availableStatuses.has(code));
    if (missingStatuses.length) {
      throw new Error("Missing request statuses: " + missingStatuses.join(", ") + ". Seed lookup tables first.");
    }

    if (!leaveTypeRows.length) throw new Error("No active leave types found; seed leave types first.");

    const statuses = STATUS_ORDER.filter((code) => availableStatuses.has(code));
    const employeeIds = employeeRows.map(({ id }) => id);
    const leaveTypeCodes = leaveTypeRows.map(({ code }) => code);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const day = (daysAgo: number) => new Date(today.getTime() - daysAgo * MS_PER_DAY);

    const overtimeRows = Array.from({ length: OT_COUNT }, (_, index) => {
      const employeeId = employeeIds[index % employeeIds.length];
      const statusCode = statuses[index % statuses.length];
      const startAt = day((index * 17) % 365);
      startAt.setUTCHours(11 + (index % 3), 0, 0, 0);
      const createdAt = new Date(startAt.getTime() - ((index % 10) + 1) * MS_PER_DAY);
      const decidedAt = statusCode === "approved" || statusCode === "rejected"
        ? new Date(createdAt.getTime() + 2 * 60 * 60 * 1000)
        : null;
      const cancelledAt = statusCode === "cancelled"
        ? new Date(createdAt.getTime() + 2 * 60 * 60 * 1000)
        : null;

      return {
        id: seededUuid("overtime", index),
        employeeId,
        startAt,
        endAt: new Date(startAt.getTime() + (1 + (index % 4)) * 60 * 60 * 1000),
        reason: "FAKE_VOLUME_TEST: OT #" + (index + 1),
        statusCode,
        decidedByEmployeeId: decidedAt ? employeeId : null,
        decidedAt,
        cancelledByEmployeeId: cancelledAt ? employeeId : null,
        cancelledAt,
        createdAt,
        updatedAt: decidedAt ?? cancelledAt ?? createdAt,
      };
    });

    const leaveRows = Array.from({ length: LEAVE_COUNT }, (_, index) => {
      const employeeId = employeeIds[index % employeeIds.length];
      const statusCode = statuses[index % statuses.length];
      const startOn = day((index * 37) % 365).toISOString().slice(0, 10);
      const startAt = new Date(startOn + "T00:00:00.000Z");
      const createdAt = new Date(startAt.getTime() - ((index % 14) + 1) * MS_PER_DAY);
      const decidedAt = statusCode === "approved" || statusCode === "rejected"
        ? new Date(createdAt.getTime() + 2 * 60 * 60 * 1000)
        : null;
      const cancelledAt = statusCode === "cancelled"
        ? new Date(createdAt.getTime() + 2 * 60 * 60 * 1000)
        : null;

      return {
        id: seededUuid("leave", index),
        employeeId,
        leaveTypeCode: leaveTypeCodes[index % leaveTypeCodes.length],
        startOn,
        endOn: startOn,
        session: index % 5 === 0 ? (index % 2 === 0 ? "am" : "pm") : "full",
        reason: "FAKE_VOLUME_TEST: leave #" + (index + 1),
        statusCode,
        decidedByEmployeeId: decidedAt ? employeeId : null,
        decidedAt,
        cancelledByEmployeeId: cancelledAt ? employeeId : null,
        cancelledAt,
        createdAt,
        updatedAt: decidedAt ?? cancelledAt ?? createdAt,
      };
    });

    const before = await getSizes();
    const inserted = await db.transaction(async (tx) => {
      const overtime = await tx.insert(overtimeRequests)
        .values(overtimeRows)
        .onConflictDoNothing()
        .returning({ id: overtimeRequests.id });
      const leave = await tx.insert(leaveRequests)
        .values(leaveRows)
        .onConflictDoNothing()
        .returning({ id: leaveRequests.id });
      return { overtime: overtime.length, leave: leave.length };
    });
    const after = await getSizes();

    console.log("Inserted " + inserted.overtime + " / " + OT_COUNT + " OT and " +
      inserted.leave + " / " + LEAVE_COUNT + " leave rows.");
    printSizes("Before:", before);
    printSizes("After: ", after);
    console.log("Growth: DB " + formatBytes(after.database - before.database) +
      " | OT " + formatBytes(after.overtime - before.overtime) +
      " | leave " + formatBytes(after.leave - before.leave));
  } finally {
    await sqlClient.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
