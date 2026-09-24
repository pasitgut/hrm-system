# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PeopleOS — a Thai-language HRM (HR management) system: employee records, OT requests, leave, a central approvals queue, and reports. Built on Next.js (App Router) with React 19 and Tailwind v4.

**Before writing any code**, read the relevant guide under `node_modules/next/dist/docs/` — this project pins a Next.js version with breaking API/convention changes from older training data (see `AGENTS.md` for details on this requirement).

## Commands

```bash
npm run dev      # next dev
npm run build    # next build
npm run start    # next start
```

There is no lint or test script configured, and no `next.config.*` or ESLint config present in the repo.

## Architecture

**Data is currently all mocked in-component** — there is no database client, no API routes (`app/**/route.*` don't exist), and nothing reads from `init.sql`. `init.sql` is a Postgres schema (departments, positions, employees, skills, leave/overtime requests, request statuses, etc.) that describes the *intended* future backend shape but is not wired to anything yet. Each feature module keeps its own mock array (e.g. `employees` in `EmployeeModule.jsx`) — when persisting data for real, model new work after `init.sql`'s shape.

**Routing is a thin shell over feature modules.** Every route under `app/*/page.jsx` is a one-line wrapper that renders a component from `components/hrm/<feature>/`:

```
app/ot/page.jsx  →  <OTModule />  (components/hrm/ot/OTModule.jsx)
```

All real logic, state, and markup lives in the `components/hrm/<feature>/` module, not the page file. Routes: `/` (overview), `/employees`, `/ot`, `/leave`, `/approvals`, `/reports`.

**`HrmShell` (`components/hrm/HrmShell.jsx`) is the app chrome** — sidebar/header/mobile nav, and it owns:
- `RoleContext` (`useHrmRole()`), toggling between `"manager"` and `"employee"` views. Manager role adds an "รออนุมัติ" (approvals) nav item; modules read this context to conditionally show approval actions.
- Dark mode: toggled via a `.dark` class on `<html>`, persisted to `localStorage` under `peopleos-theme` (falls back to `prefers-color-scheme` on first load). Don't reintroduce a different dark-mode mechanism.
- `HrmDialog` / `HrmSettingsDialog` (`components/hrm/`) for the app-level notification and settings dialogs — reuse these instead of ad hoc modals for shell-level UI.

**Two-tier component structure:**
- `components/ui/` — shadcn/ui-style primitives (button, dialog, select, table, etc.), `new-york` style, no TSX (`.jsx` despite the shadcn TS convention — see `components.json`). These are shared building blocks; extend them here rather than duplicating variants in feature modules.
- `components/hrm/<feature>/` — feature modules composed from `components/ui/` primitives plus `@remixicon/react` icons.

**Class merging:** `@/utils/cx` (`cx`) is a thin re-export of `@/lib/utils`'s `cn` (clsx + tailwind-merge). Both exist in the codebase; `cx` is what's actually imported throughout `components/ui/` and `components/hrm/`, so prefer `cx` for consistency with existing code even though `AGENTS.md` names `cn`.

**UI primitive conventions to follow when extending `components/ui/`:** variants defined with `cva`, plus alias maps for legacy naming (e.g. `Button` accepts `variant="primary"|"danger"` and `size="small"` as aliases for shadcn's `default`/`destructive`/`sm`) — check for existing alias maps before adding a new variant name.

**Path alias:** `@/*` maps to the repo root (see `tsconfig.json`), e.g. `@/components/ui/button`, `@/lib/utils`, `@/styles/globals.css`.

**Styling:** Tailwind v4 via `@import "tailwindcss"` in `styles/globals.css`, which also imports `styles/theme.css` (design tokens) and `styles/hrm.css` (app-specific styles). No `tailwind.config.*` — v4 is CSS-config-driven. Semantic tokens and mobile-first/accessibility conventions are documented in `AGENTS.md`; follow those.

**Content is Thai (`lang="th"`)** — labels, nav items, and mock data are in Thai; match this when adding UI copy.
