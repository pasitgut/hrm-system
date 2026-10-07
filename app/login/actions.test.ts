import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";
import { authenticate } from "@/app/login/actions";

beforeEach(resetDb);
afterAll(closeDb);

describe("authenticate", () => {
  it("succeeds for a matching email + password", async () => {
    const { user, plainPassword } = await createUser({ email: "authtest@example.com", role: "employee" });

    const result = await authenticate("authtest@example.com", plainPassword);

    expect(result?.id).toBe(user.id);
  });

  it("is case-insensitive on the email", async () => {
    const { user, plainPassword } = await createUser({ email: "mixedcase@example.com", role: "supervisor" });

    const result = await authenticate("MixedCase@example.com", plainPassword);

    expect(result?.id).toBe(user.id);
  });

  it("accepts an employee code as the login identifier", async () => {
    const { user, employee, plainPassword } = await createUser({ email: "code-login@example.com" });

    const result = await authenticate(employee!.code, plainPassword);

    expect(result?.id).toBe(user.id);
  });

  it("fails for the wrong password", async () => {
    await createUser({ email: "wrongpass@example.com", plainPassword: "Password123!" });

    const result = await authenticate("wrongpass@example.com", "TotallyWrong1!");

    expect(result).toBeNull();
  });

  it("fails for an unknown email", async () => {
    const result = await authenticate("nobody@example.com", "Password123!");

    expect(result).toBeNull();
  });

  it("fails for a deactivated user even with the correct password", async () => {
    const { plainPassword } = await createUser({ email: "inactive@example.com", isActive: false });

    const result = await authenticate("inactive@example.com", plainPassword);

    expect(result).toBeNull();
  });
});
