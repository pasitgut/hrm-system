import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  getAdminConfig,
  getSystemAdminPermissions,
  isSystemAdminIdentifier,
  isSystemAdminSession,
  isSystemAdminUserId,
  SYSTEM_ADMIN_USER_ID,
  verifySystemAdminCredentials,
} from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";

const ENV_KEYS = ["ADMIN_USERNAME", "ADMIN_EMAIL", "ADMIN_PASSWORD"] as const;

describe("lib/auth/admin", () => {
  const snapshot = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  it("defaults to built-in admin / admin credentials when env overrides are absent", () => {
    for (const key of ENV_KEYS) delete process.env[key];

    const config = getAdminConfig();
    expect(config).toEqual({
      username: DEFAULT_ADMIN_USERNAME,
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      isDefaultPassword: true,
    });
    expect(verifySystemAdminCredentials("admin", "admin")).toBe(true);
    expect(verifySystemAdminCredentials("ADMIN@peopleos.co", "admin")).toBe(true);
    expect(verifySystemAdminCredentials("admin", "wrong")).toBe(false);
    expect(verifySystemAdminCredentials("someone", "admin")).toBe(false);
  });

  it("overrides the default password when ADMIN_PASSWORD is set in env", () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_EMAIL;
    process.env.ADMIN_PASSWORD = "CustomStrongPassword#99";

    const config = getAdminConfig();
    expect(config.isDefaultPassword).toBe(false);
    expect(verifySystemAdminCredentials("admin", "admin")).toBe(false);
    expect(verifySystemAdminCredentials("admin", "CustomStrongPassword#99")).toBe(true);
  });

  it("supports overriding username and email while preserving the built-in admin identifier", () => {
    process.env.ADMIN_USERNAME = "SuperAdmin";
    process.env.ADMIN_EMAIL = "boss@company.co";
    process.env.ADMIN_PASSWORD = "secret";

    expect(isSystemAdminIdentifier("superadmin")).toBe(true);
    expect(isSystemAdminIdentifier("boss@company.co")).toBe(true);
    expect(isSystemAdminIdentifier("admin")).toBe(true);
    expect(verifySystemAdminCredentials("superadmin", "secret")).toBe(true);
    expect(verifySystemAdminCredentials("boss@company.co", "secret")).toBe(true);
  });

  it("identifies system admin sessions cleanly", () => {
    expect(isSystemAdminUserId(SYSTEM_ADMIN_USER_ID)).toBe(true);
    expect(isSystemAdminUserId("00000000-0000-4000-8000-000000000001")).toBe(false);
    expect(isSystemAdminSession({ sub: SYSTEM_ADMIN_USER_ID })).toBe(true);
    expect(isSystemAdminSession({ sub: "other", isSystemAdmin: true })).toBe(true);
    expect(isSystemAdminSession({ sub: "other" })).toBe(false);
  });

  it("grants full company/HR permissions while disabling employee self-service grants", () => {
    const permissions = getSystemAdminPermissions();
    expect(hasPermission(permissions, "employees.profile.view")).toBe(true);
    expect(hasPermission(permissions, "employees.profile.create")).toBe(true);
    expect(hasPermission(permissions, "employees.compensation.manage")).toBe(true);
    expect(hasPermission(permissions, "salary_slips.view")).toBe(true);
    expect(hasPermission(permissions, "users.permissions.manage")).toBe(true);
    expect(hasPermission(permissions, "work.view")).toBe(true);

    expect(hasPermission(permissions, "ot.view_self")).toBe(false);
    expect(hasPermission(permissions, "ot.request.self")).toBe(false);
    expect(hasPermission(permissions, "leave.view_self")).toBe(false);
    expect(hasPermission(permissions, "leave.request.self")).toBe(false);
    expect(hasPermission(permissions, "assets.view_self")).toBe(false);
    expect(hasPermission(permissions, "assets.request.self")).toBe(false);
  });
});
