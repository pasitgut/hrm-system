# LINE Bot integration map

## Repository and scope

Implementation repository: `pasitgut/hrm-system`, branch `feat/line-hrm-bot`, based on commit `70feeec`. The original Apps Script files remain in the parent workspace and are unchanged.

The existing application uses Next.js 16, TypeScript, Drizzle with the postgres driver, Zod, jose and Vitest. This implementation reuses those dependencies. LINE signature verification uses Node HMAC/timing-safe comparison, provider calls use fetch, and the Google Service Account assertion uses the existing jose library. No additional SDK, ORM or frontend framework is installed.

## Business ownership

| Existing behavior | Actual owner after this change |
|---|---|
| Leave creation, validation and quota | `lib/leave/commands.ts#createLeave`, using `app/api/leave/_quota.ts` and the existing date/session parser |
| Approve/reject leave | `lib/leave/commands.ts#decideLeave`, permission `leave.approve`, conditional transition from pending |
| Cancel pending own leave | `lib/leave/commands.ts#cancelLeave`, permission `leave.request.self` and matching employee UUID |
| Web API compatibility | Existing POST `/api/leave`, PATCH `/api/leave/[id]/decision`, DELETE `/api/leave/[id]` now invoke those same commands |
| Transactional notifications | `lib/line/outbox.ts` creates jobs inside the business transaction when LINE_BOT_ENABLED is true |
| LINE conversation | `lib/line/bot.ts`, advisory transaction lock per LINE UID, persisted state and existing receipt table |
| Google Calendar | `lib/line/calendar.ts`, Service Account, Calendar events scope, explicit calendar ID |
| Provider recovery | `lib/line/jobs.ts` and service-authenticated POST `/api/internal/integrations/retry` |
| Identity linking | Authenticated same-origin POST `/api/account/line-link`, then one-use code sent to the bot; `employees.line_uid` remains the only permanent link |

The website authenticates through its own JWT cookie and `users` records; it does not assume Supabase Auth. The bot resolves the current linked employee and active user on every event. It uses the same permission helpers as the web. Jobs containing employee information check the recipient's current employee/LINE mapping and active account again before delivery.

Existing lookup codes confirmed from source/tests: pending, approved, rejected, cancelled. Leave session values are full/am/pm. Quota rules and pro-rating remain in the existing HRM logic. No separate manager approval policy is invented from employees.manager_id.

## Schema compatibility

Migration `0028_line_hrm_bot` adds four operational tables: line_bot_states, line_link_codes, line_integration_jobs and line_calendar_events. It adds nullable request_payload to line_webhook_events. It does not rename or reinterpret sheet_committed, response_payload, push_retry_key or the existing status constraint.

The new processor only consumes processing receipts with a non-null request_payload. Existing work-tracking receipts with null request_payload remain owned by their original pipeline. No LINE webhook/work-tracking message processor exists in the cloned repository at the base commit; production channel routing must be checked before replacing any external webhook.

RLS is enabled on all four new tables, with no anonymous/client policies. Only the application's trusted server database role may access this operational data. Migration and tests use Drizzle's existing workflow; do not add a Supabase service-role REST client.

## Verification commands

Use the repository's package manager on an environment with Node LTS and npm available:

```sh
npm ci
npm run db:check
npm run db:migrate
npm test -- lib/line components/hrm/LineLinkButton.test.tsx proxy.test.ts
npm test
npm run typecheck
npm run build
```

`db:migrate` targets the configured database. For tests, use a disposable local database through TEST_DATABASE_URL and DATABASE_URL, with a test-only JWT_SECRET. Never point resetDb/test fixtures at production.

## Explicit implementation choices

- Actor serialization uses PostgreSQL transaction advisory locks and row locks instead of an in-memory mutex or a separate state-version column. Business mutations and receipt completion commit together.
- Stateful buttons carry an opaque draft ID, and approval cards carry an exact PostgreSQL updated_at revision token. Old cards cannot authorize a different draft or an edited request. Conversation input older than 30 minutes is rejected, and inactivity follows LINE event time rather than worker time.
- Provider calls happen after business commit. Worker claims use leases and fencing tokens. Calendar create/delete claims for one internal event are serialized, and Google event IDs remain deterministic across retries.
- Reply results that may have succeeded are kept as unknown and never silently converted into duplicate push messages. Push uses a persistent UUID retry key from its first attempt.
- Retried push jobs older than 23 hours from job creation are conservatively moved to unknown before HTTP; this avoids relying on LINE's expired 24-hour idempotency window, at the cost of manual reconciliation for some old queued jobs.
- Redeemable link codes are hashed before receipt persistence, ignored group events keep no payload, and the runner cleans completed bot-owned operational data after seven days without touching shared work-tracking receipts.
- User-facing date pickers retain the existing flow; leave submission through LINE currently uses full-day sessions. The existing HRM web API continues to support half-day leave.
- Deferred and environment-dependent work is tracked separately in [LINE Bot pending work](../line-bot-pending.md).
