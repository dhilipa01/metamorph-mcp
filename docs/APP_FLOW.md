# APP_FLOW: Metamorph MCP (navigation and user journey map)

Version 1.0 draft, 2026-10-30. Metamorph is an MCP server, so "pages" are (a) MCP interactions in a client such as Studio, Cursor or a terminal MCP client and (b) widget views rendered inside that client. Items marked **[OWNER]** need confirmation.

## Pages and views
| View | Where | Purpose |
|---|---|---|
| Connect | client config | Add the server URL and API key |
| Dashboard (score) | widget | Overall score, top findings, anti-pattern and OWASP results |
| Plan stepper | widget | Stages, risk per stage, approvals, rollback notes |
| Diff and preview | widget | What will change, files touched, tests to run |
| Compatibility matrix | widget | Conflicts such as UI-library combinations |
| Before/after report | widget | Final Metamorph report with numbers |
| Cloud targets | resource view / widget | AWS, Cloudflare, Kubernetes skeleton list [Tier 2] |
| Audit log | resource | Recent tool calls per key |

## Navigation type
Conversation-driven. The user (or agent) calls a tool; the result renders a widget; widget buttons call the next tool (`callTool`) or post a follow-up message (`sendFollowUpMessage`). Widgets support inline and fullscreen display modes.

## First screen for a brand-new user
Server connected, tools list visible (8 tools). Prompt suggestions: "Check this repo for CVE-xxxx", "Assess my project", "Plan a PHP to Node migration". An empty state widget explains: "No assessment yet. Give me a repo URL or upload."

## Authentication flow
The owner generates keys (`ApiKeyModule.generateKey`), sets them as host environment variables (hashed use), and hands each key out once. Three keys: owner (write, cumulative), judge (read plus plan), test (CI). Client sends `x-api-key` or `Authorization: Bearer`. Scopes are cumulative: write includes plan includes read. Invalid or missing key → 401 with a message that says how to get a key; too-low scope → 403 naming the needed scope. Judges receive their key through the submission form, not the repo; judge and test keys are revoked after judging by removing the variable and redeploying.

## Flow 1: CVE-driven upgrade (core demo)
1. User calls `analyze_advisory` with a CVE id (or pastes an advisory, diff or article text).
2. Server resolves via OSV.dev, extracts packages. If text came from an article, extracted names are flagged "needs confirmation".
3. If a project is known (`assessment_id`), server says affected yes / no / unsure, where, severity, fixed versions.
4. User calls `plan_modernization` (goal `patch_advisory`) → staged plan with risk and rollback.
5. User calls `preview_changes` for stage 1 → diff summary and tests to run.
6. User approves: `apply_stage` with a **write key** plus the `approval_token` from the preview. It runs as **one call**: fetch the repo as an archive (the host has no `git`), `npm install --ignore-scripts`, build, test, produce a bounded patch, return everything inline, delete the temp directory. Build and test run only for Metamorph's own fixture repos on the deployed server.
7. `verify_changes` → report widget with before/after (for example vulnerable packages before and after).
8. **Watch (optional):** `check_watch` returns advisories changed since the client's cursor; urgent ones (high or critical, KEV-listed, malicious package) are flagged. In a modernized project, a generated scheduled workflow does the same on a cron.

## Flow 2: Evolve (legacy to modern)
1. `assess_project` with repo URL or upload → stack, UI libraries, hosting hints, architecture style, findings, score.
2. `plan_modernization` with goal `migrate_stack` and `target_stack` (for example node-ts), optionally `target_cloud` (aws).
3. Compatibility matrix widget shows conflicts (for example UI libraries); user picks a resolution.
4. `preview_changes` → `apply_stage` (sandbox): scaffold modern app with defaults, sample translated handlers flagged "needs review", IaC skeletons [Tier 2].
5. `verify_changes` → report. `generate_mcp_design` optional: outcome-based MCP over the new app.

## Flow 3: Build (after Evolve) [Tier 2]
1. User supplies a PRD or idea; `plan_modernization` goal `build_from_spec`.
2. Same target adapters and defaults produce the scaffold in the sandbox; same scoring and report.

## Flow 4: Score an MCP design
`score_mcp_design` with a tools list or server path → per-anti-pattern and per-OWASP results plus token cost of definitions; dashboard widget.

## Approval flow
Write tools need an `approval_token` issued after the user views `preview_changes`. Token is short-lived and bound to plan, stage and key. If the client supports MCP elicitation (spike S7), the server may also ask for confirmation interactively; token remains the fallback.

## Empty states
No assessment yet; no advisory match ("not affected, here is why"); no conflicts found; no findings (show a positive score with what was checked).

## Error states and where the user goes next
| Error | Message guidance |
|---|---|
| 401 missing/invalid key | "Add an API key; see Connect" |
| 403 scope too low | "This needs write scope; request a write key" |
| Repo too large / upload too big | "Limit is X MB; try a subfolder or shallow clone" |
| Unsupported stack | "Supported: PHP, Node/JS. Plan-only report available" |
| Sandbox unavailable | "Apply is disabled on this server; use preview and apply the patch yourself" |
| Advisory not found | "Try the GHSA id or paste the advisory text" |
| Build or tests fail in sandbox | Show failing step, keep the sandbox for the time limit, suggest `verify_changes` after a fix |
| Rate limit exceeded | "Retry after N seconds" |
Every error names the next tool or action (anti-pattern rule).

## Modal, drawer and overlay interactions
Fullscreen toggle for dashboard and diff; confirmation dialog before requesting an approval token; side panel for finding details.

## Redirect logic
There are no URL redirects. After `apply_stage` the widget moves to Verify; after `verify_changes` it moves to the Report; the Report links back to the plan (follow-up message).
