export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  if (!process.env.DATABASE_URL?.trim() && !process.env.DIRECT_DATABASE_URL?.trim()) return;

  const { ensureDatabaseMigrated } = await import("@/lib/db/auto-migrate");
  await ensureDatabaseMigrated();
}
