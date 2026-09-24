import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL (or DIRECT_DATABASE_URL) must be set to run drizzle-kit");
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
