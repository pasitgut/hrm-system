import { afterEach, describe, expect, it } from "vitest";
import { isRemoteDatabaseUrl, resolvePostgresOptions } from "@/lib/db/connection";

const ORIGINAL_VERCEL = process.env.VERCEL;

afterEach(() => {
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL_VERCEL;
});

describe("resolvePostgresOptions", () => {
  it("disables prepared statements, requires SSL, and bounds pooling for Supabase Transaction Pooler (:6543)", () => {
    const opts = resolvePostgresOptions(
      "postgresql://postgres.projectref:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
    );
    expect(opts).toEqual({
      prepare: false,
      ssl: "require",
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
    });
  });

  it("disables prepared statements and requires SSL for Supabase Session Pooler (:5432) and Direct DB", () => {
    const sessionOpts = resolvePostgresOptions(
      "postgresql://postgres.projectref:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
    );
    const directOpts = resolvePostgresOptions(
      "postgresql://postgres:secret@db.projectref.supabase.co:5432/postgres",
    );

    expect(sessionOpts.prepare).toBe(false);
    expect(sessionOpts.ssl).toBe("require");
    expect(directOpts.prepare).toBe(false);
    expect(directOpts.ssl).toBe("require");
  });

  it("keeps Neon compatibility with prepare=false and ssl=require", () => {
    const opts = resolvePostgresOptions(
      "postgresql://user:pass@ep-cool-rain-1234.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
    );
    expect(opts.prepare).toBe(false);
    expect(opts.ssl).toBe("require");
    expect(opts.max).toBe(5);
  });

  it("enables prepared statements and skips SSL for local Postgres and Docker", () => {
    delete process.env.VERCEL;
    for (const url of [
      "postgresql://hrm:pass@localhost:5432/hrm_dev",
      "postgresql://hrm:pass@127.0.0.1:5432/hrm_test",
      "postgresql://hrm:pass@postgres:5432/hrm_dev",
    ]) {
      expect(resolvePostgresOptions(url)).toEqual({
        prepare: true,
        ssl: false,
      });
    }
  });

  it("respects sslmode=disable even on remote hostnames", () => {
    const opts = resolvePostgresOptions("postgresql://u:p@db.internal.example:5432/app?sslmode=disable");
    expect(opts.ssl).toBe(false);
    expect(opts.prepare).toBe(true);
  });
});

describe("isRemoteDatabaseUrl", () => {
  it("flags Supabase, Neon, and external hosts as remote while allowing local hosts", () => {
    expect(isRemoteDatabaseUrl("postgresql://u:p@db.abc.supabase.co:5432/postgres")).toBe(true);
    expect(isRemoteDatabaseUrl("postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres")).toBe(true);
    expect(isRemoteDatabaseUrl("postgresql://u:p@ep-test.neon.tech/neondb")).toBe(true);
    expect(isRemoteDatabaseUrl("postgresql://u:p@localhost:5432/hrm_dev")).toBe(false);
    expect(isRemoteDatabaseUrl("postgresql://u:p@127.0.0.1:5432/hrm_test")).toBe(false);
    expect(isRemoteDatabaseUrl("postgresql://u:p@postgres:5432/hrm_dev")).toBe(false);
    expect(isRemoteDatabaseUrl("")).toBe(false);
  });
});
