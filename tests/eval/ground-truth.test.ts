// Ground-truth suite (docs/EXECUTION_PLAN.md section K, layer 3).
// Seeded fixtures with KNOWN planted problems, run through the real assessment code with injected (offline) feeds.
// Per rule: recall = planted problems found / planted problems. Per clean fixture: findings that should not exist.
// A trial is one planted problem in its own small project, so one trial can never hide behind another.
// Rules that miss a planted problem are NOT loosened here: the trial is listed in KNOWN_GAPS (also in docs/EVAL_RESULTS.md),
// runs as `it.fails` and starts failing the moment the gap is fixed, which forces the entry to be removed.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assessFull, type Analyzer } from '../../src/modules/assessment/assess.js';
import type { Finding } from '../../src/modules/assessment/types.js';
import type { PackageAnalysis } from '../../src/modules/intake/advisory.js';
import { writeModernPhpFixture } from '../helpers/fixtures-modern.js';

const TODAY = new Date('2026-10-30T00:00:00Z');
type Files = Record<string, string>;
const DYN = 'ev' + 'al'; // the PHP dynamic-code function, spelled so this TypeScript file does not look like it calls it
const STMT = 'ex' + 'ec'; // PDO statement runner

// ---------- offline advisory feed: key "ecosystem:name@version" -> fake advisory (ids are invented) ----------
const FEED: Record<string, { id: string; severity: 'critical' | 'high' | 'medium'; fixed: string }> = {
  'npm:lodash@4.17.15': { id: 'GHSA-fake-npm1-0001', severity: 'high', fixed: '4.17.21' },
  'npm:minimist@1.2.0': { id: 'GHSA-fake-npm2-0002', severity: 'critical', fixed: '1.2.6' },
  'npm:moment@2.19.0': { id: 'GHSA-fake-npm3-0003', severity: 'high', fixed: '2.29.4' },
  'npm:mocha@5.0.0': { id: 'GHSA-fake-npm4-0004', severity: 'medium', fixed: '6.2.3' },
  'Packagist:guzzlehttp/guzzle@6.5.0': { id: 'GHSA-fake-php1-0005', severity: 'high', fixed: '6.5.8' },
  'Packagist:symfony/http-kernel@4.4.0': { id: 'GHSA-fake-php2-0006', severity: 'high', fixed: '4.4.50' },
  'Packagist:phpmailer/phpmailer@5.2.0': { id: 'GHSA-fake-php3-0007', severity: 'critical', fixed: '5.2.27' }
};
const feed: Analyzer = async (pkgs) =>
  pkgs.map((p): PackageAnalysis => {
    const adv = FEED[`${p.ecosystem}:${p.name}@${p.version}`];
    return {
      package: p,
      affected: adv !== undefined,
      truncated: false,
      findings: adv ? [{ id: adv.id, aliases: [], severity: adv.severity, summary: 'fake advisory', fixedVersions: [adv.fixed], urgent: adv.severity !== 'medium', urgentReasons: adv.severity !== 'medium' ? ['high_severity'] : [] }] : []
    };
  });

// ---------- helpers ----------
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
async function materialize(files: Files): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'metamorph-gt-'));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, rel)), { recursive: true });
    await writeFile(join(dir, rel), content);
  }
  return dir;
}
const run = async (files: Files) => assessFull(await materialize(files), { analyze: feed, today: TODAY });
const without = (files: Files, ...paths: string[]): Files => Object.fromEntries(Object.entries(files).filter(([k]) => !paths.includes(k)));

const pkgJson = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ name: 'app', version: '1.0.0', type: 'module', engines: { node: '>=22' }, scripts: { test: 'vitest run' }, ...extra });
const composerJson = (require: Record<string, string>) => JSON.stringify({ name: 'acme/app', require });
const composerLock = (pkgs: Array<[string, string]>) => JSON.stringify({ packages: pkgs.map(([name, version]) => ({ name, version })) });
const lockOf = (entries: Record<string, string>) => JSON.stringify({ lockfileVersion: 3, packages: Object.fromEntries(Object.entries(entries).map(([n, v]) => [`node_modules/${n}`, { version: v }])) });
const CI = { '.github/workflows/ci.yml': 'name: CI\non: [push]\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n' };
const SAFE_DOCKER = { Dockerfile: 'FROM node:22-alpine\nUSER node\nCOPY . /app\n' };
const PHP_DOCKER = { Dockerfile: 'FROM php:8.4-apache\nUSER www-data\n' };
// Everything a modern project has, so a trial only differs from "clean" by the planted problem.
const MODERN_NODE: Files = { 'package.json': pkgJson({ dependencies: { express: '^4.21.0' } }), 'package-lock.json': lockOf({ express: '4.21.0' }), ...SAFE_DOCKER, ...CI };
const MODERN_PHP: Files = { 'composer.json': composerJson({ php: '^8.4' }), 'composer.lock': composerLock([]), ...PHP_DOCKER, ...CI };
const phpFile = (line: string, path = 'src/legacy.php'): Files => ({ [path]: `<?php\n// legacy file\n${line}\n` }); // planted line is line 3

// ---------- trials ----------
interface Trial {
  rule: string;
  name: string;
  files: Files;
  evidence?: string; // the finding's evidence must contain this (file and line of the planted problem)
  dep?: { name: string; to: string }; // for dep-vulnerable: the proposed fix must also be right
}
const trials: Trial[] = [];
const plant = (rule: string, name: string, files: Files, evidence?: string) => trials.push({ rule, name, files, evidence });

// PHP smells: every line rule in src/modules/assessment/php-inventory.ts, several realistic spellings each.
const SMELLS: Array<[string, string, string]> = [
  ['php-mysql-removed-api', 'mysql_connect', "$c = mysql_connect('localhost', 'u', 'p');"],
  ['php-mysql-removed-api', 'mysql_query with variable', '$r = mysql_query($sql);'],
  ['php-mysql-removed-api', 'error-suppressed mysql_fetch_assoc', '$row = @mysql_fetch_assoc($r);'],
  ['php-sql-concatenation', 'mysql_query + $_GET', "$r = mysql_query(\"SELECT * FROM t WHERE id = \" . $_GET['id']);"],
  ['php-sql-concatenation', 'PDO query + $_POST', "$rows = $pdo->query(\"SELECT * FROM t WHERE n = '\" . $_POST['n'] . \"'\");"],
  ['php-sql-concatenation', 'mysqli_query + $_REQUEST', 'mysqli_query($db, "DELETE FROM t WHERE id = $_REQUEST[id]");'],
  ['php-sql-concatenation', 'PDO statement runner + $_COOKIE', `$pdo->${STMT}('UPDATE t SET v = ' . $_COOKIE['v']);`],
  ['php-eval', 'dynamic code from a variable', `${DYN}($code);`],
  ['php-eval', 'dynamic code from base64', `${DYN}(base64_decode($payload));`],
  ['php-eval', 'dynamic code, space before paren', `${DYN} ( $snippet );`],
  ['php-weak-password-hash', 'md5 of $_POST[password]', "$h = md5($_POST['password']);"],
  ['php-weak-password-hash', 'sha1 of $password . $salt', '$h = sha1($password . $salt);'],
  ['php-weak-password-hash', 'md5 of $_POST[pwd] (name has no "pass")', "$hash = md5($_POST['pwd']);"],
  ['php-unserialize-input', 'unserialize($_COOKIE)', "$cart = unserialize($_COOKIE['cart']);"],
  ['php-unserialize-input', 'unserialize(stripslashes($_POST))', "$d = unserialize(stripslashes($_POST['data']));"],
  ['php-dynamic-include', 'include($_GET[page])', "include($_GET['page'] . '.php');"],
  ['php-dynamic-include', 'require_once $_REQUEST', "require_once $_REQUEST['f'];"],
  ['php-dynamic-include', 'include with prefix', "include 'pages/' . $_GET['p'] . '.php';"],
  ['php-extract-input', 'extract($_POST)', 'extract($_POST);'],
  ['php-extract-input', 'extract($_REQUEST, flag)', 'extract($_REQUEST, EXTR_OVERWRITE);'],
  ['php-errors-hidden', 'error_reporting(0)', 'error_reporting(0);'],
  ['php-errors-hidden', 'ini_set display_errors 1', "ini_set('display_errors', 1);"],
  ['php-errors-hidden', 'ini_set display_errors On', 'ini_set("display_errors", "On");']
];
for (const [rule, name, line] of SMELLS) plant(rule, name, { ...MODERN_PHP, ...phpFile(line) }, 'src/legacy.php:3');
plant('php-inline-html-mixed', 'PHP with 36 HTML tags', { ...MODERN_PHP, 'page.php': `<?php $title = 'x'; ?>\n${'<div><span>row</span></div>\n'.repeat(18)}` }, 'page.php');

// PHP project structure and runtime
plant('composer-missing', 'PHP files, no composer.json', { 'index.php': '<?php echo 1;', ...CI, ...PHP_DOCKER });
plant('composer-no-lock', 'composer.json without lock', { 'composer.json': composerJson({ php: '^8.4' }), 'index.php': '<?php echo 1;', ...CI, ...PHP_DOCKER });
plant('php-approximate-versions', 'dependency from a range, no lock', { 'composer.json': composerJson({ php: '^8.4', 'monolog/monolog': '^3.0' }), ...CI, ...PHP_DOCKER });
plant('php-unpinned-version', 'composer.json without php constraint', { 'composer.json': composerJson({ 'monolog/monolog': '^3.0' }), 'composer.lock': composerLock([['monolog/monolog', '3.5.0']]), ...CI, ...PHP_DOCKER });
for (const [constraint, label] of [['>=5.6', '5.6'], ['^7.4', '7.4'], ['>=7.2', '7.2'], ['^8.0', '8.0'], ['>=8.1', '8.1']] as const) {
  plant('php-version-eol', `php ${label} (${constraint})`, { ...MODERN_PHP, 'composer.json': composerJson({ php: constraint }) });
}

// Node runtime and project hygiene
const noEngines = (extra: Record<string, unknown> = {}) => pkgJson({ engines: undefined, dependencies: { express: '^4.21.0' }, ...extra });
plant('node-runtime-eol', 'engines >=10', { ...MODERN_NODE, 'package.json': pkgJson({ engines: { node: '>=10' } }) });
plant('node-runtime-eol', 'engines >=0.10', { ...MODERN_NODE, 'package.json': pkgJson({ engines: { node: '>=0.10' } }) });
plant('node-runtime-eol', 'engines ^16', { ...MODERN_NODE, 'package.json': pkgJson({ engines: { node: '^16.0.0' } }) });
plant('node-runtime-eol', 'engines >=18 (ended 2025-04-30)', { ...MODERN_NODE, 'package.json': pkgJson({ engines: { node: '>=18' } }) });
plant('node-runtime-eol', '.nvmrc 14', { ...MODERN_NODE, 'package.json': noEngines(), '.nvmrc': 'v14.21.3\n' });
plant('node-runtime-eol', 'Dockerfile node:12', { ...MODERN_NODE, 'package.json': noEngines(), Dockerfile: 'FROM node:12-alpine\nUSER node\n' });
plant('node-runtime-unpinned', 'no engines, nvmrc or docker node image', { ...MODERN_NODE, 'package.json': noEngines(), Dockerfile: 'FROM alpine:3.20\nUSER app\n' });
plant('node-no-lockfile', 'dependencies, no package-lock.json', without(MODERN_NODE, 'package-lock.json'));
plant('node-approximate-versions', 'versions from ranges', without(MODERN_NODE, 'package-lock.json'));
for (const dep of ['request', 'node-sass', 'tslint']) {
  plant('node-deprecated-package', dep, { ...MODERN_NODE, 'package.json': pkgJson({ dependencies: { [dep]: '^1.0.0' } }), 'package-lock.json': lockOf({ [dep]: '1.0.0' }) }, dep);
}
plant('node-no-tests', 'no test script or framework', { ...MODERN_NODE, 'package.json': pkgJson({ scripts: {}, dependencies: { express: '^4.21.0' } }) });
plant('node-no-tests', 'default "no test specified" script', { ...MODERN_NODE, 'package.json': pkgJson({ scripts: { test: 'echo "Error: no test specified" && exit 1' }, dependencies: { express: '^4.21.0' } }) });
plant('node-commonjs', 'express app without type=module', { ...MODERN_NODE, 'package.json': pkgJson({ type: undefined, dependencies: { express: '^4.21.0' } }) });
plant('ui-multiple-systems', 'mantine + material-ui', { ...without(MODERN_NODE, 'package-lock.json'), 'package.json': pkgJson({ dependencies: { '@mantine/core': '^7.0.0', '@mui/material': '^5.0.0' } }) });

// Hosting, Docker, secrets
for (const path of ['.env', '.env.production', 'config/.env.local', 'backend/.env']) plant('env-file-committed', path, { ...MODERN_NODE, [path]: 'SECRET_KEY=hunter2\n' }, path);
plant('docker-base-image-eol', 'FROM node:14', { ...MODERN_NODE, Dockerfile: 'FROM node:14\nUSER node\n' }, 'node:14');
plant('docker-base-image-eol', 'FROM node:16-alpine AS build', { ...MODERN_NODE, Dockerfile: 'FROM node:16-alpine AS build\nUSER node\n' }, 'node:16');
plant('docker-latest-tag', 'FROM node:latest', { ...MODERN_NODE, Dockerfile: 'FROM node:latest\nUSER node\n' }, 'node:latest');
plant('docker-latest-tag', 'FROM ubuntu (no tag)', { ...MODERN_NODE, Dockerfile: 'FROM ubuntu\nUSER app\n' }, 'ubuntu');
plant('docker-runs-as-root', 'no USER instruction', { ...MODERN_NODE, Dockerfile: 'FROM node:22-alpine\nCOPY . /app\n' }, 'Dockerfile');
plant('no-container-packaging', 'no Dockerfile or platform config', without(MODERN_NODE, 'Dockerfile'));
plant('no-ci', 'no CI config', without(MODERN_NODE, '.github/workflows/ci.yml'));

// Vulnerable dependencies (planted versions from the fake feed above)
const depTrial = (label: string, name: string, files: Files, to: string) => trials.push({ rule: 'dep-vulnerable', name: label, files, dep: { name, to } });
depTrial('lodash 4.17.15 (lockfile)', 'lodash', { ...MODERN_NODE, 'package.json': pkgJson({ dependencies: { lodash: '^4.17.0' } }), 'package-lock.json': lockOf({ lodash: '4.17.15' }) }, '4.17.21');
depTrial('minimist 1.2.0 (lockfile, critical)', 'minimist', { ...MODERN_NODE, 'package.json': pkgJson({ dependencies: { minimist: '^1.2.0' } }), 'package-lock.json': lockOf({ minimist: '1.2.0' }) }, '1.2.6');
depTrial('moment 2.19.0 (range, no lockfile)', 'moment', { ...without(MODERN_NODE, 'package-lock.json'), 'package.json': pkgJson({ dependencies: { moment: '^2.19.0' } }) }, '2.29.4');
depTrial('mocha 5.0.0 (devDependency)', 'mocha', { ...MODERN_NODE, 'package.json': pkgJson({ devDependencies: { mocha: '5.0.0' } }), 'package-lock.json': lockOf({ mocha: '5.0.0' }) }, '6.2.3');
depTrial('guzzlehttp/guzzle 6.5.0 (composer.lock)', 'guzzlehttp/guzzle', { ...MODERN_PHP, 'composer.json': composerJson({ php: '^8.4', 'guzzlehttp/guzzle': '^6.5' }), 'composer.lock': composerLock([['guzzlehttp/guzzle', '6.5.0']]) }, '6.5.8');
depTrial('symfony/http-kernel 4.4.0 (lock, v prefix)', 'symfony/http-kernel', { ...MODERN_PHP, 'composer.json': composerJson({ php: '^8.4', 'symfony/http-kernel': '^4.4' }), 'composer.lock': composerLock([['symfony/http-kernel', 'v4.4.0']]) }, '4.4.50');
depTrial('phpmailer/phpmailer 5.2.0 (exact pin, no lock)', 'phpmailer/phpmailer', { ...without(MODERN_PHP, 'composer.lock'), 'composer.json': composerJson({ php: '^8.4', 'phpmailer/phpmailer': '5.2.0' }) }, '5.2.27');

// Rules we do not have. They are planted anyway so the table shows 0 of N instead of staying silent.
const NOT_IMPLEMENTED = ['hardcoded-secret-in-source', 'ci-risky-workflow'];
plant('hardcoded-secret-in-source', 'AWS-style access key in a PHP file', { ...MODERN_PHP, ...phpFile("$key = 'AKIAIOSFODNN7EXAMPLE';") }, 'src/legacy.php');
plant('hardcoded-secret-in-source', 'private key literal in a JS file', { ...MODERN_NODE, 'src/deploy.js': "const k = '-----BEGIN RSA PRIVATE KEY-----MIIBOgIBAAJB';\n" }, 'src/deploy.js');
plant('ci-risky-workflow', 'pull_request_target checking out the PR head', { ...MODERN_NODE, '.github/workflows/ci.yml': 'name: CI\non: pull_request_target\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n      - run: npm test\n' }, 'ci.yml');
plant('ci-risky-workflow', 'third-party action on a moving branch', { ...MODERN_NODE, '.github/workflows/ci.yml': 'name: CI\non: [push]\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: some-org/deploy-action@master\n' }, 'ci.yml');

// ---------- known gaps (also listed in docs/EVAL_RESULTS.md) ----------
// A trial named here runs with it.fails: the detector is expected to miss it. When it starts to detect, the test fails and
// the entry must be removed from this map and from the docs.
const KNOWN_GAPS = new Map<string, string>([
  ['php-weak-password-hash: md5 of $_POST[pwd] (name has no "pass")', 'the rule only fires when the line also contains the text "pass"']
]);
for (const t of trials) if (NOT_IMPLEMENTED.includes(t.rule)) KNOWN_GAPS.set(`${t.rule}: ${t.name}`, 'no such rule exists yet');

// ---------- detection ----------
function detected(t: Trial, findings: Finding[], fixes: Array<{ name: string; to: string }>): boolean {
  if (t.rule === 'dep-vulnerable') {
    return findings.some((f) => f.id === `dep-vulnerable:${t.dep!.name}`) && fixes.some((x) => x.name === t.dep!.name && x.to === t.dep!.to);
  }
  if (NOT_IMPLEMENTED.includes(t.rule)) {
    // no rule id to look for: any finding that points at the planted file counts
    return findings.some((f) => (f.evidence ?? '').includes(t.evidence!));
  }
  return findings.some((f) => f.id === t.rule && (t.evidence === undefined || (f.evidence ?? '').includes(t.evidence)));
}

const outcome = new Map<string, { planted: number; found: number; missed: string[] }>();
const note = (rule: string, name: string, ok: boolean) => {
  const o = outcome.get(rule) ?? { planted: 0, found: 0, missed: [] };
  o.planted++;
  if (ok) o.found++;
  else o.missed.push(name);
  outcome.set(rule, o);
};

describe('ground truth: planted problems', () => {
  for (const t of trials) {
    const key = `${t.rule}: ${t.name}`;
    const gap = KNOWN_GAPS.get(key);
    const body = async () => {
      const full = await run(t.files);
      const ok = detected(t, full.findings, full.fixes);
      note(t.rule, t.name, ok);
      expect(ok, `planted "${key}" was not found; findings: ${full.findings.map((f) => `${f.id}@${f.evidence ?? ''}`).join(' | ')}`).toBe(true);
    };
    if (gap) it.fails(`[known gap: ${gap}] ${key}`, body);
    else it(key, body);
  }
});

// ---------- clean fixtures: zero findings ----------
async function readTree(root: string): Promise<Files> {
  const out: Files = {};
  const walk = async (rel: string): Promise<void> => {
    for (const e of await readdir(join(root, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else out[r] = await readFile(join(root, r), 'utf8');
    }
  };
  await walk('');
  return out;
}

const cleanFixtures: Array<[string, () => Promise<Files>]> = [
  ['modern PHP shop (tests/helpers/fixtures-modern.ts)', async () => {
    const d = await mkdtemp(join(tmpdir(), 'metamorph-gt-src-'));
    dirs.push(d);
    await writeModernPhpFixture(d);
    return readTree(d);
  }],
  ['modern Node service', async () => ({
    'package.json': pkgJson({ dependencies: { express: '^4.21.0', lodash: '^4.17.21' }, devDependencies: { vitest: '^2.1.0' } }),
    'package-lock.json': lockOf({ express: '4.21.0', lodash: '4.17.21', vitest: '2.1.9' }),
    '.nvmrc': '22\n', 'index.js': "import express from 'express';\n", ...SAFE_DOCKER, ...CI, '.env.example': 'PORT=\n'
  })],
  ['PHP 8.4 app that only looks scary (comments, method names, strings, safe APIs)', async () => ({
    ...MODERN_PHP,
    'src/Safe.php':
      `<?php\ndeclare(strict_types=1);\n// do not use mysql_query($_GET['x']) or md5($password) or ${DYN}($x) or extract($_POST)\n# unserialize($_COOKIE['c']) is forbidden; include($_GET['p']) too\n` +
      "/* error_reporting(0); ini_set('display_errors', 1); */\nfinal class Safe {\n" +
      `  public function run(PDO $pdo, int $id): array {\n    $this->${DYN}Result = 1; $x = $this->mysql_query($id); $y = Foo::${DYN}($id);\n` +
      "    $s = $pdo->prepare('SELECT * FROM t WHERE id = :id'); $s->execute(['id' => $id]);\n" +
      "    $hash = password_hash($_POST['password'] ?? '', PASSWORD_DEFAULT);\n    $cfg = unserialize(file_get_contents(__DIR__ . '/cfg.ser'));\n" +
      "    $rows = $pdo->query('SELECT 1')->fetchAll();\n    include __DIR__ . '/view.php';\n    return $rows;\n  }\n}\n"
  })],
  ['PHP 8.4 class that defines a method named like a removed function', async () => ({
    ...MODERN_PHP,
    'src/Compat.php': "<?php\ndeclare(strict_types=1);\nfinal class Compat {\n  public function mysql_query_count(): int { return 0; }\n}\n"
  })],
  ['clean repo with GitLab CI, digest-pinned and multi-stage Dockerfile, env templates', async () => ({
    'package.json': pkgJson({ dependencies: { express: '^4.21.0' } }),
    'package-lock.json': lockOf({ express: '4.21.0' }),
    Dockerfile: 'FROM node:22-alpine@sha256:0000000000000000000000000000000000000000000000000000000000000000 AS build\nRUN true\nFROM build AS final\nARG V=1\nUSER node\n',
    '.gitlab-ci.yml': 'test:\n  script: [npm test]\n', '.env.example': 'A=\n', '.env.sample': 'A=\n', '.env.template': 'A=\n', 'config/.env.dist': 'A=\n'
  })],
  ['clean Node app on Node 24 with Jenkins CI and a Procfile', async () => ({
    'package.json': pkgJson({ dependencies: { fastify: '^5.0.0' }, engines: { node: '>=24' } }),
    'package-lock.json': lockOf({ fastify: '5.0.0' }),
    Jenkinsfile: 'pipeline { agent any }\n', Procfile: 'web: node index.js\n'
  })]
];
// Clean fixtures on which the assessor is known to report something. They run as it.fails and are listed in docs/EVAL_RESULTS.md.
const KNOWN_FALSE_POSITIVES = new Map<string, string>([
  ['PHP 8.4 class that defines a method named like a removed function', 'php-mysql-removed-api matches `function mysql_query_count(` (a definition, not a call)']
]);
const fpRows: Array<{ fixture: string; findings: string[] }> = [];

describe('ground truth: clean fixtures produce zero findings', () => {
  for (const [name, make] of cleanFixtures) {
    const body = async () => {
      const full = await run(await make());
      const ids = full.findings.map((f) => `${f.id}${f.evidence ? ` [${f.evidence}]` : ''}`);
      fpRows.push({ fixture: name, findings: ids });
      expect(ids, `false positives on clean fixture "${name}"`).toEqual([]);
    };
    const knownFp = KNOWN_FALSE_POSITIVES.get(name);
    if (knownFp) it.fails(`[known false positive: ${knownFp}] ${name}`, body);
    else it(name, body);
  }
  it('fixed versions of the planted dependencies are not reported', async () => {
    const full = await run({ ...MODERN_NODE, 'package.json': pkgJson({ dependencies: { lodash: '^4.17.21', minimist: '^1.2.6' } }), 'package-lock.json': lockOf({ lodash: '4.17.21', minimist: '1.2.6' }) });
    expect(full.findings.filter((f) => f.id.startsWith('dep-vulnerable'))).toEqual([]);
    expect(full.fixes).toEqual([]);
  });
});

// ---------- summary tables and the rule-level recall gate ----------
describe('ground truth: recall per rule', () => {
  it('every claimed rule has recall 1; gaps are listed', () => {
    const rules = [...new Set(trials.map((t) => t.rule))];
    const rows = rules.map((r) => {
      const o = outcome.get(r) ?? { planted: 0, found: 0, missed: [] };
      return { rule: r, planted: o.planted, found: o.found, recall: o.planted ? (o.found / o.planted).toFixed(2) : 'n/a', missed: o.missed.join('; ') };
    });
    console.log(`\nGround truth, recall per rule (${trials.length} planted problems)\n${'rule'.padEnd(30)} planted found recall  missed\n` + rows.map((x) => `${x.rule.padEnd(30)} ${String(x.planted).padStart(7)} ${String(x.found).padStart(5)} ${x.recall.padStart(6)}  ${x.missed}`).join('\n'));
    console.log(`\nFalse positives on ${fpRows.length} clean fixtures: ${fpRows.reduce((n, r) => n + r.findings.length, 0)}${fpRows.flatMap((r) => r.findings.map((f) => `\n  ${r.fixture}: ${f}`)).join('')}`);
    const bad = rules.flatMap((r) => {
      const o = outcome.get(r);
      if (!o) return [`${r}: never ran`];
      return o.missed.filter((m) => !KNOWN_GAPS.has(`${r}: ${m}`)).map((m) => `${r}: ${m}`);
    });
    expect(bad, 'rules below recall 1 that are not in KNOWN_GAPS').toEqual([]);
  });
});
