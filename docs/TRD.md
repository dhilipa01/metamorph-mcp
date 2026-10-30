# TRD: Metamorph MCP (Technical Requirements Document)

Version 1.0 draft, 2026-10-30. Tags: **[verified]** checked in a source or in this project, **[design]** proposal, **[verify]** must be checked before use, **[OWNER]** needs confirmation.

## Stack
| Layer | Choice |
|---|---|
| Language | TypeScript, ESM (`"type": "module"`, imports use `.js` suffix) [verified in starter] |
| Server framework | `@nitrostack/core` ^1 (official NitroStack TypeScript SDK; decorators `@McpApp`, `@Module`, `@Tool`, `@Resource`, `@Prompt`, `@Widget`, guards, interceptors, pipes, filters, `@Cache`, `@RateLimit`) [verified in starter skills] |
| Validation | Zod ^3.25 [verified] |
| Widgets | Next.js app in `src/widgets` with `@nitrostack/widgets` (`useWidgetSDK`, `useWidgetState`) [verified]; React; Tailwind and shadcn/ui [design] |
| CLI | `@nitrostack/cli` ^1 (`init`, `dev`, `build`, `start`, `generate`, `upgrade`, `install`, `cursor`, `pack`) [verified, v1.1.2 installed] |
| Runtime | **Node 20.x.** Local machine is Node 20.20.2 and stays that way for now [owner]; the deployed host also runs Node v20.20.2 on linux/arm64 [verified by probe]. Inspector 0.17.2 (pinned) is the smoke-test runner on Node 20; Inspector v2 needs Node >= 22.19, an optional later upgrade |
| Database | None at first. Stateless-safe design: signed self-contained tokens for ids. MongoDB or PostgreSQL only if spikes show a need (notes: decide by problem) [design] |
| Auth | `ApiKeyModule` (`keysEnvPrefix`, `hashed`, `headerName`, `metadataField`, `customValidation`); header `x-api-key` or `Authorization: Bearer` via `headerName: 'Authorization'`; `ApiKeyModule.generateKey('sk')` and `hashKey()` [verified in NitroStack docs] |
| Hosting | NitroStack Cloud (GitHub auto-deploy or Studio deploy or zip upload max 100 MB) [verified in handbook] |
| Transport | Dual (STDIO for local, HTTP for remote); dev MCP on `:3002/mcp`, widgets on `:3001` [verified] |
| Protocol | Default `auto`: serves 2026-07-28 stateless spec and legacy clients; env `NITRO_MCP_PROTOCOL_VERSION` [verified in starter README] |

## Third-party APIs and services
| Service | Purpose | Cost |
|---|---|---|
| OSV.dev (`POST /v1/query`, `GET /v1/vulns/{id}`) | CVE and advisory data by package and version; CVE-id records can lack package data, so resolve via the GHSA alias [verified] | free |
| npm registry | package metadata, versions | free [verify rate limits] |
| GitHub | clone public repos for assessment | free; token only if private repos are ever supported [design] |
| Infisical | secrets manager default in generated projects (not required by our server) | free tier [verify] |
| AWS, Cloudflare, Kubernetes, Kafka/Debezium, Bedrock/SageMaker | targets we generate skeletons for; our server does not call them | none |
| tree-sitter | parsing for many languages; PHP grammar [verify] | free |

## Key libraries (all versions pinned in the lockfile) [design, verify each before adding]
`zod`, `semver`, a TOML/JSON/YAML parser, `tree-sitter` plus a PHP grammar (or fallback), a zip library with zip-slip protection, a diff library, a secrets-pattern redactor. Fewer dependencies is better (OWASP MCP04).

## Folder structure and naming
```
mcp-starter/ (to be renamed metamorph-mcp)
  src/
    index.ts, app.module.ts
    modules/<feature>/<feature>.{module,tools,resources,prompts,service}.ts
    modules/ intake assessment planning apply verify design rubric cloud compat
    common/ guards interceptors pipes filters redaction sandbox
    widgets/app/<route>/page.tsx    score-dashboard plan-stepper before-after compat-matrix
  docs/        PRD TRD APP_FLOW DESIGN SCHEMA IMPLEMENTATION_PLAN THREAT_MODEL TEST_PLAN
  tests/       smoke (Inspector CLI), e2e (Playwright, Selenium), perf (JMeter), security
```
Naming: kebab-case files, snake_case tool names (intent-level, e.g. `plan_modernization`), flat Zod inputs, resources under `metamorph://`.

## Environment variables (names only, never values in the repo)
`NODE_ENV`, `PORT`, `NITRO_LOG_LEVEL`, `NITROSTACK_APP_MODE`, `MCP_TRANSPORT_TYPE`, `NITRO_MCP_PROTOCOL_VERSION` [verified in `.env.example`]; `API_KEY_1..N` (prefix configurable), `METAMORPH_TOKEN_SECRET` (signs state tokens), `METAMORPH_SANDBOX_DIR`, `METAMORPH_MAX_UPLOAD_MB`, `METAMORPH_MAX_REPO_MB`, `METAMORPH_COMMAND_TIMEOUT_S` [design]. `.env.example` lists names only.

## Tool and resource contract rules (from `../anti_patterns.md`)
Intent-level names; flat inputs; filtered outputs (3 to 5 fields); error messages that name the next tool to call; no overlapping tools; under 15 tools; short non-repeating descriptions; every tool has an example. Tool annotations set honestly (`readOnlyHint`, `destructiveHint`, `idempotentHint`) but never trusted as a security boundary (MCP spec calls them untrusted).

## Security requirements (details in `THREAT_MODEL.md`)
Scopes enforced server-side; hashed keys; redaction; sandbox path containment using realpath (pattern: `refs/servers/src/filesystem/path-validation.ts`); `npm install --ignore-scripts` only; zip-slip and size caps; command allow-list with argument arrays; audit events; rate limit per key.

## Sandbox design [design, gated by spike S2]
**Measured on the deployed host (spike_probe, 2026-10-30):** Node 20.20.2, linux/arm64, 16 CPUs, **memory cgroup limit 500 MiB**, `/tmp` writable, `npm` 10.8.2 works, outbound HTTPS works (OSV, npm registry), **`git` is not installed**, `POST /mcp` answers, calls 60 s apart hit the same instance. Timeout results: see `IMPLEMENTATION_PLAN.md`.
Input: **repo URL only** (uploads are cut). Because there is no `git`, the repo is fetched as an HTTPS archive (for example GitHub's tarball for a ref) and extracted in Node with zip-slip/size checks. Work in a per-run temp directory under `/tmp`; no writes outside it; `npm install --ignore-scripts` with the registry host allowed and other hosts blocked [enforcement to be verified]; installs must fit 500 MiB. Output: bounded patch and results returned inline in the same call; directory deleted in a `finally` block. On the deployed server, test and build steps run only for Metamorph's own fixture repos; arbitrary repos get plan-and-preview. If a limit blocks this, ship plan-and-preview and keep `apply_stage` disabled; a clearly labelled local run is the demo fallback.

## Compatibility matrices [design, every rule needs a source URL and verified date]
- `metamorph://compat/ui`: UI-library combinations (shadcn/ui, Mantine, Ink, others). **No rule is encoded until checked against current docs.** Starting hypotheses to verify: shadcn/ui and Mantine both style React DOM components with different systems and can conflict on one page; Ink targets terminals, not the DOM.
- `metamorph://compat/frameworks`: PHP framework to Node target mappings (plain PHP, Laravel, Symfony) and Node/React version pairs.
- `metamorph://cloud/{target}`: AWS, Cloudflare, Kubernetes target notes.

## Hosting and deploy flow
Local: `npm run dev` (Studio connects, widgets on 3001). Production: `npm run build`, `start:prod`; deploy through Studio "Link to app, Deploy", GitHub auto-deploy, or zip from `nitrostack-cli pack`. CLI v1.1.2 has no `login` or `deploy` command even though cloud docs mention them [verified drift].

## Constraints
Official SDK only; deploy on NitroStack Cloud; ChatGPT connector cannot use API keys; cloud limits undocumented; no secrets in Git; repo public until judging; Node version split (20 for runtime, 22.19+ for Inspector v2 tests).

## Open technical questions [OWNER or spike]
Node 22 activation; tree-sitter PHP availability; where browser tests run; elicitation support in Studio; Infisical usage in generated projects.
