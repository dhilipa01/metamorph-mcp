import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessDirectory, type Analyzer } from '../../src/modules/assessment/assess.js';
import { writeNodeFixture, writePhpFixture } from '../helpers/fixtures.js';
import { writeModernPhpFixture } from '../helpers/fixtures-modern.js';

const TODAY = new Date('2026-10-30T00:00:00Z');
const dirs: string[] = [];
const temp = async () => {
  const d = await mkdtemp(join(tmpdir(), 'metamorph-assess-'));
  dirs.push(d);
  return d;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

// Deterministic stand-in for OSV: every package is "affected" with one high, urgent finding.
const fakeOsv: Analyzer = async (pkgs) =>
  pkgs.map((p) => ({
    package: p,
    affected: true,
    truncated: false,
    findings: [{ id: 'GHSA-test-test-test', aliases: [], severity: 'high' as const, summary: 'test advisory', fixedVersions: ['9.9.9'], urgent: true, urgentReasons: ['high_severity' as const] }]
  }));

describe('assessDirectory: legacy Node fixture', () => {
  it('reports runtime EOL, deprecated package, env file, vulnerable deps and a low score', async () => {
    const dir = await temp();
    await writeNodeFixture(dir);
    const a = await assessDirectory(dir, { analyze: fakeOsv, today: TODAY });
    const ids = a.topFindings.map((f) => f.id);
    expect(a.stack).toBe('node');
    expect(a.runtime.minMajor).toBe(10);
    expect(ids).toContain('node-runtime-eol');
    expect(a.topFindings.some((f) => f.id === 'node-deprecated-package' && f.evidence === 'request')).toBe(true);
    expect(a.topFindings.some((f) => f.id === 'env-file-committed')).toBe(true);
    expect(a.dependencies).toMatchObject({ total: 3, checked: 3, vulnerable: 3, urgent: 3, approximateVersions: false });
    expect(a.score.overall).toBeLessThan(60);
    expect(a.assessmentId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('keeps going and says so when the vulnerability service fails', async () => {
    const dir = await temp();
    await writeNodeFixture(dir);
    const a = await assessDirectory(dir, { analyze: async () => { throw new Error('down'); }, today: TODAY });
    expect(a.findingCount).toBeGreaterThan(0);
    expect(a.dependencies.vulnerable).toBe(0);
  });
});

describe('assessDirectory: legacy PHP fixture', () => {
  it('detects PHP smells, composer versions and hosting hints', async () => {
    const dir = await temp();
    await writePhpFixture(dir);
    const a = await assessDirectory(dir, { analyze: fakeOsv, today: TODAY });
    const ids = a.topFindings.map((f) => f.id);
    expect(a.stack).toBe('php');
    expect(a.hosting).toContain('apache-htaccess');
    expect(ids).toEqual(expect.arrayContaining(['php-sql-concatenation']));
    expect(a.dependencies.checked).toBe(2);
    expect(a.dependencies.approximateVersions).toBe(false);
    expect(a.score.overall).toBeLessThan(60);
  });
});

// OSV stand-in for "no known advisories", matching the live check of the pinned modern versions.
const cleanOsv: Analyzer = async (pkgs) => pkgs.map((p) => ({ package: p, affected: false, findings: [], truncated: false }));

describe('assessDirectory: modernized PHP shop', () => {
  it('scores 100 with no findings above info once every issue is fixed', async () => {
    const dir = await temp();
    await writeModernPhpFixture(dir);
    const a = await assessDirectory(dir, { analyze: cleanOsv, today: TODAY });
    expect(a.topFindings.filter((f) => f.severity !== 'info')).toEqual([]);
    expect(a.score.overall).toBe(100);
    expect(a.runtime.declared).toBe('^8.4');
    expect(a.hosting).toEqual(expect.arrayContaining(['docker', 'github-actions']));
  });

  it('the legacy shop scores far lower than the modernized one', async () => {
    const legacy = await temp();
    await writePhpFixture(legacy);
    const before = await assessDirectory(legacy, { analyze: fakeOsv, today: TODAY });
    const modern = await temp();
    await writeModernPhpFixture(modern);
    const after = await assessDirectory(modern, { analyze: cleanOsv, today: TODAY });
    expect(after.score.overall - before.score.overall).toBeGreaterThan(70);
  });
});

describe('assessDirectory: edge cases', () => {
  it('an empty directory is "unknown" and does not throw', async () => {
    const dir = await temp();
    const a = await assessDirectory(dir, { analyze: fakeOsv, today: TODAY });
    expect(a.stack).toBe('unknown');
    expect(a.dependencies.total).toBe(0);
  });

  it('is deterministic for the same input', async () => {
    const dir = await temp();
    await writeNodeFixture(dir);
    const a = await assessDirectory(dir, { analyze: fakeOsv, today: TODAY });
    const b = await assessDirectory(dir, { analyze: fakeOsv, today: TODAY });
    expect(b.assessmentId).toBe(a.assessmentId);
    expect(b.score).toEqual(a.score);
  });
});
