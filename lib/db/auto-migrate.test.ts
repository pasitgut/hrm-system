import { describe, expect, it } from "vitest";
import { classifyDatabaseError, maskDatabaseUrl } from "@/lib/db/auto-migrate";

describe("lib/db/auto-migrate diagnostics", () => {
  it("masks database passwords without altering host or user", () => {
    expect(maskDatabaseUrl("postgresql://postgres.abc:SuperSecret123@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"))
      .toBe("postgresql://postgres.abc:***@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres");
  });

  it("detects missing DATABASE_URL", () => {
    const result = classifyDatabaseError(new Error("DATABASE_URL is not set"), "");
    expect(result.ready).toBe(false);
    expect(result.reason).toBe("missing_url");
    expect(result.message).toContain("DATABASE_URL");
  });

  it("detects invalid URL format such as unencoded password characters", () => {
    const result = classifyDatabaseError(
      new TypeError("Invalid URL"),
      "postgresql://postgres:bad@pass#1@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    );
    expect(result.ready).toBe(false);
    expect(result.reason).toBe("invalid_url");
    expect(result.message).not.toContain("bad@pass#1");
  });

  it("detects Supabase IPv6 direct host ENETUNREACH and recommends Pooler URL", () => {
    const nested = Object.assign(new Error("connect ENETUNREACH 2406:da18::5432"), { code: "ENETUNREACH" });
    const wrapper = Object.assign(new Error("Failed query"), { cause: nested });
    const result = classifyDatabaseError(
      wrapper,
      "postgresql://postgres:mysecret@db.abcdefghijklmnop.supabase.co:5432/postgres",
    );
    expect(result.ready).toBe(false);
    expect(result.reason).toBe("ipv6_direct_host");
    expect(result.hint).toContain("pooler.supabase.com");
    expect(result.message).not.toContain("mysecret");
  });

  it("detects PostgreSQL authentication failure (28P01)", () => {
    const err = Object.assign(new Error("password authentication failed for user"), { code: "28P01" });
    const result = classifyDatabaseError(
      err,
      "postgresql://postgres.ref:wrongpass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    );
    expect(result.ready).toBe(false);
    expect(result.reason).toBe("auth_failed");
    expect(result.hint).toContain("postgres.<project-ref>");
    expect(JSON.stringify(result)).not.toContain("wrongpass");
  });

  it("detects missing tables (42P01)", () => {
    const err = Object.assign(new Error('relation "users" does not exist'), { code: "42P01" });
    const result = classifyDatabaseError(
      err,
      "postgresql://postgres.ref:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    );
    expect(result.ready).toBe(false);
    expect(result.reason).toBe("missing_tables");
  });
});
