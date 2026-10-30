// Joins the inventories, hosting hints, OSV check and scoring into one filtered assessment (OWASP MCP10: small outputs).
import { canonicalHash } from '../../common/approval-token.js';
import { analyzePackages, type PackageAnalysis, type Severity as OsvSeverity } from '../intake/advisory.js';
import type { PackageRef } from '../intake/osv.client.js';
import { readKeyFiles } from './files.js';
import { detectHosting } from './hosting.js';
import { inventoryNode, nodeFindings, NODE_EOL } from './node-inventory.js';
import { inventoryPhp, phpFindings, scanPhpSources } from './php-inventory.js';
import { scoreFindings, topFindings, type Score } from './score.js';
import type { DependencyFix, DepRef, Finding, Severity } from './types.js';

export type Analyzer = (packages: PackageRef[]) => Promise<PackageAnalysis[]>;

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
}

const MAX_CHECKED = 50;
const OSV_TO_FINDING: Record<OsvSeverity, Severity> = { critical: 'critical', high: 'high', medium: 'medium', low: 'low', unknown: 'medium' };
const RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function dockerNodeMajor(dockerfile: string | undefined): number | undefined {
  const m = dockerfile ? /^\s*FROM\s+node:(\d+)/im.exec(dockerfile) : null;
  return m ? Number(m[1]) : undefined;
}

function toRefs(deps: DepRef[], ecosystem: PackageRef['ecosystem']): PackageRef[] {
  return deps.map((d) => ({ name: d.name, ecosystem, version: d.version }));
}

function dependencyFindings(analyses: PackageAnalysis[], approx: Map<string, boolean>): Finding[] {
  const out: Finding[] = [];
  for (const a of analyses) {
    if (!a.affected || a.findings.length === 0) continue;
    const top = a.findings[0]; // already sorted most severe first
    const urgent = a.findings.some((f) => f.urgent);
    const fixed = top.fixedVersions[0];
    const approximate = approx.get(`${a.package.ecosystem}:${a.package.name}`) === true;
    out.push({
      id: `dep-vulnerable:${a.package.name}`,
      category: 'dependencies',
      severity: OSV_TO_FINDING[top.severity],
      title: `${a.package.name}@${a.package.version} has ${a.findings.length}${a.truncated ? '+' : ''} known advisories${urgent ? ' (urgent)' : ''}`,
      evidence: `${top.id}${approximate ? ' (version is approximate: no lockfile)' : ''}`,
      recommendation: fixed ? `Upgrade ${a.package.name} to ${fixed} or later.` : `Check ${top.id} for a fixed release of ${a.package.name}.`
    });
  }
  return out;
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

export async function assessDirectory(dir: string, opts: { analyze?: Analyzer; today?: Date } = {}): Promise<Assessment> {
  return (await assessFull(dir, opts)).assessment;
}

export async function assessFull(dir: string, opts: { analyze?: Analyzer; today?: Date } = {}): Promise<FullAssessment> {
  const today = opts.today ?? new Date();
  const analyze: Analyzer = opts.analyze ?? ((pkgs) => analyzePackages(pkgs));
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
  findings.push(...dependencyFindings(analyses, approx));

  const sorted = groupByRule(findings).sort((a, b) => RANK[b.severity] - RANK[a.severity] || a.id.localeCompare(b.id));
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
  return { assessment, findings: sorted, fixes: dependencyFixes(analyses, devByKey), files: c };
}
