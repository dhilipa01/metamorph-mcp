# DESIGN: UI/UX Design Brief for Metamorph MCP widgets

Version 1.0 draft, 2026-10-30. Scope: the widgets rendered inside MCP clients (Studio, Cursor, a terminal MCP client) and the README/demo look. Items marked **[OWNER]** are proposals for you to confirm or change. Generated projects get their own defaults (see `TRD.md`).

## Aesthetic direction [OWNER]
Calm, precise developer tool: dense but readable, no decoration that does not carry information. Feels like a security and engineering dashboard (reference apps: Linear, Vercel, Raycast, as in the template's own examples). Findings and numbers are the hero; colour is used for severity and state, not for decoration.

## Dark mode and light mode: both, 100% [owner requirement]
- Every widget ships both themes and respects the host: read `theme` from `useWidgetSDK()` and fall back to `prefersDarkColorScheme()` [verified in the widget skill].
- Colours are defined once as tokens on `:root` and redefined for dark mode; no hard-coded hex inside components.
- Test: Playwright screenshots in both themes for every widget (see `TEST_PLAN.md`).

## Colour tokens (proposal, check contrast before locking) [OWNER]
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #FFFFFF | #0D0F12 | page background |
| `--surface` | #F5F6F8 | #151922 | cards, panels |
| `--border` | #E1E4EA | #262C38 | dividers |
| `--text` | #12151B | #ECEFF4 | primary text |
| `--text-muted` | #566070 | #9AA4B5 | secondary text |
| `--primary` | #4F46E5 | #8B83FF | primary action, links |
| `--ok` | #15803D | #4ADE80 | pass, safe |
| `--warn` | #B45309 | #FBBF24 | caution |
| `--danger` | #B91C1C | #F87171 | critical finding |
Severity is never colour-only: always an icon and a text label as well.

## Typography [OWNER]
Inter for UI text, JetBrains Mono for code, versions and package names. Scale: 12 (meta), 14 (body), 16 (emphasis), 20 and 28 (headings), 40 (score). Tabular numbers for scores and counts so before/after columns align.

## Component style
shadcn/ui components on Radix and Tailwind for the widget app [design, matches our own default for React targets]. Rounded corners 8px, subtle borders instead of heavy shadows, 4px spacing grid. Cards for findings, tables for matrices, a stepper for plans, a side-by-side diff for previews.

## Key UI patterns per view
| View | Pattern | Data it shows (see `SCHEMA.md`) |
|---|---|---|
| Score dashboard | Score ring, category bars, top findings list, anti-pattern and OWASP grid | Assessment.score, Findings |
| Plan stepper | Vertical steps with status chips (pending, previewed, approved, applied, verified, failed), risk badge, rollback note | Plan.stages |
| Diff and preview | Two-column diff, file tree, "tests to run" list, Approve button that requests the token | Stage.preview |
| Compatibility matrix | Table of subjects (for example shadcn/ui, Mantine, Ink) with conflict / compatible / isolate cells, source link and verified date per rule | CompatRule |
| Before/after report | Paired metrics with delta and a one-line "why it matters" | Report |
| Audit view | Recent calls table with key label, tool, outcome | AuditEvent |

## Widget behaviour in the host
Support inline and fullscreen (`requestFullscreen`, `requestInline`); respect `maxHeight` and safe areas (`getSafeArea`); buttons call tools with `callTool` or ask the agent with `sendFollowUpMessage`; keep state in `useWidgetState`; open external links with `openExternal` [verified in the widget skill].

## Mobile and touch
Fully responsive; use `isPrimarilyTouchDevice()` to enlarge targets to at least 44px; single-column layout under 640px.

## Accessibility (WCAG 2.2 AA target)
Contrast 4.5:1 for text and 3:1 for UI components in both themes; visible focus rings; full keyboard operation of stepper, matrix and diff; semantic headings and table markup; ARIA labels for the score ring; status never colour-only; respect `prefersReducedMotion()` (no animation when set). Automated check with axe through Playwright plus a manual keyboard pass.

## Performance and PWA basics (for widgets and generated apps)
Aim for good Core Web Vitals (LCP, CLS, TBT) in the widget app; lazy-load heavy views; compress assets. Generated React projects ship PWA basics (manifest, service worker, offline shell) as part of modern defaults [Tier 2].

## Empty, loading and error states
Skeleton loaders instead of spinners for lists; empty states that say what to do next ("Give me a repo URL or upload"); error cards that name the next tool, matching `APP_FLOW.md`.

## Content and tone
Plain words mixed with technical terms. Bullets, not paragraphs. Every number gets a short reason ("Fewer tool definition tokens means more room for your task").

## Demo and README look
Dark and light screenshots side by side; one dashboard hero image; before/after numbers table; the 3-minute video follows the template: problem, solution, working demo.

## Open design questions [OWNER]
Brand colour and logo; whether to ship a custom icon for the NitroStack Studio tile; keep reference apps Linear and Vercel or pick others.
