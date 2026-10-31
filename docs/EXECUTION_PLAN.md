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
