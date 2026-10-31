import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_PAGES, MAX_PDF_BYTES, NO_RUNNER_SENTENCE, PAGE_MARGIN, renderPdf, safeText } from '../../src/modules/report/pdf.js';
import { ReportCache, generateReport, lookupResource, reportUri } from '../../src/modules/report/report.js';
import { buildReportData, cleanText, type ReportDependency, type RunnerSummary } from '../../src/modules/report/report-data.js';
import { buildSarif, locationOf } from '../../src/modules/report/sarif.js';
import { buildSbom, purlOf } from '../../src/modules/report/sbom.js';
import { FIXTURES, NOW, dataOf, fullOf, manyFindings, phpShopReportData } from '../helpers/report-fixtures.js';


// ---- poppler helpers (layout checks run only when installed) ----
const have = (cmd: string) => spawnSync(cmd, ['-v'], { encoding: 'utf8' }).error === undefined;
const POPPLER = have('pdftotext') && have('pdftoppm');
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
async function tmp(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'metamorph-report-'));
  dirs.push(d);
  return d;
}

interface Box { x0: number; y0: number; x1: number; y1: number; text: string }
interface PageBoxes { width: number; height: number; words: Box[] }

async function bboxPages(pdf: Buffer): Promise<PageBoxes[]> {
  const dir = await tmp();
  const file = join(dir, 'in.pdf');
  await writeFile(file, pdf);
  const r = spawnSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  expect(r.status).toBe(0);
  const pages: PageBoxes[] = [];
  for (const chunk of r.stdout.split('<page ').slice(1)) {
    const dims = chunk.match(/width="([\d.]+)" height="([\d.]+)"/);
    const words: Box[] = [];
    for (const m of chunk.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
      words.push({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text: m[5] });
    }
    pages.push({ width: +(dims?.[1] ?? 0), height: +(dims?.[2] ?? 0), words });
  }
  return pages;
}

describe('PDF: worst-case fixtures', () => {
  for (const [name, make] of Object.entries(FIXTURES)) {
    it(`${name}: renders within caps and deterministically`, async () => {
      const data = make();
      const a = await renderPdf(data);
      expect(a.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(a.pages).toBeGreaterThanOrEqual(1);
      expect(a.pages).toBeLessThanOrEqual(MAX_PAGES);
      expect(a.bytes).toBeLessThan(MAX_PDF_BYTES);
      const b = await renderPdf(make());
      expect(b.buffer.equals(a.buffer)).toBe(true);
    }, 60_000);
  }
});

describe.skipIf(!POPPLER)('PDF layout (needs pdftotext and pdftoppm from poppler-utils)', () => {
  for (const [name, make] of Object.entries(FIXTURES)) {
    it(`${name}: words stay inside margins, no blank page, header and page numbers on every page`, async () => {
      const r = await renderPdf(make());
      const pages = await bboxPages(r.buffer);
      expect(pages.length).toBe(r.pages);
      const tol = 1.5;
      pages.forEach((p, i) => {
        expect(p.width).toBeCloseTo(595.28, 0);
        expect(p.words.length, `page ${i + 1} has no text`).toBeGreaterThan(0);
        for (const w of p.words) {
          expect(w.x0, `"${w.text}" on page ${i + 1}`).toBeGreaterThanOrEqual(PAGE_MARGIN - tol);
          expect(w.x1, `"${w.text}" on page ${i + 1}`).toBeLessThanOrEqual(p.width - PAGE_MARGIN + tol);
          expect(w.y0).toBeGreaterThanOrEqual(0);
          expect(w.y1).toBeLessThanOrEqual(p.height);
        }
        const text = p.words.map((w) => w.text).join(' ');
        expect(text, `header on page ${i + 1}`).toContain('Metamorph assessment report');
        expect(text, `page number on page ${i + 1}`).toContain(`Page ${i + 1} of ${pages.length}`);
        // body text: something beyond the header (y < 40) and footer (y > height - 40) must exist
        const body = p.words.filter((w) => w.y0 > PAGE_MARGIN - 2 && w.y1 < p.height - PAGE_MARGIN + 2);
        expect(body.length, `page ${i + 1} is blank`).toBeGreaterThan(0);
      });
    }, 60_000);
  }

  it('control characters never reach the PDF text layer and unsupported scripts become "?"', async () => {
    const r = await renderPdf(FIXTURES['control characters']());
    const dir = await tmp();
    const f = join(dir, 'c.pdf');
    await writeFile(f, r.buffer);
    const t = spawnSync('pdftotext', [f, '-'], { encoding: 'utf8' }).stdout;
    // eslint-disable-next-line no-control-regex
    expect(/[\u0000-\u0008\u000B\u001B\u0085]/.test(t)).toBe(false);
    expect(t).toContain('bell');
  });

  it('renders Latin, Greek and Cyrillic text', async () => {
    const r = await renderPdf(FIXTURES['unicode, RTL and emoji']());
    const dir = await tmp();
    const f = join(dir, 'u.pdf');
    await writeFile(f, r.buffer);
    const t = spawnSync('pdftotext', [f, '-'], { encoding: 'utf8' }).stdout;
    expect(t).toContain('Привет');
    expect(t).toContain('Ελληνικά');
  });
});

describe.runIf(!POPPLER)('PDF layout checks', () => {
  it.skip('SKIPPED: pdftotext/pdftoppm (poppler-utils) not found on this machine', () => {});
});

describe('PDF content rules', () => {
  it.skipIf(!POPPLER)('cover page shows score, severity strip, the top 3 ranked findings and the what-it-is note, and nothing spills to page 2', async () => {
    const data = dataOf(manyFindings(40), { repoUrl: 'https://github.com/owner/repo' });
    data.meta.commit = '0123456789abcdef0123456789abcdef01234567';
    data.meta.subfolder = 'apps/shop';
    const r = await renderPdf(data);
    const dir = await tmp();
    const f = join(dir, 'c.pdf');
    await writeFile(f, r.buffer);
    const page = (n: number) => spawnSync('pdftotext', ['-f', String(n), '-l', String(n), f, '-'], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ');
    const one = page(1);
    expect(one).toContain('Modernization assessment report');
    expect(one).toContain('0123456789abcdef0123456789abcdef01234567'); // full sha, no break inserted
    expect(one).toContain('apps/shop');
    expect(one).toContain(`${data.score.value} / 100`);
    expect(one).toContain('Origin: measured');
    for (const label of ['Critical', 'High', 'Medium', 'Low', 'Info']) expect(one).toContain(label);
    expect(one).toContain('A score of 100 means nothing our checks detect; projected numbers are estimates; only runner results are measured.');
    for (const top of data.findings.slice(0, 3)) {
      expect(one).toContain(top.rankReason);
    }
    expect(one).toContain(data.findings[0].title.slice(0, 20));
    expect(one).not.toContain('Executive summary'); // that starts on page 2
    expect(page(2)).toContain('Executive summary');
  }, 30_000);

  it('says exactly that nothing was verified when no runner result is attached', async () => {
    const r = await renderPdf(dataOf(manyFindings(3)));
    expect(r.buffer.length).toBeGreaterThan(1000);
    const d = dataOf(manyFindings(3));
    expect(d.verification).toBeUndefined();
    // the sentence lives in the document definition; verify via the text layer when poppler is present
    if (POPPLER) {
      const dir = await tmp();
      const f = join(dir, 'v.pdf');
      await writeFile(f, r.buffer);
      const t = spawnSync('pdftotext', [f, '-'], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ');
      expect(t).toContain(NO_RUNNER_SENTENCE);
    }
  });

  it('shows runner checks when a runner result is attached', async () => {
    const runner: RunnerSummary = { runner: 'docker', checks: [{ name: 'composer audit', status: 'passed' }, { name: 'phpstan', status: 'failed', detail: '3 errors' }], scoreBefore: 40, scoreAfter: 70 };
    const d = dataOf(manyFindings(3), { runner });
    expect(d.verification?.scoreAfter).toEqual({ value: 70, origin: 'measured', source: 'docker' });
    const r = await renderPdf(d);
    if (POPPLER) {
      const dir = await tmp();
      const f = join(dir, 'v2.pdf');
      await writeFile(f, r.buffer);
      const t = spawnSync('pdftotext', [f, '-'], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ');
      expect(t).toContain('composer audit');
      expect(t).not.toContain(NO_RUNNER_SENTENCE);
    }
  });

  it('labels every number with an origin', () => {
    const d = dataOf(manyFindings(10));
    expect(d.score.origin).toBe('measured');
    expect(d.counts.every((c) => c.count.origin === 'measured')).toBe(true);
    expect(d.findings.filter((f) => f.cvss).every((f) => f.cvss?.origin === 'reported')).toBe(true);
    expect(d.findings.filter((f) => f.epss).every((f) => f.epss?.origin === 'reported')).toBe(true);
  });

  it('safeText strips controls, caps at 200, adds soft breaks and chunks unbroken runs', () => {
    expect(safeText('a\u0000b\u0007c')).toBe('a b c');
    expect(Array.from(safeText('x'.repeat(500))).filter((c) => c !== '​').length).toBe(200);
    expect(safeText('src/a-b_c.php')).toBe('src/​a-​b_​c.​php');
    const chunks = safeText('y'.repeat(100)).split('​');
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(14);
    expect(safeText('😀 العربية').replace(/\u200B/g, '')).toBe('? ???????');
    expect(cleanText('a‮b c')).toBe('a b c');
  });
});

describe('SARIF 2.1.0', () => {
  const noNulls = (v: unknown, path = '$'): void => {
    expect(v, `null at ${path}`).not.toBeNull();
    if (Array.isArray(v)) v.forEach((x, i) => noNulls(x, `${path}[${i}]`));
    else if (typeof v === 'object' && v) for (const [k, x] of Object.entries(v)) noNulls(x, `${path}.${k}`);
  };

  it('has the required structure, rule ids, cwe tags and locations only when known', () => {
    const d = dataOf([...manyFindings(8), { id: 'no-loc', category: 'runtime', severity: 'high', title: 'T', evidence: '3 of 9 dependencies', recommendation: 'R' }]);
    const s = JSON.parse(JSON.stringify(buildSarif(d)));
    noNulls(s);
    expect(s.version).toBe('2.1.0');
    expect(s.$schema).toContain('sarif-2.1.0');
    expect(s.runs).toHaveLength(1);
    const run = s.runs[0];
    expect(run.tool.driver.name).toBe('Metamorph');
    const ids = new Set(run.tool.driver.rules.map((r: { id: string }) => r.id));
    expect(ids.size).toBe(run.tool.driver.rules.length);
    for (const res of run.results) {
      expect(ids.has(res.ruleId)).toBe(true);
      expect(run.tool.driver.rules[res.ruleIndex].id).toBe(res.ruleId);
      expect(['error', 'warning', 'note']).toContain(res.level);
      expect(typeof res.message.text).toBe('string');
    }
    const rule0 = run.tool.driver.rules.find((r: { id: string }) => r.id === 'rule-0');
    expect(rule0.properties.tags).toContain('external/cwe/cwe-89');
    const withLoc = run.results.find((r: { ruleId: string }) => r.ruleId === 'rule-1');
    expect(withLoc.locations[0].physicalLocation).toEqual({ artifactLocation: { uri: 'src/module1/file1.php' }, region: { startLine: 2 } });
    expect(run.results.find((r: { ruleId: string }) => r.ruleId === 'no-loc').locations).toBeUndefined();
  });

  it('locationOf rejects absolute and traversal paths', () => {
    expect(locationOf('/etc/passwd:1')).toBeUndefined();
    expect(locationOf('../x.php:1')).toBeUndefined();
    expect(locationOf('a/b.php')).toEqual({ path: 'a/b.php' });
    expect(locationOf('index.php:12')).toEqual({ path: 'index.php', line: 12 });
  });
});

describe('CycloneDX 1.5 SBOM', () => {
  const deps: ReportDependency[] = [
    { ecosystem: 'npm', name: 'lodash', version: '4.17.15', dev: false, approximate: false },
    { ecosystem: 'npm', name: '@scope/pkg', version: '1.0.0', dev: true, approximate: true },
    { ecosystem: 'composer', name: 'Guzzlehttp/Guzzle', version: '6.5.0', dev: false, approximate: false },
    { ecosystem: 'composer', name: 'guzzlehttp/guzzle', version: '6.5.0', dev: false, approximate: false }
  ];

  it('has required fields, valid purls, no nulls, no duplicate refs', () => {
    const s = JSON.parse(JSON.stringify(buildSbom(dataOf([], { deps }))));
    expect(s.bomFormat).toBe('CycloneDX');
    expect(s.specVersion).toBe('1.5');
    expect(s.serialNumber).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(s.version).toBe(1);
    expect(s.metadata.component).toMatchObject({ type: 'application', name: 'owner/repo' });
    expect(s.components).toHaveLength(3);
    const refs = s.components.map((c: { 'bom-ref': string }) => c['bom-ref']);
    expect(new Set(refs).size).toBe(refs.length);
    for (const c of s.components) {
      expect(c.type).toBe('library');
      expect(c.purl).toMatch(/^pkg:(npm|composer)\/[^@\s]+@[^\s]+$/);
      expect(c.purl.startsWith('pkg:npm/%40') || c.purl.startsWith('pkg:composer/') || c.purl.startsWith('pkg:npm/lodash')).toBe(true);
    }
    expect(JSON.stringify(s)).not.toContain('null');
    expect(s.dependencies[0].dependsOn).toHaveLength(3);
  });

  it('builds purls for npm scopes and composer vendors', () => {
    expect(purlOf({ ecosystem: 'npm', name: '@angular/core', version: '12.0.0' })).toBe('pkg:npm/%40angular/core@12.0.0');
    expect(purlOf({ ecosystem: 'composer', name: 'Symfony/Http-Kernel', version: 'v4.4.0' })).toBe('pkg:composer/symfony/http-kernel@v4.4.0');
    expect(purlOf({ ecosystem: 'npm', name: 'x', version: '1.0.0+build' })).toBe('pkg:npm/x@1.0.0%2Bbuild');
  });

  it('is deterministic', () => {
    const d = dataOf([], { deps });
    expect(JSON.stringify(buildSbom(d))).toBe(JSON.stringify(buildSbom(d)));
  });
});

describe('cache and tool result', () => {
  it('evicts by TTL (10 min) and by size (5 entries)', () => {
    let t = 0;
    const c = new ReportCache(() => t);
    const art = (n: string) => [{ format: 'sarif' as const, mimeType: 'x', data: Buffer.from(n) }];
    for (let i = 0; i < 6; i++) c.put(`id${i}`, art(String(i)));
    expect(c.size).toBe(5);
    expect(c.get('id0', 'sarif')).toBeUndefined();
    expect(c.get('id5', 'sarif')?.data.toString()).toBe('5');
    t += 10 * 60 * 1000 + 1;
    expect(c.get('id5', 'sarif')).toBeUndefined();
    expect(c.size).toBe(0);
  });

  it('embeds pdf as base64 blob and sarif/sbom as text, and serves them as resources', async () => {
    const cache = new ReportCache();
    const res = await generateReport(dataOf(manyFindings(5), { deps: [{ ecosystem: 'npm', name: 'a', version: '1.0.0', dev: false, approximate: false }] }), ['pdf', 'sarif', 'sbom'], cache);
    const resources = res.content.filter((c) => c.type === 'resource');
    expect(resources).toHaveLength(3);
    const pdf = res.content.find((c) => c.type === 'resource' && c.resource.mimeType === 'application/pdf');
    expect(pdf && pdf.type === 'resource' && Buffer.from(pdf.resource.blob ?? '', 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    const sarif = res.content.find((c) => c.type === 'resource' && c.resource.mimeType.includes('sarif'));
    expect(sarif && sarif.type === 'resource' && JSON.parse(sarif.resource.text ?? '{}').version).toBe('2.1.0');
    expect(res.structuredContent.pages).toBeGreaterThan(0);
    const id = res.structuredContent.reportId;
    expect(lookupResource(reportUri(id, 'pdf'), cache)?.data.subarray(0, 5).toString()).toBe('%PDF-');
    expect(lookupResource(reportUri(id, 'sbom'), cache)?.mimeType).toContain('cyclonedx');
    expect(lookupResource('metamorph://report/../../etc/passwd.pdf', cache)).toBeUndefined();
  }, 30_000);

  it('returns a resource link and a message instead of content above 1 MB', async () => {
    const cache = new ReportCache();
    const deps = Array.from({ length: 6000 }, (_, i) => ({ ecosystem: 'npm' as const, name: `package-with-a-long-name-${i}`, version: `1.${i}.0`, dev: false, approximate: false }));
    const res = await generateReport(dataOf([], { deps }), ['sbom'], cache);
    expect(res.structuredContent.formats[0].embedded).toBe(false);
    expect(res.content.some((c) => c.type === 'resource')).toBe(false);
    expect(res.content.some((c) => c.type === 'resource_link')).toBe(true);
    expect(res.structuredContent.message).toContain('not embedded');
  });
});

describe('real sample: php-shop fixture', () => {
  it('assesses, plans and renders a PDF', async () => {
    const dir = await tmp();
    const data = await phpShopReportData(dir);
    const r = await renderPdf(data);
    const out = process.env.METAMORPH_SAMPLE_PDF ?? '/tmp/metamorph-sample-php-shop.pdf';
    await writeFile(out, r.buffer);
    console.log(`sample php-shop PDF: ${out} pages=${r.pages} bytes=${r.bytes}`);
    expect(r.pages).toBeGreaterThanOrEqual(5);
    expect(r.pages).toBeLessThanOrEqual(MAX_PAGES);
  }, 30_000);
});
