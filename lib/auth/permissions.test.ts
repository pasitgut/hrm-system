import { describe, expect, it } from "vitest";
import {
  MANAGER_PERMISSIONS,
  PERMISSIONS,
  canApproveAssetLoan,
  canApproveLeave,
  canApproveOT,
  canManageAssets,
  canManageEmployees,
  canManageSettings,
  canViewCompanyLeave,
  canViewCompanyOt,
  encodePermissionsForStorage,
  hasPermission,
  normalizePermissions,
  type PermissionKey,
} from "@/lib/auth/permissions";

describe("capability helpers", () => {
  const cases: Array<[string, (permissions: unknown) => boolean, PermissionKey]> = [
    ["canApproveOT", canApproveOT, "ot.approve"],
    ["canApproveLeave", canApproveLeave, "leave.approve"],
    ["canApproveAssetLoan", canApproveAssetLoan, "assets.requests.manage"],
    ["canManageAssets", canManageAssets, "assets.requests.manage"],
    ["canManageEmployees", canManageEmployees, "employees.profile.update"],
    ["canManageSettings", canManageSettings, "settings.departments.manage"],
    ["canViewCompanyOt", canViewCompanyOt, "ot.view_company"],
    ["canViewCompanyLeave", canViewCompanyLeave, "leave.view_company"],
  ];

  it.each(cases)("%s is true only when the matching permission is granted", (_name, check, permission) => {
    expect(check([permission])).toBe(true);
    expect(check([])).toBe(false);
    expect(check(undefined)).toBe(false);
  });

  it("lets approvers see company-wide OT and leave without a separate view grant", () => {
    expect(canViewCompanyOt(["ot.approve"])).toBe(true);
    expect(canViewCompanyLeave(["leave.approve"])).toBe(true);
  });
});

describe("hasPermission", () => {
  it("grants self-service access by default until it is explicitly disabled", () => {
    expect(hasPermission([], "ot.request.self")).toBe(true);
    expect(hasPermission(["permissions.ot_request_self.disabled"], "ot.request.self")).toBe(false);
  });

  it("does not grant privileged permissions by default", () => {
    expect(hasPermission([], "ot.approve")).toBe(false);
    expect(hasPermission("not-an-array", "ot.request.self")).toBe(false);
  });
});

describe("normalizePermissions / encodePermissionsForStorage", () => {
  it("round-trips: disabling a default grant survives storage and normalization", () => {
    const granted: PermissionKey[] = ["ot.approve", "work.view"];

    const stored = encodePermissionsForStorage(granted);
    const normalized = normalizePermissions(stored);

    expect(stored).toContain("permissions.ot_request_self.disabled");
    expect(normalized).toContain("ot.approve");
    expect(normalized).toContain("work.view");
    expect(normalized).not.toContain("ot.request.self");
  });

  it("ignores unknown and non-string entries", () => {
    expect(normalizePermissions(["bogus", 42, "ot.approve"])).toContain("ot.approve");
    expect(normalizePermissions(["bogus"])).not.toContain("bogus" as PermissionKey);
    expect(normalizePermissions(null)).toEqual([]);
  });
});

describe("MANAGER_PERMISSIONS", () => {
  it("only contains permissions defined in the catalogue", () => {
    const known = new Set<string>(PERMISSIONS.map(({ key }) => key));
    for (const permission of MANAGER_PERMISSIONS) expect(known.has(permission)).toBe(true);
  });

  it("allows approving and company-wide viewing", () => {
    expect(canApproveOT([...MANAGER_PERMISSIONS])).toBe(true);
    expect(canApproveLeave([...MANAGER_PERMISSIONS])).toBe(true);
    expect(canManageAssets([...MANAGER_PERMISSIONS])).toBe(true);
  });
});
