import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, resetDb } from "@/tests/setup/db";
import { createUser } from "@/tests/setup/factories";
import { verifySessionToken } from "@/lib/auth/session";

const { setCookie } = vi.hoisted(() => ({ setCookie: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: setCookie }),
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => { throw new Error(`NEXT_REDIRECT:${destination}`); },
}));

import { loginAction } from "@/app/login/actions";

beforeEach(async () => {
  setCookie.mockClear();
  await resetDb();
});

afterAll(closeDb);

describe("first login", () => {
  it("sends a temporary-password login straight to password change", async () => {
    const { user, plainPassword } = await createUser({
      email: "first.login@example.com",
      plainPassword: "2604",
      mustChangePassword: true,
    });
    const form = new FormData();
    form.set("identifier", user.email);
    form.set("password", plainPassword);

    await expect(loginAction({ error: null }, form)).rejects.toThrow("NEXT_REDIRECT:/change-password");

    expect(setCookie).toHaveBeenCalledOnce();
    const token = setCookie.mock.calls[0][1];
    await expect(verifySessionToken(token)).resolves.toMatchObject({
      sub: user.id,
      mustChangePassword: true,
    });
  });
});
