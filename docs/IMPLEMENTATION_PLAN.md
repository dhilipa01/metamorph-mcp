# IMPLEMENTATION_PLAN: Metamorph MCP (step-by-step build sequence)

Version 1.1 (living document: when facts change, this file changes). Source plan: `~/.claude/plans/the-following-needs-to-replicated-patterson.md` (approved). Time boxes are estimates, not promises.

**Cutoff assumption [owner]:** the exact submission cutoff on Nov 1 is not published; assume it falls between **12:00 and 15:00** (IST, owner's local time). Plan: **code wrapped by 12:00 on Nov 1**. Update this block the moment the real cutoff is announced.
**Time reality:** at 22:14 IST on Oct 30 about 37.5 wall-clock hours remain until the 12:00 freeze; roughly 20 productive hours after two nights of sleep and breaks (estimate). The earlier 29-hour coding plan does not fit, so Tier 1 is cut to the hero path below and Tier 2 is one vertical slice.
**Hero path for the demo [owner]:** CVE in, plan, preview, sandbox build and test, Metamorph report. Final video is recorded in **NitroStack Studio**; daily work happens in a terminal MCP client (both must be tested; ChatGPT is out of scope).
**Tier 2 is committed [owner]** (cloud lane, Build mode) but only after gate G2, as one vertical slice plus data rows.

## Working rules
- AI-generated code is allowed. Every piece is read by the owner against these docs before it stays, and gets a test the same day [organizer rule, newer].
- Each step = code + test + owner review. A step is not done until its done criteria pass.
- Risk first: spikes before features. Deploy early and after every milestone.
- Tier 1 first; Tier 2 only after the Tier 1 gate (G2). Anything unbuilt is labelled "designed, not built".
- Never commit secrets or `.env`. Repo stays public until judging ends.

## Tiers
- **Tier 1 (demo core):** CVE path, assess, plan, preview, score, sandbox apply (Node/JS and a PHP to Node/TS sample), verify, report widget, auth, scopes, audit, deploy, README, video.
- **Tier 2 (generate-and-validate skeletons):** compatibility matrix depth (Mantine, Ink, shadcn/ui), PHP framework-magic mapping, AWS Terraform/CDK, Cloudflare, Kubernetes, Kafka/Debezium config, Bedrock/SageMaker snippets, PWA and Core Web Vitals budgets, generated Playwright/Selenium/JMeter suites, Build mode, `generate_mcp_design`.

## Phase 0: refocus and documents (in progress)
Done criteria: `ARCHITECTURE.md` v1 and the six docs exist and the owner has read them; open questions answered or parked; `IDEA.md` points to them.

## Phase 1: setup and risk-first spikes (about 3 h)
| Spike | Question | Done when | If it fails |
|---|---|---|---|
| S1 | What are NitroStack Cloud's real limits (payload, timeout, memory, outbound network)? | Skeleton deployed via Studio; limits recorded in `TRD.md` | Shrink input limits; plan-and-preview only |
| S2 | Can the hosted server clone a repo, run `npm install --ignore-scripts`, write a temp dir, within a timeout, and do calls land on the same instance? | A throwaway test tool proves each step | `apply_stage` disabled; plan-and-preview ships |
| S0 | Test runner installed (Vitest) and one green test; Inspector 0.17.2 pinned | `npm test` passes | none, do first |
| S3 | Local machine is Node 20.20.2; smoke tests use Inspector 0.17.2 (already ran `tools/list` against the starter on Node 20). Node 22 plus Inspector v2 is an optional upgrade | `initialize` and `tools/list` assertions pass with `jq` | Stay on 0.17.2 |
| S4 | API key guard with per-key scopes through Studio's Bearer field | read key works, write refused, bad key 401 | Fall back to `x-api-key` header |
| S5 | tree-sitter PHP grammar available? | A PHP file parses | LLM-assisted reading, flagged "needs review" |
| S6 | Where do Playwright and Selenium run (local vs sandbox)? | Decision recorded in `TEST_PLAN.md` | Run browser tests locally only |
| S7 | Does Studio support MCP elicitation? | Yes/no recorded | Keep approval token only |
**Gate G1:** decide sandbox apply vs plan-and-preview from S1/S2.

### Probe results (S1/S2), deployed 2026-10-30, measured with `spike_probe` against the live service
| Fact | Result | Consequence |
|---|---|---|
| Endpoint | `POST /mcp` answers (HTTP 200, protocol 2025-06-18, no session id); `/mcp/health` 200; `/` and `/sse` return 404 | Client URL is `<serviceUrl>/mcp` |
| Runtime | Node v20.20.2, linux/arm64, 16 CPUs | Same Node as local; native deps need arm64 builds |
| Memory | cgroup limit 524288000 bytes (500 MiB) although the OS reports about 31 GB | Installs and builds must fit 500 MiB |
| `git` | **not installed** (ENOENT) | No `git clone`; fetch repos as an HTTPS archive (GitHub tarball) and extract in Node |
| `npm` | 10.8.2 works; `npm view` works | `npm install --ignore-scripts` is possible in a temp dir |
| Network | outbound HTTPS works (OSV 200, npm registry) | OSV and archive downloads work |
| `/tmp` | writable | Sandbox dir under `/tmp` |
| Instances | calls 60 s apart hit the same instance (same boot id and pid, uptime grows) | Affinity seen but not guaranteed; one-call apply stays the design |
| Timeout | holds of 30, 60 and 120 s all completed (the 120 s call returned HTTP 200 after 123.3 s) | A single apply call can run at least 2 minutes; keep apply well under that and add its own timeout |
| Persistence | marker file written by call 1 was found by every later call; boot id unchanged over about 7 minutes (uptime 410 s) | Same instance, same disk during the test; still not guaranteed under load, so apply stays one call |

**G1 recorded (2026-10-30 22:20 IST): GO** for one-call sandbox apply on the deployed host, with these conditions: repo fetched as an HTTPS archive (no `git`), installs within 500 MiB, fixture-only test execution. **Not yet measured** (fold into the next deploy, the walking skeleton, with an extended probe): reaching GitHub's archive host and extracting (`tar` presence or Node extraction), a real `npm install --ignore-scripts` of a fixture within 500 MiB and its duration, and whether child processes can be capped. Local-run apply remains the labelled demo fallback.

## Phase 2: foundations (about 4 h)
Done criteria for each, with a test:
1. Rename project and server to `metamorph-mcp`; remove calculator leftovers; `.env.example` names only; build passes.
2. `ApiKeyModule` plus scope guard plus 401/403 messages with next-step guidance.
3. Audit interceptor and `metamorph://audit/recent` resource.
4. Redaction utility (unit-tested with sample secrets).
5. Sandbox utility: realpath containment, zip-slip check, size caps, command allow-list; security tests for traversal and symlink escape written first.
6. Signed state tokens (sign, verify, expiry, tamper tests).

## Phase 2.5: walking skeleton (about 2 h, before real logic)
All Tier 1 tools stubbed and deployed; API-key guard with scopes, the hash-bound approval token and the CVE-flow contract test pass through Inspector CLI. Gate: real tool logic starts only after this passes.

## Phase 3: Tier 1 tools (about 8 h)
Order and done criteria (each: code, Inspector smoke test, owner review):
1. `analyze_advisory`: CVE/GHSA via OSV.dev with `@Cache`; "needs confirmation" for text input. Known case: `lodash@4.17.15` returns advisories.
2. `assess_project`: Node/JS inventory first (package.json and lockfile), then PHP detection (`composer.json`), UI libraries, hosting hints, score.
3. `score_mcp_design`: 10 anti-patterns and OWASP list; token count; self-run on our own tools.
4. `plan_modernization`: goals `patch_advisory`, `upgrade_runtime`, `migrate_stack`; stages with risk and rollback.
5. `preview_changes` and the approval token.
6. `apply_stage` (sandbox only; skipped if G1 says no).
7. `verify_changes` and the report data.
8. Dashboard and plan stepper widgets (dark and light).
**Gate G2:** Tier 1 complete and tested; deployed; only then start Tier 2.

## Phase 4: Tier 2 (about 8 h, cut as needed)
In order of value for the pitch: compatibility matrix (verify each rule against docs, with source and date); PHP to Node/TS sample translation with framework-magic mapping flagged; AWS Terraform skeleton and Docker defaults; Kubernetes and Cloudflare skeletons; Kafka/Debezium config; generated test suites; Build mode; `generate_mcp_design`.

## Phase 5: test hardening (about 4 h, runs in parallel with phase 4 where possible)
Playwright cross-browser parallel on widgets; Selenium secondary; JMeter load test on `/mcp`; Lighthouse for Core Web Vitals; security suite (traversal, symlink, zip-slip, redaction, injection text, lifecycle scripts, scope bypass); deployment validation with a Blue-Green style before/after smoke; self-score published.

## Phase 6: ship (about 3 h before freeze)
Deploy final build; verify the deployed server answers with a key and refuses without; README (bullets, plain words mixed with technical terms, quantitative gain with a reason, install snippets, safety section, limits, FAQ); `llms.txt`; demo video (max 3 minutes: problem, solution, working demo; mp4); submit through the organizer account; confirm repo is public and complete.
**Gate G3 (freeze):** code wrapped by **12:00 on Nov 1**; after that only final deploy check, README, video and submission. If the real cutoff is announced earlier, freeze at cutoff minus 1.5 hours.

## Cut order if time runs short
1. `generate_mcp_design`  2. Build mode  3. Kubernetes, Debezium, Cloudflare depth  4. Extra widgets  5. Selenium (keep Playwright)  6. Real apply (fall back to plan-and-preview).
Never cut: auth and scopes, tests for Tier 1, the report, deployment, README, video.

## Checkpoints (IST, assumption-based; revise when cutoff is known)
| When | Gate |
|---|---|
| Oct 30 23:00 | G1 recorded (probe results in this file); S0 test runner green |
| Oct 31 01:00 | Walking skeleton deployed and green (Phase 2.5) |
| Oct 31 21:00 | G2: Tier 1 complete, tested, deployed; Tier 2 starts only if met |
| Oct 31 23:30 | Rehearsal package: README v1 and video v1 on Tier 1 |
| Nov 1 07:00 | Tier 2 cut review |
| Nov 1 09:00 | Final package candidate, submittable as is |
| Nov 1 12:00 | Code freeze (G3) |
Rules: a missed gate triggers the cut order, not extra hours.

## Deferred, revisit later (owner asked to mark these)
- **Success-metric targets** in `PRD.md` stay blank until baselines exist; fill after S1 to S3 and the first self-score.
- **Verify the hypotheses** before any doc or rule uses them: UI-library conflicts (Mantine, Ink, shadcn/ui), tree-sitter PHP grammar, Infisical defaults, elicitation support in Studio.
- Tier 2 depth (Kubernetes, Debezium, Bedrock/SageMaker) and Build mode after G2.
- Optional later: Node 22 and Inspector v2; OAuth template; database-backed audit and nonce store.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Scope versus time | Tiers, gates, cut order |
| Cloud sandbox not feasible | S2 early; plan-and-preview fallback |
| Untrusted repo execution | `--ignore-scripts`, allow-listed commands, containment, caps |
| Docs drift (login/deploy, transports) | Trust Studio and CLI behaviour; note drift in TRD |
| Overlap with Aegis and NitroForge | Lead with advisory-driven modernization and the report |
| UI-library claims wrong | No compatibility rule ships without source and date |
| Rate limits or outages (OSV, npm) | Cache; graceful error that names the next step |
| Token budget (1.5M tokens for the event) | Keep prompts short; reuse docs; avoid large crawls |

## Definition of done for the project
Tier 1 tests green; deployed and verified with and without key; README and video complete; self-score published; every AI-written file reviewed by the owner; open items parked in `IDEA.md`.
