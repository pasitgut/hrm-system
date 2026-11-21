# LINE Bot implementation decisions and review

Historical review of the initial implementation at cc8fd8b. The user subsequently required employee-code registration and original Flex payloads. That revision supersedes the one-use-link-code design below; current behavior is in [function mapping](line-bot-function-mapping.md) and [remaining differences](line-bot-differences.md).

## Source and delivery boundary

Work is in the isolated clone of pasitgut/hrm-system on feat/line-hrm-bot, based on 70feeec. The user confirmed this repository. No production database, webhook URL or hosting environment was changed. The original Apps Script code remains unchanged.

## Decisions made during implementation

1. Reused Next.js, Drizzle/postgres, Zod, jose, native crypto and fetch instead of adding LINE/Google SDK dependencies. The provider-specific HTTP/signature behavior is covered by tests; changing a provider contract requires updating this adapter.
2. Used a fresh clone on a feature branch for isolation. This avoids touching an existing user checkout; the branch still needs the user's normal integration/deployment process.
3. Used transaction advisory locks per LINE user rather than a new conversation version column. Receipt completion and business/state mutations are atomic; unrelated conversations remain independent.
4. The cloned repository contains the shared LINE receipt schema but no legacy LINE message processor. Only non-null bot request_payload receipts are consumed. Replacing a production channel URL without confirming any external work-tracking router could remove unrelated commands, so that cutover is explicitly pending.
5. Restricted Calendar menus to mapped events owned by the caller. Pagination makes every eligible mapped event reachable; company-wide visibility, administrator deletion and historical ownership remain pending. The cost is reduced visibility until those policies and mappings are supplied.
6. Kept half-day Calendar jobs failed with an explicit configuration error rather than inventing working hours. Web HRM half-day approvals remain valid; manual Calendar handling is needed until a company schedule is confirmed.
7. Used existing JSX UI conventions for the small account-link dialog, leaving shared component APIs unchanged. Backend and integration modules use TypeScript.
8. Applied a conservative 23-hour age guard to previously attempted LINE push jobs using job creation time. This may require manual reconciliation earlier than a first-attempt timestamp would, but prevents a delayed retry from relying on an expired provider key.

## Independent review and one fix pass

A fresh read-only reviewer examined the working tree against the Spec, plan, domain rules, provider contracts and concurrency requirements. No critical issue was reported. The following important findings were reproduced with regression tests and corrected in one fix pass:

| Finding | Correction |
|---|---|
| Old approval card approved newly edited dates | Exact database revision bound to the card and checked in the conditional update |
| Old draft confirmation submitted a different current draft | Opaque draft ID on every stateful postback |
| Delayed events rebuilt expired state | Event-age guard and event-time expiry |
| Fallback Calendar deletion could remove a foreign event | GET and ownership/internal-ID verification before deletion, including deterministic-ID fallback |
| Push replay after provider key expiry could duplicate a message | Conservative retry-window guard with unknown/manual reconciliation |
| Ignored events and link-code receipts retained private plaintext | Minimal ignored receipts and hash-only persistence of recognized generated proofs |
| Delayed leave messages ignored access/password reset changes | Delivery-time eligibility and relevant leave-read/approval permission checks |
| Appointment menus hid later entries and used DB session timezone | Pagination, start ordering, deletable-item filtering and explicit Bangkok date bounds |
| Google 403 throttling was treated as a permanent failure | Retry documented rateLimitExceeded/userRateLimitExceeded, keep permission failures permanent |

The reviewer also identified missing seven-day cleanup. The runner now removes only completed bot jobs, expired codes and sufficiently old expired state. Shared receipts and unresolved jobs remain intact. Registration cancellation was treated as user-visible behavior rather than cosmetic polish and fixed before credential parsing.

An additional create/delete race was reproduced before the independent review: a late create could leave an orphan event after deletion. Calendar job claims are now serialized per internal event without holding a DB transaction over provider HTTP calls.

## Deferred minor

The header still exposes the account-link button when the integration is disabled. It displays a recoverable unavailable message, and the endpoint remains authenticated/disabled. Feature-flag visibility polish is deferred in the pending-work document.

## Scope judgments retained

Live credentials, Calendar sharing, channel verification, deployment, scheduler configuration, hosting/message quotas and costs, production RLS credentials, backups/restore, actual Sheets imports, legacy row/Calendar mappings and replacement historical buttons require the deployment owner or data not present here. They remain explicit gates rather than guesses.

Cross-employee Calendar visibility/admin rights, half-day hours and external work-tracking routing require policy/source confirmation. Drive, Cloudinary, OT and asset features are preserved, not expanded. Dependency upgrades are separate work because audit findings predate this change and forced upgrades could break HRM. The existing HRM convention of charging cross-year leave to its starting year is preserved; changing it here would change company quota behavior across both web and LINE.

These decisions can reduce automation until the gates close; they do not permit data loss or bypass the HRM's permission and quota rules. See [pending work](line-bot-pending.md) and [cutover runbook](runbooks/line-cutover.md).

## Verification result

Local PostgreSQL verification after the fix pass: 75 test files and 414 tests passed. TypeScript typecheck, Drizzle migration check, production Next.js build and git whitespace checks passed. Migration 0028 was applied successfully to the disposable local database; all four new tables report RLS enabled. No new package dependency or lockfile change was required.

Provider HTTP behavior was tested with controlled responses, including lost reply responses, an expired push retry window, concurrent Calendar creation/deletion, ownership collisions and Google throttling. This evidence does not replace the live provider, production role/policy and cutover checks listed in the pending-work document.

## Employee-code and original-Flex revision

The user explicitly replaced the original one-use-token requirement with employee-code registration. The obsolete HRM link endpoint/button were removed. The registration persists employees.line_uid and resumes leave entry after registration; existing active-account, first-login, permission, rate-limit and non-overwrite protections remain documented differences.

Four original GAS files are byte-identical archives; config is redacted. All 33 original functions have a mapping. The eight Flex/card builders are compared against actual archived-source execution with identical input data, normalizing only hidden draft/revision/row metadata. DB tests verify notification reason, source, employee code, duration, annual statistics, deciding administrator and cancellation recipients.

A fresh read-only reviewer confirmed these mappings and identified one concrete edge case: a long location could make the appointment success text exceed LINE's limit. A boundary test failed first, then passed after splitting text into complete Unicode-safe chunks without dropping content. The reviewer declined OTP restoration, ownership expansion, half-day schedule invention, data migration and first-login relaxation as explicit user choices or documented policy/data gates.

Final verification: 76 test files, 427 tests passed using the full Vitest suite; TypeScript typecheck, production build and git whitespace checks passed. The archived original blobs were checked in the Git index against their SHA-256 manifest. The archive alone preserves original whitespace/EOL bytes through path-specific attributes; production code keeps normal whitespace checks. No schema migration or new dependency is required for this revision. Live LINE rendering and provider/deployment checks remain pending.

## Provider references

- [LINE push retry keys and their validity window](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/)
- [Google Calendar retryable errors](https://developers.google.com/workspace/calendar/api/guides/errors)
- [Google Service Account assertion flow](https://developers.google.com/identity/protocols/oauth2/service-account)
