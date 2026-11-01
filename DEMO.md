# DEMO: Metamorph MCP (2:50, recorded in NitroStudio)

Rules for this script
- Only things labelled LIVE in `docs/EVIDENCE.md` are shown as working. `apply_stage` is PROJECTED and is said out loud as "projected".
- `verify_patch` is NOT in the main script (FIXTURE: never called live through the deployed server). Optional insert only if the owner confirms it live in Studio (marked IF CONFIRMED).
- The report widget view is not yet confirmed inside NitroStudio. The script works either way: the tool result shows the three download links.
- Demo repo (authored by us): `https://github.com/dhilipa01/metamorph-demo-legacy`, subfolder `php-shop`. Second repo (not ours): `silexphp/Silex`, pinned in `eval/corpus.json`.
- Numbers below were measured on 2026-11-01 against a local build of this branch with live OSV/KEV/EPSS data (php-shop 17, projected 41, Silex 0). Feeds change; re-check on the day and say what the screen shows.

Time budget: 12 + 28 + 20 + 30 + 20 + 20 + 20 + 20 = 170 s (2:50).

## Pre-flight checklist
- [ ] NitroCloud dashboard, app `metamorph`: latest deployment is Live
- [ ] `curl -s -o /dev/null -w "%{http_code}\n" https://metamorph-6ae4a33e-dhilipan-sankar-fronthyre.app.nitrocloud.ai/mcp/health` prints 200
- [ ] `METAMORPH_URL=https://metamorph-6ae4a33e-dhilipan-sankar-fronthyre.app.nitrocloud.ai METAMORPH_KEY=<write key> scripts/smoke.sh` ends with `OVERALL: PASS` (key stays in the shell, never on screen)
- [ ] Host env has `METAMORPH_TOKEN_SECRET` (32+ chars) and `METAMORPH_PUBLIC_URL` set to the deployed origin, so the preview returns a token and report links are clickable
- [ ] Studio server URL ends in `/mcp`; Authentication is Bearer; two server entries added: one with the write key, one with a read key (for the 403 in beat 7)
- [ ] Ports 3001 and 3002 free if any local Studio project is open: `ss -ltnp | grep -E ":(3001|3002)"`
- [ ] Theme chosen (light or dark) and checked once on the widget; window large, font readable, notifications off, no key or secret visible in any panel
- [ ] Dry run once. The approval token lives 300 s: do beats 4 and 5 back to back
- [ ] Download links last 10 minutes: click the PDF link within that time and have the PDF viewer ready
- [ ] Have these pre-run results in a second tab as fallback screenshots: assess php-shop, preview diff, apply result, report links

## Beat 1: Problem (0:00-0:12)
- On screen: Studio with the Metamorph server connected, tool list visible (9 tools).
- Tool call: none.
- Say: "Old PHP and Node apps carry known-vulnerable packages and dead runtimes. Nobody wants to touch them blind. Metamorph is an MCP server that assesses a repo, plans the upgrade, and shows the exact diff before anything changes."
- Expected: tool list shows `assess_project`, `plan_modernization`, `preview_changes`, `apply_stage`, `generate_report` and the rest.
- Fallback: if the list is empty, the URL is missing `/mcp` or the key is wrong. Re-enter and Retry.

## Beat 2: Connect and assess a real repo (0:12-0:40)
- On screen: `assess_project` call, then the result and the score widget.
- Tool call:
```json
{ "repo_url": "https://github.com/dhilipa01/metamorph-demo-legacy", "subfolder": "php-shop" }
```
- Say: "One URL, one Bearer key, no install. I point it at a public repo, a small PHP shop we built with planted problems. Score 17 out of 100, six high findings: PHP 7.2 is out of security support, the old mysql API, SQL built from request input, two vulnerable packages. Nothing from the repo was run; it was read as an archive."
- Then, second repo (not ours, from the 20-repo test set): call `assess_project` with
```json
{ "repo_url": "https://github.com/silexphp/Silex" }
```
- Say: "Same tool on an archived framework we did not write: score 0, three projects found, and it says plainly that the dependency versions are guessed because there is no lockfile."
- Expected: php-shop score 17, stack php, top finding `symfony/http-kernel@4.4.0 has 2 known advisories (urgent)`. Silex: score 0, note "Found 3 projects" and "no lockfile ... half weight". Each takes a few seconds (OSV round trips).
- Fallback: if the call is slow or fails, show the pre-run screenshot and say "this one is pre-run". If the repo download fails, use the other repo.

## Beat 3: Triage, ranked by exploited-now data (0:40-1:00)
- On screen: the findings list with its ranking reason, then a `check_watch` result.
- Tool call:
```json
{ "cve_ids": ["CVE-2021-44228"], "products": ["php@8.1"] }
```
- Say: "Findings are ranked known-exploited first, then severity, then exploit probability, and each shows why. For this shop none of the packages are on the CISA known-exploited list, and the EPSS scores are low, 0.03 and 0.02, so it says that honestly. To show what a hit looks like, here is Log4Shell: on the CISA list, used by ransomware, EPSS 0.99999. And PHP 8.1 is already end of life since 2025-12-31."
- Expected: `kevHits` has CVE-2021-44228 (dateAdded 2021-12-10, ransomware true), `epss` 0.99999, `eol` php 8.1 isEol true, `unavailable` empty.
- Fallback: if a feed is down, the result lists it under `unavailable`; say so and move on. Do not claim a hit that is not on screen.

## Beat 4: Plan, preview diff, approval token (1:00-1:30)
- On screen: plan widget with the stage, then the diff and the token field.
- Tool calls:
```json
plan_modernization: { "repo_url": "https://github.com/dhilipa01/metamorph-demo-legacy", "subfolder": "php-shop", "goal": "patch_advisory" }
preview_changes:    { "repo_url": "https://github.com/dhilipa01/metamorph-demo-legacy", "subfolder": "php-shop", "stage": "patch-dependencies", "goal": "patch_advisory" }
```
- Say: "The plan is ordered stages with risk and rollback. I preview the first one: the exact diff, bumping guzzle and symfony http-kernel in composer.json. Nothing is applied yet. The preview hands back a signed approval token, valid five minutes, tied to this plan, this patch and this stage."
- Expected: plan shows `patch-dependencies`, automated, projected 17 to 41. Preview: one file, `composer.json`, guzzle 6.5.0 to 8.0.1, http-kernel 4.4.0 to 6.2.6, `expiresInSeconds` 300.
- Fallback: use the same `goal` in both calls. If `patch-dependencies` is not in the plan, use the stage id the plan shows. If preview returns no token, the host lacks `METAMORPH_TOKEN_SECRET`: stop and fix before recording.

## Beat 5: Apply, said as "projected" (1:30-1:50)
- On screen: `apply_stage` result and the before/after score.
- Tool call (write key; paste the real token from beat 4, do not linger on it):
```json
{ "repo_url": "https://github.com/dhilipa01/metamorph-demo-legacy", "subfolder": "php-shop", "stage": "patch-dependencies", "goal": "patch_advisory", "approval_token": "<approvalToken from preview_changes>" }
```
- Say: "Apply, with a write key. It patches a throwaway copy, never my repo. Score goes from 17 to 41, and the two dependency advisories are gone. That number is projected, an estimate from our own code, not a measured build. I take the patch, run git apply, and assess again to confirm."
- Expected: `mode: projected`, `scoreBefore` 17, `scoreAfter` 41, `scoreDelta` 24, `findingsFixed` the two dependencies, a patch and `howToApply` steps.
- Fallback: "token expired" means more than 300 s passed: rerun preview and apply at once. A 403 means the wrong server entry (read key) is selected.
- IF CONFIRMED (owner has run it live in Studio): add 20 s on `verify_patch` with the same arguments to show a measured baseline and patched run. Otherwise skip it and say nothing about verification beyond "projected".

## Beat 6: Report with a download link (1:50-2:10)
- On screen: `generate_report` result with three links; click the PDF link, show a page.
- Tool call:
```json
{ "repo_url": "https://github.com/dhilipa01/metamorph-demo-legacy", "subfolder": "php-shop" }
```
- Say: "One call gives a PDF, a SARIF file for code scanning and a CycloneDX SBOM, each with a signed link valid ten minutes. This is the thing you forward to your manager."
- Expected: 3 files (PDF about 7 pages, SARIF, SBOM), `expiresInMinutes` 10; the PDF opens from the link. If the report widget view renders (IF CONFIRMED in Studio) show its download buttons; if it shows an unrecognised-result card, ignore it and use the links in the result text.
- Fallback: a 404 on the link means it expired or the server restarted: rerun the tool. A relative link means `METAMORPH_PUBLIC_URL` is not set.

## Beat 7: Security moment (2:10-2:30)
- On screen: two refusals.
- Tool call 1, `apply_stage` with a fake token (write key):
```json
{ "repo_url": "https://github.com/dhilipa01/metamorph-demo-legacy", "subfolder": "php-shop", "stage": "patch-dependencies", "goal": "patch_advisory", "approval_token": "bogus.token" }
```
- Tool call 2: same arguments, but on the server entry that uses the read key.
- Say: "A made-up token is refused: real ones are signed, bound to the patch, and expire. And a read-only key cannot call apply at all, the server answers 403 whatever the model says. The repo is only ever read; nothing from it is executed on the server."
- Expected: call 1: "Invalid approval token. Call preview_changes again and pass its approvalToken unchanged." Call 2: `This tool needs "write" scope but this key has "read"` (exact wording from the code; the 403 text with a read key is covered by tests, run it once in rehearsal).
- Fallback: if no read-key entry is set up, drop call 2 and say "scopes are read, plan, write; only apply and verify need write".

## Beat 8: Honest limits and roadmap (2:30-2:50)
- On screen: README section "What is real and what is not", then the roadmap list.
- Tool call: none.
- Say: "What is real: assessment, planning, previews and reports run on live data. Apply is a projection. The build-and-test runner works on GitHub, but is not yet wired live through this server. The AWS scan is tested against an emulator, not a real account. Not built: pull requests, tickets, notifications, private repos, prompts and elicitation. Metamorph: assess, plan, preview, approve, apply, report."
- Expected: the EVIDENCE table is readable on screen.
- Fallback: if the README does not render, read the same list from `docs/EVIDENCE.md`.

## If something goes wrong live
- `Cannot POST /`: URL missing `/mcp`
- 401: key wrong or missing; 403: scope too low (apply needs write)
- Token expired: run preview again and apply within 300 s
- Report link 404: expired (10 min) or server restarted; rerun `generate_report`
- Slow tool (more than 20 s): say "this is live data from OSV", wait up to 60 s, otherwise cut to the pre-run screenshot and say it is pre-run
- "Waiting for widget server" (local only): free ports 3001 and 3002 and retry

## Rehearsal checklist (target total 2:50, hard limit 3:00)
- [ ] Run 1, no recording: note the time of each beat against the budget (12 / 28 / 20 / 30 / 20 / 20 / 20 / 20 s)
- [ ] Run 2, recording: hit every budget within 3 s; if beat 2 runs over, drop the Silex call and say it in one sentence over a pre-run screenshot
- [ ] Beats 4 and 5 happen inside 300 s: measure the gap
- [ ] The PDF opens from the link in under 10 minutes of generation
- [ ] Both refusals show readable text
- [ ] No key, token or secret visible in any frame (pause and check the preview token in beat 4)
- [ ] Say "projected" out loud in beat 5 and name the limits in beat 8
- [ ] Owner confirms before recording: report widget view in Studio (yes/no), `verify_patch` live (yes/no); the matching IF CONFIRMED lines stay out of the script if either is no
