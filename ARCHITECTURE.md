# ARCHITECTURE (v1, 2026-10-30, supersedes v0)

Name: **Metamorph MCP**. Track: Enterprise AI & Workplace Automation. Auth: API keys (Bearer-compatible).
Status: design only, no feature code yet. Tags: **[verified]** checked in a source, **[owner]** owner decision, **[design]** my proposal needing owner review.
Detailed documents live in `docs/` (PRD, TRD, APP_FLOW, DESIGN, SCHEMA, IMPLEMENTATION_PLAN, THREAT_MODEL, TEST_PLAN).

## 1. What Metamorph MCP does [owner]
1. **Evolve:** modernize a legacy system into a modern app, platform, product or service.
2. **CVE-driven upgrades:** a CVE, advisory, patch diff or notice goes in; affected code is found, a plan comes out, upgrades are applied in a sandbox.
3. **Convert languages and frameworks** (first pair PHP to Node/TS), including UI-library edge cases: Mantine, Ink and shadcn/ui do not combine freely, so plans carry a compatibility matrix and conflict detection.
4. **Build mode** (after Evolve): idea or PRD in, scaffolded modern product out.
5. **Cloud and infrastructure lane:** AWS as the 100% target; Cloudflare; Terraform/CDK; Blue-Green deploys; Kubernetes; deployment and environment validation; legacy SQL to NoSQL sync (Kafka/Debezium); PWA and Core Web Vitals; Playwright, Selenium, JMeter test emphasis; Bedrock/SageMaker in serverless setups.
6. **Self-scoring:** every output is scored against the 10 anti-patterns (`../anti_patterns.md`) and the OWASP MCP Top 10.

Pitch (speed plus control): drop in a CVE, advisory, patch, article, platform notice, legacy project or an idea; Metamorph finds what is affected, plans, and builds the result in a sandbox only after approval, with modern modular defaults and a before/after report.

## 2. Evolve first, then Build: one pipeline [owner, design]
Why this order (notes: "why redo code and logic twice before conversion?"): both modes share the same machinery.
```
 EVOLVE input: legacy project / CVE / notice          BUILD input: idea / PRD
          |                                                   |
   source adapter (php, node-js, ...)                  spec reader (PRD -> model)
          \_____________________ neutral Project Model _______/
                                       |
                  compatibility check (UI libs, frameworks, runtimes)
                                       |
                 target adapter (node-ts, ...) + modern defaults
                                       |
        generated app  +  cloud/IaC skeletons  +  test suites  +  MCP design
                                       |
                     score (anti-patterns, OWASP) -> Metamorph report
```
Build mode reuses Evolve's target adapters, defaults and scoring. Nothing is written twice.

## 3. Differentiation [verified from research files]
| Existing | What it covers | Metamorph difference |
|---|---|---|
| AWS Transform, Google Mainframe Assessment Tool, Moderne, vFunction, Hypercubic | Enterprise legacy and architecture modernization, mostly closed or enterprise-priced | Free, open-source, covers CVE-driven upgrades, framework and UI-library conversion, cloud skeletons and MCP design scoring in one tool |
| Infield (YC W20) | Dependency upgrades | We add architecture, stack conversion and cloud lane |
| Converter MCPs read (AI Code Translator, code-to-tree, MCP Basics, NPM Helper) | Single-purpose translate, AST, format, npm upgrade | None of their READMEs mention advisory-driven upgrades, compatibility conflicts, cloud lane or OWASP/anti-pattern scoring |
| NitroStack showcase: **Aegis** (audits combined MCP tool permissions), **NitroForge** (OpenAPI to MCP), FinGate/Protocol-0/NovaForge (approval gates) | Judges know these | We score design as part of modernization and do not start from an API spec; approval gate is a pattern, not our headline |
| Armature, Golf | Runtime analytics and gateway governance | We score design before deployment (their pages show no design-time scoring; not read in depth) |

## 4. MCP surface (under 15 tools) [design]
| Tool | Intent | Mode | Flat inputs | Returns (filtered) |
|---|---|---|---|---|
| `assess_project` | How outdated, risky and well structured is this? | read | `source` (repo URL or `upload_id`), `stack?`, `focus?` | stack, UI libraries, hosting/cloud, architecture style, top findings (max 10), score, `assessment_id` |
| `analyze_advisory` | Does this CVE / advisory / article affect me? | read | `source_type` (cve, ghsa, url, text, diff), `source`, `assessment_id?` | affected yes/no/unsure, where, severity, fixed versions, confidence |
| `plan_modernization` | Give me a safe, ordered plan. | read | `assessment_id`, `goal` (patch_advisory, upgrade_runtime, migrate_stack, modularize, meet_standard, switch_cloud, build_from_spec), `target_stack?`, `target_cloud?` | stages, risk per stage, compatibility conflicts, rollback notes, `plan_id` |
| `preview_changes` | Show exactly what will change. | read | `plan_id`, `stage` | diff summary, files touched, tests to run |
| `apply_stage` | Do stage N in the sandbox. | write (sandbox only) | `plan_id`, `stage`, `approval_token` | sandbox id, files created, build and test result, download handle |
| `verify_changes` | Did it work and improve? | read | `plan_id` | build/test status, re-score, before/after numbers |
| `score_mcp_design` | Is this MCP surface well designed and safe? | read | `tools_json` or `server_path` | per-anti-pattern and per-OWASP result, token cost |
| `generate_mcp_design` | Turn this app's capabilities into an outcome-based MCP. | read | `assessment_id`, `max_tools?` | proposed tool list, descriptions, schemas |
| `check_watch` | What changed in the CVE world for my packages since I last looked? | read | `packages[]` or `assessment_id`, `since?` (cursor) | changed advisories with urgency flags (high/critical, KEV-listed, malicious package), next cursor |

**Apply flow (decided 2026-10-30):** `preview_changes` returns `plan_hash`, `patch_hash` and an approval token (HMAC, short expiry, bound to the hashes, not to a key id). `apply_stage` needs a write key plus that token and runs as **one call**: fetch repo archive (host has no `git`), `npm install --ignore-scripts`, build, test (fixture repos only on the deployed server), bounded patch returned inline, temp directory deleted in `finally`. Idempotent on the hashes, so replay is harmless. Uploads are cut; input is a repo URL. See `docs/SCHEMA.md`.
**Why protocol-stateless, and what it does not mean:** the default protocol is stateless and the host autoscales, so there is no per-connection session. That does not forbid storage; it was a time and risk choice. A small MongoDB TTL store for nonces and watch cursors is the documented upgrade path.
Resources: `metamorph://rubric/anti-patterns`, `metamorph://rubric/owasp-mcp-top10`, `metamorph://defaults/{stack}`, `metamorph://compat/ui`, `metamorph://compat/frameworks`, `metamorph://cloud/{target}` (aws, cloudflare, k8s), `metamorph://report/{id}`.
Prompts: `modernize_from_advisory`, `migrate_stack`, `build_from_prd`, `review_before_apply`.
Widgets: score dashboard, plan stepper with diff, before/after, compatibility matrix (dark and light mode both required).
Edge cases (UI-library conflicts, cloud targets) are resources and plan rules, not new tools, to respect the tool-count anti-pattern.

## 5. Stack and UI-library compatibility [owner edge case, design]
- `metamorph://compat/ui` holds rules such as: React DOM component libraries (shadcn/ui on Radix + Tailwind, Mantine with its own styling system) conflict when mixed on one page; Ink targets terminals, not the DOM. Each rule carries a source URL and a verified date. **Do not encode a rule until checked against current docs** (not verified in this session).
- `plan_modernization` reports conflicts and proposes either one library or an isolation boundary.

## 6. Cloud and infrastructure lane [owner scope, design generate-and-validate]
Skeleton generators write files into the sandbox; the user runs them. No `terraform apply`, no data movement.
| Area | Output |
|---|---|
| AWS (100% target) | Terraform and CDK skeletons: VPC, ECS or Lambda, CloudFront, Route53, secrets; Blue-Green deployment layout |
| Cloudflare | Workers / Pages config and DNS notes |
| Kubernetes | Manifests or Helm skeleton, health probes |
| Legacy SQL to NoSQL sync | Kafka and Debezium connector config plus schema mapping notes (no data moved) |
| Serverless AI | Bedrock and SageMaker integration snippets inside Lambda-style handlers |
| Web quality | PWA checklist and Core Web Vitals budgets (LCP, CLS, TBT), compression settings |
| Validation | Deployment and environment validation checklist; generated Playwright, Selenium and JMeter suites |

## 7. Policies mapped to OWASP MCP Top 10 (2025 beta) [verified list, design controls]
| Item | Control |
|---|---|
| MCP01 Token / secret exposure | Secrets from env or Infisical only; redact secret-like strings in outputs and logs; `.env` never committed |
| MCP02 Scope creep | Scopes `read`, `plan`, `write`; per-key scopes via custom validation; default read-only; write scope time-limited |
| MCP03 Tool poisoning | Static, pinned tool descriptions listed in README; no tool text built from user input |
| MCP04 Supply chain | Our dependencies pinned and OSV-checked; lockfile committed |
| MCP05 Command injection | No shell strings; argument arrays; allow-list (`npm install --ignore-scripts`, test runners); realpath-contained sandbox paths (pattern from `refs/servers/src/filesystem/path-validation.ts`); zip-slip checks; size caps |
| MCP06 Prompt injection | Advisory, article and repo text treated as data; schema-validated extraction; "needs confirmation" flag |
| MCP07 Authn / authz | `ApiKeyModule` (`x-api-key` or `Authorization: Bearer`), hashed keys, guard on every tool, stricter on write |
| MCP08 Audit | Event log per tool call (who, scope, tool, outcome) via SDK events |
| MCP09 Shadow servers | One official endpoint and tool list in README; `score_mcp_design` flags unlisted servers in configs |
| MCP10 Over-sharing | Outputs filtered to 3 to 5 needed fields; size caps |
MCP annotations (`readOnlyHint` etc.) are untrusted per the MCP spec: scopes are enforced server-side.

## 8. Hosting, auth and state [verified facts, design choices]
- **Sandbox:** a cloud-hosted server cannot read the user's disk, so input is a repo URL or upload and writes go to a disposable sandbox. NitroStack Cloud limits (payload, timeout, memory, outbound network, running `npm`/`git`) are not documented; spike S1/S2 decides between sandbox apply and plan-and-preview only.
- **Auth:** API keys via `ApiKeyModule` (`keysEnvPrefix`, `hashed`, `headerName`, `customValidation` for per-key scopes; `headerName: 'Authorization'` for Bearer). ChatGPT's connector offers only No Auth or OAuth, so the demo runs in Studio, Cursor and a terminal MCP client. OAuth template is a stretch.
- **State:** protocol default is stateless and cloud autoscales, so no memory-only state. Start with signed self-contained tokens for `assessment_id` and `plan_id`; add MongoDB or PostgreSQL only if needed.
- **Docs drift:** cloud docs mention `nitrostack login`/`deploy` (absent in CLI v1.1.2); transport docs differ from the running endpoint. Trust what Studio and the CLI do.

## 9. SDK layout (official NitroStack TypeScript SDK only) [design]
```
src/
  app.module.ts
  modules/ intake/ assessment/ planning/ apply/ verify/ design/ rubric/ cloud/ compat/
  common/  guards (scope) interceptors (audit, timing) pipes filters (guidance errors) redaction sandbox
  widgets/app/ score-dashboard plan-stepper before-after compat-matrix
```

## 10. Testing (rigorous) [owner rule, design]
Contract and smoke (Inspector CLI, pinned), widget review (`--app-info`), UI end to end (Playwright cross-browser parallel, Selenium), performance (JMeter on `/mcp`, Lighthouse), security tests, deployment validation, self-scoring. Full detail in `docs/TEST_PLAN.md`. AI-written code is permitted; every piece is read against these docs before it stays.

## 11. Phasing [design]
Tier 1 (demo core): CVE path, assess, plan, preview, score, sandbox apply for Node/JS and PHP to Node/TS samples, report widget. Tier 2 (generate skeletons): cloud lane, Build mode, compatibility depth. Anything not built by Nov 1 is labelled "designed, not built" in the PRD.
