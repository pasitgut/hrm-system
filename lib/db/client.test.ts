import { afterEach, describe, expect, it, vi } from "vitest";

describe("lib/db/client lazy initialization", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    vi.resetModules();
  });

  it("can be imported without DATABASE_URL during build time", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();

    const mod = await import("@/lib/db/client");
    expect(mod.db).toBeDefined();
    expect(mod.sqlClient).toBeDefined();
    await expect(mod.sqlClient.end()).resolves.toBeUndefined();
  });

  it("throws DATABASE_URL is not set only when a query is actually invoked", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();

    const { db, sqlClient } = await import("@/lib/db/client");
    expect(() => db.select()).toThrow("DATABASE_URL is not set");
    expect(() => sqlClient.unsafe("SELECT 1")).toThrow("DATABASE_URL is not set");
  });
});
