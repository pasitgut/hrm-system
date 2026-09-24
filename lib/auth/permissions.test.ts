import { describe, expect, it } from "vitest";
import {
  canApproveAssetLoan,
  canApproveLeave,
  canApproveOT,
  canManageAssets,
  canManageEmployees,
  canManageSettings,
  canViewCompanyOt,
} from "@/lib/auth/permissions";

const supervisorCeoOnly = [
  ["employee", false],
  ["supervisor", true],
  ["ceo", true],
] as const;

describe("permissions", () => {
  it.each(supervisorCeoOnly)("canApproveOT(%s) === %s", (role, expected) => {
    expect(canApproveOT(role)).toBe(expected);
  });

  it.each(supervisorCeoOnly)("canViewCompanyOt(%s) === %s", (role, expected) => {
    expect(canViewCompanyOt(role)).toBe(expected);
  });

  it.each(supervisorCeoOnly)("canApproveLeave(%s) === %s", (role, expected) => {
    expect(canApproveLeave(role)).toBe(expected);
  });

  it.each(supervisorCeoOnly)("canApproveAssetLoan(%s) === %s", (role, expected) => {
    expect(canApproveAssetLoan(role)).toBe(expected);
  });

  it.each(supervisorCeoOnly)("canManageEmployees(%s) === %s", (role, expected) => {
    expect(canManageEmployees(role)).toBe(expected);
  });

  it.each(supervisorCeoOnly)("canManageAssets(%s) === %s", (role, expected) => {
    expect(canManageAssets(role)).toBe(expected);
  });

  it.each(supervisorCeoOnly)("canManageSettings(%s) === %s", (role, expected) => {
    expect(canManageSettings(role)).toBe(expected);
  });
});
