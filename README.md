# Metamorph MCP

Modernize legacy code, react to new CVEs, and score the result, from any MCP client.
Built for the NitroStack x Fronthyre "MCP to the Moon" buildathon (Enterprise AI track) with the official NitroStack TypeScript SDK.

> **Status: early build (Oct 30 2026).** Design docs are done; tools are being built. Nothing below is claimed to work until it is listed under "Working now".

## What it is
- **CVE-driven upgrades:** give a CVE or advisory, learn if your project is affected, get a ranked plan.
- **Evolve:** assess a legacy project (old Node/JS, PHP first) and plan a move to a modern, modular stack.
- **Build (later):** idea or spec in, modern scaffold out, using the same pipeline.
- **Scored:** every output is checked against MCP anti-patterns and the OWASP MCP Top 10.
- **Safe by design:** read-only by default, approval before any change, writes only into a throwaway sandbox.

## Working now
- Secret redaction utility (`src/common/redact.ts`) with unit tests.
- Server skeleton on the NitroStack SDK, builds and answers MCP requests.
- Design docs in `docs/` and `ARCHITECTURE.md` (scope, tools, threat model, test plan).

## Planned tools (design, not built yet)
- `assess_project`, `analyze_advisory`, `plan_modernization`, `preview_changes`, `apply_stage`, `verify_changes`, `score_mcp_design`, `generate_mcp_design`, `check_watch`.

## Run it locally
- Needs Node 20 and npm.
- `npm install`
- `npm run build`
- `npm test`
- `npm run dev` (MCP server plus widget server; connect NitroStack Studio to the project folder)

## Environment
- Copy `.env.example` to `.env`. Variable names are listed there; never commit real values.
- API keys for the hosted server are set as host environment variables (see `docs/SCHEMA.md`).

## Docs
- `ARCHITECTURE.md`, `docs/PRD.md`, `docs/TRD.md`, `docs/APP_FLOW.md`, `docs/DESIGN.md`, `docs/SCHEMA.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/THREAT_MODEL.md`, `docs/TEST_PLAN.md`.

## License
To be added before submission.
