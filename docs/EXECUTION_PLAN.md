# Execution plan (supersedes the order of work in PLAN_V2 section 10)

Date written: 2026-10-31. Code freeze: 2026-11-01 12:00 IST. Rule: a capability is BUILT only after a real run; fixture-tested only is labelled "fixture-tested".

## A. Goal and acceptance demo
One sentence from the user ("modernize <repo>") produces: assessment from real tools, a plan, one approval, a verified patch (real composer/npm/tests in an isolated runner), a PDF + SARIF + SBOM report, a pull request on a branch (merge stays manual), tickets and a notification. Acceptance run: php-shop (ours) and two public repos we did not write, with results reported even when poor.

## B. Current state (verified)
Live tools: analyze_advisory, assess_project, plan_modernization, preview_changes, apply_stage, check_watch. 426 tests, tsc and build clean, main 254a60e. Score dashboard widget (assess, plan, apply) works in Studio. Intelligence feeds (CISA KEV, EPSS, endoflife.date, php.net and Node RSS/Atom) merged but not yet called live. `.env` stage fixed (no deletion; keys-only .env.example; git rm --cached, rotation, history purge steps). apply_stage is a projection until the runner exists.

## C. Decisions (made)
1. Isolation: GitHub Actions runner plus the same script in Docker. No untrusted code on the MCP host.
2. PHP on the host: NOT built now (the safety check blocked the download-and-run spike). All real PHP/composer steps run in the runner. Revisit only if the owner explicitly approves host binaries.
3. Integrations have two modes: artifact (return a ready payload for the client's own MCPs) and direct (Metamorph calls the provider, opt-in, secrets in host env).
4. Tool budget stays at 13: existing 6 + verify_patch, generate_report, open_pr, create_tickets, notify, cloud_inventory, modernize.
5. IBM Cloud is out. Everything else is built.

## D. Shared contracts (written first, so parallel work does not collide)
- Finding (exists): id, severity, title, evidence, recommendation + cwe, owasp, cvss, kev, epss, source.
- RunnerResult v1 (WS1): checks[], findings[], tests, buildOk; zod-validated.
- ReportData (WS2): every number labelled measured / projected / reported.
- Connector verbs (WS4 to WS6): connect_check, create_issue(s) (idempotent by assessmentId+stage), open_pr, notify(event). Output capped at 3 to 5 fields per item; third-party text is marked as data.

## E. Workstreams
| WS | What | Tools / files | Needs | Done when |
|---|---|---|---|---|
| WS1 | Runner: Docker image, metamorph-run.mjs, GH workflow, RunnerResult schema | runner/, src/modules/verify/result.ts, .github/workflows/metamorph-runner.yml | nothing | real result.json before/after for php-shop produced in Docker locally; workflow run once on GitHub |
| WS2 | Report: PDF (pdfmake), SARIF, CycloneDX | src/modules/report/, tool generate_report | nothing | worst-case render tests pass; sample PDF looked at; SARIF/SBOM validate |
| WS3 | verify_patch: dispatch runner, poll with progress, read artifact; real apply replaces projection | src/modules/verify/ | WS1, GitHub token | apply_stage result shows measured before/after from the runner |
| WS4 | GitHub: alerts (Dependabot, code scanning, secret scanning), open_pr (branch + PR, never touches default branch; merge is manual and the PR body says so) | src/modules/github/ | GitHub token | PR opened on the demo repo |
| WS5 | Tickets: Linear, Jira (one interface, idempotent) | src/modules/tickets/ | Linear key; Jira site + token | one issue per guided stage on each, rerun updates not duplicates |
| WS6 | notify: signed webhook to Slack, Discord, n8n; email via Resend/SMTP | src/modules/notify/ | webhook URLs; Resend key | one message in each destination |
| WS7 | Cloud: AWS then Azure read-only inventory, findings, runtime-EOL map | src/modules/cloud/ | AWS read-only role; Azure read-only service principal | real inventory from each account |
| WS8 | Scanner adapters: runner outputs normalised; pull-mode for SonarQube/Snyk if keys given | in WS1 + src/modules/scanners/ | optional keys | findings from Trivy, Semgrep, Gitleaks, Checkov appear in report |
| WS9 | modernize orchestrator, MCP prompts and resources, widget stepper | src/modules/orchestrator/, widgets | WS1 to WS6 | one call runs the whole acceptance demo with one approval |
| WS10 | Quality: independent repos run, Playwright widget screenshots (both themes), security tests, OWASP MCP self-score, README and DEMO rewrite with BUILT items only | tests/, README, DEMO.md | all | claims policy checked line by line |

## F. Order and checkpoints (H = hours from now; freeze at about H+25)
- H0 to H4: WS1 and WS2 in parallel (running). Owner supplies credentials (section G). I merge, run live check_watch.
- H4 to H9: WS3 (needs WS1). WS4 and WS6 in parallel (need tokens). Live run of the verified apply on php-shop.
- H9 to H15: WS5 (Linear, then Jira), WS7 (AWS, then Azure), WS8.
- H15 to H20: WS9 orchestrator + prompts/resources + stepper.
- H20 to H24: WS10 acceptance runs on two outside repos, screenshots, README/DEMO rewrite, rehearsal, fixes.
- H24 to H25: freeze, deploy check, record video (earlier rehearsal the night before).
Each checkpoint ends with merge, tsc, tests, build, push, live check on the deployed server.

## G. Whose credentials (tenancy model)
Metamorph never uses its operator's accounts on behalf of users and never takes a user's secret through a tool argument (it would pass through the model and the logs).
- **Per-organisation deployment (built now):** each organisation deploys its own instance and sets provider secrets in that instance's environment. Secrets are read only inside the connector, never returned, never logged. This is how the submission instance works, with our own test accounts.
- **Artifact mode (default everywhere):** Metamorph returns the ticket, PR body or message payload; the client's own GitHub, Atlassian or Slack MCP submits it under the user's own login. Metamorph holds no credential at all.
- **Cloud:** the customer creates a read-only role in their own account and trusts Metamorph's identity with an ExternalId (AWS cross-account AssumeRole; Azure federated credential or consented app). No customer key is stored.
- **GitHub:** a GitHub App that the customer installs on chosen repos; Metamorph holds only the app private key and mints short-lived installation tokens. A fine-grained token is the single-organisation fallback.
- **Multi-tenant OAuth vault (WS11, BUILD):** user connects Linear, Jira, Slack, GitHub once; tokens are stored encrypted per tenant. Details in section J.
For the submission instance we provide our own test-account credentials: GitHub token or App on metamorph-demo-legacy, Linear key, Jira site token, Slack/Discord webhooks, Resend key, n8n webhook, AWS read-only role, Azure read-only service principal. Judges get a read-scope Metamorph key only.

## H. Risks and cut line
Risks: runner image size or tool install failures; workflow_dispatch input limit for large patches; Semgrep rules need network; AWS/Azure account setup time; MCP clients may not support elicitation or tool-called widget buttons; deploy limits (123s timeouts) for long runner polls (mitigation: progress notifications, resumable verify by run id).
Cut order if time runs out: Azure, Jira, widget stepper, SonarQube/Snyk pull-mode. Never cut: WS1, WS2, WS3, WS4. A cut item goes into the README under "not built" with no claims.

## I. Verification gates before any claim
tsc, tests, build green; live call on the deployed server for every new tool; at least two repos we did not write; widget checked in Studio both themes; PDF opened and looked at; no secret in output or logs (grep of results); OWASP MCP Top 10 and anti-pattern self-score regenerated.

## J. WS11 multi-tenant vault (BUILD)
- Standard: MCP 2025-11-25 URL-mode elicitation. A server must not ask for passwords, API keys or tokens through form mode; it sends the user to an out-of-band URL, so credentials never pass through the model, the client or its logs. This is the pattern for a server acting as an OAuth client to third parties (checked 2026-10-31 against the spec pages). VERIFY the installed SDK exposes URL-mode elicitation; if not, the tool returns the connect URL as plain output (same security property, less polish).
- Flow: tool `connect_start(provider)` returns a connect URL carrying a signed, short-lived `state` bound to the caller's Metamorph key id. The user opens it, logs in at the provider (Linear, Atlassian 3LO, Slack, GitHub App install), the provider redirects to `/connect/callback/<provider>` on our server, which exchanges the code (PKCE) and stores the token. Tools afterwards say only `connected: true/false`.
- Storage: tokens encrypted with AES-256-GCM, a per-record data key wrapped by a master key from env (`METAMORPH_VAULT_KEY`), stored in an external Postgres (`DATABASE_URL`; the NitroStack docs list no managed database or token store, and the host filesystem is not durable). Refresh handled server side; revoke tool `disconnect(provider)`; audit event per use without secrets; tenant id = Metamorph key id (or OAuth subject), every query scoped by tenant id.
- Webhook and Resend/SMTP settings per tenant stored the same way. AWS/Azure: the vault generates a per-tenant ExternalId; no customer secret stored.
- Done when: two different keys connect two different accounts and each can only see and use its own; revoking one does not affect the other; a database dump contains no plaintext token; a callback with a forged or expired state is rejected.
- Owner supplies: a Postgres connection string (free Neon or Supabase project), OAuth client id and secret for each provider app registered under the operator's account (one app per provider, used by all tenants), `METAMORPH_VAULT_KEY` (32 random bytes).

## K. WS12 quality harness (replaces "test accounts will do")
Four layers from industry practice (unit, protocol, conformance, evals), plus load and real-world measurement:
1. Unit: vitest (exists, 426+).
2. Protocol and conformance: MCP Inspector CLI pinned (initialize, tools/list schema checks, valid/invalid calls, 401/403, annotations), run in CI against the built server.
3. Ground truth: seeded vulnerable fixtures with known answers (planted CVE-affected versions, planted code smells, planted secrets). Metrics: detection recall and false-positive count per rule, patch success rate (build and tests pass after apply in the runner), score change measured by tools.
4. Real-world corpus: 20 pinned public repos (old PHP and Node projects we did not write), fixed commits, results table with timing and our findings cross-checked against `composer audit`, `npm audit`, OSV-Scanner. Published in the README including the bad results.
5. Model-facing evals: scripted tasks checking that a model picks the right tool, in the right order, with sensible args (evalview or a small harness), including injection text in advisories and repo files.
6. Load and resilience: JMeter against /mcp (concurrency, 123s timeout behaviour, memory under the 500 MiB limit with big repos); connector contract tests against a mock provider (429, 5xx, timeouts, partial pages, malformed JSON) run in CI; one real smoke run per provider, then dogfood on this project's own repo and the owner's real accounts.
7. Security: path traversal, symlink escape, archive bombs, secret redaction, scope bypass, forged tokens/state, SSRF through repo_url and webhook URLs, MCP-specific scanners (Snyk Agent Scan) on our own server.
Owner of the harness: me, built before WS9; its report goes into the README and the PDF.

## L. Will it help a real user? Readiness definition (2026-10-31)
Honest position: today it is an assessment and projection tool for public GitHub repos. It does not yet save a team work they could not already get free.

Who: a small team or a security/platform lead who owns legacy PHP or Node apps, mostly in private repos, and has to show progress on CVEs and end-of-life runtimes.
Job: "tell me what matters first, fix what is safe, prove it works, hand me something I can merge and show my manager."

Where free tools already win (do not compete): version-bump pull requests (Dependabot, Renovate), single-ecosystem audits (`npm audit`, `composer audit`), PHP language upgrades (Rector itself). Metamorph is only worth using where it combines them:
1. Triage across everything: dependencies, runtime end-of-life with dates, code smells, secrets, Docker/CI, ranked by exploited-in-the-wild (KEV) and exploit probability (EPSS), not by raw count.
2. A fix that was verified: patch applied in an isolated runner, project tests and build run, before/after measured by tools, not projected.
3. One call from the user's AI client, with one approval, ending in a branch pull request, tickets and a notification; merge stays manual.
4. A report the user can forward (PDF, SARIF, SBOM).
5. Ongoing watch of new advisories for the user's stack.

Gaps that decide whether it is usable (added to the critical path):
- **Private repositories.** Real legacy code is mostly private; we only read public repos. Fix: GitHub App install (customer picks repos), installation tokens, read-only for assess, write only for the PR branch. Becomes part of WS4 and is moved ahead of WS5 to WS8.
- **Upgrade path over rewrite.** Real users mostly need "PHP 7.4 to 8.4" or "Node 14 to 22" with fixes, not a language rewrite. Rector-driven PHP upgrade and Node engine/dependency upgrade, verified by the runner, are the core. PHP to Node conversion is out of scope and said so in the README.
- **Onboarding in under 5 minutes.** README quickstart for connecting a client, first call, expected output; error messages that say the next step.
- **Failure behaviour.** Large repos, monorepos, missing lockfiles, no tests (say "unverified" instead of green), flaky tests (rerun once and report), runner timeouts (resumable by run id).
- **Trust.** SECURITY.md, privacy statement (what is fetched, what is stored, what is never stored), audit events, licence file, pinned dependency audit clean, no secrets in logs.
- **Cost and abuse limits.** Per-key rate limits, repo size limits, SSRF guard on every URL input, runner quotas.

"Ready" means all of: (a) the acceptance demo passes on 3 repos we did not write, 1 of them private through the GitHub App; (b) on those 3 repos the verified-fix PR builds and tests pass, or the tool says exactly why not; (c) the quality harness (section K) report is published; (d) a person who did not build it completes the quickstart unaided in 5 minutes (the owner can ask one friend to try it; record where they got stuck); (e) README claims match measured results.
Validation after the freeze, not claimed before: measure time-to-merged-PR against doing it by hand on the same three repos.

## M. Priority order set by the owner (2026-10-31 16:10 IST)
1. Finish merging the two running agents (assessment accuracy; runner image + PHP version) and deploy.
2. Then dispatch subagents until WS1, WS2, WS8 and WS12 are DONE (finishing the core). Definition of done per workstream:
   - WS1 runner: prebuilt image pulled from GHCR; PHP version chosen from the project; `verify_patch` run live once end to end with the owner's token (baseline + patched); flaky tests rerun once and reported as flaky; Node project verified (npm ci/audit/test count parsing exercised on a real repo); phpunit/phpstan exercised with a real project config; runner timeouts resumable by run id.
   - WS2 report: widget confirmed in Studio (or the unrecognised card shows what Studio sends); SARIF dependency findings carry a location (manifest path) so code-scanning accepts them; SBOM and SARIF validated against the official schemas (fetch blocked before; retry or vendor the schemas with a source note); runner result shown in the report; downloads tied to the requesting key before private repos exist; known limits (fonts for non-Latin text, per-instance cache) stated in the report appendix.
   - WS8 scanners: runner findings normalised into the shared Finding shape (tool, rule id, CWE/OWASP where defensible), deduplicated across tools, included in score/rank/report as measured; Semgrep offline fallback proven; SonarQube and Snyk pull-mode only if keys exist (otherwise not built, listed as such).
   - WS12 quality: remaining layers: model-facing evals (tool selection, order, argument sanity, injection text in advisories and repo files), load and resilience (concurrency on /mcp, memory under 500 MiB, timeout behaviour, big repos), security tests (path traversal, symlink, archive bombs, redaction, scope bypass, forged tokens, SSRF through repo_url), conformance gaps (tool annotations, schema errors naming a next step, report output size), CI green on GitHub.
3. After that, ON THE OWNER'S SAY-SO: WS4 (GitHub connector: branch PR, alerts, GitHub App for private repos), WS5 (Linear, Jira), WS7 (AWS, Azure).
4. Remaining workstreams (WS6 notify, WS9 modernize orchestrator, WS10 README/DEMO, WS11 vault) only if time remains.
Freeze: 2026-11-01 12:00 IST.

## N. Pre-mortem, TRIZ and OODA deltas to the "done" definitions (2026-10-31 16:20 IST)
Failure frame: it is 2026-11-01 12:00, the freeze has passed and the core was not done or the demo broke.
Top risks and the gates they add:
1. The GitHub runner path was only fixture-tested; the first real use of `verify_patch` happens late and the API shapes differ (dispatch run id, artifact redirect hosts, polling budget). Gate: run `verify_patch` live on a repo the same hour the prebuilt image lands, before any other WS1 item is called done; keep the fake-GitHub tests but label them fixture-tested until then. Owner: me with owner's key and token.
2. Legacy PHP projects cannot build, so every demo verification says `verified: false`. Gate: PHP version selection (agent running) AND one demo target that can verify green (a repo with a real lockfile and a passing test suite, built by the owner or chosen from the corpus) so the demo shows a truthful verified result next to an honest unverified one. Without a green case the demo is not claimed.
3. Host limits (500 MiB, ~123 s) break on larger repos or slow OSV. Gate: load and resilience layer asserts memory and time thresholds on the biggest corpus repos; assessment keeps the 60 s budget and says 'checked X of Y'.
4. Studio widget behaviour is unknown. Gate: owner re-runs generate_report after deploy; the unrecognised card must name what arrived; if still empty the widget work stays open, not 'done'.
5. A merge passes 688 unit tests but breaks the deployed server (env, routes, widgets build). Gate: `scripts/smoke.sh` run by the owner after each deploy (tools/list count, check_watch, generate_report, fetch a download link, bogus-token refusal); results noted in HANDOFF.
6. Claims drift from evidence (scores shift after scanner normalisation, README says more than was measured). Gate: README capabilities table where every row cites a test id or a dated live check; WS10 is not skipped even if time is short.
7. Usage or time limits cut work mid-merge. Gate: HANDOFF updated after every merge; no merge left half-finished.
8. CI on GitHub red or slow (conformance about 3 min, docker-based veraPDF test). Gate: docker-dependent tests skip cleanly in CI and run locally; CI runtime reported; CI must be green on main before the freeze.
TRIZ resolutions: (a) real execution vs host safety and the 123 s limit: separate in SPACE (runner off host) and TIME (async run id, resumable); (b) rich reports vs small tool outputs: separate by SPACE (files behind signed links, summary in the result); (c) downloads bound to the requesting key vs links that must open in a browser without headers: separate by CONDITION: signed link whose claim carries the key id and a 10 minute expiry (reuse the HMAC token code); (d) 'everything verified live' vs 20 hours: separate by CONDITION: three evidence labels (live-verified, fixture-tested, not built), never mixed.
OODA order for the next rounds (reversible steps, re-observe after each merge: deploy, smoke, Studio): round 1 WS12 hygiene gaps (annotations, error messages, report size) and WS2 SARIF locations/schemas; round 2 WS1 live verify + green demo target + Node verification; round 3 WS8 normalisation; round 4 WS12 load/security/evals; then the owner decides WS4/5/7.

## O. Owner decisions 2026-10-31 19:40 IST
- AWS is mandatory (read-only slice, WS7). Azure and IBM are cut; Linear and Jira only if time remains after AWS and the UI work. GitHub PR connector (WS4) and `modernize` follow.
- UI/UX is a severe weakness and gets its own workstream WS13, scheduled right after AWS: widget look and behaviour (evaluate shadcn/ui with Tailwind, Mantine, or the plain-CSS design system we have), a distinct visual identity for Metamorph across widgets, report, README and demo; make the deployed app and Studio presentation look intentional.
- Feasibility facts checked today: widgets are Next.js 14 + React 18 static exports (src/widgets, package deps: next, react, @nitrostack/widgets, ext-apps; no Tailwind or component library installed). The SDK's server info type exposes only name and version (no icons, title or instructions fields found in @nitrostack/core types), so server-level branding is limited to the name, tool/widget metadata and widget content; Studio's own chrome cannot be restyled by us. Open questions for the WS13 agent: widget iframe CSP and sandbox limits for fonts/images/CSS, bundle size ceilings, whether shadcn/Mantine fit the static export, dark/light handling in Studio, and what NitroCloud lets us set per app (name/description/icon in the dashboard).
## P. WS8 scanners status (2026-10-31)
Built and tested: runner findings are normalised into the shared Finding shape (`src/modules/scanners/normalize.ts`), deduplicated across tools (`dedupe.ts`), scored and ranked with the existing formula as a measured score labelled "measured by runner tools" (`measured.ts`), shown in `verify_patch` (baseline vs patched, only when both runs completed), in the report section "Findings measured by the runner" and in SARIF. The Semgrep offline fallback was run for real with `--network none` (see docs/EVAL_RESULTS.md section 6). KEV and EPSS enrichment of runner findings is implemented as a pure function (`enrichMeasured`) but is not yet fed from the live feeds in `generate_report`, so runner findings rank by severity only until that is wired.

SonarQube and Snyk pull-mode: not built. The owner has no keys for either service, so nothing was written for them.
