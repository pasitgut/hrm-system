# LINE Bot deployment and cutover

## Before deployment

1. Review the feature branch, [integration map](../integrations/line-hrm-map.md), and [pending work](../line-bot-pending.md).
2. Keep LINE_BOT_ENABLED=false until migration 0028 and environment configuration are ready. Take a restricted-access database/Sheets backup and rehearse restoring it.
3. Use the existing HRM deployment pipeline. Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` against a disposable test DB first.
4. Apply migration 0028 with `npm run db:migrate` using the intended Direct/Session Pooler connection. Do not run seeds/resetDb against production. Verify RLS is enabled and browser roles cannot read the four operational tables.
5. Configure the variables listed in .env.example using the hosting secret store. The Calendar Service Account must be shared onto the target calendar. Do not reuse personal Drive refresh-token credentials.
6. Configure an authenticated scheduler to POST `/api/internal/integrations/retry` every five minutes. Use Supabase Vault if using pg_cron/pg_net. Configure an HTTP timeout that allows the endpoint to finish, and disable production scheduler URLs on restored/staging databases.

## Test channel acceptance

1. Enable the bot in a test deployment and verify `/api/line/webhook` in the LINE console. Invalid signatures must return 401. The proxy deliberately bypasses cookie redirects for this exact route only; the handler enforces provider authentication.
2. In the bot's private chat, send ลงทะเบียน and then the employee code. Verify employees.line_uid is persisted and subsequent messages need no code. Also test starting leave while unregistered: after code entry, the original leave-type Flex must appear automatically. Employee codes are not secret identity proofs; follow the internal HR verification policy and never overwrite an existing LINE binding silently.
3. Test leave creation, quota rejection, cancel-own, approve/reject, revoked permissions, date boundaries and duplicate delivery. Confirm that both website and LINE use the same leave rows and permissions.
4. Test creating/viewing/deleting a mapped appointment and full-day approved leave. Simulate provider failure and verify durable retries and visible failed/unknown states.

## Production switch

1. Confirm that work-tracking or other LINE commands do not rely on an external handler that would be replaced. Resolve the pending routing gate before changing the URL.
2. Complete or reconcile in-flight old requests. Stop old writers, import the final verified delta, and map legacy IDs. Tell users to restart unfinished conversations; do not import PropertiesService state blindly.
3. Enable the new bot, change the LINE webhook URL once, and retire the old HRM-to-Apps-Script notification actions. Keep one writer and one owner of integration jobs.
4. Confirm a test employee's full workflow and inspect queued/failed/unknown jobs and Calendar mappings. Keep old code available but unable to write during verification.

## Failure and rollback

If only the new bot malfunctions, disable LINE_BOT_ENABLED while leaving the HRM database intact. Existing HRM web leave routes remain available; new integration jobs stop being created while disabled. Recover/reconcile missed notifications before re-enabling, rather than blindly backfilling all approved leave.

After production data has changed, do not point LINE back at old Sheets immediately. Pause new bot commands, reconcile new HRM rows and Google events, then explicitly choose a single writer. Roll back code while preserving additive tables and new business data; do not drop the migration tables as an automatic rollback.

Unknown reply jobs require manual reconciliation. Failed Calendar jobs do not reverse a successful HRM approval. Reuse the existing operation key/event ID/retry key when replaying safe jobs.

LINE push retry keys have a limited provider validity window. The runner conservatively stops previously attempted push jobs after 23 hours from job creation. Do not requeue an old/unknown push assuming its original key still prevents duplicates; confirm the accepted-request/provider result and obtain an explicit delivery decision first.
