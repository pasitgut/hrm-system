import { afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, resetDb, closeDb } from "@/tests/setup/db";
import { lineIntegrationJobs } from "@/lib/db/schema";
import { runPendingWork } from "@/lib/line/jobs";
import { POST as retry } from "@/app/api/internal/integrations/retry/route";
import { generateKeyPairSync } from "node:crypto";
import { createEmployee } from "@/tests/setup/factories";
import { lineCalendarEvents } from "@/lib/db/schema";
import { employees, users, lineBotStates, lineLinkCodes, lineWebhookEvents } from "@/lib/db/schema";
import { createUser } from "@/tests/setup/factories";
beforeEach(async () => {
  await resetDb(); await db.delete(lineIntegrationJobs);
  process.env.LINE_BOT_ENABLED = "true";
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-token";
  process.env.LINE_INTEGRATION_SECRET = "test-runner-secret";
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeDb);
describe("durable integration delivery", () => {
  it("requires service authentication on the retry endpoint", async () => {
    expect((await retry(new Request("http://localhost/api/internal/integrations/retry", { method: "POST" }))).status).toBe(401);
  });
  it("reuses a stable push retry key and completes only once across parallel runners", async () => {
    const keys: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => { keys.push(new Headers(init.headers).get("X-Line-Retry-Key")!); return Response.json({}); });
    const [job] = await db.insert(lineIntegrationJobs).values({ operationKey: "delivery", kind: "line.message", payload: { to: "Utest", messages: [{ type: "text", text: "result" }] } }).returning();
    await Promise.all([runPendingWork(), runPendingWork()]);
    expect(keys).toEqual([job.retryKey]);
    expect((await db.select().from(lineIntegrationJobs))[0].status).toBe("completed");
  });
  it("retries temporary failure at most five times and then keeps a failed job", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
    const [job] = await db.insert(lineIntegrationJobs).values({ operationKey: "temporary", kind: "line.message", payload: { to: "Utest", messages: [{ type: "text", text: "result" }] } }).returning();
    for (let n = 0; n < 6; n++) { await runPendingWork(); await db.update(lineIntegrationJobs).set({ nextAttemptAt: new Date(0) }).where(eq(lineIntegrationJobs.id, job.id)); }
    await runPendingWork();
    expect((await db.select().from(lineIntegrationJobs))[0]).toMatchObject({ status: "failed", attempts: 6 });
  });
  it("never turns an ambiguous reply result into a duplicate push", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => { urls.push(url); throw new Error("lost response"); });
    await db.insert(lineIntegrationJobs).values({ operationKey: "reply", kind: "line.message", payload: { to: "Utest", replyToken: "reply-token", replyUntil: Date.now() + 40_000, messages: [{ type: "text", text: "result" }] } });
    await runPendingWork(); await runPendingWork();
    expect(urls).toEqual(["https://api.line.me/v2/bot/message/reply"]);
    expect((await db.select().from(lineIntegrationJobs))[0].status).toBe("unknown");
  });
  it("does not retry permanent authorization failures", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 403 }));
    await db.insert(lineIntegrationJobs).values({ operationKey: "permanent", kind: "line.message", payload: { to: "Utest", messages: [{ type: "text", text: "result" }] } });
    await runPendingWork();
    expect((await db.select().from(lineIntegrationJobs))[0]).toMatchObject({ status: "failed", attempts: 1 });
  });
  it("does not replay an ambiguous push after the provider's 24-hour idempotency window", async () => {
    let sent = 0; vi.stubGlobal("fetch", async () => { sent++; return Response.json({}); });
    await db.insert(lineIntegrationJobs).values({ operationKey: "late-retry", kind: "line.message", attempts: 1, createdAt: new Date(Date.now() - 25 * 3_600_000), payload: { to: "Utest", messages: [{ type: "text", text: "result" }] } });
    await runPendingWork();
    expect(sent).toBe(0);
    expect((await db.select().from(lineIntegrationJobs))[0].status).toBe("unknown");
  });
  it("rechecks password reset restrictions and revoked leave-read access before delivery", async () => {
    const account = await createUser({ role: "employee", mustChangePassword: true });
    await db.update(employees).set({ lineUid: "Utest" }).where(eq(employees.id, account.employee.id));
    let sent = 0; vi.stubGlobal("fetch", async () => { sent++; return Response.json({}); });
    await db.insert(lineIntegrationJobs).values({ operationKey: "reset-user", kind: "line.message", payload: { employeeId: account.employee.id, to: "Utest", messages: [{ type: "text", text: "private leave info" }] } });
    await runPendingWork();
    expect(sent).toBe(0);
    await db.update(users).set({ mustChangePassword: false, permissions: ["permissions.leave_view_self.disabled", "permissions.leave_request_self.disabled"] }).where(eq(users.id, account.user.id));
    await db.insert(lineIntegrationJobs).values({ operationKey: "revoked-read", kind: "line.message", payload: { employeeId: account.employee.id, leaveReadRequired: true, to: "Utest", messages: [{ type: "text", text: "private leave info" }] } });
    await runPendingWork(); expect(sent).toBe(0);
  });
  it("does not delete an event that failed the Calendar ownership check", async () => {
    const employee = await createEmployee();
    const [event] = await db.insert(lineCalendarEvents).values({ employeeId: employee.id, title: "local", status: "deleting" }).returning();
    process.env.GOOGLE_CALENDAR_ID = "test-calendar";
    let deleted = false;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url.includes("oauth2")) return Response.json({ access_token: "fake-token", expires_in: 3600 });
      if (init.method === "DELETE") deleted = true;
      return Response.json({ extendedProperties: { private: { application: "another-system" } } });
    });
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { format: "pem", type: "pkcs8" }, publicKeyEncoding: { format: "pem", type: "spki" } });
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "calendar@example.iam.gserviceaccount.com"; process.env.GOOGLE_PRIVATE_KEY = privateKey;
    await db.insert(lineIntegrationJobs).values({ operationKey: "foreign-delete", kind: "calendar.delete", payload: { eventId: event.id } });
    await runPendingWork();
    expect(deleted).toBe(false);
    expect((await db.select().from(lineIntegrationJobs))[0].status).toBe("failed");
  });
  it("cleans completed bot work after seven days without deleting unresolved jobs or shared receipts", async () => {
    const old = new Date(Date.now() - 8 * 86_400_000);
    await db.insert(lineIntegrationJobs).values([{ operationKey: "old-done", kind: "line.message", payload: {}, status: "completed", updatedAt: old }, { operationKey: "old-unknown", kind: "line.message", payload: {}, status: "unknown", updatedAt: old }]);
    await db.insert(lineBotStates).values({ lineUid: "expired", expiresAt: old });
    await db.insert(lineWebhookEvents).values({ eventId: "shared-receipt", status: "completed", createdAt: old });
    await runPendingWork();
    expect((await db.select().from(lineIntegrationJobs)).map((j) => j.operationKey)).toEqual(["old-unknown"]);
    expect(await db.select().from(lineBotStates)).toHaveLength(0);
    expect(await db.select().from(lineWebhookEvents)).toHaveLength(1);
  });
  it("serializes create and delete for one Calendar event so a delayed create cannot leave an orphan", async () => {
    const employee = await createEmployee();
    const [event] = await db.insert(lineCalendarEvents).values({ employeeId: employee.id, title: "Meeting", startAt: new Date("2026-12-01T02:00:00Z"), endAt: new Date("2026-12-01T03:00:00Z") }).returning();
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { format: "pem", type: "pkcs8" }, publicKeyEncoding: { format: "pem", type: "spki" } });
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "calendar@example.iam.gserviceaccount.com";
    process.env.GOOGLE_PRIVATE_KEY = privateKey;
    process.env.GOOGLE_CALENDAR_ID = "test-calendar";
    let remoteExists = false;
    let remoteResource: Record<string, any> = {};
    let releaseCreate!: () => void; let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const release = new Promise<void>((resolve) => { releaseCreate = resolve; });
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url.includes("oauth2")) return Response.json({ access_token: "fake-google-token", expires_in: 3600 });
      if (init.method === "POST") { remoteResource = JSON.parse(String(init.body)); started(); await release; remoteExists = true; return Response.json({ id: "created" }); }
      if (init.method === "DELETE") { if (!remoteExists) return new Response(null, { status: 404 }); remoteExists = false; return new Response(null, { status: 204 }); }
      return remoteExists ? Response.json(remoteResource) : new Response(null, { status: 404 });
    });
    await db.insert(lineIntegrationJobs).values({ operationKey: "calendar-create", kind: "calendar.upsert", payload: { eventId: event.id } });
    const first = runPendingWork(1);
    await startedPromise;
    await db.update(lineCalendarEvents).set({ status: "deleting" }).where(eq(lineCalendarEvents.id, event.id));
    await db.insert(lineIntegrationJobs).values({ operationKey: "calendar-delete", kind: "calendar.delete", payload: { eventId: event.id } });
    await runPendingWork(1);
    releaseCreate(); await first; await runPendingWork(1);
    expect(remoteExists).toBe(false);
    expect((await db.select().from(lineCalendarEvents))[0].status).toBe("deleted");
  });
});
