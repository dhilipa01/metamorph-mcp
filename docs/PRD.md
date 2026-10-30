# PRD: Metamorph MCP (Product Requirements Document)

Version 1.0 draft, 2026-10-30. Template: "The 6 Documents You Need Before Writing Any Code" (PRD). Items marked **[OWNER]** need your confirmation.
Source of truth for scope. Related: `../ARCHITECTURE.md`, `TRD.md`, `APP_FLOW.md`, `DESIGN.md`, `SCHEMA.md`, `IMPLEMENTATION_PLAN.md`.

## App name
Metamorph MCP

## Tagline
Drop in a CVE, a legacy app or an idea. Get a safe, scored, modern build.

## Event context
"MCP to the Moon", NitroStack x Fronthyre, online buildathon, Oct 30 to Nov 1 2026, solo. Track: **Enterprise AI & Workplace Automation** [owner]. Judged on problem-solution fit and real-world impact, presentation and UX, depth and quality of MCP integration. Official NitroStack TypeScript SDK only. AI-generated code is permitted but must be verified against the architecture and tested rigorously [owner, newer organizer rule].

## Problem
- **Legacy and outdated code is expensive to move.** Old PHP apps, old Node and JS versions, outdated packages, changed browser and PWA standards, changed ISO and compliance rules, and cloud-provider switches all force migrations that teams do by hand.
- **New CVEs need impact analysis.** Someone has to read an advisory, work out whether the code is affected, find a safe fix version and test it.
- **Conversions break at the seams.** Moving between frameworks or UI libraries (for example Mantine, shadcn/ui, Ink) hits compatibility conflicts that are discovered late.
- **Existing modernization tools are enterprise-priced or closed** (AWS Transform, Google Mainframe Assessment Tool, Moderne, vFunction, Hypercubic). Tools that audit MCP tool design exist (NitroStack's own showcase includes Aegis, which audits combined tool permissions; several OWASP-style MCP scanners exist), but none found in our research combines modernization, CVE-driven upgrades and design scoring in one free pipeline.
- **AI-assisted migration is hard to trust.** Without scoring, approval gates and tests, generated code is unverified.
Who feels it: engineering teams and platform teams with legacy systems; solo developers and agencies inheriting old projects.

## Core value proposition
Speed plus control. One MCP server that: (1) assesses a legacy project, (2) turns a CVE or notice into a ranked plan, (3) converts stacks and frameworks with compatibility checks, (4) generates modern, modular defaults and cloud skeletons, and (5) scores everything against MCP anti-patterns and the OWASP MCP Top 10, with a before/after report. Free and open source. Nothing is written without approval; writes only go to a throwaway sandbox.

## Why MCP is the right technology [judging criterion]
- The users already work inside AI clients and IDEs (Studio, Cursor, a terminal MCP client). MCP puts modernization where they work.
- MCP primitives all earn their place: **tools** (assess, plan, apply), **resources** (rubrics, compatibility rules, cloud targets, reports), **prompts** (migration templates), **widgets** (dashboard, plan stepper, compatibility matrix).
- Approval and scopes fit MCP's consent model; any MCP client can reuse the same server.

## Target user
- **Primary:** an engineer or tech lead at a startup, agency or enterprise platform team who owns a legacy PHP or old Node/JS application and has to modernize it safely without a big consulting budget. Uses Cursor, a terminal MCP client or NitroStack Studio.
- **Secondary:** AI agents calling Metamorph as a tool on behalf of that engineer.
- **Persona (primary) [OWNER to adjust]:** "Maya", tech lead of a 6-person product team at a small company. She inherited a PHP storefront (plain PHP, `mysqli`, sessions, inline HTML) on one VPS. Her team knows JavaScript, not PHP. Pain: a new CVE landed in a Composer dependency on a Friday; she cannot tell what is affected, the upgrade could break checkout, and the board wants "move it to Node, containers and AWS" without downtime. Needs: a fast answer (affected or not), a safe ordered plan, a preview of every change, proof it builds and tests pass in isolation, and a report she can show her manager. Works in a terminal MCP client daily; sees demos in NitroStack Studio. Success for her: from CVE to approved plan in minutes, no change to production until she says so.
- **Persona (secondary):** "Dev", an agency engineer who inherits several old projects per quarter and needs the same assessment and CVE watch across all of them (the watch feature below).
- **Persona (agent):** an AI assistant calling Metamorph tools on Maya's behalf; it needs small tool lists, filtered outputs and error messages that name the next tool.

## Modes
- **Evolve (leads):** legacy system to modern app/platform/product/service.
- **Build (follows):** idea or PRD to a scaffolded modern product, reusing Evolve's target adapters and defaults so work is not done twice.

## Core features: Must have (Tier 1, demo core)
1. **Project assessment:** detect stack (Node/JS and PHP first), dependencies, UI libraries, hosting/cloud hints, architecture style; return top findings and a score.
2. **CVE and advisory analysis:** accept a CVE/GHSA id, advisory text, patch diff or URL; use OSV.dev; say affected yes/no/unsure with confidence and fixed versions. Pasted text is untrusted data; extracted package names are flagged "needs confirmation".
3. **Modernization plan:** goals `patch_advisory`, `upgrade_runtime`, `migrate_stack`, `modularize`, `meet_standard`, `switch_cloud`, `build_from_spec`; staged, with risk per stage, rollback notes and compatibility conflicts.
4. **Preview:** exact diff summary before anything is applied.
5. **Sandbox apply (with approval token):** create the modernized project in a throwaway copy; never touch the user's repo; build and test results returned. Falls back to plan-and-preview if the cloud sandbox spike fails [see IMPLEMENTATION_PLAN S2].
6. **Verification and report:** before/after numbers in one Metamorph report.
7. **MCP design scoring:** score a tool list or server against the 10 anti-patterns and the OWASP MCP Top 10, including token cost of definitions.
8. **Security baseline:** API-key auth (Bearer-compatible), scopes `read`/`plan`/`write`, audit log, secret redaction, path sandboxing, no lifecycle scripts on untrusted repos.
9. **Dashboard widget** in dark and light mode (both required).
10. **Deployed on NitroStack Cloud** with README, install snippets and a demo video.

## Nice to have (Tier 2, generate-and-validate skeletons; written in the sandbox, run by the user)
- **PHP to Node/TS conversion beyond samples:** mapping plan, scaffolded modular target, a sample of translated handlers flagged "needs review", framework-magic mapping (Laravel facades, service providers).
- **UI-library compatibility matrix** (Mantine, Ink, shadcn/ui and others) with conflict detection; each rule sourced and dated.
- **Cloud and infrastructure lane:** AWS as the 100% target (Terraform and CDK skeletons, Blue-Green layout), Cloudflare, Kubernetes manifests, Kafka/Debezium config for legacy SQL to NoSQL sync (config and mapping only), Bedrock/SageMaker serverless snippets, PWA and Core Web Vitals budgets, deployment and environment validation.
- **Generated test suites:** Playwright, Selenium, JMeter.
- **Build mode** from a PRD.
- `generate_mcp_design` (outcome-based MCP over the modernized app).
- Per-stack modern defaults: for React, Docker, Infisical secrets, shadcn/ui, modular feature folders.
- OAuth template as a stretch (ChatGPT connector does not accept API keys).

## Out of scope for this version
- Moving or transforming real data (generated schema mapping and scripts only).
- Running `terraform apply`, deploying workloads, changing cloud accounts.
- Fully automatic translation of a whole PHP application.
- Editing the user's repository in place.
- Running exploit code; only advisories, fixed versions and patch diffs are accepted.
- Languages beyond the first adapters (PHP, Node/JS) unless time remains.
Anything designed but not built by Nov 1 is labelled "designed, not built" in the README and the video.

## User stories
- As a **tech lead**, I want to paste a CVE and learn if my project is affected and what to upgrade, so that I can act within minutes.
- As a **tech lead**, I want a staged plan with risks and a rollback note, so that I can approve the safest path.
- As a **developer**, I want a preview of every change before anything is written, so that I stay in control.
- As a **developer**, I want the modernized project built in a sandbox with test results, so that I trust it before touching my repo.
- As a **migrating team**, I want compatibility conflicts (for example UI libraries) flagged in the plan, so that I do not discover them mid-migration.
- As a **platform engineer**, I want Terraform, Docker and Kubernetes skeletons for the target cloud, so that deployment is not a blank page.
- As an **MCP author**, I want my tool list scored against anti-patterns and OWASP, so that my server is lean and safe.
- As a **security reviewer**, I want an audit log and scoped keys, so that every action is traceable.
- As a **judge or reader**, I want one report with before/after numbers, so that I can see the improvement and why it matters.

## Demo legacy project (decided approach, details to build)
Our own synthetic fixtures, so there is no license risk and the demo is repeatable:
- **`legacy-php-shop`**: small plain-PHP storefront: `mysqli` queries, `$_SESSION` login, inline HTML templates, `composer.json` pinning `guzzlehttp/guzzle` 6.5.0 and `symfony/http-kernel` 4.4.0. Verified on 2026-10-30 via OSV.dev: guzzle 6.5.0 returns 14 advisories and http-kernel 4.4.0 returns 2 (counts change over time; record the date in the demo).
- **`legacy-node-orders`**: small Express app on an old runtime with `lodash` 4.17.15 (OSV returned 6 advisories on 2026-10-30).
- Hero demo uses the Node fixture for the build-and-test path (needs `npm`, which the host has) and the PHP fixture for the assessment, plan and "needs review" translation sample. A real third-party legacy project can be a Tier 2 proof if time remains.

## CVE watch (new feature, owner request: "no one misses a CVE in urgent times")
- **W1 `check_watch` (Tier 1 if time, else Tier 2):** given a package list or an assessment, return advisories changed since a cursor (the client holds the cursor). Uses OSV batch query (`{id, modified}` per vulnerability, verified 2026-10-30). Urgency flags: high or critical severity, listed in CISA's Known Exploited Vulnerabilities feed (reachable, verified), or a malicious-package (`MAL-`) entry.
- **W2 generated scheduled workflow (Tier 2):** Metamorph writes a GitHub Actions cron workflow into the modernized project that runs the check and opens an issue or sends a webhook for urgent hits. Real alerts without any server-side state.
- MCP resource subscriptions only notify while a client is connected, so they are not the alarm. Server-side watcher with a database is out of scope for this version.

## Success metrics (targets are set after spikes S1 to S3 measure baselines) [OWNER to confirm]
**Marked for later (owner): the Target column is intentionally blank until baselines exist. No numbers are invented.**
| Metric | How measured | Target |
|---|---|---|
| Tool count | tools/list | under 15 (design: 8) |
| Tool definition size | token count of tools/list | measured and published; lower than comparable servers found in research (GitHub MCP about 18,000 tokens for 27 tools, per Bump.sh) |
| Anti-pattern failures on our own server | `score_mcp_design` self-run | 0 of 10 |
| OWASP MCP Top 10 coverage | threat model plus tests | 10 of 10 mapped, each with a passing test |
| CVE to plan time | timed demo run | measured and shown in the video |
| Test pass rate | Inspector smoke + Playwright + security tests | 100% of Tier 1 tests green or explicitly waived |
| Demo | video | under 3 minutes: problem, solution, working demo |
| Deployed | NitroStack Cloud | server answers with a valid key, refuses without |
Each metric gets a plain-language "why it matters" in the README (quantitative gain backed by a qualitative reason, per owner notes).

## Constraints and assumptions
- Solo builder, about 37 hours on the clock at 22:14 IST Oct 30 (about 20 productive). Cutoff assumed between 12:00 and 15:00 IST on Nov 1; **code wrapped by 12:00** [owner]. Update when the organizers publish the real time.
- Hero demo path [owner]: CVE to plan to sandbox build and report. Final video in NitroStack Studio; daily work in a terminal MCP client.
- Deployed host facts (probe): Node 20.20.2 on arm64, 500 MiB memory limit, no `git`, `npm` and outbound HTTPS available.
- Official NitroStack TypeScript SDK only; deploy on NitroStack Cloud.
- NitroStack Cloud limits (payload, timeout, memory, outbound network, running `npm` and `git`) are undocumented; assumed unknown until spikes.
- API keys cannot connect from ChatGPT's connector (No Auth or OAuth only); demo runs in Studio, Cursor, a terminal MCP client.
- Repo stays public until judging ends; no secrets or `.env` committed.

## Risks
Scope versus time (tiers and cut order mitigate); sandbox feasibility on cloud; untrusted repo execution; docs drift between NitroStack docs and CLI/Studio behaviour; overlap with NitroStack showcase projects (Aegis, NitroForge).

## Open questions [OWNER]
1. Persona wording and the demo legacy project to use (a real old PHP or Node app, or a prepared sample).
2. Exact submission cutoff time on Nov 1.
3. Confirm the success-metric targets after baselines exist.
