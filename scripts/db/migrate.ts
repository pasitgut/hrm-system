import {
  maskDatabaseUrl,
  resolveMigrationConnectionString,
  runDatabaseMigrations,
} from "@/lib/db/auto-migrate";

async function main() {
  // Migrations run DDL, so target Supabase Session Pooler (:5432) or Neon's unpooled URL in production.
  const connectionString = resolveMigrationConnectionString();
  if (!connectionString) {
    throw new Error("DATABASE_URL (or DIRECT_DATABASE_URL) is not set");
  }

  console.log(`Running migrations against ${maskDatabaseUrl(connectionString)} ...`);
  await runDatabaseMigrations(connectionString);
  console.log("Migrations complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
