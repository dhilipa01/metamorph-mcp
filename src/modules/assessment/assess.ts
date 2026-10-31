// Joins the inventories, hosting hints, OSV check and scoring into one filtered assessment (OWASP MCP10: small outputs).
import { canonicalHash } from '../../common/approval-token.js';
import { analyzePackages, type PackageAnalysis, type Severity as OsvSeverity } from '../intake/advisory.js';
import type { PackageRef } from '../intake/osv.client.js';
import { EolClient } from '../feeds/eol.js';
import { EpssClient } from '../feeds/epss.js';
import { classifyRule, owaspForCwes } from '../feeds/standards.js';
import { readKeyFiles } from './files.js';
import { detectHosting } from './hosting.js';
import { inventoryNode, nodeFindings, NODE_EOL } from './node-inventory.js';
import { inventoryPhp, phpFindings, PHP_EOL, scanPhpSources } from './php-inventory.js';
import { rankFindings } from './rank.js';
import { scoreFindings, topFindings, type Score } from './score.js';
import type { DependencyFix, DepRef, Finding, Severity } from './types.js';

export type Analyzer = (packages: PackageRef[]) => Promise<PackageAnalysis[]>;
// EPSS lookup by CVE id (probability 0..1). Optional enrichment: a failure adds nothing.
export type EpssLookup = (cves: string[]) => Promise<Map<string, number>>;
// Live end-of-life check for a release cycle. Answers:
//   { eolDate, latest }  the cycle is past its end of support
//   { supported: true }  endoflife.date answered and the cycle is still supported
//   undefined            no answer (feed down, unknown cycle, or a stub): nothing is claimed about the feed
// fetchedAt / url describe the real answer when the lookup knows them (they are copied to the report's source list).
export type EolAnswer = { eolDate: string; latest: string; fetchedAt?: string; url?: string } | { supported: true; fetchedAt?: string; url?: string };
export type EolLookup = (product: 'php' | 'nodejs', cycle: string) => Promise<EolAnswer | undefined>;

// An outside or built-in source the assessment relied on. `builtIn` sources were never fetched, so they have no time.
export interface AssessmentSource {
  name: string;
  url?: string;
  fetchedAt?: string;
  builtIn?: boolean;
}

export const EOL_LIVE_SOURCE = 'endoflife.date';
export const PHP_EOL_TABLE_SOURCE: AssessmentSource = { name: 'PHP end-of-life table (built-in, offline fallback)', url: 'https://www.php.net/supported-versions.php', builtIn: true };
export const NODE_EOL_TABLE_SOURCE: AssessmentSource = { name: 'Node.js end-of-life table (built-in, offline fallback)', url: 'https://github.com/nodejs/Release/blob/main/schedule.json', builtIn: true };

export interface AssessOptions {
  analyze?: Analyzer;
  today?: Date;
  epss?: EpssLookup;
  eol?: EolLookup;
}

const MAX_EPSS_CVES = 50;

export function liveEpss(client: EpssClient = new EpssClient()): EpssLookup {
  return async (cves) => new Map((await client.getScores(cves)).map((s) => [s.cve, s.epss]));
}

export function liveEol(client: EolClient = new EolClient()): EolLookup {
  return async (product, cycle) => {
    const c = await client.tryCheck(product, cycle);
    if (!c) return undefined;
    return c.isEol && typeof c.eol === 'string' ? { eolDate: c.eol, latest: c.latest, fetchedAt: c.fetchedAt, url: c.source } : { supported: true, fetchedAt: c.fetchedAt, url: c.source };
  };
}

function cvesOf(f: { id: string; aliases: string[] }): string[] {
  return [f.id, ...f.aliases].filter((a) => /^CVE-\d{4}-\d{4,}$/.test(a));
}

export interface Assessment {
  assessmentId: string;
  stack: 'node' | 'php' | 'mixed' | 'unknown';
  runtime: { declared?: string; minMajor?: number; source?: string };
  frameworks: string[];
  uiLibraries: string[];
  hosting: string[];
  dependencies: { total: number; checked: number; vulnerable: number; urgent: number; approximateVersions: boolean };
  score: Score;
  topFindings: Finding[];
  findingCount: number;
  truncated: boolean;
}

export interface FullAssessment {
  assessment: Assessment;
  findings: Finding[];
  fixes: DependencyFix[];
  files: Record<string, string>;
  sources?: AssessmentSource[]; // outside or built-in sources the runtime end-of-life check relied on (report appendix)
}

const MAX_CHECKED = 50;
const OSV_TO_FINDING: Record<OsvSeverity, Severity> = { critical: 'critical', high: 'high', medium: 'medium', low: 'low', unknown: 'medium' };

function dockerNodeMajor(dockerfile: string | undefined): number | undefined {
  const m = dockerfile ? /^\s*FROM\s+node:(\d+)/im.exec(dockerfile) : null;
  return m ? Number(m[1]) : undefined;
}

function toRefs(deps: DepRef[], ecosystem: PackageRef['ecosystem']): PackageRef[] {
  return deps.map((d) => ({ name: d.name, ecosystem, version: d.version }));
}

function dependencyFindings(analyses: PackageAnalysis[], approx: Map<string, boolean>, epss: Map<string, number> = new Map()): Finding[] {
  const out: Finding[] = [];
  for (const a of analyses) {
    if (!a.affected || a.findings.length === 0) continue;
    const top = a.findings[0]; // already sorted most severe first
    const urgent = a.findings.some((f) => f.urgent);
    const fixed = top.fixedVersions[0];
    const approximate = approx.get(`${a.package.ecosystem}:${a.package.name}`) === true;
    // Enrichment only ever adds facts we actually have; missing data leaves the fields off.
    const cwe = top.cwes ?? [];
    const owasp = owaspForCwes(cwe);
    const scores = cvesOf(top).map((c) => epss.get(c)).filter((n): n is number => n !== undefined);
    const kev = a.findings.some((f) => f.urgentReasons.includes('known_exploited'));
    out.push({
      id: `dep-vulnerable:${a.package.name}`,
      category: 'dependencies',
      severity: OSV_TO_FINDING[top.severity],
      title: `${a.package.name}@${a.package.version} has ${a.findings.length}${a.truncated ? '+' : ''} known advisories${urgent ? ' (urgent)' : ''}`,
      evidence: `${top.id}${approximate ? ' (version is approximate: no lockfile)' : ''}`,
      recommendation: fixed ? `Upgrade ${a.package.name} to ${fixed} or later.` : `Check ${top.id} for a fixed release of ${a.package.name}.`,
      ...(cwe.length > 0 ? { cwe } : {}),
      ...(owasp.length > 0 ? { owasp } : {}),
      ...(top.cvss !== undefined ? { cvss: top.cvss } : {}),
      ...(kev ? { kev: true } : {}),
      ...(scores.length > 0 ? { epss: Math.max(...scores) } : {}),
      source: 'osv.dev'
    });
  }
  return out;
}

// Adds CWE / OWASP ids for our own rules where a defensible mapping exists. Never overrides data already on the finding.
function withStandards(f: Finding): Finding {
  if (f.cwe) return f;
  const c = classifyRule(f.id);
  if (c.cwe.length === 0) return f;
  return { ...f, cwe: c.cwe, ...(c.owasp.length > 0 ? { owasp: c.owasp } : {}) };
}

// Which EOL source decided the runtime verdict: the built-in tables when they know the version, otherwise endoflife.date
// when it answered. A source is listed only if it was really used; a live source carries the time it was really fetched.
async function extraEolFindings(nodeMajor: number | undefined, phpMinor: string | undefined, lookup: EolLookup | undefined): Promise<{ findings: Finding[]; sources: AssessmentSource[] }> {
  const out: Finding[] = [];
  const sources: AssessmentSource[] = [];
  if (nodeMajor !== undefined && NODE_EOL[nodeMajor] !== undefined) sources.push(NODE_EOL_TABLE_SOURCE);
  if (phpMinor !== undefined && PHP_EOL[phpMinor] !== undefined) sources.push(PHP_EOL_TABLE_SOURCE);
  if (!lookup) return { findings: out, sources };
  const live = (r: EolAnswer, product: string): AssessmentSource => ({ name: EOL_LIVE_SOURCE, url: r.url ?? `https://endoflife.date/api/${product}.json`, ...(r.fetchedAt ? { fetchedAt: r.fetchedAt } : {}) });
  try {
    if (nodeMajor !== undefined && NODE_EOL[nodeMajor] === undefined) {
      const r = await lookup('nodejs', String(nodeMajor));
      if (r) sources.push(live(r, 'nodejs'));
      if (r && 'eolDate' in r) out.push({ id: 'node-runtime-eol', category: 'runtime', severity: 'high', title: `Node.js ${nodeMajor} is past end of life`, evidence: `Node ${nodeMajor} ended ${r.eolDate} (endoflife.date)`, recommendation: 'Move to the current maintained LTS (Node 22 or 24).', source: 'endoflife.date' });
    }
    if (phpMinor !== undefined && PHP_EOL[phpMinor] === undefined) {
      const r = await lookup('php', phpMinor);
      if (r) sources.push(live(r, 'php'));
      if (r && 'eolDate' in r) out.push({ id: 'php-version-eol', category: 'runtime', severity: 'high', title: `PHP ${phpMinor} no longer receives security fixes`, evidence: `PHP ${phpMinor} ended ${r.eolDate} (endoflife.date)`, recommendation: 'Raise the PHP requirement to a version that still receives security support.', source: 'endoflife.date' });
    }
  } catch {
    // feed trouble never fails an assessment
  }
  return { findings: out, sources };
}

// One finding per rule: repeats collapse into "<first evidence> (+N more)" so the list stays readable and the score
// reflects how many distinct problems exist, not how many lines repeat one problem.
function groupByRule(findings: Finding[]): Finding[] {
  const groups = new Map<string, { first: Finding; count: number }>();
  for (const f of findings) {
    const g = groups.get(f.id);
    if (g) g.count++;
    else groups.set(f.id, { first: f, count: 1 });
  }
  return [...groups.values()].map(({ first, count }) =>
    count === 1 ? first : { ...first, evidence: `${first.evidence ?? ''} (+${count - 1} more)`.trim() }
  );
}

// Numeric compare by dot/dash segments; missing or non-numeric segments count as 0.
export function cmpVersion(a: string, b: string): number {
  const seg = (v: string) => v.split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : 0));
  const pa = seg(a);
  const pb = seg(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function dependencyFixes(analyses: PackageAnalysis[], dev: Map<string, boolean>): DependencyFix[] {
  const out: DependencyFix[] = [];
  for (const a of analyses) {
    if (!a.affected) continue;
    let to: string | undefined;
    for (const f of a.findings) for (const v of f.fixedVersions) if (to === undefined || cmpVersion(v, to) > 0) to = v;
    if (to === undefined) continue;
    const { ecosystem, name, version } = a.package;
    out.push({ ecosystem, name, from: version, to, urgent: a.findings.some((f) => f.urgent), dev: dev.get(`${ecosystem}:${name}`) === true });
  }
  return out.sort((x, y) => Number(y.urgent) - Number(x.urgent) || x.name.localeCompare(y.name));
}

export async function assessDirectory(dir: string, opts: AssessOptions = {}): Promise<Assessment> {
  return (await assessFull(dir, opts)).assessment;
}

export async function assessFull(dir: string, opts: AssessOptions = {}): Promise<FullAssessment> {
  const today = opts.today ?? new Date();
  const analyze: Analyzer = opts.analyze ?? ((pkgs) => analyzePackages(pkgs));
  // Live feeds are the default only when OSV is live too; an injected analyzer means a test or offline run.
  const epssLookup = opts.epss ?? (opts.analyze ? undefined : liveEpss());
  const eolLookup = opts.eol ?? (opts.analyze ? undefined : liveEol());
  const kf = await readKeyFiles(dir);
  const c = kf.contents;
  const findings: Finding[] = [];

  const hasNode = 'package.json' in c;
  const phpCount = kf.php.length || kf.paths.filter((p) => p.endsWith('.php')).length;
  const hasPhp = 'composer.json' in c || phpCount > 0;

  const nodeInv = hasNode
    ? inventoryNode({ packageJson: c['package.json'], packageLock: c['package-lock.json'], nvmrc: c['.nvmrc'], nodeVersionFile: c['.node-version'], dockerNodeMajor: dockerNodeMajor(c['Dockerfile']) })
    : undefined;
  const phpInv = hasPhp ? inventoryPhp({ composerJson: c['composer.json'], composerLock: c['composer.lock'] }, phpCount) : undefined;

  if (nodeInv) findings.push(...nodeFindings(nodeInv, today));
  if (phpInv) findings.push(...phpFindings(phpInv, today), ...scanPhpSources(kf.php));

  // Extra EOL signal: only for versions the checked-in tables do not know (they stay the offline source of truth).
  const eol = await extraEolFindings(nodeInv?.minNodeMajor, phpInv?.minPhp, eolLookup);
  findings.push(...eol.findings);

  const todayIso = today.toISOString().slice(0, 10);
  const hosting = detectHosting(kf.paths, c, { isNodeMajorEol: (major) => (NODE_EOL[major] ?? '9999') < todayIso });
  findings.push(...hosting.findings);

  // Known vulnerabilities for direct dependencies (non-dev first, exact versions first), capped for the OSV call.
  const approx = new Map<string, boolean>();
  const candidates: Array<{ ref: PackageRef; dev: boolean; approximate: boolean }> = [];
  for (const d of nodeInv?.deps ?? []) candidates.push({ ref: toRefs([d], 'npm')[0], dev: d.dev, approximate: d.approximate });
  for (const d of phpInv?.deps ?? []) candidates.push({ ref: toRefs([d], 'Packagist')[0], dev: d.dev, approximate: d.approximate });
  candidates.sort((a, b) => Number(a.dev) - Number(b.dev) || Number(a.approximate) - Number(b.approximate));
  const checked = candidates.slice(0, MAX_CHECKED);
  const devByKey = new Map<string, boolean>();
  checked.forEach((x) => {
    approx.set(`${x.ref.ecosystem}:${x.ref.name}`, x.approximate);
    devByKey.set(`${x.ref.ecosystem}:${x.ref.name}`, x.dev);
  });

  let analyses: PackageAnalysis[] = [];
  if (checked.length > 0) {
    try {
      analyses = await analyze(checked.map((x) => x.ref));
    } catch {
      findings.push({ id: 'osv-unavailable', category: 'dependencies', severity: 'info', title: 'Vulnerability data was unavailable', recommendation: 'Run analyze_advisory again later to check the dependencies.' });
    }
  }
  let epss = new Map<string, number>();
  if (epssLookup) {
    const cves = [...new Set(analyses.filter((a) => a.affected && a.findings.length > 0).flatMap((a) => cvesOf(a.findings[0])))].slice(0, MAX_EPSS_CVES);
    if (cves.length > 0) {
      try {
        epss = await epssLookup(cves);
      } catch {
        // EPSS down: findings simply carry no epss field
      }
    }
  }
  findings.push(...dependencyFindings(analyses, approx, epss));

  const sorted = rankFindings(groupByRule(findings.map(withStandards)))
  const stack = nodeInv && phpInv ? 'mixed' : nodeInv ? 'node' : phpInv ? 'php' : 'unknown';
  const vulnerable = analyses.filter((a) => a.affected).length;
  const urgent = analyses.filter((a) => a.findings.some((f) => f.urgent)).length;

  const assessment: Assessment = {
    assessmentId: canonicalHash({ stack, deps: checked.map((x) => `${x.ref.name}@${x.ref.version}`), findings: sorted.map((f) => f.id) }).slice(0, 16),
    stack,
    runtime: { declared: nodeInv?.declaredEngine ?? phpInv?.phpConstraint, minMajor: nodeInv?.minNodeMajor, source: nodeInv?.runtimeSource },
    frameworks: [...(nodeInv?.frameworks ?? []), ...(phpInv?.framework ? [phpInv.framework] : [])],
    uiLibraries: nodeInv?.uiLibraries ?? [],
    hosting: hosting.hints,
    dependencies: {
      total: candidates.length,
      checked: checked.length,
      vulnerable,
      urgent,
      approximateVersions: checked.some((x) => x.approximate)
    },
    score: scoreFindings(sorted),
    topFindings: topFindings(sorted, 10),
    findingCount: sorted.length,
    truncated: kf.truncated
  };
  return { assessment, findings: sorted, fixes: dependencyFixes(analyses, devByKey), files: c, sources: eol.sources };
}
