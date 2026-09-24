# HRM UI conventions

- Build on the shadcn/ui source components in `components/ui/`. Add a component there when the shared library lacks it, and keep its API accessible and composable.
- Merge conditional Tailwind classes with `cn()` from `@/lib/utils`.
- Use shadcn semantic color tokens (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `ring-ring`) from `styles/theme.css`; keep light and dark themes token-driven.
- Make layouts mobile-first. Let content shrink, wrap action groups, and contain horizontal table scrolling within its surface. Keep touch targets at least 40px where space allows.
- Preserve keyboard access and visible focus rings when replacing controls. Form fields need associated labels and clear validation feedback.
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
