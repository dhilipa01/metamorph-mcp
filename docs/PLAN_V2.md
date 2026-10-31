# Plan V2: real execution, live connectors, fewer clicks

Status labels used everywhere: **BUILT** (works, tested), **BUILD** (in this plan), **DESIGN** (specified, not built, said so in the README), **VERIFY** (vendor fact to confirm against official docs before coding).

## 0. Principles
- No simulated result is presented as real. If a step is simulated it is labelled `projected`, and the real step replaces it as soon as it exists.
- Scores come from recognised tools and standards, not our own weights. Our weights stay only as an aggregation layer and say so.
- One call should do the job. The user types one sentence; approval is one click.
- Credentials never live in the MCP. Short-lived, read-only, per-request or host-secret, never logged, never returned.
- Untrusted repo code never runs on the MCP host.

## 1. Execution tiers (decision made)
| Tier | Where | What runs | Status |
|---|---|---|---|
| T1 Host-safe | NitroCloud host, temp dir | pinned, checksum-verified PHP CLI (static build), composer.phar, `composer update/audit --no-scripts --no-plugins`, Rector, PHPStan, `npm install --ignore-scripts`, `npm audit`, tsc, Trivy/Grype fs scan | BUILD after spike S1 |
| T2 Isolated runner | **GitHub Actions** (ephemeral VM, no secrets in job, `permissions: contents: read`) | project tests (PHPUnit, jest), build, app boot, DAST smoke | BUILD |
| T2b Same script | Docker image `metamorph-runner` for local / self-hosted | identical entry script | BUILD (same code) |

Why GitHub Actions for the isolated tier: ephemeral, free for public repos, no infrastructure for us, results readable through the API, and the user already has GitHub. Docker is the offline alternative using the same script. The NitroCloud host has no Docker, so it cannot be the sandbox for untrusted tests.

Spike S1 (first, about 1h): deploy a hidden tool that downloads PHP static CLI (linux-aarch64) + composer.phar, verifies sha256, runs `php -v` and a `composer update --no-scripts` on php-shop. Pass = T1 is real. Fail = T1 moves into the T2 runner and the host keeps only Node-side checks.

## 2. Intelligence feeds (no secrets, build first)
Tools return data plus the source URL and fetch time. All outbound hosts are allowlisted.
- CISA KEV (exploited in the wild), FIRST EPSS (exploit probability), OSV + GHSA + NVD (CVSS), deps.dev (versions, licences, dependents), endoflife.date (replaces hard-coded EOL tables), OpenSSF Scorecard API, MITRE CWE list.
- `check_watch`: given a repo or package list, returns new advisories since a timestamp, ranked by KEV > EPSS > CVSS. A generated GitHub Actions workflow schedules it and opens an issue.
- Findings carry CWE, OWASP Top 10 category, CVSS vector, KEV flag, EPSS score. Priority = those, not our weights.

## 3. Source-control and ticketing connectors
- **GitHub** (BUILD, token via host secret or per-request): read Dependabot, code-scanning and secret-scanning alerts; dispatch the runner workflow; create branch + pull request with the approved patch; PR comment with report. Never pushes to the default branch; merging the PR into main is always a manual step by a human (stated in README and in the PR body). Scope required: `write` plus approval token.
- **Linear** and **Jira** (BUILD Linear first; Jira is DESIGN: full spec, same issue interface, built after Linear): create one issue per guided stage (title, steps, severity, links to the report), link to the PR; idempotent by `assessmentId + stage` so reruns update, not duplicate. VERIFY auth flows (Linear API key / OAuth, Jira Cloud OAuth 2.0 3LO or API token).
- Notifications: see section 12 (outbound webhook, Slack/Discord, email).

## 4. Cloud connectors (live, read-only first)
Pattern for every provider: `connect` check, `inventory`, `findings`, `map_to_stack` (what the legacy app runs on vs target). Read-only roles only. No keys stored.
- **AWS** (BUILD one slice): STS AssumeRole with ExternalId into a read-only role we document (SecurityAudit-style policy); read Security Hub / Inspector findings, Config rules, Trusted Advisor where available; Lambda/EC2/RDS runtime EOL inventory. VERIFY exact IAM actions and APIs.
- **Azure** (DESIGN now, second cloud to build right after AWS; the cloud lane is a core promise, so it is not dropped): service principal or workload identity federation; Defender for Cloud assessments and Azure Resource Graph inventory. VERIFY.
- **IBM Cloud** (DESIGN): Security and Compliance Center posture and findings via IAM API key exchange. VERIFY.
- Infra-as-code scan of the repo (Terraform, Dockerfile, K8s) with Checkov/Trivy config runs in T1 or T2: no cloud credentials needed, so it ships even if live cloud slips.
- Each connector declared in the README as BUILT or DESIGN. No half-claims.

## 5. Scanner connectors (beyond SonarCloud)
Two kinds. **Run** (we execute the tool): Trivy (fs, config, SBOM), Grype + Syft (SBOM), OSV-Scanner, Semgrep (SAST, autofix rules), Checkov (IaC), Gitleaks (secrets), Hadolint (Dockerfile), PHPStan/Psalm, ESLint, OpenSSF Scorecard. **Pull** (read the user's existing result): SonarCloud, GitHub code scanning (SARIF), Snyk, Dependabot. All results normalised into one Finding shape with tool, rule id, CWE, severity, location. SARIF is the common input and output.
Score = aggregation of normalised findings (documented, tunable, reproducible), with the raw tool counts shown beside it.

## 6. Real modernization stages
| Stage | Real implementation |
|---|---|
| patch-dependencies | real `composer update <pkg> --no-scripts` / `npm install --ignore-scripts`; the lockfile is the tool's, not ours |
| lock-dependencies | produce and commit real lockfile |
| upgrade-runtime | Rector PHP level sets; Node via `npm`/engines + Dockerfile + CI; verified by runner |
| remove-deprecated | Rector sets (PHP), jscodeshift/ESLint --fix (Node); diff reviewed in preview |
| fix-security-code | Semgrep rules with autofix where they exist; the rest guided with exact locations |
| remove-committed-env | **fix bug**: `git rm --cached`, generate `.env.example` (keys only), rotation checklist for every key found, history purge steps (`git filter-repo`). The local file is never deleted by our patch |
| add-packaging | Dockerfile + CI templates, validated by Hadolint and a runner build |
| modernize-structure | DESIGN (only what Rector sets cover is claimed) |

Verification after apply (T2): build, project tests, lint, static analysis, re-scan. Report shows tool before/after, not our projection. `projected` stays only as the instant preview.

## 7. Fewer clicks: the orchestrator
- `modernize` tool: input = repo URL (+ goal). It runs assess, plan, preview, then asks **one** approval (MCP elicitation if the client supports it, else widget button or token), then apply, verify (dispatch runner, poll with progress notifications), report, optional PR + Linear issue. One call, one approval.
- Existing fine-grained tools stay for control.
- MCP prompts: `/modernize`, `/cve-triage`, `/watch-repo` as slash commands.
- MCP resources: `metamorph://report/<id>.pdf`, `.sarif`, `.cdx.json`, `metamorph://standards/*`.
- Widget stepper with buttons: Assess, Plan, Review diff, Approve, Verify, Open PR, Re-assess. VERIFY that widget buttons can call tools; fallback shows the exact command.
- Progress notifications for long steps; tasks pattern if the SDK supports it (VERIFY).

## 8. Automated PDF report
Library choice: **pdfmake** (pure JS, tables with repeating header rows, page headers/footers with page x of y, controllable page breaks). pdfkit is the fallback for charts/vector work. pdf-lib has no table support, so no.

Formatting rules (anti-lag, anti-overlap), enforced in code and tests:
1. Fixed page: A4, 40pt margins, one base font size (10pt body, 8pt table), embedded fonts (Inter/Noto subset). Base-14 Helvetica is not embedded, which fails PDF/UA and PDF/A font rules.
2. Tables: `headerRows: 1` so headers repeat each page; rows must not split (`dontBreakRows`); fixed or star column widths, never `auto` for long text; `keepWithHeaderRows` so a heading never sits alone at the page bottom.
3. Long strings (paths, hashes, URLs): insert soft break points (zero-width space after `/ - _ .`) and cap length (200 chars) with an ellipsis and a full-text appendix reference.
4. Widows/orphans: headings keep-with-next; sections start on a new page only for the major parts; no manual absolute positioning anywhere. CSS `orphans`/`widows` do not apply to pdfmake/pdfkit (they are paged-media CSS), so pagination is controlled by the rules above.
5. Row and size caps: top N findings in the body (for example 25), the rest in an appendix table; hard cap total pages (for example 30) and total bytes. Embed as a resource only below about 1 MB, otherwise return a resource link: MCP payloads are JSON with base64 (about 33% overhead) and clients choke well below 10 MB.
6. Untrusted text (repo content, advisory text) is data: stripped of control characters, never interpreted as markup.
7. Accessibility: document title, language, tagged structure where the library supports it (VERIFY pdfmake/pdfkit tagged support), readable colour contrast, no colour-only meaning. PDF/UA needs tagging, language, alt text and embedded fonts.
8. Deterministic output: fixed creation date option; no network fetches during render (fonts bundled).

Tests: render with worst-case fixtures (0 findings, 200 findings, 500-char strings, Unicode/RTL, one giant table), convert pages to PNG (`pdftoppm`) and assert page count, no text outside margins (extract text boxes with `pdftotext -bbox` or pdfjs), no empty page, header on every table page; optional veraPDF validation for PDF/UA in CI (VERIFY).

Contents: cover (score, date, repo, commit), executive summary, tool-based before/after, findings by CWE/OWASP, KEV/EPSS-prioritised table, plan and stages, patch summary, verification results, SBOM summary, appendix (full findings, tool versions, sources + fetch times). Also export SARIF and CycloneDX SBOM.

## 9. MCP hygiene gaps to close
Resources and prompts present; tool annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`) set honestly; structured output schemas; every string `.max()`; connector-specific rate limits and timeouts; audit event per connector call (no secrets); OWASP MCP Top 10 self-score regenerated and published; tool count stays small by folding connectors under `connect/inventory/findings` style tools per provider type, not one tool per vendor.

## 10. Order of work (dependency order, not clock order)
1. S1 spike: PHP/composer on host. Decide T1.
2. Fix `.env` patch. Normalised Finding + standards fields (CWE/OWASP/CVSS) + feeds (KEV, EPSS, endoflife.date). No secrets needed.
3. Runner script + Dockerfile + GH Actions workflow; test locally in Docker on php-shop and a Node repo.
4. Real apply: composer update/audit, Rector, PHPStan in T1; wire results into scoring.
5. `generate_report`: PDF + SARIF + CycloneDX as resources, with the test harness from section 8.
6. GitHub connector (alerts, dispatch, PR). Linear issues.
7. `modernize` orchestrator + prompts + widget stepper.
8. AWS read-only slice. Scanner adapters (Trivy, Semgrep, Gitleaks, Checkov first).
9. DESIGN-labelled: Azure, IBM, Jira, Slack, structure modernization, Semgrep autofix breadth.

Critical path for the next 24h: items 1 to 5 plus the GitHub connector from item 6. Items 7 to 8 follow if time allows; items labelled DESIGN go into the README as roadmap with no claims.

## 11. Honest claims policy
README lists each capability as BUILT / DESIGN. Demo shows only BUILT. Any projected figure is labelled. Test inputs include at least two repos we did not write, with results reported even when poor.

## 12. Ecosystem research: what prevalent MCP servers connect to (2026-10-31)
Evidence types: **[local]** from our notes, **[web]** from searches today, **[checked]** I called the URL today, **[inference]** my conclusion.

### 12.1 What exists
- **[local]** Registry snapshot 2026-10-30: 3,333 servers list a repo; most are single-product connectors. Atlassian's official remote server is in the top 25 by stars (1,138). Competing modernization MCPs found by search: COBOL Bridge MCP, legacy2mcp, AWS Transform MCP, vFunction. Our anti-pattern list (one tool per endpoint, too many tools, unfiltered output, no sequencing, API-first design) applies directly to connectors.
- **[web]** Atlassian Rovo MCP (official, cloud-hosted, Jira/Confluence/JSM/Bitbucket/Compass, uses the user's existing permissions). GitHub MCP (official, Docker or hosted, PAT). Slack: community servers (post, reply, react), no single official one found. Discord: community servers, webhook-based senders exist. Email: Resend official hosted MCP, Gmail official preview (drafts/labels), SendGrid none. n8n: has an MCP Server Trigger node that exposes a workflow as an MCP server. RSS: several community RSS/Atom reader servers. Cloud: AWS has many focused servers under awslabs/mcp (S3, CloudWatch, CDK, cost, etc.), Azure MCP Server is official in microsoft/mcp (40+ services), IBM Cloud MCP servers are experimental, local, a layer over the IBM Cloud CLI. Scanners: Semgrep and Snyk expose MCP from their CLIs, SonarQube has a managed cloud MCP, Trivy has several community servers, a multi-scanner SAST MCP wraps Bandit, Semgrep, Trivy, CodeQL, Checkov, Gitleaks, OSV-Scanner, Grype, and Checkmarx, Black Duck, Mend, Cycode announced MCP at RSAC 2026.

### 12.2 What it means for us
- **[inference]** Almost every prevalent MCP is a thin connector to one SaaS. Users already have GitHub, Atlassian, Slack and cloud MCPs in their client. If Metamorph re-wraps each one, it duplicates tools the client already holds (overlap anti-pattern) and loses to them.
- **[inference]** Our value is the part none of them do: the modernization workflow across them, with idempotency, approval and verification. So Metamorph is an orchestrator with two modes per integration:
  1. **Artifact mode (default, no credentials in Metamorph):** return a ready payload (issue draft with fields, PR body + patch, notification text, SARIF) that the client's own GitHub/Atlassian/Slack MCP can submit. Fewest secrets, no overlap.
  2. **Direct mode (opt-in, for automation without a client, such as scheduled CVE watch):** Metamorph calls the provider API itself using a host secret or short-lived token. Only for GitHub, Linear/Jira, webhooks, email, and the cloud read-only slices.
- **[inference]** Scanners: prefer wrapping the CLI inside our runner (Trivy, Semgrep, Gitleaks, Checkov, OSV-Scanner, Grype) over calling their MCPs, because the runner gives normalised SARIF in one pass. Pull-mode for SonarQube/Snyk results users already have.

### 12.3 Notifications and "send a message" (fewer clicks)
- One tool `notify` (scope write) posting a signed JSON event to a user-configured destination. Destinations: Slack incoming webhook, Discord webhook, generic webhook (n8n / Zapier / Make), email via Resend or SMTP. Secrets (webhook URLs, API keys) live in host env, never in tool input or output; destinations are allowlisted by hostname.
- Org/workspace setup: webhooks first (no bot install). Slack/Discord app install with workspace or server id is DESIGN (OAuth install flow, per-channel routing).
- n8n: Metamorph posts events to an n8n webhook; n8n fans out to Slack, Discord, email, Jira. This covers many destinations without us building each. n8n can also call Metamorph as an MCP client. Payload fields: event, repo, score before/after, top findings (capped), link to report, `idempotencyKey`.
- Email: report PDF link plus summary through Resend (VERIFY free tier and attachment limits) or SMTP; attachment only under the size cap in section 8.

### 12.4 Intelligence feeds incl. RSS/Atom (checked today)
| Source | Result today | Use |
|---|---|---|
| CISA KEV JSON | 200, JSON | exploited-in-the-wild flag |
| FIRST EPSS API | 200, JSON | exploit probability |
| endoflife.date API | 200, JSON (php: cycle 8.5, eol 2029-12-31) | replaces hard-coded EOL tables |
| php.net releases feed | 200, Atom | PHP release/security watch |
| Node.js vulnerability feed | 200, RSS | Node security release watch |
| Node.js blog feed | 200, RSS | release notes |
| GitHub advisories Atom | 406 on direct request | use the GitHub REST advisories API instead (VERIFY) |
| CISA advisories RSS | 403 Access Denied to our request | not circumvented; use KEV JSON; check the official bulk/API options (VERIFY) |
Plan: a small feed reader (RSS 2.0 + Atom parser, timeouts, size cap, host allowlist, ETag/If-Modified-Since) feeding `check_watch`. Ecosystem feeds are added per stack (VERIFY Packagist and npm advisory feeds before listing).

### 12.5 Cloud connectors elevated
AWS and Azure are the headline of the cloud lane, so both follow the same read-only pattern (assume-role / federated credential, inventory, findings, runtime-EOL map) after the critical path, with AWS first. **[inference]** Reuse the official AWS and Azure MCP servers' API surface as reference for which services and permissions matter; Metamorph does not proxy them, it consumes provider APIs directly in read-only mode and returns normalised findings. IBM Cloud stays DESIGN because its MCP is experimental and CLI-bound (**[web]**).

### 12.6 Anti-pattern guardrails for connectors
Few tools (provider-agnostic verbs: `connect`, `inventory`, `findings`, `notify`, `create_ticket`, `open_pr`), capped outputs (3 to 5 fields per item), errors with next step, one orchestrator tool for sequencing, no raw passthrough of third-party text into the model without marking it as data (OWASP MCP prompt-injection risk from issue and advisory text).
