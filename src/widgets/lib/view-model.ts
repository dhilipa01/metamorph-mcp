// Pure data shaping for the score dashboard widget. No React, no I/O, never throws.
// Accepts the output of assess_project or plan_modernization and returns a capped, typed view model.

export const MAX_FINDINGS = 10;
export const MAX_STAGES = 8;
export const MAX_STEPS = 6;
export const MAX_STRING = 200;
export const MAX_FIXED = 15;
export const MAX_REMAINING = 5;
export const MAX_FILES = 10;
export const MAX_CHECKS = 12;
export const MAX_REASONS = 6;

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Risk = 'low' | 'medium' | 'high';

export interface FindingVM {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  evidence?: string;
  recommendation?: string;
  rankReason?: string;
}

export interface StageVM {
  index: number;
  id: string;
  title: string;
  kind: string;
  automated: boolean;
  risk: Risk;
  steps: string[];
  rollback?: string;
  scoreAfter?: number;
}

export interface DependenciesVM {
  total?: number;
  checked: number;
  vulnerable: number;
  urgent: number;
  approximateVersions: boolean;
}

export interface AssessmentVM {
  kind: 'assessment';
  stack: string;
  score: number;
  byCategory: Array<{ category: string; score: number }>;
  counts: Array<{ severity: Severity; count: number }>;
  findings: FindingVM[];
  findingCount: number;
  dependencies?: DependenciesVM;
  runtime: { declared?: string; source?: string };
  hosting: string[];
  truncated: boolean;
}

export interface PlanVM {
  kind: 'plan';
  stack: string;
  goal: string;
  scoreBefore?: number;
  scoreAfter?: number;
  stages: StageVM[];
  hint?: string;
}

export interface ApplyVM {
  kind: 'apply';
  stage: { id: string; index?: number; title: string; risk: Risk };
  mode: 'projected';
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  findingsFixed: string[];
  fixedCount: number;
  remaining: Array<{ id: string; severity: Severity; title: string }>;
  remainingCount: number;
  files: Array<{ path: string; action: 'create' | 'edit' | 'delete' }>;
  fileCount: number;
  note?: string;
}

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timed_out';
export type CheckStatus = 'pass' | 'fail' | 'error' | 'skipped';

export interface RunVM {
  status: RunStatus;
  runId?: string;
  buildOk?: boolean;
  patchApplied?: boolean;
  tests?: { ran: number; passed: number; failed: number };
}

export interface VerifyVM {
  kind: 'verify';
  status: RunStatus;
  verified: boolean;
  reasons: string[];
  reasonCount: number;
  stage?: string;
  patched: RunVM;
  baseline: RunVM;
  checks: Array<{ tool: string; status: CheckStatus }>;
  checkCount: number;
  hint?: string;
}

export interface EmptyVM {
  kind: 'empty';
}

export type ViewModel = AssessmentVM | PlanVM | ApplyVM | VerifyVM | EmptyVM;

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const RISKS: Risk[] = ['low', 'medium', 'high'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (t === '') return undefined;
  return t.length > MAX_STRING ? `${t.slice(0, MAX_STRING - 1)}…` : t;
}

function strList(v: unknown, cap: number): string[] {
  return Array.isArray(v) ? v.map(str).filter((s): s is string => s !== undefined).slice(0, cap) : [];
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function count(v: unknown): number {
  const n = num(v);
  return n === undefined ? 0 : Math.max(0, Math.round(n));
}

function pct(v: unknown): number | undefined {
  const n = num(v);
  return n === undefined ? undefined : Math.min(100, Math.max(0, Math.round(n)));
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function finding(raw: unknown): FindingVM | undefined {
  if (!isObj(raw)) return undefined;
  const title = str(raw.title);
  if (!title) return undefined;
  return {
    id: str(raw.id) ?? title,
    severity: oneOf(raw.severity, SEVERITIES, 'info'),
    category: str(raw.category) ?? 'general',
    title,
    evidence: str(raw.evidence),
    recommendation: str(raw.recommendation),
    rankReason: str(raw.rankReason)
  };
}

function stage(raw: unknown, i: number): StageVM | undefined {
  if (!isObj(raw)) return undefined;
  const title = str(raw.title);
  if (!title) return undefined;
  return {
    index: num(raw.index) ?? i + 1,
    id: str(raw.id) ?? `stage-${i + 1}`,
    title,
    kind: str(raw.kind) ?? 'code',
    automated: raw.automated === true,
    risk: oneOf(raw.risk, RISKS, 'medium'),
    steps: strList(raw.steps, MAX_STEPS),
    rollback: str(raw.rollback),
    scoreAfter: pct(raw.scoreAfter)
  };
}

function list<T>(raw: unknown, cap: number, map: (x: unknown, i: number) => T | undefined): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (let i = 0; i < raw.length && out.length < cap; i++) {
    const v = map(raw[i], i);
    if (v !== undefined) out.push(v);
  }
  return out;
}

function toApply(o: Record<string, unknown>, before: number, after: number): ApplyVM {
  const st = isObj(o.stage) ? o.stage : {};
  const fixedAll = Array.isArray(o.findingsFixed) ? o.findingsFixed.length : 0;
  const fixed = strList(o.findingsFixed, MAX_FIXED);
  const remainingAll = Array.isArray(o.remaining) ? o.remaining.length : 0;
  const remaining = list(o.remaining, MAX_REMAINING, (r) => {
    if (!isObj(r)) return undefined;
    const title = str(r.title);
    if (!title) return undefined;
    return { id: str(r.id) ?? title, severity: oneOf(r.severity, SEVERITIES, 'info'), title };
  });
  const filesAll = Array.isArray(o.files) ? o.files.length : 0;
  const files = list(o.files, MAX_FILES, (f) => {
    if (!isObj(f)) return undefined;
    const path = str(f.path);
    if (!path) return undefined;
    return { path, action: oneOf(f.action, ['create', 'edit', 'delete'] as const, 'edit') };
  });
  return {
    kind: 'apply',
    stage: { id: str(st.id) ?? 'stage', index: num(st.index), title: str(st.title) ?? str(st.id) ?? 'Stage', risk: oneOf(st.risk, RISKS, 'medium') },
    mode: 'projected',
    scoreBefore: before,
    scoreAfter: after,
    scoreDelta: Math.round(num(o.scoreDelta) ?? after - before),
    findingsFixed: fixed,
    fixedCount: Math.max(fixedAll, fixed.length),
    remaining,
    remainingCount: Math.max(remainingAll, remaining.length),
    files,
    fileCount: Math.max(filesAll, files.length),
    note: str(o.note)
  };
}

const RUN_STATUSES: RunStatus[] = ['queued', 'running', 'completed', 'failed', 'timed_out'];
const CHECK_STATUSES: CheckStatus[] = ['pass', 'fail', 'error', 'skipped'];

function run(raw: unknown): RunVM {
  const o = isObj(raw) ? raw : {};
  const t = isObj(o.tests) ? o.tests : undefined;
  return {
    status: oneOf(o.status, RUN_STATUSES, 'failed'),
    runId: str(o.runId),
    buildOk: typeof o.buildOk === 'boolean' ? o.buildOk : undefined,
    patchApplied: typeof o.patchApplied === 'boolean' ? o.patchApplied : undefined,
    tests: t ? { ran: count(t.ran), passed: count(t.passed), failed: count(t.failed) } : undefined
  };
}

// verify_patch output. `verified` is true only when the tool says so AND no reason is listed: a green label can never
// come from a missing field or from a reason list that was dropped.
function toVerify(o: Record<string, unknown>): VerifyVM {
  const reasonsAll = Array.isArray(o.unverifiedReasons) ? o.unverifiedReasons.length : 0;
  const reasons = strList(o.unverifiedReasons, MAX_REASONS);
  const patched = isObj(o.patched) ? o.patched : {};
  const checksAll = Array.isArray(patched.checks) ? patched.checks.length : 0;
  const checks = list(patched.checks, MAX_CHECKS, (c) => {
    if (!isObj(c)) return undefined;
    const tool = str(c.tool);
    return tool ? { tool, status: oneOf(c.status, CHECK_STATUSES, 'error') } : undefined;
  });
  const st = isObj(o.stage) ? o.stage : undefined;
  return {
    kind: 'verify',
    status: oneOf(o.status, RUN_STATUSES, 'failed'),
    verified: o.verified === true && reasonsAll === 0 && run(o.patched).status === 'completed',
    reasons,
    reasonCount: Math.max(reasonsAll, reasons.length),
    stage: st ? (str(st.title) ?? str(st.id)) : undefined,
    patched: run(o.patched),
    baseline: run(o.baseline),
    checks,
    checkCount: Math.max(checksAll, checks.length, count(patched.checkCount)),
    hint: str(o.hint)
  };
}

function toAssessment(o: Record<string, unknown>, score: Record<string, unknown>): AssessmentVM {
  const byCat = isObj(score.byCategory) ? score.byCategory : {};
  const counts = isObj(score.counts) ? score.counts : {};
  const deps = isObj(o.dependencies) ? o.dependencies : undefined;
  const runtime = isObj(o.runtime) ? o.runtime : {};
  const findings = list(o.topFindings, MAX_FINDINGS, finding);
  return {
    kind: 'assessment',
    stack: str(o.stack) ?? 'unknown',
    score: pct(score.overall) ?? 0,
    byCategory: Object.entries(byCat)
      .map(([category, v]) => ({ category: category.slice(0, 40), score: pct(v) }))
      .filter((x): x is { category: string; score: number } => x.score !== undefined),
    counts: SEVERITIES.map((severity) => ({ severity, count: count(counts[severity]) })),
    findings,
    findingCount: Math.max(count(o.findingCount), findings.length),
    dependencies: deps
      ? {
          total: num(deps.total) === undefined ? undefined : count(deps.total),
          checked: count(deps.checked),
          vulnerable: count(deps.vulnerable),
          urgent: count(deps.urgent),
          approximateVersions: deps.approximateVersions === true
        }
      : undefined,
    runtime: { declared: str(runtime.declared), source: str(runtime.source) },
    hosting: strList(o.hosting, 10),
    truncated: o.truncated === true
  };
}

export function toViewModel(output: unknown): ViewModel {
  try {
    let o: unknown = output;
    if (typeof o === 'string') {
      try {
        o = JSON.parse(o);
      } catch {
        return { kind: 'empty' };
      }
    }
    if (!isObj(o)) return { kind: 'empty' };
    if (Array.isArray(o.stages)) {
      return {
        kind: 'plan',
        stack: str(o.stack) ?? 'unknown',
        goal: str(o.goal) ?? 'modernize_all',
        scoreBefore: pct(o.scoreBefore),
        scoreAfter: pct(o.scoreAfter),
        stages: list(o.stages, MAX_STAGES, stage),
        hint: str(o.hint)
      };
    }
    if (o.mode === 'measured' && typeof o.verified === 'boolean' && isObj(o.patched)) return toVerify(o);
    const before = pct(o.scoreBefore);
    const after = pct(o.scoreAfter);
    if (before !== undefined && after !== undefined && (o.mode === 'projected' || (isObj(o.stage) && Array.isArray(o.files)))) {
      return toApply(o, before, after);
    }
    if (isObj(o.score) && num(o.score.overall) !== undefined) return toAssessment(o, o.score);
    return { kind: 'empty' };
  } catch {
    return { kind: 'empty' };
  }
}

export function scoreBand(score: number): 'ok' | 'warn' | 'danger' {
  return score >= 80 ? 'ok' : score >= 50 ? 'warn' : 'danger';
}
