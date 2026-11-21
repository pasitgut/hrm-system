import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getRoleLabel,
  getRoleShortLabel,
  isRole,
  normalizeRole,
  ROLE_DEFAULT_PERMISSIONS,
  USER_ROLES,
} from "@/lib/auth/roles";

describe("roles", () => {
  it("defines exactly the three system roles", () => {
    expect(USER_ROLES).toEqual(["employee", "hr", "executive"]);
  });

  it("validates current roles and rejects legacy or unknown values", () => {
    expect(isRole("employee")).toBe(true);
    expect(isRole("hr")).toBe(true);
    expect(isRole("executive")).toBe(true);
    expect(isRole("supervisor")).toBe(false);
    expect(isRole("ceo")).toBe(false);
    expect(isRole("manager")).toBe(false);
    expect(isRole(null)).toBe(false);
  });

  it("normalizes unknown or unsupported role values to employee", () => {
    expect(normalizeRole("employee")).toBe("employee");
    expect(normalizeRole("hr")).toBe("hr");
    expect(normalizeRole("executive")).toBe("executive");
    expect(normalizeRole("supervisor")).toBe("employee");
    expect(normalizeRole("ceo")).toBe("employee");
    expect(normalizeRole("unknown")).toBe("employee");
    expect(normalizeRole(undefined)).toBe("employee");
  });

  it("provides Thai display labels for each role", () => {
    expect(getRoleLabel("employee")).toBe("พนักงาน");
    expect(getRoleLabel("hr")).toBe("ฝ่ายทรัพยากรบุคคล (HR)");
    expect(getRoleLabel("executive")).toBe("ผู้บริหาร");
    expect(getRoleShortLabel("hr")).toBe("HR");
  });

  it("maps every default preset permission to a known permission key", () => {
    const known = new Set<string>(PERMISSIONS.map(({ key }) => key));
    for (const role of USER_ROLES) {
      for (const permission of ROLE_DEFAULT_PERMISSIONS[role]) {
        expect(known.has(permission)).toBe(true);
      }
    }
    expect(ROLE_DEFAULT_PERMISSIONS.hr).toContain("users.permissions.manage");
    expect(ROLE_DEFAULT_PERMISSIONS.executive).toContain("ot.approve");
    expect(ROLE_DEFAULT_PERMISSIONS.executive).not.toContain("users.permissions.manage");
    expect(ROLE_DEFAULT_PERMISSIONS.employee).not.toContain("ot.approve");
  });
});
