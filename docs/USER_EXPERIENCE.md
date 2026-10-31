# User experience spec: choices, onboarding, caveats

Source: owner direction of 2026-10-31 plus decisions already in PLAN_V2.md and EXECUTION_PLAN.md. Nothing here is a new feature idea; items marked OPEN are decisions still to make. Build to this document; if code and this document disagree, fix one of them.

## 1. Who and what
Teams that own legacy PHP or Node apps (mostly private repos) and need to know what matters first, apply safe fixes, and show proof. Metamorph is worth using only where it combines triage, verified fixes, one-call workflow and a forwardable report; plain version bumps lose to Dependabot/Renovate (see EXECUTION_PLAN section L).

## 2. Value order (build and demo in this order)
1. **Triage across everything**: dependencies, runtime end-of-life dates, code risks, secrets, Docker/CI. Ranked by whether a flaw is being exploited now (CISA known-exploited list) and how likely it is (EPSS), then severity; not by raw count.
   - Build status: the data fields exist on findings (kev, epss, cvss, cwe, owasp). The ranking is built (src/modules/assessment/rank.ts): known-exploited first, then severity, then EPSS, with a `rankReason` on each finding, used by assess_project, plan_modernization and the report.
2. **A fix that was verified** (runner result, not projection).
3. **One call from the AI client**, one approval, ending in a branch pull request (merge stays manual).
4. **A report to forward**: always PDF, SARIF and SBOM together (no format choice), each with a signed 10 minute download link and a widget with download buttons.
5. **Ongoing watch** of new advisories for the user's stack.

## 3. Choices the user always has
- **What to run**: assess only (read), plan, preview a stage, apply a stage, or the whole sequence. Existing goal options: `patch_advisory` (dependency fixes only), `upgrade_runtime`, `modernize_all`.
- **Stage by stage**: every automated stage is previewed as a diff before anything is applied; approval is explicit per stage (signed token, 300s).
- **Where the fix goes**: Metamorph never edits the user's repo directly. The user gets a patch to apply themselves, or (once the GitHub connector exists) a pull request on a branch. Merging is always manual and the PR text says so.
- **Verified or projected**: results say which. Projected = estimate on a temporary copy; verified = measured by tools in the isolated runner.
- **Integration mode** (EXECUTION_PLAN section G): artifact mode (Metamorph returns the ticket, PR text or message payload; the user's own client MCP submits it) or direct mode (Metamorph calls the provider using the credentials the user connected).
- **Which repos Metamorph can read**: public repos by URL; private repos only through a GitHub App installation where the customer picks the repos. Read-only for assessment; write only to the pull-request branch.

## 4. Scope statement (README must say)
- Core: upgrade, not rewrite. Examples: PHP 7.4 to 8.4, Node 14 to 22, with dependency and code fixes, verified by the runner (Rector for PHP upgrades; Node upgrades through engines/dependencies/CI).
- PHP to Node (language conversion) is out of scope. IBM Cloud is out of scope.
- Supported sources today: public GitHub repositories. Private repositories require the GitHub App (in build). Other hosts (GitLab, Bitbucket): OPEN, not planned.

## 5. Onboarding (target: under 5 minutes, unaided)
README quickstart in this order: get a Metamorph key (scope explained: read, plan, write) -> connect the MCP client (URL ends in `/mcp`, Bearer key) -> first call `assess_project` on a repo -> read the result -> plan -> preview -> approve -> apply. Each step shows the expected output. Errors always say the next step (existing examples: missing `/mcp` -> `Cannot POST /`; wrong key -> 401; low scope -> 403; invalid token -> "Call preview_changes again and pass its approvalToken unchanged"). The test is a person who did not build it finishing the quickstart in 5 minutes; record where they get stuck.
OPEN: how a new user obtains a key (the owner issues keys today).

## 6. Honest failure behaviour (each needs a defined message and a test)
| Situation | Required behaviour |
|---|---|
| Large repo or monorepo | Stop at the existing size/file limits, say which limit was hit and suggest the `subfolder` option; never silently assess part of it. Implemented for projects: manifests up to 3 levels deep, at most 5 assessed, the rest and the ignored ones named in `notes`; no manifest at the root is stated, and the planning/report tools refuse to act on an empty root |
| No lockfile | Say versions are approximate (already flagged in the assessment) and that verification is weaker. Implemented: such findings are marked `(version range, no lockfile)`, flagged low confidence and count at half weight in the score |
| No tests | Report "unverified: no tests found". Never show a green check or a verified label |
| Flaky tests | Rerun once; if results differ, report "flaky" with both outcomes; never count as pass |
| Runner timeout | Report the timeout, which checks finished, and the run id so the user can resume or fetch the result |
| Feed or scanner unavailable | Name it as unavailable in the result; the rest still returns (already how `check_watch` works). The OSV check has a 60 s budget: it returns what it has and states "Checked X of Y dependencies" with the unchecked production/dev counts |
| Patch fails to apply or build fails after patch | Say so, show the failing step, return no success label |
| Invalid input (missing field, wrong type, too short or long, bad enum, too many items) | One message in the shape `Invalid input for <tool>: <field> <problem>. Next step: <fix, taken from the field description>. Example: <the tool's example request>`, at most 700 characters, never containing the offending value (only its type name), because the value may be a secret or an injection attempt. The caller is authenticated first: no key gives 401 and a read key on a write tool gives 403 before any input message. Implemented in `src/common/input-validation.ts` (formatter, same zod schema as the published JSON Schema), `src/common/validated-tool.ts` (the `Tool` decorator every tool uses) and `src/common/sdk-validation.ts` (lets the MCP SDK's own schema failure through to the tool). Tests: `tests/unit/input-validation.test.ts`, conformance `invalid-input/*` and `auth/401-before-input-error` |
| Secrets found | Show key names and file paths only, never values; list the rotation and history-purge steps (already built for committed env files). Secrets in source (AWS key id, private key block, GitHub token) show file:line and the key type only |

## 7. Caveats that must appear in output or README
- A score of 100 means nothing our checks detect, not "modern" or "secure".
- Projected numbers are estimates; only runner results are measured.
- There are two scores and they cover different things: the static assessment score (repository files, hosting checks, OSV advisories) and the measured score (what the runner tools reported, deduplicated across tools, labelled "measured by runner tools"). `verify_patch` and the report's Verification section show the measured baseline and patched score when both runs completed; a good measured score never means "verified".
- Runner findings are ranked like the static ones: known-exploited (CISA KEV) first, then severity, then EPSS, looked up once per distinct CVE id after deduplication. If KEV or EPSS cannot be reached the finding keeps the rest of its ranking data, the feed is named as unavailable in the report sources and in `verify_patch`'s `measured.feeds`, and nothing fails. `verify_patch` does this lookup after the runs finish, capped at 8 seconds.
- AWS is never contacted by the report unless `include_cloud` is true. Then the report gets a separate section "Cloud inventory (AWS, read-only)" (counts per service, ranked findings, what was not checked with AWS error codes, scan limits) and the SARIF file gets results with a logical location (resource and region, no file) and `properties.sources: ["aws-readonly"]`. These findings are never part of the repository score, counts or findings list. If AWS is not set up the section says only that a cloud scan was requested but is not configured, and the report is generated as usual. The whole cloud step is capped at 45 seconds.
- Removing a committed `.env` from the repo does not remove the secret from git history; rotate every secret.
- Findings for which no automated fix exists are guidance only.
- Results depend on advisory data (OSV and feeds) available at the time of the call; each result carries source and fetch time where built.

## 8. What counts as ready
As in EXECUTION_PLAN section L: acceptance demo on 3 repos we did not write (1 private through the GitHub App), verified-fix PR passes build and tests or states why not, quality-harness report published, unaided 5-minute onboarding, README claims equal measured results.
