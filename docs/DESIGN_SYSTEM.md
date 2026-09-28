# PeopleOS design system

This document is the source of truth for UI work across PeopleOS. Build new screens from the shared tokens and patterns here; do not invent route-specific visual conventions. The design should support quick, confident work in a Thai-language HR system.

## Product philosophy

- Keep the interface quiet, white-first, and content-led. Blue identifies actions and selection; neutral surfaces carry most of the screen.
- Optimize for daily scanning: put the employee, request, amount, date, and current status where they can be found quickly.
- Use a surface only when it groups related information. Prefer spacing, alignment, and dividers over nested cards.
- Keep common actions predictable, labels direct, and feedback close to the control that caused it.
- Preserve existing routes, permissions, API contracts, validation, and workflow behavior when changing presentation.

## Color tokens

Use semantic CSS variables from `styles/theme.css` and semantic Tailwind classes. Do not put palette literals in page components.

| Token | Light value | Use |
| --- | --- | --- |
| `--background` | `#ffffff` | Main application canvas |
| `--card` / `--popover` | `#ffffff` | Grouped content and overlays |
| `--foreground` | `#202a35` | Main text |
| `--muted` | `#f6f7f8` | Quiet neutral fill, hover, and table header |
| `--muted-foreground` | `#667085` | Secondary copy and metadata |
| `--border` | `#e4e7eb` | Dividers and surface boundaries |
| `--input` | `#cfd5dc` | Form-control boundaries |
| `--primary` | `#2f80ed` | Primary action, link, focus, selected navigation |
| `--status-success` | `#26734d` | Approved and completed |
| `--status-warning` | `#9a5b08` | Pending and needs attention |
| `--status-danger` | `#b42318` | Rejected, destructive, or failed |
| `--status-neutral` | `#667085` | Inactive, cancelled, or informational metadata |

Dark mode uses the same semantic roles and stays supported. Keep large surfaces neutral in both modes. Use low-opacity status fills with the matching status token; never communicate status by color alone.

## Typography

The shared font stack is `Noto Sans Thai`, `Leelawadee UI`, `Segoe UI`, `Tahoma`, then system sans-serif. Do not add a remote font dependency for ordinary UI.

| Role | Size / line height | Weight |
| --- | --- | --- |
| Page title | 22–24px / 1.3 | 600 |
| Section title | 16px / 24px | 600 |
| Body and controls | 14px / 20–22px | 400–500 |
| Table content | 13–14px / 20px | 400–500 |
| Labels and metadata | 12px / 18px | 400–500 |
| Helper text | 12px / 18px | 400 |

Use sentence case, readable Thai line lengths, and medium weights for hierarchy. Use `font-variant-numeric: tabular-nums` for aligned totals, counts, and time values.

## Spacing and shape

- Use a 4px spacing base. Common steps are 4, 8, 12, 16, 20, 24, and 32px.
- Keep page sections 20–24px apart; related controls 8–12px apart; labels close to their fields.
- Radius tokens are restrained: `sm` 3px, `md` 4px, `lg` 6px, `xl` 8px, `2xl` 10px, `3xl` 12px.
- Use 4–6px for controls, 6–8px for grouped surfaces, and larger radii only for dialogs or specific illustrations. Do not round every item or use pill badges by default.
- Ordinary cards and tables are flat. Shadows are reserved for overlays that need separation from the page.

## Layout and navigation

- Desktop uses a persistent left navigation rail, a compact top bar, and a main content region with a consistent maximum width.
- Keep the sidebar compact, grouped by workflow, with icon and label. Mark the current route with a thin blue edge and a faint neutral/blue fill, not a large solid block. Keep the account area at the bottom. A collapsed mode may reduce the rail to icon width while preserving accessible labels.
- The top bar is about 56px high and reserved for navigation controls and global actions. Do not repeat the page title there.
- Main content stays white-first with about 24px desktop padding and 16px on mobile. Avoid full-width blue backdrops and unnecessary containers.
- At mobile sizes, expose navigation through a clear menu control, wrap actions, preserve 40px touch targets, and prevent page-level horizontal overflow.
- Set sensible content widths for forms and text. Let data tables scroll inside their own surface when a table cannot fit.

## Page composition

Use this order when it fits the workflow:

1. `PageHeader`: one page title, a short contextual description, and the primary action aligned at the end.
2. Compact summary values only when they help the user decide what to do next.
3. Search, filters, view controls, and result count in one toolbar.
4. The main work surface: table or compact list for structured records; calendar only for date-oriented work.
5. Related history, guidance, or secondary detail after the main task.

Use `components/hrm/PageHeader.jsx` for page headings. Do not add a second title in the top bar. Section headings should be brief and may include one secondary action.

## Cards and surfaces

- Use a card when a group has its own task, form, summary, or independently meaningful content.
- Avoid wrapping a page section in a card and then wrapping each item inside another card.
- Prefer one flat white surface with a subtle boundary, or an unboxed section separated by a divider.
- Use compact metric strips rather than four oversized statistic cards. Keep decorative icon tiles small and neutral.
- Keep callouts inline and narrow. Reserve tinted backgrounds for status feedback, not ordinary content.

## Tables and lists

- Prefer a table for employees, approvals, OT, leave history, payroll, and other records with repeated fields.
- Use 40px table headers and approximately 44–48px body rows. Keep columns aligned and sort/filter controls adjacent to the dataset.
- Put primary identity first, dates and amounts in consistent columns, status in one predictable column, and row actions at the end.
- Truncate only where the full value remains available through a suitable accessible label or detail view. Allow long Thai names to wrap or shrink instead of breaking the layout.
- Put horizontal scrolling on the table wrapper, not the page. On narrow screens, use a compact record summary when the table is not usable.
- Empty states explain what is absent and, when available, offer one relevant next action. Loading states preserve the expected layout; errors state the recovery action.

## Forms and controls

- Use shared controls from `components/ui/` and semantic tokens. Associate every field with a visible label; use helper text for format and constraints.
- Keep controls at least 40px high where space allows. Align related fields in responsive grids and group long forms with short section labels.
- Show validation next to the field or form area that needs correction. Preserve entered values when displaying an error.
- Tabs are compact, use a neutral inactive state, and show the active state through text, underline, or a restrained blue treatment.
- Dropdowns, sheets, and dialogs must be keyboard reachable, have a clear title, and keep destructive decisions explicit. Use a sheet or inline expansion when a small detail does not need a modal.

## Buttons and actions

- Primary: blue fill for the one main action in a region.
- Secondary: neutral fill or outline for an alternative action.
- Tertiary: text/ghost for low-emphasis actions.
- Destructive: red for irreversible or state-changing destructive actions; include clear wording.
- Keep button labels action-oriented. Give every interactive element hover, pressed, focus-visible, disabled, and loading feedback where relevant.
- Do not make every available action a filled button. Keep row actions compact and predictable.

## Badges and statuses

Use the shared `Badge`/`StatusBadge` mapping instead of page-specific status colors:

| Meaning | Token |
| --- | --- |
| Pending / needs review | `status-warning` |
| Approved / complete / active | `status-success` |
| Rejected / failed / destructive | `status-danger` |
| Cancelled / inactive / neutral | `status-neutral` |
| Informational | `status-info` |

Keep labels short and badges compact, rectangular, and low contrast. Pair each status color with text or an icon.

## Feedback and accessibility

- Announce asynchronous feedback with `role="status"` or `role="alert"` as appropriate. Place errors next to their recovery action.
- Keep visible focus rings; never remove keyboard focus without replacing it. Maintain semantic landmarks, heading order, button names, and table headers.
- Respect reduced-motion preferences. Motion is brief feedback, not decoration.
- Maintain readable contrast and do not rely on color alone. Inputs need labels and errors need programmatic associations.
- Provide a skip link and ensure menus, tabs, dialogs, and table actions work with keyboard and touch.

## Common anti-patterns

- Large blue or tinted panels behind ordinary content.
- A stack of oversized KPI cards with repeated icons and labels.
- Borders, shadows, and rounded corners on every nested element.
- Pill tabs and pill badges used as the default shape.
- Duplicate page titles in the top bar and page body.
- Showing the same status in multiple disconnected places.
- Placeholder actions, dead links, or invented data presented as live operational data.
- Fixed-width controls that overflow Thai text or small screens.
- Route-specific colors, spacing, radius, or status meanings that differ from this system.
