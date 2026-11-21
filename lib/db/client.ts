import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { resolvePostgresOptions } from "@/lib/db/connection";
import * as schema from "@/lib/db/schema";

function createClient(connectionString: string) {
  return postgres(connectionString, resolvePostgresOptions(connectionString));
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

// Exported so tests can call `sqlClient.end()` for a clean process exit.
export const sqlClient = createClient(databaseUrl);
export const db = drizzle(sqlClient, { schema });
