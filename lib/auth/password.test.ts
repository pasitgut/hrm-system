import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password", () => {
  it("hashes a password to something other than the plaintext", async () => {
    const hash = await hashPassword("Password123!");
    expect(hash).not.toBe("Password123!");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("Password123!");
    await expect(verifyPassword("Password123!", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Password123!");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("produces different hashes for the same input (random salt)", async () => {
    const [a, b] = await Promise.all([hashPassword("Password123!"), hashPassword("Password123!")]);
    expect(a).not.toBe(b);
  });
});
