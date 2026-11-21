import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { resolvePostgresOptions } from "@/lib/db/connection";
import * as schema from "@/lib/db/schema";

type SqlClient = ReturnType<typeof postgres>;
type DbClient = PostgresJsDatabase<typeof schema>;

let _sqlClient: SqlClient | null = null;
let _db: DbClient | null = null;

function createClient(connectionString: string): SqlClient {
  return postgres(connectionString, resolvePostgresOptions(connectionString));
}

function getSqlClient(): SqlClient {
  if (!_sqlClient) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not set");
    }
    _sqlClient = createClient(databaseUrl);
  }
  return _sqlClient;
}

function getDb(): DbClient {
  if (!_db) {
    _db = drizzle(getSqlClient(), { schema });
  }
  return _db;
}

// Lazily initialized so build-time module evaluation (e.g. Docker / Vercel
// container builds where runtime env vars like DATABASE_URL are not present
// during `next build`) succeeds without touching the database.
// Exported so tests can call `sqlClient.end()` for a clean process exit.
export const sqlClient: SqlClient = new Proxy((() => {}) as unknown as SqlClient, {
  apply(_target, thisArg, argArray) {
    const client = getSqlClient() as unknown as (...args: unknown[]) => unknown;
    return Reflect.apply(client, thisArg, argArray);
  },
  get(_target, prop) {
    if (prop === "then") return undefined;
    if (prop === "end" && !_sqlClient) {
      return async () => undefined;
    }
    const client = getSqlClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export const db: DbClient = new Proxy({} as DbClient, {
  get(_target, prop) {
    if (prop === "then") return undefined;
    const instance = getDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
