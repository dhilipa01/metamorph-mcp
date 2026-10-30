# SCHEMA: Backend data model and auth architecture for Metamorph MCP

Version 1.0 draft, 2026-10-30. There is no database at first (see "State strategy"). Entities below are TypeScript/Zod shapes; they only become tables if spikes show a need. Items marked **[OWNER]** need confirmation; **[verify]** depends on a spike.

## State strategy [design, verify with S1/S2]
- The default protocol is stateless and NitroStack Cloud autoscales, so memory-only state would break between calls.
- `assessment_id` and `plan_id` are **signed self-contained tokens**: `base64url(payload).HMAC-SHA256(METAMORPH_TOKEN_SECRET)` with `iat`, `exp`, `kid`. Payload carries only what is needed to re-derive the object (source reference plus commit hash, goal, stage, key id), not the object itself.
- Re-derivation means rerunning analysis from the source. That is slower but needs no shared storage.
- **Sandbox files live on one instance's disk.** If the host runs several instances, a later call may hit a different instance. Spike S2 must test this; if it fails, apply stays disabled or sticky routing/object storage is added. MongoDB or PostgreSQL stay optional (notes: decide by problem).

## Entities

### ApiKey (configuration, not user data)
`id`, `label`, `key_hash` (SHA-256 via `ApiKeyModule.hashKey`), `scopes[]` (`read`|`plan`|`write`), `created_at`, `expires_at`, `revoked` (bool), `last_used_at`. Source of truth: environment or secrets manager (`API_KEY_*` prefix); hashed; never logged or returned. Plain keys are generated with `ApiKeyModule.generateKey('sk')` and shown once.

### Assessment
`id`, `source{type: repo_url, url, ref, commit}` (**repo URL only; uploads are cut**; the host has no `git`, so repos are fetched as an HTTPS archive and extracted), `stack{language, framework?, runtime_version?}`, `dependencies[{name, version, ecosystem, latest?, vulnerabilities[osv_id]}]`, `ui_libraries[{name, version}]`, `hosting_hints[]` (for example docker, serverless, vps), `architecture{style, modules[]}`, `findings[Finding]`, `score{overall 0-100, by_category}`, `created_at`.

### Finding
`id`, `category` (`security`|`dependencies`|`architecture`|`standards`|`cloud`|`mcp_design`), `severity` (`critical`|`high`|`medium`|`low`|`info`), `title`, `evidence{file, line?}`, `recommendation`, `owasp_mcp?` (MCP01..MCP10), `anti_pattern?` (1..10, from `../anti_patterns.md`).

### Advisory
`id`, `source_type` (`cve`|`ghsa`|`url`|`text`|`diff`), `source_hash` (hash of pasted text, not the text), `osv_ids[]`, `aliases[]`, `packages[{name, ecosystem, affected_ranges, fixed_versions[]}]`, `severity`, `confidence` (`high`|`medium`|`low`), `needs_confirmation` (bool, true when names were extracted from free text), `created_at`. Pasted text is untrusted data and is never executed or followed as instructions.

### Plan
`id`, `assessment_id`, `goal` (`patch_advisory`|`upgrade_runtime`|`migrate_stack`|`modularize`|`meet_standard`|`switch_cloud`|`build_from_spec`), `target_stack?`, `target_cloud?`, `stages[Stage]`, `conflicts[CompatConflict]`, `created_at`.

### Stage
`index`, `title`, `description`, `risk{level, reasons[]}`, `rollback`, `files_expected[]`, `tests_to_run[]`, `status` (`pending`|`previewed`|`approved`|`applied`|`verified`|`failed`).

### CompatRule (resource data, versioned in the repo)
`id`, `subject_a`, `subject_b`, `relation` (`conflict`|`compatible`|`requires_isolation`), `explanation`, `source_url`, `verified_on` (ISO date). **A rule without a source URL and date is not shipped.** Starting subjects: shadcn/ui, Mantine, Ink, plus framework pairs.

### SandboxRun
`id`, `plan_id`, `stage`, `workdir` (inside the sandbox root only), `started_at`, `expires_at`, `commands[{argv[], exit_code, duration_ms}]`, `build_status`, `test_status`, `artifacts[{path, size, sha256}]`.

### Report
`id`, `plan_id`, `before{metrics}`, `after{metrics}`, `score_before`, `score_after`, `definition_tokens{before, after?}`, `generated_at`, `notes[]`. Metrics: vulnerable packages, outdated packages, anti-pattern failures, OWASP gaps, tool definition tokens, tests passed and failed.

### AuditEvent
`id`, `ts` (ISO), `key_id`, `scope`, `tool`, `args_hash`, `outcome` (`ok`|`denied`|`error`), `duration_ms`, `error_code?`. **Decision (owner): audit events live in structured logs.** They are emitted through the SDK event system as JSON log lines; the `metamorph://audit/recent` resource shows a per-instance, best-effort in-memory buffer (not durable). Database persistence is an option, not part of this version: mention only.

## Auth architecture
| Item | Design |
|---|---|
| Method | API keys; `x-api-key` or `Authorization: Bearer` (`headerName: 'Authorization'`) |
| Validation | `customValidation` compares hash and attaches `context.auth = {subject, scopes}` |
| Roles | `read`, `plan`, `write` per key |
| Enforcement | Guard on every tool; annotations are hints only (the MCP spec calls them untrusted) |
| Rate limit | Per key via `@RateLimit` (docs and skill disagree on option names: check the real type) |
| Rotation | Generate new key, add, revoke old |

**Scope hierarchy:** cumulative. `write` includes `plan` includes `read`. Key issuance (owner decision): the owner generates keys with `ApiKeyModule.generateKey('sk')` and sets them as environment variables on the host; keys are shown once, never committed. Minimum set: an **owner/write key** (owner only), a **judge/read+plan key** (no write; given to reviewers through the submission form, not in the repo), and a **test key** for CI. Revoke judge and test keys after judging. Env-sourced keys cannot be revoked at runtime: revocation means removing the variable and redeploying.

### Tool to scope map
| Tool | Scope |
|---|---|
| `assess_project`, `analyze_advisory`, `score_mcp_design`, `generate_mcp_design`, `preview_changes`, `verify_changes`, resources | `read` |
| `plan_modernization` | `plan` |
| `apply_stage` | `write` (sandbox only, needs approval token) |

### Approval token (decided 2026-10-30: consent is bound to content, authority comes from the key)
- **The write key is the authority.** Holding it is what permits `apply_stage`.
- **The token only proves "this exact change was previewed".** Signed (HMAC-SHA256), bound to `plan_hash`, `patch_hash`, `stage` and expiry; **not bound to a key id** (preview runs on a read key, apply on a write key). Issued by `preview_changes`; expires in minutes.
- **Apply is one run-to-completion call and idempotent** on (`plan_hash`, `patch_hash`): a replayed token re-runs the same operation in a fresh temp directory and creates no new harm. "Single use" is dropped; replay is made harmless instead of prevented. Cost abuse is limited by per-call timeout, size caps and a best-effort per-instance rate limit.
- **Residual limits:** replay protection is weaker than a nonce store; each call re-fetches the repo; the call must fit the host timeout. Upgrade path if needed: a small MongoDB TTL collection for nonces behind the same function signatures.

## Sensitive data and handling
- Secrets: API keys (hashed), `METAMORPH_TOKEN_SECRET`. Never in Git, logs, outputs or sandbox artifacts.
- Redaction on every output and log for secret-like patterns found in scanned code (tokens, keys, `.env` values).
- Uploaded or cloned code is untrusted and temporary: sandbox TTL, directory deleted on expiry; no long-term storage of user source.
- No personal data is collected beyond a key label.

## Files and storage
Sandbox root `METAMORPH_SANDBOX_DIR`; per-run subdirectory; zip-slip checked; symlinks resolved with realpath and rejected if they leave the root; size caps (`METAMORPH_MAX_UPLOAD_MB`, `METAMORPH_MAX_REPO_MB`).

## Webhooks and events
No webhooks. Internal events: `tool.called`, `advisory.analyzed`, `plan.created`, `stage.applied`, `report.generated` via `emitEvent` / `@OnEvent` [verified SDK feature].

## API endpoints
MCP only (`/mcp`, plus `/mcp/health` per NitroStack docs [verify]). No separate REST API.

## Open questions [OWNER]
Who issues keys during the event; whether to persist audit events (database) or keep them in logs; where sandbox files may live if the host runs several instances (spike S2).
