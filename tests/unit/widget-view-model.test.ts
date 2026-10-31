import { describe, expect, it } from 'vitest';
import { MAX_FINDINGS, MAX_STAGES, MAX_STEPS, MAX_STRING, scoreBand, toViewModel, type AssessmentVM, type PlanVM } from '../../src/widgets/lib/view-model.js';

const assessment = {
  assessmentId: 'abc',
  stack: 'php',
  runtime: { declared: '^5.6', source: 'composer.json' },
  frameworks: [],
  uiLibraries: [],
  hosting: ['shared hosting'],
  dependencies: { total: 3, checked: 3, vulnerable: 2, urgent: 1, approximateVersions: true },
  score: {
    overall: 43,
    byCategory: { security: 50, dependencies: 12, runtime: 88, architecture: 100, standards: 100, cloud: 95 },
    counts: { critical: 1, high: 2, medium: 0, low: 0, info: 1 }
  },
  topFindings: [{ id: 'php-eol', category: 'runtime', severity: 'high', title: 'PHP 5.6 is end of life', evidence: 'composer.json', recommendation: 'Move to PHP 8.4.' }],
  findingCount: 4,
  truncated: false
};

const plan = {
  assessmentId: 'abc',
  stack: 'php',
  goal: 'modernize_all',
  scoreBefore: 43,
  scoreAfter: 100,
  stages: [
    { index: 1, id: 'patch-dependencies', title: 'Patch dependencies', kind: 'dependencies', automated: true, risk: 'low', addresses: [], steps: ['Bump guzzle'], rollback: 'Revert manifest.', scoreAfter: 61 },
    { index: 2, id: 'upgrade-runtime', title: 'Upgrade runtime', kind: 'runtime', automated: false, risk: 'high', addresses: [], steps: ['Edit code'], rollback: 'Revert.', scoreAfter: 100 }
  ],
  hint: 'Call preview_changes.'
};

describe('toViewModel', () => {
  it('shapes an assessment', () => {
    const vm = toViewModel(assessment) as AssessmentVM;
    expect(vm.kind).toBe('assessment');
    expect(vm.score).toBe(43);
    expect(vm.byCategory).toHaveLength(6);
    expect(vm.counts.find((c) => c.severity === 'critical')?.count).toBe(1);
    expect(vm.findings[0]).toMatchObject({ severity: 'high', title: 'PHP 5.6 is end of life', recommendation: 'Move to PHP 8.4.' });
    expect(vm.dependencies).toEqual({ total: 3, checked: 3, vulnerable: 2, urgent: 1, approximateVersions: true });
    expect(vm.runtime.declared).toBe('^5.6');
    expect(vm.hosting).toEqual(['shared hosting']);
  });

  it('shapes a plan', () => {
    const vm = toViewModel(plan) as PlanVM;
    expect(vm.kind).toBe('plan');
    expect(vm.scoreBefore).toBe(43);
    expect(vm.scoreAfter).toBe(100);
    expect(vm.stages.map((s) => [s.automated, s.risk, s.scoreAfter])).toEqual([
      [true, 'low', 61],
      [false, 'high', 100]
    ]);
  });

  it('parses a JSON string', () => {
    expect(toViewModel(JSON.stringify(plan)).kind).toBe('plan');
  });

  it.each([null, undefined, 42, 'nope', [], {}, { score: 'x' }, { score: {} }, true])('returns empty for %j', (input) => {
    expect(toViewModel(input)).toEqual({ kind: 'empty' });
  });

  it('never throws on hostile input', () => {
    const evil = {
      get stages(): unknown {
        throw new Error('boom');
      }
    };
    expect(toViewModel(evil)).toEqual({ kind: 'empty' });
  });

  it('tolerates missing optional fields', () => {
    const vm = toViewModel({ score: { overall: 70 }, topFindings: [{ title: 'Something', severity: 'weird' }, { nothing: 1 }, 'x'] }) as AssessmentVM;
    expect(vm.kind).toBe('assessment');
    expect(vm.stack).toBe('unknown');
    expect(vm.byCategory).toEqual([]);
    expect(vm.dependencies).toBeUndefined();
    expect(vm.hosting).toEqual([]);
    expect(vm.findings).toHaveLength(1);
    expect(vm.findings[0].severity).toBe('info');
    expect(vm.findings[0].evidence).toBeUndefined();
    const p = toViewModel({ stages: [{ title: 'Only title' }] }) as PlanVM;
    expect(p.stages[0]).toMatchObject({ index: 1, risk: 'medium', automated: false, steps: [] });
    expect(p.scoreAfter).toBeUndefined();
  });

  it('clamps scores to 0-100', () => {
    expect((toViewModel({ score: { overall: 250 } }) as AssessmentVM).score).toBe(100);
    expect((toViewModel({ score: { overall: 5, byCategory: { security: -5 } } }) as AssessmentVM).byCategory[0].score).toBe(0);
  });

  it('caps lists', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `f${i}`, severity: 'low', title: `Finding ${i}` }));
    const a = toViewModel({ score: { overall: 10 }, topFindings: many, findingCount: 30 }) as AssessmentVM;
    expect(a.findings).toHaveLength(MAX_FINDINGS);
    expect(a.findingCount).toBe(30);
    const stages = Array.from({ length: 20 }, (_, i) => ({ title: `S${i}`, steps: Array.from({ length: 20 }, (_, j) => `step ${j}`) }));
    const p = toViewModel({ stages }) as PlanVM;
    expect(p.stages).toHaveLength(MAX_STAGES);
    expect(p.stages[0].steps).toHaveLength(MAX_STEPS);
  });

  it('truncates very long strings', () => {
    const long = 'x'.repeat(5000);
    const a = toViewModel({ score: { overall: 10 }, topFindings: [{ title: long, evidence: long, recommendation: long }] }) as AssessmentVM;
    expect(a.findings[0].title.length).toBe(MAX_STRING);
    expect(a.findings[0].evidence!.length).toBe(MAX_STRING);
    expect(a.findings[0].recommendation!.length).toBe(MAX_STRING);
  });
});

describe('scoreBand', () => {
  it('maps thresholds', () => {
    expect([scoreBand(100), scoreBand(80), scoreBand(79), scoreBand(50), scoreBand(49)]).toEqual(['ok', 'ok', 'warn', 'warn', 'danger']);
  });
});
