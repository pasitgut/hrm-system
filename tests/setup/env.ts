try {
  process.loadEnvFile();
} catch {
  // no .env file present — fall back to whatever is already in process.env
}

// Route DB-touching code at the app's DATABASE_URL toward the test database,
// while keeping DIRECT_DATABASE_URL (used only by scripts/migrate.ts) untouched.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
