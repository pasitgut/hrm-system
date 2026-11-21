import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSafeToRewriteData } from "./guard";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assertSafeToRewriteData", () => {
  it("blocks destructive scripts against Supabase and Neon URLs", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("ALLOW_DESTRUCTIVE_DB_SCRIPTS", "");

    for (const url of [
      "postgresql://postgres:pw@db.xyz.supabase.co:5432/postgres",
      "postgresql://postgres.xyz:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
      "postgresql://u:p@ep-cool.neon.tech/db",
    ]) {
      vi.stubEnv("DATABASE_URL", url);
      expect(() => assertSafeToRewriteData("db:seed")).toThrow("refuses to run");
    }
  });

  it("blocks destructive scripts in production environments", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/hrm_dev");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ALLOW_DESTRUCTIVE_DB_SCRIPTS", "");

    expect(() => assertSafeToRewriteData("db:seed")).toThrow("refuses to run");
  });

  it("allows local database rewrites in non-production environments", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("ALLOW_DESTRUCTIVE_DB_SCRIPTS", "");
    vi.stubEnv("DATABASE_URL", "postgresql://hrm:pass@localhost:5432/hrm_test");

    expect(() => assertSafeToRewriteData("db:seed")).not.toThrow();
  });

  it("allows override when ALLOW_DESTRUCTIVE_DB_SCRIPTS=1", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:pw@db.xyz.supabase.co:5432/postgres");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DESTRUCTIVE_DB_SCRIPTS", "1");

    expect(() => assertSafeToRewriteData("db:seed")).not.toThrow();
  });
});
