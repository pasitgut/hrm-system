import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

function createClient(connectionString: string) {
  const isNeon = connectionString.includes("neon.tech");
  return postgres(connectionString, {
    // Neon's pooled (-pooler) endpoint uses PgBouncer in transaction mode,
    // which is incompatible with server-side prepared statements.
    prepare: !isNeon,
    ssl: isNeon ? "require" : false,
  });
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

// Exported so tests can call `sqlClient.end()` for a clean process exit.
export const sqlClient = createClient(databaseUrl);
export const db = drizzle(sqlClient, { schema });
