// Typed, sanitized input for every report format (PDF, SARIF, CycloneDX). Built once from the assessment pipeline.
// Honest-claims rule (PLAN_V2 section 11): every number carries where it came from.
//   measured  = output of a tool run by Metamorph on the repository (assessment, runner)
//   projected = apply/plan preview: what the score WOULD be, not something that was run
//   reported  = taken from an outside feed (OSV, CISA KEV, EPSS, endoflife.date)
import type { FullAssessment } from '../assessment/assess.js';
import { inventoryNode } from '../assessment/node-inventory.js';
import { inventoryPhp } from '../assessment/php-inventory.js';
import type { Category, DependencyFix, Finding, ModernizationPlan, Severity } from '../assessment/types.js';
import { rankFindings, rankReason } from '../assessment/rank.js';
import type { ApplyResult } from '../planning/apply.js';

export type Origin = 'measured' | 'projected' | 'reported';

export interface Labelled<T> {
  value: T;
  origin: Origin;
  source?: string;
}

// src/modules/verify/result.ts does not exist on this branch, so this is the minimal shape the report needs from a
// runner. When the real runner result lands, map it onto this interface (or make it extend it).
export interface RunnerSummary {
  runner: string; // e.g. "github-actions" or "docker"
  startedAt?: string; // ISO 8601
  finishedAt?: string;
  checks: Array<{ name: string; status: 'passed' | 'failed' | 'skipped'; detail?: string; durationMs?: number }>;
  tools?: Array<{ name: string; version: string }>;
  scoreBefore?: number; // measured by the runner
  scoreAfter?: number;
}

// Optional feed provenance: which outside sources were consulted and when.
export interface FeedsData {
  sources: Array<{ name: string; url?: string; fetchedAt?: string }>;
}

export interface ReportMeta {
  repoUrl: string;
  subfolder?: string;
  commit?: string; // commit sha or ref when known
  generatedAt: string; // ISO 8601; also the PDF creation date, so identical input gives identical bytes
}

export interface ReportFinding {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  evidence?: string;
  recommendation: string;
  cwe: string[];
  owasp: string[];
  cvss?: Labelled<number>;
  epss?: Labelled<number>;
  kev: boolean; // origin: CISA KEV feed (reported); only ever true when listed
  rankReason: string; // why it sits at this position: KEV first, then severity, then EPSS
  source?: string;
}

export interface ReportDependency {
  ecosystem: 'npm' | 'composer';
  name: string;
  version: string;
  dev: boolean;
  approximate: boolean; // version derived from a range, not a lockfile
}

export interface ReportStage {
  index: number;
  id: string;
  title: string;
  kind: string;
  automated: boolean;
  risk: string;
  addresses: number; // count of finding ids
  scoreAfter: Labelled<number>; // projected
}

export interface ReportPatch {
  stageId: string;
  title: string;
  risk: string;
  files: Array<{ path: string; action: string }>;
  scoreBefore: Labelled<number>; // projected
  scoreAfter: Labelled<number>; // projected
  scoreDelta: Labelled<number>; // projected
  findingsFixed: number;
  remaining: number;
}

export interface ReportData {
  meta: ReportMeta;
  stack: string;
  runtime: string; // declared runtime constraint or "not declared"
  score: Labelled<number>;
  scoreByCategory: Array<{ category: Category; score: Labelled<number> }>;
  counts: Array<{ severity: Severity; count: Labelled<number> }>;
  findings: ReportFinding[]; // ranked: KEV, severity, EPSS (assessment/rank.ts)
  truncatedScan: boolean;
  dependencies: ReportDependency[];
  dependencyStats: { total: Labelled<number>; checked: Labelled<number>; vulnerable: Labelled<number>; urgent: Labelled<number>; approximate: boolean };
  fixes: Array<{ ecosystem: string; name: string; from: string; to: string; urgent: boolean; dev: boolean; origin: Origin }>;
  plan?: { goal: string; stack: string; scoreBefore: Labelled<number>; scoreAfter: Labelled<number>; stages: ReportStage[] };
  patches: ReportPatch[];
  verification?: { runner: string; startedAt?: string; finishedAt?: string; checks: RunnerSummary['checks']; scoreBefore?: Labelled<number>; scoreAfter?: Labelled<number> };
  tools: Array<{ name: string; version: string }>;
  sources: Array<{ name: string; url?: string; fetchedAt: string }>; // fetchedAt is "not recorded" when unknown
}

export const TOOL_NAME = 'Metamorph';
export const TOOL_VERSION = '1.0.0';
export const NOT_RECORDED = 'not recorded';
export const NOT_FETCHED_BUILT_IN = 'not fetched (built-in table)';

// ---- untrusted text handling ----

// Control characters (C0 except none, DEL, C1), line/paragraph separators and bidi override/isolate marks (spoofing).
// Tabs and newlines become one space: all report text is single-line plain text.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069\u200E\u200F\uFEFF]/g;

export function cleanText(v: unknown, max = 2000): string {
  if (v === undefined || v === null) return '';
  const s = (typeof v === 'string' ? v : String(v)).replace(CONTROL, ' ').replace(/ {2,}/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
}

function opt(v: unknown, max = 2000): string | undefined {
  const s = cleanText(v, max);
  return s === '' ? undefined : s;
}

// ---- builders ----

export function dependenciesFromFiles(files: Record<string, string>): ReportDependency[] {
  const out: ReportDependency[] = [];
  if ('package.json' in files) {
    const inv = inventoryNode({ packageJson: files['package.json'], packageLock: files['package-lock.json'] });
    for (const d of inv.deps) out.push({ ecosystem: 'npm', name: cleanText(d.name, 214), version: cleanText(d.version, 100), dev: d.dev, approximate: d.approximate });
  }
  if ('composer.json' in files) {
    const inv = inventoryPhp({ composerJson: files['composer.json'], composerLock: files['composer.lock'] }, 0);
    for (const d of inv.deps) out.push({ ecosystem: 'composer', name: cleanText(d.name, 214), version: cleanText(d.version, 100), dev: d.dev, approximate: d.approximate });
  }
  return out;
}

function toReportFinding(f: Finding): ReportFinding {
  const source = opt(f.source, 100);
  return {
    id: cleanText(f.id, 200),
    category: f.category,
    severity: f.severity,
    title: cleanText(f.title, 1000),
    ...(opt(f.evidence) ? { evidence: opt(f.evidence) } : {}),
    recommendation: cleanText(f.recommendation, 1000),
    cwe: (f.cwe ?? []).map((c) => cleanText(c, 20)).filter(Boolean),
    owasp: (f.owasp ?? []).map((c) => cleanText(c, 20)).filter(Boolean),
    ...(typeof f.cvss === 'number' && Number.isFinite(f.cvss) ? { cvss: { value: f.cvss, origin: 'reported' as const, ...(source ? { source } : {}) } } : {}),
    ...(typeof f.epss === 'number' && Number.isFinite(f.epss) ? { epss: { value: f.epss, origin: 'reported' as const, source: 'first.org EPSS' } } : {}),
    kev: f.kev === true,
    rankReason: cleanText(f.rankReason ?? rankReason(f), 80),
    ...(source ? { source } : {})
  };
}

const m = (value: number, source?: string): Labelled<number> => ({ value, origin: 'measured', ...(source ? { source } : {}) });
const p = (value: number, source?: string): Labelled<number> => ({ value, origin: 'projected', ...(source ? { source } : {}) });

export interface BuildReportInput {
  full: FullAssessment;
  meta: ReportMeta;
  plan?: ModernizationPlan;
  apply?: ApplyResult[];
  runner?: RunnerSummary;
  feeds?: FeedsData;
  dependencies?: ReportDependency[]; // defaults to the lockfile/manifest inventory of full.files
}

export function buildReportData(input: BuildReportInput): ReportData {
  const { full, meta, plan, apply, runner, feeds } = input;
  const a = full.assessment;
  const findings = rankFindings(full.findings).map(toReportFinding); // the same ranking assess_project and the plan use
  const dependencies = input.dependencies ?? dependenciesFromFiles(full.files);

  const sourceMap = new Map<string, { name: string; url?: string; fetchedAt: string }>();
  // Sources the assessment itself relied on (live endoflife.date answers, built-in EOL tables), then the caller's feed
  // list, which wins on a name clash. Built-in tables were never fetched, so they say so instead of "not recorded".
  for (const s of full.sources ?? []) {
    const name = cleanText(s.name, 120);
    if (name) sourceMap.set(name, { name, ...(opt(s.url, 300) ? { url: opt(s.url, 300) } : {}), fetchedAt: s.builtIn ? NOT_FETCHED_BUILT_IN : (opt(s.fetchedAt, 40) ?? NOT_RECORDED) });
  }
  for (const s of feeds?.sources ?? []) {
    const name = cleanText(s.name, 120);
    if (name) sourceMap.set(name, { name, ...(opt(s.url, 300) ? { url: opt(s.url, 300) } : {}), fetchedAt: opt(s.fetchedAt, 40) ?? NOT_RECORDED });
  }
  // Sources named by findings but not in the feed list: listed with an honest "not recorded" fetch time.
  for (const f of findings) if (f.source && !sourceMap.has(f.source)) sourceMap.set(f.source, { name: f.source, fetchedAt: NOT_RECORDED });

  const tools = [
    { name: TOOL_NAME, version: TOOL_VERSION },
    { name: 'Node.js', version: cleanText(process.versions.node, 20) },
    ...(runner?.tools ?? []).map((t) => ({ name: cleanText(t.name, 80), version: cleanText(t.version, 40) }))
  ];

  return {
    meta: {
      repoUrl: cleanText(meta.repoUrl, 300),
      ...(opt(meta.subfolder, 200) ? { subfolder: opt(meta.subfolder, 200) } : {}),
      ...(opt(meta.commit, 80) ? { commit: opt(meta.commit, 80) } : {}),
      generatedAt: meta.generatedAt
    },
    stack: cleanText(a.stack, 20),
    runtime: opt(a.runtime.declared, 100) ?? 'not declared',
    score: m(a.score.overall, 'Metamorph scoring'),
    scoreByCategory: (Object.keys(a.score.byCategory) as Category[]).map((c) => ({ category: c, score: m(a.score.byCategory[c]) })),
    counts: (['critical', 'high', 'medium', 'low', 'info'] as Severity[]).map((s) => ({ severity: s, count: m(a.score.counts[s]) })),
    findings,
    truncatedScan: a.truncated,
    dependencies,
    dependencyStats: {
      total: m(a.dependencies.total),
      checked: m(a.dependencies.checked),
      vulnerable: { value: a.dependencies.vulnerable, origin: 'reported', source: 'osv.dev' },
      urgent: { value: a.dependencies.urgent, origin: 'reported', source: 'osv.dev + CISA KEV' },
      approximate: a.dependencies.approximateVersions
    },
    fixes: full.fixes.map((f: DependencyFix) => ({ ecosystem: f.ecosystem, name: cleanText(f.name, 214), from: cleanText(f.from, 100), to: cleanText(f.to, 100), urgent: f.urgent, dev: f.dev, origin: 'reported' as const })),
    ...(plan
      ? {
          plan: {
            goal: plan.goal,
            stack: plan.stack,
            scoreBefore: m(plan.scoreBefore),
            scoreAfter: p(plan.scoreAfter, 'plan preview'),
            stages: plan.stages.map((s) => ({
              index: s.index,
              id: cleanText(s.id, 60),
              title: cleanText(s.title, 200),
              kind: s.kind,
              automated: s.automated,
              risk: s.risk,
              addresses: s.addresses.length,
              scoreAfter: p(s.scoreAfter, 'plan preview')
            }))
          }
        }
      : {}),
    patches: (apply ?? []).map((r) => ({
      stageId: cleanText(r.stage.id, 60),
      title: cleanText(r.stage.title, 200),
      risk: r.stage.risk,
      files: r.files.map((f) => ({ path: cleanText(f.path, 500), action: f.action })),
      scoreBefore: p(r.scoreBefore, 'apply preview'),
      scoreAfter: p(r.scoreAfter, 'apply preview'),
      scoreDelta: p(r.scoreDelta, 'apply preview'),
      findingsFixed: r.findingsFixed.length,
      remaining: r.remaining.length
    })),
    ...(runner
      ? {
          verification: {
            runner: cleanText(runner.runner, 80),
            ...(opt(runner.startedAt, 40) ? { startedAt: opt(runner.startedAt, 40) } : {}),
            ...(opt(runner.finishedAt, 40) ? { finishedAt: opt(runner.finishedAt, 40) } : {}),
            checks: runner.checks.map((c) => ({ name: cleanText(c.name, 200), status: c.status, ...(opt(c.detail, 500) ? { detail: opt(c.detail, 500) } : {}), ...(typeof c.durationMs === 'number' ? { durationMs: c.durationMs } : {}) })),
            ...(typeof runner.scoreBefore === 'number' ? { scoreBefore: m(runner.scoreBefore, runner.runner) } : {}),
            ...(typeof runner.scoreAfter === 'number' ? { scoreAfter: m(runner.scoreAfter, runner.runner) } : {})
          }
        }
      : {}),
    tools,
    sources: [...sourceMap.values()]
  };
}
