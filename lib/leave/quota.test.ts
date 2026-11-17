import { describe, expect, it } from "vitest";
import { completedMonthsBetween, entitledQuotaDays } from "./quota";

const tenure = (startDate: string, year: number, annualQuotaDays: number | null = 6) =>
  entitledQuotaDays({ annualQuotaDays, quotaBasis: "tenure", startDate, year });

describe("completedMonthsBetween", () => {
  it("counts whole months and never goes negative", () => {
    expect(completedMonthsBetween("2026-07-01", "2027-01-01")).toBe(6);
    expect(completedMonthsBetween("2026-07-15", "2027-01-01")).toBe(5);
    expect(completedMonthsBetween("2027-02-01", "2027-01-01")).toBe(0);
  });
});

describe("entitledQuotaDays", () => {
  it("gives the full maximum to someone with 12+ months of service", () => {
    expect(tenure("2025-07-15", 2026)).toBe(6);
    expect(tenure("2026-01-01", 2026)).toBe(6);
    expect(tenure("2020-03-10", 2026)).toBe(6);
  });

  it("pro-rates by completed months in the first year, rounding down", () => {
    expect(tenure("2026-07-01", 2026)).toBe(3); // 6 months
    expect(tenure("2026-07-15", 2026)).toBe(2); // 5 months -> 2.5 -> 2
    expect(tenure("2026-12-01", 2026)).toBe(0); // 1 month -> 0.5 -> 0
    expect(tenure("2026-02-01", 2026)).toBe(5); // 11 months -> 5.5 -> 5
  });

  it("gives nothing for a year before the employee started", () => {
    expect(tenure("2027-03-01", 2026)).toBe(0);
  });

  it("ignores tenure for fixed quotas and keeps null as uncapped", () => {
    expect(entitledQuotaDays({ annualQuotaDays: 30, quotaBasis: "fixed", startDate: "2026-12-01", year: 2026 })).toBe(30);
    expect(entitledQuotaDays({ annualQuotaDays: null, quotaBasis: "tenure", startDate: "2026-12-01", year: 2026 })).toBeNull();
  });
});
