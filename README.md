# Metamorph MCP

MCP server that looks at a legacy repo, scores it, plans a staged upgrade, shows the exact diff, and (after explicit approval) builds the patch in a throwaway sandbox with a before/after score. Your repo is never modified. Built with the NitroStack TypeScript SDK for the NitroStack buildathon, Enterprise AI track.

## Hero flow
- Legacy repo URL (public GitHub, optional subfolder)
- `assess_project`: score out of 100 plus findings (score-dashboard widget)
- `plan_modernization`: ordered stages with risk, steps, rollback, projected score
- `preview_changes`: files touched plus unified diff, and a short-lived approval token
- `apply_stage`: needs the token and a write key; patches a throwaway copy, returns the patch plus a PROJECTED before/after score
- You run `git apply` yourself, then `assess_project` again to confirm

## Tools (all live)
| Tool | Scope | What it does |
|---|---|---|
| `analyze_advisory` | read | Checks advisory ids (up to 10) or installed packages (`ecosystem:name@version`, up to 50) against OSV. Says if affected and the fixed version |
| `assess_project` | read | Scans a public GitHub repo (Node or PHP), returns a 0-100 score, findings by severity and category. Renders the score dashboard widget |
| `plan_modernization` | plan | Staged plan for goal `patch_advisory`, `upgrade_runtime` or `modernize_all`. Some stages automated, others guided. Widget |
| `preview_changes` | read | Read-only. File list and diff for one stage, plus `approvalToken` (guided stages return steps, not a diff) |
| `generate_report` | read | Always produces three files, no options: PDF, SARIF 2.1.0 and CycloneDX 1.5 SBOM. Returns a signed download link per file (valid 10 minutes), score, counts and page count. Widget with download buttons |
| `apply_stage` | write | Verifies the token, applies the stage to a temp copy, re-scans it, returns patch plus projected score. Widget |

## Security model
- Scopes are cumulative: `read` < `plan` < `write`. Every tool has a guard. Only `apply_stage` needs `write`
- API keys: Bearer header, server stores only the SHA-256 hash, constant-time compare. 401 for missing/wrong key, 403 for low scope
- Approval token: HMAC-SHA256, bound to plan hash + patch hash + stage, TTL 300s (default; max 900s allowed in code), secret from `METAMORPH_TOKEN_SECRET` (32+ chars). Changed patch, other stage, expired or forged token is refused
- If the secret is not set, `apply_stage` refuses everything
- Replay inside the TTL is accepted on purpose: apply is idempotent on the hashes and runs in a fresh temp dir. Single-use is not claimed
- No repo code execution: the repo is fetched as an archive and only read and parsed. Nothing from it is installed, built or run
- Sandbox: per-run temp dir, path containment, archive checks (zip-slip, size caps). The user's repo is never touched; the patch is returned for you to apply
- Redaction: outputs and logs pass through `src/common/redact.ts`
- Tool input schemas carry `.max()` limits on every string and array
- Full analysis: `docs/THREAT_MODEL.md` (OWASP MCP Top 10 mapping), `SECURITY.md`

## Results (live deployed server, demo repo `dhilipa01/metamorph-demo-legacy`)
- `php-shop`: score 17 before, 11 findings. Two come from known-vulnerable dependencies (guzzle, symfony/http-kernel, high severity, 12 points each); the rest are runtime end-of-life and risky PHP code patterns (fixed deductions: critical 25, high 12, medium 5, low 2)
- `php-shop` after `apply_stage` `patch-dependencies`: projected 41 (+24). Fixes those two dependency advisories (2 x 12 = +24); this is a projection on the sandbox copy, not a change to your repo
- `php-shop-modernized`: 100. The cleaned-up reference version has no findings, so nothing is deducted
- `node-orders`: 43. Node sample with remaining findings; the per-finding breakdown is in the `assess_project` output
- 391 unit tests pass
- Scoring rule: start at 100, subtract a fixed weight per finding by severity, floor at 0

## Roadmap (designed, NOT built)
- PHP to Node mapping
- Cloud skeletons (AWS, Cloudflare, Kubernetes)
- Build mode (idea or spec in, modern scaffold out)
- CVE watch (`check_watch`)
- Also only designed: `verify_changes`, `score_mcp_design`, `generate_mcp_design`
- See `docs/PRD.md` and `ARCHITECTURE.md` for the designs

## Run locally
- Node 20 and npm
- `npm install`
- `npm run build`
- `npm test` (vitest)
- `npm run dev` starts the MCP server plus the widget server. Ports 3001 and 3002 must be free
- Copy `.env.example` to `.env`. For local calls without a key set `METAMORPH_AUTH=off` (local only, never on a host)
- To test approvals set `METAMORPH_TOKEN_SECRET` (32+ chars) and a key: `METAMORPH_KEY_OWNER=write:<sha256 hex of your key>`
- Report download links (`generate_report`) are `GET /reports/<id>.<pdf|sarif|cdx.json>?t=<token>` on the same HTTP server as `/mcp`, so they need `MCP_TRANSPORT_TYPE=http` or `dual` and `METAMORPH_TOKEN_SECRET` (32+ chars). Set `METAMORPH_PUBLIC_URL` (for example `https://metamorph.example.com`) to get absolute, clickable links; without it the tool returns relative paths. The token is an HMAC bound to report id, file type, the id of the requesting API key and a 10 minute expiry. The key id is the first 12 hex characters of a SHA-256 over the stored key hash (or `anon` when `METAMORPH_AUTH=off`); the plain key and its hash never appear in a token or log. The report cache records which key id created each report and the route refuses a link whose key id disagrees, so one key's link cannot open another key's report. The link is still a bearer capability: anyone who holds the URL can download that one file for 10 minutes, because a browser click cannot send an API key. The `metamorph://report/<id>` MCP resources are not key-bound. Reports live in memory of one server instance, so after expiry or a restart the link answers 404 and you run `generate_report` again
- Never commit `.env`

## Connect
- Transport: Streamable HTTP
- URL: your deployment host plus `/mcp` (path must end with `/mcp`; `Cannot POST /` means it does not)
- Auth: `Authorization: Bearer <your key>`. Use `<YOUR_API_KEY>` as the placeholder; keys are created by the operator and shown once
- Studio: Add Server, Other Project, HTTP, paste URL, Bearer token
- Health check: `GET /mcp/health` returns 200

## Docs
- `ARCHITECTURE.md`, `docs/PRD.md`, `docs/TRD.md`, `docs/APP_FLOW.md`, `docs/DESIGN.md`, `docs/SCHEMA.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/THREAT_MODEL.md`, `docs/TEST_PLAN.md`
- `DEMO.md`: timed demo script

## License
To be added.
