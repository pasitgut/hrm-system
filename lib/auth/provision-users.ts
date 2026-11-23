import { and, asc, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { hashPassword } from "@/lib/auth/password";
import { getStoredPermissionsForRole } from "@/lib/auth/role-permissions";
import { db } from "@/lib/db/client";
import type * as schema from "@/lib/db/schema";
import { employees, users } from "@/lib/db/schema";

type ProvisionDb = PostgresJsDatabase<typeof schema>;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BATCH_SIZE = 200;

export function normalizeProvisionEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function isValidProvisionEmail(value: unknown): value is string {
  return typeof value === "string" && EMAIL_PATTERN.test(value.trim());
}

export type SkippedProvisionReason = "missing_email" | "invalid_email" | "email_in_use";

export type SkippedProvisionEmployee = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  email: string | null;
  reason: SkippedProvisionReason;
};

export type MissingUserAccountsSummary = {
  eligibleCount: number;
  missingEmailCount: number;
  totalWithoutAccount: number;
  missingEmailEmployees: SkippedProvisionEmployee[];
};

export type ProvisionMissingUsersResult = {
  createdCount: number;
  skippedCount: number;
  skipped: SkippedProvisionEmployee[];
};

type EligibleCandidate = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  normalizedEmail: string;
};

async function collectProvisionCandidates(database: ProvisionDb = db): Promise<{
  eligible: EligibleCandidate[];
  skipped: SkippedProvisionEmployee[];
}> {
  const [missingEmployees, existingUsers] = await Promise.all([
    database
      .select({
        id: employees.id,
        code: employees.code,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
      })
      .from(employees)
      .leftJoin(users, eq(users.employeeId, employees.id))
      .where(and(isNull(employees.deletedAt), isNull(users.id)))
      .orderBy(asc(employees.firstName), asc(employees.lastName)),
    database.select({ email: users.email }).from(users),
  ]);

  const usedEmails = new Set<string>(
    existingUsers
      .map((row) => normalizeProvisionEmail(row.email))
      .filter((email): email is string => email !== null),
  );

  const eligible: EligibleCandidate[] = [];
  const skipped: SkippedProvisionEmployee[] = [];

  for (const emp of missingEmployees) {
    const rawEmail = emp.email?.trim() ?? "";
    if (!rawEmail) {
      skipped.push({ ...emp, email: null, reason: "missing_email" });
      continue;
    }
    if (!isValidProvisionEmail(rawEmail)) {
      skipped.push({ ...emp, email: rawEmail, reason: "invalid_email" });
      continue;
    }
    const normalizedEmail = rawEmail.toLowerCase();
    if (usedEmails.has(normalizedEmail)) {
      skipped.push({ ...emp, email: normalizedEmail, reason: "email_in_use" });
      continue;
    }
    usedEmails.add(normalizedEmail);
    eligible.push({
      id: emp.id,
      code: emp.code,
      firstName: emp.firstName,
      lastName: emp.lastName,
      normalizedEmail,
    });
  }

  return { eligible, skipped };
}

export async function getMissingUserAccountsSummary(
  database: ProvisionDb = db,
): Promise<MissingUserAccountsSummary> {
  const { eligible, skipped } = await collectProvisionCandidates(database);
  return {
    eligibleCount: eligible.length,
    missingEmailCount: skipped.length,
    totalWithoutAccount: eligible.length + skipped.length,
    missingEmailEmployees: skipped,
  };
}

export async function provisionMissingUserAccounts(
  database: ProvisionDb = db,
): Promise<ProvisionMissingUsersResult> {
  const { eligible, skipped } = await collectProvisionCandidates(database);
  if (eligible.length === 0) {
    return {
      createdCount: 0,
      skippedCount: skipped.length,
      skipped,
    };
  }

  // Compute bcrypt hashes before opening a transaction so DB connections/locks are not held during hashing.
  const employeePermissions = await getStoredPermissionsForRole("employee", database);
  const prepared: Array<EligibleCandidate & { passwordHash: string }> = [];
  for (const candidate of eligible) {
    prepared.push({
      ...candidate,
      passwordHash: await hashPassword(candidate.code),
    });
  }

  let createdCount = 0;
  await database.transaction(async (tx) => {
    for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
      const batch = prepared.slice(i, i + BATCH_SIZE);
      const inserted = await tx
        .insert(users)
        .values(
          batch.map((item) => ({
            employeeId: item.id,
            email: item.normalizedEmail,
            passwordHash: item.passwordHash,
            role: "employee" as const,
            permissions: employeePermissions,
            mustChangePassword: true,
            isActive: true,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: users.id });
      createdCount += inserted.length;
    }
  });

  return {
    createdCount,
    skippedCount: skipped.length,
    skipped,
  };
}
