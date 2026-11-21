import { createHash } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";

export class ProviderError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryAfter = 0) { super(message); }
}
export type CalendarInput = { title: string; startOn?: string; endOn?: string; session?: string; startAt?: string; endAt?: string; location?: string };
export function calendarEventId(key: string) { return `hrm${createHash("sha256").update(key).digest("hex")}`; }
export function buildCalendarBody(input: CalendarInput) {
  const common = { summary: input.title, location: input.location || "", extendedProperties: { private: { application: "hrm-line" } } };
  if (input.startOn && input.endOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startOn) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endOn) || input.startOn > input.endOn) throw new Error("Invalid Calendar dates");
    if (input.session && input.session !== "full") {
      throw new ProviderError("Half-day Calendar schedule is not configured", 400);
    }
    const end = new Date(`${input.endOn}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
    return { ...common, start: { date: input.startOn }, end: { date: end.toISOString().slice(0, 10) } };
  }
  if (!input.startAt || !input.endAt || !Number.isFinite(Date.parse(input.startAt)) || !Number.isFinite(Date.parse(input.endAt)) || Date.parse(input.endAt) <= Date.parse(input.startAt)) throw new Error("Invalid Calendar time range");
  return { ...common, start: { dateTime: input.startAt, timeZone: "Asia/Bangkok" }, end: { dateTime: input.endAt, timeZone: "Asia/Bangkok" } };
}
let cachedToken: { value: string; expires: number } | undefined;
async function accessToken() {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new ProviderError("Google Calendar is not configured", 503);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/calendar.events" }).setProtectedHeader({ alg: "RS256" }).setIssuer(email).setAudience("https://oauth2.googleapis.com/token").setIssuedAt().setExpirationTime("1h").sign(await importPKCS8(privateKey, "RS256"));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new ProviderError("Google service account authentication failed", response.status);
  const token = await response.json();
  if (typeof token.access_token !== "string") throw new ProviderError("Invalid Google token response", 502);
  cachedToken = { value: token.access_token, expires: Date.now() + Math.min(3600, Number(token.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}
export async function calendarRequest(method: string, path: string, body?: unknown, token?: string) {
  const calendar = process.env.GOOGLE_CALENDAR_ID;
  if (!calendar && !token) throw new ProviderError("Google Calendar is not configured", 503);
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar || "test")}/${path}`, { method, headers: { Authorization: `Bearer ${token ?? await accessToken()}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const throttled = response.status === 403 && error?.error?.errors?.some((item: { reason?: string }) => ["rateLimitExceeded", "userRateLimitExceeded"].includes(item.reason || ""));
    throw new ProviderError("Google Calendar request failed", throttled ? 429 : response.status, Number(response.headers.get("retry-after")) || 0);
  }
  return response.status === 204 ? null : response.json();
}
export async function upsertCalendarEvent(id: string, input: CalendarInput) {
  const eventId = calendarEventId(id);
  try { await calendarRequest("POST", "events", { id: eventId, ...buildCalendarBody(input), extendedProperties: { private: { application: "hrm-line", internalEventId: id } } }); }
  catch (error) {
    if (!(error instanceof ProviderError) || error.status !== 409) throw error;
    const existing = await calendarRequest("GET", `events/${eventId}`);
    if (existing.extendedProperties?.private?.application !== "hrm-line" || existing.extendedProperties?.private?.internalEventId !== id) throw new ProviderError("Calendar ownership mismatch", 409);
  }
  return eventId;
}
