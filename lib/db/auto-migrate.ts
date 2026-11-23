import path from "node:path";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { encodePermissionsForStorage } from "@/lib/auth/permissions";
import { provisionMissingUserAccounts } from "@/lib/auth/provision-users";
import { ROLE_DEFAULT_PERMISSIONS, USER_ROLES } from "@/lib/auth/roles";
import { resolvePostgresOptions } from "@/lib/db/connection";
import * as schema from "@/lib/db/schema";

export type DatabaseFailureReason =
  | "missing_url"
  | "invalid_url"
  | "ipv6_direct_host"
  | "auth_failed"
  | "missing_tables"
  | "unreachable"
  | "migration_failed";

export type DatabaseHealthStatus = {
  ready: boolean;
  migrated: boolean;
  reason?: DatabaseFailureReason;
  message?: string;
  hint?: string;
};

const FAILURE_RETRY_COOLDOWN_MS = 30_000;
const NETWORK_ERROR_CODES = new Set([
  "ENETUNREACH",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "CONNECT_TIMEOUT",
]);

let cachedStatus: DatabaseHealthStatus | null = null;
let lastFailedAt = 0;
let inFlightMigration: Promise<DatabaseHealthStatus> | null = null;

export function maskDatabaseUrl(url: string): string {
  return url.replace(/:\/\/([^:@/]+):[^@/]+@/, "://$1:***@");
}

function parseUrlSafely(connectionString: string): URL | null {
  try {
    const parsed = new URL(connectionString);
    if (!parsed.hostname || (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function collectErrorDetails(
  error: unknown,
  depth = 0,
  codes = new Set<string>(),
  messages: string[] = [],
): { codes: Set<string>; message: string } {
  if (!error || depth > 4) {
    return { codes, message: messages.join(" | ") };
  }
  if (typeof error === "string") {
    messages.push(error);
    return { codes, message: messages.join(" | ") };
  }
  if (typeof error === "object") {
    const record = error as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
      errors?: unknown[];
    };
    if (typeof record.code === "string" && record.code) {
      codes.add(record.code);
    }
    if (typeof record.message === "string" && record.message) {
      messages.push(record.message);
    }
    if (record.cause) {
      collectErrorDetails(record.cause, depth + 1, codes, messages);
    }
    if (Array.isArray(record.errors)) {
      for (const nested of record.errors) {
        collectErrorDetails(nested, depth + 1, codes, messages);
      }
    }
  }
  return { codes, message: messages.join(" | ") };
}

function isSupabaseDirectHost(hostname: string): boolean {
  const lower = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return lower.endsWith(".supabase.co") && !lower.includes(".pooler.");
}

export function classifyDatabaseError(error: unknown, connectionString?: string): DatabaseHealthStatus {
  const trimmedUrl = connectionString?.trim() ?? "";
  const { codes, message } = collectErrorDetails(error);

  if (!trimmedUrl && (message.includes("DATABASE_URL") || codes.size === 0)) {
    return {
      ready: false,
      migrated: false,
      reason: "missing_url",
      message: "ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล (DATABASE_URL)",
      hint: "ตั้งค่า DATABASE_URL (Supabase Transaction Pooler พอร์ต 6543) ใน Environment Variables",
    };
  }

  const parsed = trimmedUrl ? parseUrlSafely(trimmedUrl) : null;
  if ((trimmedUrl && !parsed) || codes.has("ERR_INVALID_URL") || /invalid url/i.test(message)) {
    return {
      ready: false,
      migrated: false,
      reason: "invalid_url",
      message: "รูปแบบ Connection String ของฐานข้อมูลไม่ถูกต้อง",
      hint: "ตรวจสอบ URL และเข้ารหัสอักขระพิเศษในรหัสผ่าน (เช่น @, #, ?, /) ด้วย Percent-Encoding",
    };
  }

  const hasNetworkError = [...codes].some((code) => NETWORK_ERROR_CODES.has(code))
    || /ENETUNREACH|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|CONNECT_TIMEOUT/i.test(message);

  if (parsed && isSupabaseDirectHost(parsed.hostname) && hasNetworkError) {
    return {
      ready: false,
      migrated: false,
      reason: "ipv6_direct_host",
      message: "ไม่สามารถเชื่อมต่อโฮสต์ db.*.supabase.co จากสภาพแวดล้อม IPv4 (เช่น Vercel) ได้",
      hint: "ให้ใช้ Supabase Pooler (aws-0-<region>.pooler.supabase.com) พอร์ต 6543 (?pgbouncer=true) สำหรับ DATABASE_URL และ Session Pooler พอร์ต 5432 สำหรับ DIRECT_DATABASE_URL",
    };
  }

  if (
    codes.has("28P01")
    || codes.has("28000")
    || /password authentication failed|tenant or user not found|no pg_hba\.conf entry/i.test(message)
  ) {
    return {
      ready: false,
      migrated: false,
      reason: "auth_failed",
      message: "ยืนยันตัวตนกับฐานข้อมูล PostgreSQL / Supabase ไม่สำเร็จ",
      hint: "ตรวจสอบรหัสผ่านฐานข้อมูล และใช้รูปแบบชื่อผู้ใช้ postgres.<project-ref> สำหรับ Supabase Pooler",
    };
  }

  if (codes.has("42P01") || /relation .* does not exist/i.test(message)) {
    return {
      ready: false,
      migrated: false,
      reason: "missing_tables",
      message: "ยังไม่พบตารางในฐานข้อมูล Supabase / PostgreSQL",
      hint: "ระบบจะสร้างตารางอัตโนมัติเมื่อเชื่อมต่อได้ หรือรัน npm run db:migrate ด้วย DIRECT_DATABASE_URL (Session Pooler พอร์ต 5432)",
    };
  }

  if (hasNetworkError) {
    return {
      ready: false,
      migrated: false,
      reason: "unreachable",
      message: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ฐานข้อมูลได้",
      hint: "ตรวจสอบ Host, Port (6543 สำหรับ Runtime / 5432 สำหรับ Migration), SSL และสถานะโปรเจกต์ Supabase",
    };
  }

  return {
    ready: false,
    migrated: false,
    reason: "migration_failed",
    message: "เชื่อมต่อฐานข้อมูลหรือรัน Migration สร้างตารางไม่สำเร็จ",
    hint: "ตรวจสอบ Server Log และยืนยันค่า DATABASE_URL / DIRECT_DATABASE_URL ใน Environment Variables",
  };
}

export async function ensureCoreLookupData(
  database: Pick<PostgresJsDatabase<typeof schema>, "insert">,
): Promise<void> {
  await database
    .insert(schema.employmentStatuses)
    .values([{ name: "ปฏิบัติงาน" }, { name: "พ้นสภาพ" }])
    .onConflictDoNothing();

  await database
    .insert(schema.employmentTypes)
    .values([
      { code: "full_time", name: "ประจำ" },
      { code: "contract", name: "สัญญา" },
      { code: "daily", name: "รายวัน" },
      { code: "probation", name: "ทดลองงาน" },
    ])
    .onConflictDoNothing();

  await database
    .insert(schema.requestStatuses)
    .values([
      { code: "pending", name: "รอจัดการ" },
      { code: "approved", name: "อนุมัติแล้ว" },
      { code: "rejected", name: "ไม่อนุมัติ" },
      { code: "cancelled", name: "ยกเลิก" },
    ])
    .onConflictDoNothing();

  await database
    .insert(schema.leaveTypes)
    .values([
      { code: "sick", name: "ลาป่วย", annualQuotaDays: 30, quotaBasis: "fixed" },
      { code: "personal", name: "ลากิจ", annualQuotaDays: 6, quotaBasis: "tenure" },
      { code: "birthday", name: "ลาวันเกิด", annualQuotaDays: 1, quotaBasis: "fixed" },
      { code: "vacation", name: "ลาพักร้อน", annualQuotaDays: 6, quotaBasis: "fixed" },
    ])
    .onConflictDoNothing();

  await database
    .insert(schema.otRateSettings)
    .values({ id: 1, weekdayMultiplier: 1.5, holidayMultiplier: 3 })
    .onConflictDoNothing();

  await database
    .insert(schema.rolePermissions)
    .values(
      USER_ROLES.map((role) => ({
        role,
        permissions: encodePermissionsForStorage(ROLE_DEFAULT_PERMISSIONS[role]),
      })),
    )
    .onConflictDoNothing();
}

export function resolveMigrationConnectionString(explicit?: string): string {
  return explicit?.trim() || process.env.DIRECT_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
}

export async function runDatabaseMigrations(explicitConnectionString?: string): Promise<void> {
  const connectionString = resolveMigrationConnectionString(explicitConnectionString);
  if (!connectionString) {
    throw new Error("DATABASE_URL (or DIRECT_DATABASE_URL) is not set");
  }
  const parsed = parseUrlSafely(connectionString);
  if (!parsed) {
    throw new TypeError("Invalid DATABASE_URL / DIRECT_DATABASE_URL format");
  }

  const { prepare, ssl } = resolvePostgresOptions(connectionString, { isServerless: false });
  const client = postgres(connectionString, {
    max: 1,
    prepare,
    ssl,
    connect_timeout: 15,
  });

  try {
    const migrationDb = drizzle(client, { schema });
    await migrate(migrationDb, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    await ensureCoreLookupData(migrationDb);
    const provisioned = await provisionMissingUserAccounts(migrationDb);
    if (provisioned.createdCount > 0) {
      console.log(`Auto-provisioned ${provisioned.createdCount} missing user account(s) for active employees.`);
    }
  } finally {
    await client.end({ timeout: 5 }).catch(() => undefined);
  }
}

export async function ensureDatabaseMigrated(): Promise<DatabaseHealthStatus> {
  if (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST)) {
    return { ready: true, migrated: true };
  }

  if (cachedStatus?.ready) {
    return cachedStatus;
  }

  if (cachedStatus && !cachedStatus.ready && Date.now() - lastFailedAt < FAILURE_RETRY_COOLDOWN_MS) {
    return cachedStatus;
  }

  if (inFlightMigration) {
    return inFlightMigration;
  }

  const connectionString = resolveMigrationConnectionString();
  inFlightMigration = (async () => {
    try {
      await runDatabaseMigrations(connectionString);
      cachedStatus = { ready: true, migrated: true };
      lastFailedAt = 0;
      return cachedStatus;
    } catch (error) {
      const status = classifyDatabaseError(error, connectionString);
      const masked = connectionString ? maskDatabaseUrl(connectionString) : "(unset)";
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`Database auto-migration failed [${status.reason}] (${masked}): ${detail}`);
      cachedStatus = status;
      lastFailedAt = Date.now();
      return status;
    }
  })().finally(() => {
    inFlightMigration = null;
  });

  return inFlightMigration;
}

export async function getDatabaseStatus(): Promise<DatabaseHealthStatus> {
  if (cachedStatus?.ready) {
    return cachedStatus;
  }
  return ensureDatabaseMigrated();
}
