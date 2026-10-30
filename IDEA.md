# IDEA (draft, from good_notes.txt; not final)

> **Principle (owner note):** every modernization, conversion or upgrade must output modern, modular defaults, not just working code. Example: converting to React also ships Docker, Infisical for secrets and shadcn/ui by default, split into independent modules. (Exact default list per stack is not decided yet.)

Buildathon: NitroStack x Fronthyre "MCP to the Moon", Oct 30 - Nov 1 2026, solo.
Judged on: problem-solution fit, presentation/UX, depth of MCP integration.

## Concept (from notes)
Agentic product engineering platform, two modes:
- **Evolve Mode** (lead): legacy modernization into AI-ready architecture.
- **Build Mode** (follow-up): product engineering, idea to scale.
- Why Evolve first: avoid redoing code and logic twice before conversion.

## Where MCP fits (to decide)
- Tools: analyse a legacy codebase, plan a migration, validate the result.
- Resources: architecture facts, dependency map, migration plan.
- Prompts: reusable migration/review templates.
- Widgets: dashboard (dark + light mode, both required).
- Also from notes: MCP anti-pattern checks, OWASP checks, deployment validation.

## Open questions (need an answer before coding)
1. Which of the 6 official tracks does this map to? (Tracks: BFSI/FinTech, Manufacturing, Enterprise AI, HealthTech, Education, Open Innovation.)
2. What exact legacy input do we accept (repo path, zip, one language)?
3. What is the smallest demo that fits a 3-minute video?
4. DB choice (MongoDB vs PostgreSQL) depends on question 2.
5. Python, AWS and Cloudflare in the notes: the rules say official TypeScript SDK only for NitroStack Cloud. Which of these are real requirements?

## Constraints (Do's and Don'ts)
- Official NitroStack TypeScript SDK only. No secrets or .env in GitHub.
- MVP first, deploy to NitroStack Cloud early, README with install and env docs.
- Demo video max 3 minutes: problem, solution, working demo.
- Stop code changes about 1.5 hours before submission (Nov 1).

---

# UPDATE 2026-10-30: organizer rule, direction, research

## New organizer instruction (verbatim)
"AI generated code is permitted but do not be blind to its activities; verify it against the architecture you've set up. Conduct routine tests on your code."
- Working rule: every AI-written piece is read by the owner and checked against the module layout (tools / resources / prompts / widgets) before it stays.
- Routine tests: run `npm run build`, call each tool from the inspector or Studio after every change, and keep at least one test per tool.

## Direction (owner decision)
- Selling point: turn obsolete architecture styles into modern, scalable, modular, secure ones (this is the headline, code conversion is the means).
- Triggers for modernization: old JS version, outdated packages, changed browser or PWA standards, changed ISO / compliance standards, cloud-provider switches.
- NOT the idea: converting an API with Studio's "Generate from API". Input is an old codebase and its architecture, not an API spec.
- Output: an outcome-based MCP design (few intent-level tools, filtered outputs) scored against the anti-patterns in `anti_patterns.md` and OWASP checks, with before/after numbers.
- Positioning: free, open-source take on what AWS Transform, Google Mainframe Assessment Tool, Moderne, COBOL Bridge and vFunction do for enterprises.
  - Risk (my note): matching enterprise depth in 2 days is not realistic. Pick one narrow vertical slice (for example Node/JS legacy plus dependency and architecture scoring) and say plainly what is out of scope.

## Existing converter / upgrade MCPs (verified from each README, 2026-10-30)
| MCP | What it does | Languages / frameworks covered | Security features stated |
|---|---|---|---|
| AI Code Translator MCP (asume21) | Translate code between languages, translation feedback, chatbot, vulnerability scanner | **12 languages**, hard-coded in `mcp_server.py` (checked in source): Python, JavaScript, Java, C++, C#, Go, Ruby, PHP, Swift, Kotlin, TypeScript, Rust. 10KB max source size. LLM-based (Gemini). | X-API-Key header, JWT, user registration; needs a Gemini API key; scanner rules not described. Repo also commits an `api_keys.json` file (contents not read). |
| code-to-tree (micl2e2) | **Parsing only** (see definition below). Source code to AST using tree-sitter, local binary | 7 grammars: C, C++, Rust, Go, Ruby, Python, Java (checked in `code-to-tree.c`) | None stated (local STDIO binary). My reading of the C source: `lang` buffer is 8 bytes but the read call passes capacity 16 (`code-to-tree.c` around line 296-303), and the call sits inside `assert()`. I did not test whether this is exploitable. |
| MCP Basics (caroline-davis) | Wraps Prettier (format) and ts-migrate (JS to TypeScript) | JavaScript to TypeScript only | None stated (local STDIO, built for Cline) |
| NPM Helper (pinkpixel-dev, 8 stars) | Wraps npm-check-updates: checkUpdates, upgradePackages, resolveConflicts, runDoctor (upgrade and test in a loop), plus npm search tools | npm / package.json only, Node 18+ | None described; only a third-party security badge |
- **"Parsing only" defined (code-to-tree):** it exposes exactly one tool, `code-to-tree`, with two inputs `lang` and `code`. It returns the syntax tree of that code as S-expression text. It does not translate, rewrite, refactor, validate, scan for security issues, read files or touch a project. An LLM can read the tree, but all the modernization work would still be someone else's job.
- **Language coverage target (owner requirement: 10+ or 100+):** the best converter found covers 12 languages and is LLM-only with a 10KB limit; the AST one covers 7. Our route to scale is the tree-sitter approach (many grammars) instead of one prompt per language pair. I have not verified how many tree-sitter grammars exist; check before promising "100+".
- Not verified: Elevate and Dependency Health Monitor (repos not found, listing pages not scraped). A search snippet says the latter checks vulnerabilities and license compliance; treat as unconfirmed.
- Related YC company: Infield (W20), "Safer, faster dependency upgrades" (see `yc_companies.md`).
- Gap in what I read (my inference): none of the four READMEs mention framework migrations (React, Angular, Express and similar), PWA or ISO standards, cloud-provider switching, architecture restructuring, anti-pattern scoring, or OWASP mapping.

## Enterprise tools already covering "analyse legacy, plan a migration" (from web search, not verified in depth)
- AWS Transform (MCP server, assessments, plans, transformations with human checkpoints), Google Mainframe Assessment Tool (used by Gemini CLI via MCP), Moderne / OpenRewrite (recipes), COBOL Bridge MCP, vFunction (architecture modernization plans delivered through MCP).

## Owner decisions (2026-10-30)
- Official name: **Metamorph MCP**.
- Track: **Enterprise AI & Workplace Automation**.
- Auth: **API keys**.
- Multi-stack: yes. First migration pair: **PHP to Node/TypeScript**, plus a Node/JS upgrade path. Adapter layer so more stacks can be added.
- Open: whether real file writing is in the MVP (options A, B, C in `ARCHITECTURE.md` section 11; recommendation C: writes only into a throwaway sandbox copy).

## Design doc
- **Superseded:** earlier "Evolve MCP" wording and the v0 architecture. Current name: **Metamorph MCP**. Current scope and decisions: `ARCHITECTURE.md` v1 and `docs/`.
- `ARCHITECTURE.md` v1: six-point scope (Evolve, CVE-driven upgrades, language/framework conversion with UI-library edge cases, Build mode, cloud and infrastructure lane, self-scoring), one shared pipeline, 8-tool surface, policies mapped to OWASP MCP Top 10.
- `docs/`: `PRD.md`, `TRD.md`, `APP_FLOW.md`, `DESIGN.md`, `SCHEMA.md`, `IMPLEMENTATION_PLAN.md`, `THREAT_MODEL.md`, `TEST_PLAN.md`. Drafts; items marked [OWNER] await owner confirmation.
- Pitch (owner): speed plus control. Drop in a CVE id, advisory, patch diff, news article, platform notice, legacy project or an idea and Metamorph MCP finds what is affected, plans, and builds the result in a sandbox only after approval.
- Rule update (organizer, newer): AI-generated code is permitted; verify it against the architecture and test rigorously (Playwright, Selenium, JMeter and security tests are planned).

## Research files in the project root
- `anti_patterns.md`: anti-patterns noted from 3 scraped pages. 3 more pages (cdata.com, Towards AI, HKU) were blocked (403/404) and not scraped; paste their text to add them.
- `mcp_landscape.md`: registry snapshot (8,994 unique servers, partial), categories by my keyword rules, top 50 by repo stars. Stars are per repo, not per MCP.
- `yc_companies.md`: YC companies mentioning MCP (46), software-modernization matches (35, mostly noise), and a website/docs check of the 46: 23 STRONG (dedicated MCP page, docs or blog), 9 WEAK (mentioned only), 11 none found on static pages, 3 fetch failed. Strong is not proof the server is live. Section B was re-filtered: 3 relevant competitors (Hypercubic, Infield, Datafold), 4 adjacent, 13 noise.
- `yc_mcp_structures.md`: how the 23 STRONG companies structure their MCP pages (sections, tools seen, auth and transport mentions, benefit claims) and patterns across them.

## Open questions (updated)
1. Which single vertical slice do we demo (for example old Node/JS app: outdated packages + architecture scoring)?
2. Which architecture style is the "before" (for example monolith with tangled routes) and what is the modular "after"?
3. Which standards do we score against first (OWASP list, which PWA checks)?
4. Track choice still unconfirmed (Enterprise AI & Workplace Automation looks closest).
