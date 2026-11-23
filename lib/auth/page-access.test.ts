import { describe, expect, it } from "vitest";
import {
  applyPageAccessToggle,
  canAccessPage,
  extractDeniedPages,
  haveSameDeniedPages,
  isPageEnabledForDraft,
  PAGE_ACCESS_ITEMS,
  PAGE_ACCESS_KEYS,
} from "@/lib/auth/page-access";
import { encodePermissionsForStorage } from "@/lib/auth/permissions";
import { ROLE_DEFAULT_PERMISSIONS } from "@/lib/auth/roles";

describe("page access control", () => {
  it("extracts valid denied page keys in canonical order", () => {
    const raw = [
      "ot.view_self",
      "page.reports.denied",
      "page.unknown.denied",
      "page.ot.denied",
    ];
    expect(extractDeniedPages(raw)).toEqual(["ot", "reports"]);
    expect(haveSameDeniedPages(["reports", "ot"], ["ot", "reports"])).toBe(true);
    expect(haveSameDeniedPages(["ot"], ["reports"])).toBe(false);
  });

  it("blocks access when a page has an explicit page.<key>.denied marker even if underlying permissions are granted", () => {
    const baseOtPerms = encodePermissionsForStorage(["ot.view_self", "ot.request.self"]);
    expect(canAccessPage(baseOtPerms, "ot")).toBe(true);

    const deniedOtPerms = encodePermissionsForStorage(["ot.view_self", "ot.request.self"], ["ot"]);
    expect(canAccessPage(deniedOtPerms, "ot")).toBe(false);
  });

  it("turns a page off cleanly via deniedPages while keeping underlying permissions intact", () => {
    const result = applyPageAccessToggle(ROLE_DEFAULT_PERMISSIONS.employee, [], "reports", false);
    expect(result.deniedPages).toEqual(["reports"]);
    expect(result.permissions).toContain("reports.view");
    expect(isPageEnabledForDraft(result.permissions, result.deniedPages, "reports")).toBe(false);
  });

  it("clears denial and grants minimum base permissions when enabling a previously inaccessible page", () => {
    // Employee defaults cannot open /payroll or /documents
    expect(isPageEnabledForDraft(ROLE_DEFAULT_PERMISSIONS.employee, [], "payroll")).toBe(false);

    const enabledPayroll = applyPageAccessToggle(ROLE_DEFAULT_PERMISSIONS.employee, [], "payroll", true);
    expect(enabledPayroll.deniedPages).toEqual([]);
    expect(enabledPayroll.permissions).toContain("salary_slips.view");
    expect(enabledPayroll.permissions).toContain("employees.compensation.view");
    expect(isPageEnabledForDraft(enabledPayroll.permissions, enabledPayroll.deniedPages, "payroll")).toBe(true);

    // Enabling an explicitly denied page restores access without duplicating keys
    const restoredOt = applyPageAccessToggle(ROLE_DEFAULT_PERMISSIONS.employee, ["ot"], "ot", true);
    expect(restoredOt.deniedPages).toEqual([]);
    expect(isPageEnabledForDraft(restoredOt.permissions, restoredOt.deniedPages, "ot")).toBe(true);
  });

  it("defines metadata for every controllable route key", () => {
    expect(PAGE_ACCESS_ITEMS.map((item) => item.key)).toEqual([...PAGE_ACCESS_KEYS]);
  });
});
