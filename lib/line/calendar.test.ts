import { describe, expect, it, vi, afterEach } from "vitest";
import { buildCalendarBody, calendarEventId, calendarRequest } from "@/lib/line/calendar";
afterEach(() => vi.unstubAllGlobals());
describe("service-account Calendar contract", () => {
  it("keeps all-day dates inclusive locally and exclusive at Google across leap day and year end", () => {
    expect(buildCalendarBody({ title: "ลา", startOn: "2028-02-28", endOn: "2028-03-01", session: "full" })).toMatchObject({ start: { date: "2028-02-28" }, end: { date: "2028-03-02" } });
    expect(buildCalendarBody({ title: "ลา", startOn: "2026-12-31", endOn: "2027-01-01", session: "full" })).toMatchObject({ end: { date: "2027-01-02" } });
  });
  it("keeps timed appointments in Bangkok and rejects invalid ranges", () => {
    expect(buildCalendarBody({ title: "ประชุม", startAt: "2026-12-01T09:00:00+07:00", endAt: "2026-12-01T10:00:00+07:00" })).toMatchObject({ start: { dateTime: "2026-12-01T09:00:00+07:00", timeZone: "Asia/Bangkok" } });
    expect(() => buildCalendarBody({ title: "x", startAt: "bad", endAt: "bad" })).toThrow();
  });
  it("uses a stable Google-compatible ID on retries", () => {
    expect(calendarEventId("leave:abc")).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(calendarEventId("leave:abc")).toBe(calendarEventId("leave:abc"));
    expect(calendarEventId("leave:abc")).not.toBe(calendarEventId("leave:def"));
  });
  it("does not invent work hours for half-day leave without a confirmed company schedule", () => {
    expect(() => buildCalendarBody({ title: "ลา", startOn: "2026-12-01", endOn: "2026-12-01", session: "am" })).toThrow("Half-day Calendar schedule is not configured");
  });
  it("never logs or exposes Google credentials on a provider error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private-provider-response", { status: 403 })));
    await expect(calendarRequest("GET", "events", undefined, "test-access-token")).rejects.toMatchObject({ status: 403, message: "Google Calendar request failed" });
  });
  it("classifies Google quota throttling as retryable while preserving real permission failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, { status: 403 })));
    await expect(calendarRequest("GET", "events", undefined, "test-access-token")).rejects.toMatchObject({ status: 429 });
  });
});
