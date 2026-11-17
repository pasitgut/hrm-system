# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

HRM — a Thai-language human resources management system: employee records, OT requests, leave, a central approvals queue, and reports. Built on Next.js (App Router) with React 19 and Tailwind v4.

**Before writing any code**, read the relevant guide under `node_modules/next/dist/docs/` — this project pins a Next.js version with breaking API/convention changes from older training data (see `AGENTS.md` for details on this requirement).

## Commands

```bash
npm run dev         # next dev
npm run build       # next build
npm run start       # next start
npm run typecheck   # tsc --noEmit
npm test            # vitest run (needs a Postgres test database, see Testing)
npm run db:generate # drizzle-kit generate (after editing lib/db/schema.ts)
npm run db:check    # drizzle-kit check (migration history consistency)
npm run db:migrate  # apply drizzle/ migrations to DATABASE_URL
npm run db:seed     # reset + seed a LOCAL database (refuses production/Neon, see scripts/db/guard.ts)
```

There is no lint script and no ESLint config in the repo.

## Architecture

**Backend:** PostgreSQL through Drizzle ORM (`lib/db/schema.ts`, client in `lib/db/client.ts`). `drizzle/` holds the migrations; `lib/db/schema.ts` must stay in sync with them. Route Handlers live in `app/api/**/route.ts`; shared helpers sit next to them in `_shared.ts`. Common API helpers: `jsonError` (`lib/api/response.ts`), Postgres error predicates (`lib/db/errors.ts`).

**Routing is a thin shell over feature modules.** Every route under `app/*/page.jsx` renders a component from `components/hrm/<feature>/` after a server-side permission check:

```
app/ot/page.jsx  →  <OTModule />  (components/hrm/ot/OTModule.jsx)
```

All real logic, state, and markup lives in the `components/hrm/<feature>/` module, not the page file. Routes: `/` (overview), `/employees`, `/work-tracking`, `/ot`, `/leave`, `/assets`, `/approvals`, `/payroll`, `/reports`, `/documents`, `/settings`. `/salary-slips*` only redirects to `/payroll` (the API and `lib/salary-slips` remain for the stored history).

**Auth and permissions.** Access is controlled by per-account permission keys stored in `users.permissions` (catalogue and helpers in `lib/auth/permissions.ts`), **not** by the legacy `users.role` column. The JWT session (`lib/auth/session.ts`) carries identity only; `lib/auth/dal.ts` re-reads permissions from the database on every request.
- Route Handlers: wrap the handler in `withApiAuth` and call `requireApiUser` / `requireApiPermission` / `requireApiAnyPermission`.
- Server Components: `requireUser` / `requirePermission` / `requireAnyPermission` (they redirect).
- Add a new permission by extending `PERMISSIONS` in `lib/auth/permissions.ts`; use `MANAGER_PERMISSIONS` for default admin grants.
- `proxy.ts` only handles login redirects and the first-login password change; it is not an authorization layer.

**`HrmShell` (`components/hrm/HrmShell.jsx`) is the app chrome** — sidebar/header/mobile nav, and it owns:
- `RoleContext` (`useHrmRole()`), which exposes the signed-in account's `permissions`, `employeeId`, `employeeCode` and `email`. Modules read it to show or hide actions; it is a UI convenience, the API re-checks every permission.
- Dark mode: toggled via a `.dark` class on `<html>`, persisted to `localStorage` under `peopleos-theme` (falls back to `prefers-color-scheme` on first load). Don't reintroduce a different dark-mode mechanism.
- `HrmDialog` (`components/hrm/HrmDialog.jsx`) for app-level and feature dialogs — reuse it instead of ad hoc modals.

**Two-tier component structure:**
- `components/ui/` — shadcn/ui-style primitives (button, dialog, select, table, etc.), `new-york` style, no TSX (`.jsx` despite the shadcn TS convention — see `components.json`). These are shared building blocks; extend them here rather than duplicating variants in feature modules.
- `components/hrm/<feature>/` — feature modules composed from `components/ui/` primitives plus `@remixicon/react` icons.

**Class merging:** `@/utils/cx` (`cx`) is a thin re-export of `@/lib/utils`'s `cn` (clsx + tailwind-merge). Both exist in the codebase; `cx` is what's actually imported throughout `components/ui/` and `components/hrm/`, so prefer `cx` for consistency with existing code even though `AGENTS.md` names `cn`.

**UI primitive conventions to follow when extending `components/ui/`:** variants defined with `cva`, plus alias maps for legacy naming (e.g. `Button` accepts `variant="primary"|"danger"` and `size="small"` as aliases for shadcn's `default`/`destructive`/`sm`) — check for existing alias maps before adding a new variant name.

**Path alias:** `@/*` maps to the repo root (see `tsconfig.json`), e.g. `@/components/ui/button`, `@/lib/utils`, `@/styles/globals.css`.

**Styling:** Tailwind v4 via `@import "tailwindcss"` in `styles/globals.css`, which also imports `styles/theme.css` (design tokens) and `styles/hrm.css` (app-specific styles). No `tailwind.config.*` — v4 is CSS-config-driven. Semantic tokens and mobile-first/accessibility conventions are documented in `AGENTS.md`; follow those.

**Content is Thai (`lang="th"`)** — labels, nav items, and seed data are in Thai; match this when adding UI copy.

## Database and migrations

- Change `lib/db/schema.ts`, then `npm run db:generate` for a schema diff. Hand-written SQL migrations are fine for data changes — add the SQL file, a `_journal.json` entry (strictly increasing `when`), and keep the latest `drizzle/meta/*_snapshot.json` matching `schema.ts` (`npm run db:generate` must report "No schema changes").
- Always run `npm run db:check` and apply the migrations to a scratch database before committing.
- OT day type (weekday/holiday) is **derived** from the date worked and `employees.weekly_holidays` (`lib/ot/overtime-type.ts`); there is no `overtime_type` column.

## Scripts

- `scripts/db/` — migrate, seed, volume seed, and the one-off Drive document migration (wired to `npm run db:*`).
- `scripts/verify/` — report / PDF / salary-slip verification runs (`npx tsx --env-file-if-exists=.env scripts/verify/<name>.ts`).
- `scripts/migration/` — AppSheet → HRM import (Python, see its README) and archived one-off SQL imports.

## Testing

Vitest (`npm test`). DB-backed tests need `TEST_DATABASE_URL` (and `JWT_SECRET`) pointing at a migrated, throwaway PostgreSQL database — `docker-compose.yml` provisions `hrm_test`. Test files run serially because they share and truncate that database. Tests describe accounts as `employee` / `supervisor` / `ceo` for readability; `tests/setup/permissions.ts` maps those to real permission grants.
