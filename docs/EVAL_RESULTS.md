# EVAL_RESULTS: Metamorph MCP quality harness

Measured results of the first three layers of the quality harness (docs/EXECUTION_PLAN.md section K). Bad numbers are reported as bad. Regenerate: `npm run conformance`, `npx vitest run ground-truth` (also part of `npm test`), `npm run eval` (network, not part of `npm test`).

## 1. Protocol and conformance (`npm run conformance`)

Pinned MCP Inspector CLI 0.17.2, stdio, against the built server (`dist/index.js`). Offline: a test-only preload (`scripts/conformance-preload.mjs`) stubs `fetch` inside the server process (local fixture tarball for the repo, fake OSV advisory). Auth-on checks use runtime-generated keys; stdio has no HTTP headers, so the key is sent in `_meta.authorization`, which the SDK bridges to the guard. Result of the last run: 22 pass, 9 known gaps, 0 fail (31 checks). A known gap is printed on every run and does not fail the build; a gap that starts passing is reported as FIXED so the entry gets removed.

Known gaps (real defects in the server, not harness problems):

| Check | Measured | Why it matters |
|---|---|---|
| `tools/annotations` | 0 of 7 tools carry annotations | The SDK supports `annotations` (`ToolAnnotations` in `@nitrostack/core`); no Metamorph tool sets them, so clients cannot tell read-only tools from the write tool |
| `invalid-input/schema:*` (7 tools) | Wrong-type input returns `Input validation error: Invalid arguments for tool X: data/repo_url must be string` | The SDK's schema error names no next step. Errors raised by our own code (for example an invalid repo URL) do name it and pass |
| `output-size:generate_report` | 24,353 characters (about 6,100 tokens) for `formats: ["sarif"]` on a 10-file fixture | The tool embeds the whole SARIF document in the result; the budget is 20,000 characters. Returning only the resource URI would fix it. Other tools on the same fixture: `assess_project` 11,415 characters (about 2,850 tokens, large for a 10-file repo), `plan_modernization` 10,669, `preview_changes` 2,328, `analyze_advisory` 812; all within budget |

Passing: 7 tools (limit 15); every tool has a description and an object input schema; every string has `maxLength` and every array `maxItems`; maximum nesting depth 1 (limit 2); 401 for no key and for a wrong key, 403 for a read key on `apply_stage`, and the messages name the next step; a read key passes the guard on a read tool; a write key passes the guard; no key or key hash appears in any result.

Not covered by this layer: `check_watch` output size (feeds are stubbed offline), `apply_stage` with a valid approval token, the HTTP transport (real headers), tool-description drift (SEC-04). The output budget (20,000 characters) is our own choice, not a standard.

## 2. Ground truth (`tests/eval/ground-truth.test.ts`)

71 planted problems, each in its own small project, run through the real `assessFull` with an injected offline advisory feed (invented advisory ids, no network). 6 clean fixtures must produce zero findings. Recall is per rule: planted found / planted. A planted problem counts as found only if the finding carries the right rule id, the right file (and line for PHP smells), and for dependencies the right fixed version in the proposed fix.

| Rule | Planted | Found | Recall |
|---|---|---|---|
| php-mysql-removed-api | 3 | 3 | 1.00 |
| php-sql-concatenation | 4 | 4 | 1.00 |
| php-eval | 3 | 3 | 1.00 |
| php-weak-password-hash | 3 | 2 | **0.67** |
| php-unserialize-input | 2 | 2 | 1.00 |
| php-dynamic-include | 3 | 3 | 1.00 |
| php-extract-input | 2 | 2 | 1.00 |
| php-errors-hidden | 3 | 3 | 1.00 |
| php-inline-html-mixed | 1 | 1 | 1.00 |
| composer-missing, composer-no-lock, php-approximate-versions, php-unpinned-version | 1 each | 1 each | 1.00 |
| php-version-eol | 5 | 5 | 1.00 |
| node-runtime-eol | 6 | 6 | 1.00 |
| node-runtime-unpinned, node-no-lockfile, node-approximate-versions, node-commonjs, ui-multiple-systems | 1 each | 1 each | 1.00 |
| node-deprecated-package | 3 | 3 | 1.00 |
| node-no-tests | 2 | 2 | 1.00 |
| env-file-committed | 4 | 4 | 1.00 |
| docker-base-image-eol | 2 | 2 | 1.00 |
| docker-latest-tag | 2 | 2 | 1.00 |
| docker-runs-as-root, no-container-packaging, no-ci | 1 each | 1 each | 1.00 |
| dep-vulnerable (npm lockfile, npm range, npm dev, Packagist lock, Packagist exact pin) | 7 | 7 | 1.00 |
| hardcoded-secret-in-source (no such rule) | 2 | 0 | **0.00** |
| ci-risky-workflow (no such rule) | 2 | 0 | **0.00** |

Overall: 66 of 71 planted problems found (93%). The 5 misses are 1 weak-password-hash spelling, 2 hard-coded secrets and 2 risky CI workflows. False positives: 1 on 6 clean fixtures.

Known gaps (the tests for these run as `it.fails`: they pass while the gap exists and fail the day it is fixed, which forces this list to be updated):
1. **php-weak-password-hash misses `md5($_POST['pwd'])`.** The rule requires the text "pass" on the same line, so any other variable name (`$pwd`, `$secret`, `$pw`) is missed.
2. **php-mysql-removed-api false positive on a method definition.** `public function mysql_query_count(): int` is reported as a use of the removed `mysql_*` API. The lookbehind excludes `->`, `::`, `$` and word characters but not the `function ` keyword, so compatibility shims that define such names are flagged.
3. **No rule for secrets in source** (AWS-style access key, private key literal): 0 of 2 found. The only secret check is a committed `.env`.
4. **No rule for risky CI content** (`pull_request_target` with a PR-head checkout, actions on a moving branch): 0 of 2 found. The only CI checks are "no CI config found" and the Docker rules.

Clean fixtures with zero findings (passing): the modern PHP shop, a modern Node service, a PHP 8.4 file full of comments and strings that mention `mysql_query($_GET)`, `md5($password)`, `extract($_POST)` and the dynamic-code function, safe lookalikes (`$this->mysql_query()`, a static method with the dynamic-code name, `password_hash`, `unserialize(file_get_contents())`), a repo with GitLab CI, a digest-pinned multi-stage Dockerfile and env templates (`.env.example`, `.sample`, `.template`, `.dist`), and a Node 24 repo with Jenkins. The fixed versions of the planted dependencies produce no `dep-vulnerable` finding.

Limits of this layer: the fixtures are written by the same people who wrote the rules, so recall 1.00 shows the rules do what they say, not that they find what real code contains (that is what the corpus below is for). Advisory data here is invented; real OSV matching is only exercised in the corpus run.

## 3. Real-world corpus (`npm run eval`)

<!-- corpus:start -->
Run date 2026-10-31, Metamorph commit 26524fac417c, Node v20.20.2. Live OSV, EPSS and endoflife.date feeds (no stubs). Corpus: eval/corpus.json (20 repositories, pinned to full commit shas).

Summary: {"total":20,"assessed":20,"skippedOverLimit":0,"errors":0,"medianScore":59,"minScore":0,"maxScore":96,"withLockfileCrossCheck":7,"wallSecondsTotal":314,"maxPeakRssMiB":125}

| Repo | Kind | Size KB | Stack | Score | Findings crit/high/med/low/info | Deps total/vulnerable | Independent audit (lockfile repos) | Seconds | Peak RSS MiB | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| silexphp/Silex | php | 3661 | php | 0 | 4/5/4/4/1 | 31/13 | no lockfile | 20.3 | 98 | score 0 |
| zendframework/ZendSkeletonApplication | php | 2954 | php | 79 | 0/1/1/2/1 | 4/0 | no lockfile | 5.2 | 99 |  |
| BootstrapCMS/CMS | php | 7420 | mixed | 26 | 1/3/1/4/2 | 19/2 | composer 2 direct / 17 all | 19.3 | 108 |  |
| kohana/kohana | php | 1244 | php | 77 | 0/1/1/3/2 | 2/1 | no lockfile | 4.9 | 100 |  |
| Hifone/Hifone | php | 3691 | mixed | 2 | 1/4/3/5/1 | 41/6 | composer 4 direct / 17 all | 59.4 | 110 |  |
| codecasts/spa-starter-kit | php | 1136 | php | 79 | 0/1/1/2/0 | 0/0 | no lockfile | 7.2 | 102 | no dependencies found at the repo root: manifests may be in subfolders, so this score may be false comfort |
| wardrobecms/wardrobe-archived | php | 594 | php | 64 | 1/0/1/3/1 | 2/1 | no lockfile | 4.5 | 100 |  |
| iwind/rockmongo | php | 486 | php | 79 | 0/1/1/2/1 | 0/0 | no lockfile | 1.7 | 97 | no dependencies found at the repo root: manifests may be in subfolders, so this score may be false comfort |
| top-think/thinkphp | php | 9433 | php | 31 | 0/4/3/3/1 | 0/0 | no lockfile | 6.6 | 125 | no dependencies found at the repo root: manifests may be in subfolders, so this score may be false comfort |
| gimler/symfony-rest-edition | php | 952 | php | 59 | 1/1/0/2/1 | 17/1 | composer 1 direct / 4 all | 12.6 | 105 |  |
| etsy/morgue | php | 1830 | php | 40 | 1/2/1/3/2 | 4/3 | no lockfile | 13.4 | 112 |  |
| jedireza/aqua | node | 4060 | node | 0 | 2/5/5/2/0 | 65/12 | npm 12 own (+0 via children) / 45 all | 31.5 | 107 | score 0; only 50 of 65 deps checked (cap); npm audit flags 2 direct package(s) we did not: lodash, moment |
| RickWong/react-isomorphic-starterkit | node | 184 | node | 30 | 1/2/3/3/2 | 33/3 | no lockfile | 20.2 | 98 |  |
| Cretezy/Noderize | node | 1471 | node | 87 | 0/0/1/4/1 | 1/0 | no lockfile | 9.5 | 101 |  |
| nodesource/npmsearch | node | 813 | node | 77 | 0/0/3/4/1 | 9/1 | no lockfile | 9.1 | 99 |  |
| lvarayut/relay-fullstack | node | 1615 | node | 32 | 1/2/3/2/2 | 51/4 | npm 4 own (+22 via children) / 301 all | 32.2 | 103 | only 50 of 51 deps checked (cap) |
| vesparny/fair-analytics | node | 227 | node | 42 | 0/2/6/2/2 | 27/5 | npm 3 own (+3 via children) / 53 all | 18.0 | 99 |  |
| justadudewhohacks/websocket-chat | node | 1383 | node | 70 | 0/1/2/4/0 | 19/3 | npm 3 own (+9 via children) / 170 all | 14.8 | 100 |  |
| themeteorchef/base | node | 3367 | node | 50 | 0/2/4/3/1 | 22/5 | no lockfile | 14.5 | 110 |  |
| deepsyx/home-automation | node | 4273 | unknown | 96 | 0/0/0/2/0 | 0/0 | no lockfile | 8.6 | 104 | stack not detected; no dependencies found at the repo root: manifests may be in subfolders, so this score may be false comfort |

<!-- corpus:end -->

What the run shows (written by hand from `eval/results/2026-10-31.json`; the table above is generated). Columns: severities are critical/high/medium/low/info; "Deps total/vulnerable" counts direct dependencies, of which at most 50 are checked; "Seconds" is download plus extraction plus assessment; peak RSS is the whole child process (Node baseline about 50 MiB).

- **Totals:** 20 of 20 repositories assessed, 0 skipped for extraction limits (the largest, thinkphp at 9.4 MB, fit), 0 errors, every archive carried the pinned commit sha. Median score 59, range 0 to 96. Total wall time 314 s sequentially; assessment alone 245 s. Peak memory 97 to 125 MiB, far under the 500 MiB host limit. These repositories are small; the memory and time result says nothing about large monorepos.
- **Time is dominated by OSV round trips, not by code scanning.** Slowest: Hifone 56 s of assessment (41 direct dependencies), then relay-fullstack 29 s and aqua 27 s, against a 123 s tool timeout noted in docs/EXECUTION_PLAN.md section K. A repository with 50 checked dependencies on a slow OSV day would be close to the limit. Not yet measured: behaviour past the timeout.
- **Agreement with independent tools (lockfile repositories only, 7 of 20).** Composer audit on 3 repositories: 7 direct packages with advisories, we flagged the same 7 and nothing else (3 of 3 repositories identical). npm audit (`--omit=dev`, counting only packages with an advisory of their own, not packages vulnerable through a child) on 4 repositories: 22 packages, we matched 20. The 2 misses are `lodash` and `moment` in jedireza/aqua, which sit beyond our 50-dependency cap (aqua has 65), not a matching error. We also flagged 4 dev-only packages that `--omit=dev` ignores by design (bootstrap, cookie in aqua; request, standard-version in fair-analytics). Small sample, one comparison per package; it does not show recall on unknown vulnerabilities.
- **13 of 20 repositories have no lockfile, so their dependency numbers are not verified.** For these the version is the lowest the range allows, which overstates exposure (Silex: 13 of 31 direct dependencies flagged, score 0; Hifone: 2) and cannot be cross-checked with `npm audit` or `composer audit`. The report marks them approximate (`php-approximate-versions`, `node-approximate-versions`), but the score does not discount for it.
- **The score saturates.** Silex and aqua both score 0, Hifone 2; the scale cannot tell a bad repository from a hopeless one.
- **False comfort on monorepos and nested projects.** `codecasts/spa-starter-kit` (client/ and webservice/ folders), `deepsyx/home-automation` (server/, phone-app/, home-config/) have their manifests in subfolders. Metamorph assesses the root, found 0 dependencies, and scored them 79 and 96; home-automation is reported as stack `unknown`. Nothing in the result says "no manifest at the root". The corpus script flags this in the Notes column; the tool itself does not. `iwind/rockmongo` and `top-think/thinkphp` also show 0 dependencies, but there the lack of Composer is real (code is vendored), and the PHP smell rules did fire on thinkphp (11 rule ids, score 31).
- **High scores on old code.** ZendSkeletonApplication, spa-starter-kit and rockmongo all score 79 although they target PHP 5.x or are archived; the score weighs only what the rules can see, and the project-structure findings (no CI, no container) cost 2 points each.
- **Stack detection:** 1 of 20 reported `unknown` (home-automation, see above); BootstrapCMS and Hifone were reported as `mixed` (composer.json plus package.json at the root). The other labels were not checked by hand against the repositories.
- **Not measured here:** patch success rate (needs the runner), score change after apply, OSV-Scanner cross-check (not installed locally), precision of the PHP smell rules on real code (no human labelling of the 20 repositories was done), and any repository over the extraction limits.

Reproduce: `npm run build && npm run eval` (about 6 minutes, needs network and, for the lockfile cross-check, `npm` and `composer` on the PATH). The tools run on a copy of the manifest and lockfile only, in a fresh temporary directory, with `--ignore-scripts` / `--no-scripts --no-plugins`. No repository code is executed.
