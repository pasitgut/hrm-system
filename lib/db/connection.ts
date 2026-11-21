import type postgres from "postgres";

const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1", "::1", "postgres"]);

function parseUrlSafely(connectionString: string): URL | null {
  try {
    return new URL(connectionString);
  } catch {
    return null;
  }
}

function normalizedHostname(parsed: URL | null): string {
  return parsed ? parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase() : "";
}

function isSupabaseHost(hostname: string): boolean {
  return hostname === "supabase.co"
    || hostname.endsWith(".supabase.co")
    || hostname === "supabase.com"
    || hostname.endsWith(".supabase.com");
}

function isNeonHost(hostname: string): boolean {
  return hostname === "neon.tech" || hostname.endsWith(".neon.tech");
}

export function isRemoteDatabaseUrl(connectionString: string): boolean {
  const trimmed = connectionString.trim();
  if (!trimmed) return false;
  const parsed = parseUrlSafely(trimmed);
  if (!parsed) {
    return trimmed.includes("supabase.co")
      || trimmed.includes("supabase.com")
      || trimmed.includes("neon.tech");
  }
  const hostname = normalizedHostname(parsed);
  return !LOCAL_HOSTS.has(hostname);
}

export type ResolvedPostgresOptions = Pick<
  postgres.Options<Record<string, postgres.PostgresType>>,
  "prepare" | "ssl" | "max" | "idle_timeout" | "connect_timeout"
>;

/**
 * Resolves `postgres` driver connection options for local Docker Postgres,
 * Supabase (Direct, Session Pooler, Transaction Pooler `:6543`), and Neon.
 */
export function resolvePostgresOptions(
  connectionString: string,
  options: { isServerless?: boolean } = {},
): ResolvedPostgresOptions {
  const parsed = parseUrlSafely(connectionString.trim());
  const hostname = normalizedHostname(parsed);
  const isLocal = LOCAL_HOSTS.has(hostname);
  const isSupabase = isSupabaseHost(hostname)
    || (!parsed && (connectionString.includes("supabase.co") || connectionString.includes("supabase.com")));
  const isNeon = isNeonHost(hostname) || (!parsed && connectionString.includes("neon.tech"));
  const sslMode = parsed?.searchParams.get("sslmode")?.toLowerCase();
  const isPgbouncer = parsed?.searchParams.get("pgbouncer")?.toLowerCase() === "true"
    || parsed?.port === "6543";

  const prepare = !(isSupabase || isNeon || isPgbouncer);
  const ssl: ResolvedPostgresOptions["ssl"] = sslMode === "disable" || (isLocal && sslMode !== "require")
    ? false
    : "require";
  const isManaged = isSupabase || isNeon || !isLocal || (options.isServerless ?? Boolean(process.env.VERCEL));

  return {
    prepare,
    ssl,
    ...(isManaged ? { max: 5, idle_timeout: 20, connect_timeout: 15 } : {}),
  };
}
