import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  // Migrations run DDL, so target Neon's *unpooled* connection in production.
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL (or DIRECT_DATABASE_URL) is not set");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log(`Running migrations against ${maskPassword(connectionString)} ...`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");

  await client.end();
}

function maskPassword(url: string) {
  return url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
