import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { createSessionToken, verifySessionToken, type SessionPayload } from "@/lib/auth/session";

const payload: SessionPayload = {
  sub: "11111111-1111-1111-1111-111111111111",
  employeeId: "22222222-2222-2222-2222-222222222222",
  email: "test@example.com",
  role: "employee",
};

describe("session tokens", () => {
  it("round-trips a valid token", async () => {
    const token = await createSessionToken(payload);
    const result = await verifySessionToken(token);
    expect(result).toEqual(payload);
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken(payload);
    const tampered = `${token.slice(0, -2)}xx`;
    await expect(verifySessionToken(tampered)).resolves.toBeNull();
  });

  it("rejects a token signed with the wrong secret", async () => {
    const wrongKey = new TextEncoder().encode("a-completely-different-secret-value");
    const token = await new SignJWT({ ...payload })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(wrongKey);
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const key = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new SignJWT({ ...payload })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 1000)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 500)
      .sign(key);
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("rejects malformed input", async () => {
    await expect(verifySessionToken("not-a-jwt")).resolves.toBeNull();
  });
});
