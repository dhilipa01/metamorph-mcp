// PDF report builder following docs/PLAN_V2.md section 8. pdfmake does the layout; this file only declares content.
// Rules enforced here: A4 with 40pt margins, one base size (10pt body, 8pt tables), bundled Roboto only (no network,
// no local file access beyond the font folder), repeating table headers, rows that never split, fixed or star column
// widths, headings kept with the next block, soft break points + 200 char cap on long strings, top-N findings in the
// body and the rest in an appendix, hard caps on pages and bytes, untrusted text rendered as plain text, and a fixed
// creation date so identical input gives identical bytes.
import { createRequire } from 'node:module';
import * as path from 'node:path';
import type { Origin, ReportData, ReportFinding } from './report-data.js';
import { NOT_RECORDED, cleanText } from './report-data.js';

export const MAX_PAGES = 30;
export const MAX_PDF_BYTES = 3 * 1024 * 1024;
export const MAX_FIELD_CHARS = 200;
export const TOP_FINDINGS = 25;
export const PAGE_MARGIN = 40;
export const NO_RUNNER_SENTENCE = 'Not verified: no runner result attached';

// ---- minimal pdfmake surface (the package ships no type definitions) ----
type Node = Record<string, unknown>;
type DocDefinition = Record<string, unknown>;
interface PdfOutput {
  getBuffer(): Promise<Buffer>;
}
interface PdfMake {
  setFonts(f: Record<string, Record<string, string>>): void;
  setTableLayouts(l: Record<string, unknown>): void;
  setUrlAccessPolicy(cb: (url: string) => boolean): void;
  setLocalAccessPolicy(cb: (p: string) => boolean): void;
  createPdf(doc: DocDefinition, options?: Record<string, unknown>): PdfOutput;
}

const TABLE_LAYOUT = {
  metamorph: {
    hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
    vLineWidth: () => 0,
    hLineColor: () => COLORS.rule,
    fillColor: (row: number) => (row === 0 ? COLORS.head : null),
    paddingLeft: () => 3,
    paddingRight: () => 3,
    paddingTop: () => 2,
    paddingBottom: () => 2
  }
};

const require_ = createRequire(import.meta.url);
let engine: PdfMake | undefined;

function getEngine(): PdfMake {
  if (engine) return engine;
  const pm = require_('pdfmake') as PdfMake;
  // Bundled fonts: Roboto ships inside the pdfmake package. Nothing is fetched at render time.
  const dir = path.join(path.dirname(require_.resolve('pdfmake/package.json')), 'build', 'fonts', 'Roboto');
  pm.setFonts({
    Roboto: {
      normal: path.join(dir, 'Roboto-Regular.ttf'),
      bold: path.join(dir, 'Roboto-Medium.ttf'),
      italics: path.join(dir, 'Roboto-Italic.ttf'),
      bolditalics: path.join(dir, 'Roboto-MediumItalic.ttf')
    }
  });
  pm.setTableLayouts(TABLE_LAYOUT);
  pm.setUrlAccessPolicy(() => false); // no network, ever
  pm.setLocalAccessPolicy((p) => path.resolve(p).startsWith(dir + path.sep)); // only the bundled font folder
  engine = pm;
  return pm;
}

// ---- text safety ----

const ZWSP = '\u200B';

// Roboto covers Latin, Greek and Cyrillic plus common punctuation. Anything else (CJK, Arabic, emoji) has no glyph in
// the bundled font, so it is shown as "?" instead of an empty box. The SARIF and SBOM exports keep the original text.
function renderable(cp: number): boolean {
  return (
    (cp >= 0x20 && cp <= 0x7e) ||
    (cp >= 0xa0 && cp <= 0x24f) ||
    (cp >= 0x370 && cp <= 0x52f) ||
    (cp >= 0x1e00 && cp <= 0x1eff) ||
    (cp >= 0x2010 && cp <= 0x2027) ||
    (cp >= 0x2030 && cp <= 0x205e) ||
    cp === 0x20ac ||
    cp === 0x2122 ||
    cp === 0x2212
  );
}

const BREAK_AFTER = new Set(['/', '-', '_', '.', ':', '@', '=', ',', ';', '+', '&', '?', '#', '\\']);

// Plain text only: strips control chars, caps at `max` code points (with an ellipsis), maps glyphs the font lacks to
// "?", and inserts zero-width break points after / - _ . and (for runs with none) every `chunk` characters.
export function safeText(input: unknown, max = MAX_FIELD_CHARS, chunk = 14): string {
  // eslint-disable-next-line no-control-regex
  const stripped = String(input ?? '').replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF]/g, ' ');
  let cps = Array.from(stripped.replace(/ {2,}/g, ' ').trim());
  if (cps.length > max) cps = [...cps.slice(0, max - 1), '…'];
  let out = '';
  let run = 0;
  for (let i = 0; i < cps.length; i++) {
    const ch = cps[i];
    const safe = renderable(ch.codePointAt(0) ?? 0) ? ch : '?';
    if (safe === ' ') {
      out += safe;
      run = 0;
      continue;
    }
    if (run >= chunk) {
      out += ZWSP;
      run = 0;
    }
    out += safe;
    run++;
    const next = cps[i + 1];
    if (BREAK_AFTER.has(safe) && next !== undefined && next !== ' ') {
      out += ZWSP;
      run = 0;
    }
  }
  return out;
}

// ---- small builders ----

const COLORS = { text: '#1a1a1a', muted: '#555555', rule: '#b8b8b8', head: '#e8ecf1', accent: '#0b3d91' };

const ORIGIN_NOTE: Record<Origin, string> = {
  measured: 'measured by a tool run',
  projected: 'projected from a preview, not run',
  reported: 'reported by an outside feed'
};

function label(v: { value: number; origin: Origin }, suffix = ''): string {
  return `${v.value}${suffix} (${v.origin})`;
}

const h1 = (text: string, pageBreak = false): Node => ({ text, style: 'h1', headlineLevel: 1, ...(pageBreak ? { pageBreak: 'before' } : {}) });
const h2 = (text: string): Node => ({ text, style: 'h2', headlineLevel: 2 });
const para = (text: string, extra: Node = {}): Node => ({ text: safeText(text, 600, 40), style: 'body', ...extra });
const th = (text: string): Node => ({ text, style: 'th' });
const td = (text: unknown, extra: Node = {}): Node => ({ text: safeText(text), style: 'td', ...extra });

interface TableOpts {
  widths: Array<number | string>;
  header: string[];
  rows: Node[][];
}

function table(o: TableOpts): Node {
  return {
    style: 'tableBlock',
    table: {
      headerRows: 1,
      dontBreakRows: true,
      keepWithHeaderRows: 1,
      widths: o.widths,
      body: [o.header.map(th), ...o.rows]
    },
    layout: 'metamorph'
  };
}

function note(text: string): Node {
  return { text: safeText(text, 600, 40), style: 'note' };
}

// ---- sections ----

export interface Caps {
  topN: number;
  appendixRows: number;
  dependencyRows: number;
  patchFileRows: number;
}

export const DEFAULT_CAPS: Caps = { topN: TOP_FINDINGS, appendixRows: 300, dependencyRows: 250, patchFileRows: 40 };

function findingRow(f: ReportFinding): Node[] {
  return [
    td(f.severity, { bold: true }),
    td(f.id),
    {
      stack: [
        { text: safeText(f.title), style: 'td' },
        { text: safeText(`Fix: ${f.recommendation}`), style: 'tdMuted' }
      ]
    },
    td(f.cwe.join(', ') || '-'),
    td(f.owasp.join(', ') || '-'),
    td(f.cvss ? String(f.cvss.value) : '-'),
    td(f.epss ? f.epss.value.toFixed(3) : '-'),
    td(f.kev ? 'YES' : '-', f.kev ? { bold: true } : {})
  ];
}

function cover(d: ReportData): Node[] {
  const lines: Node[] = [
    { text: 'Modernization assessment report', style: 'title', margin: [0, 120, 0, 8] },
    { text: safeText(d.meta.repoUrl, MAX_FIELD_CHARS, 40), style: 'subtitle' },
    { text: `Overall score: ${d.score.value} / 100`, style: 'score', margin: [0, 40, 0, 2] },
    { text: `Origin: ${d.score.origin} (${ORIGIN_NOTE[d.score.origin]}). Higher is healthier.`, style: 'body' },
    {
      style: 'tableBlock',
      margin: [0, 30, 0, 0],
      table: {
        widths: [110, '*'],
        body: [
          [th('Repository'), td(d.meta.repoUrl)],
          [th('Folder'), td(d.meta.subfolder ?? '(repository root)')],
          [th('Commit / ref'), td(d.meta.commit ?? 'not recorded (default branch at scan time)')],
          [th('Generated'), td(d.meta.generatedAt)],
          [th('Detected stack'), td(d.stack)],
          [th('Declared runtime'), td(d.runtime)]
        ]
      },
      layout: 'metamorph'
    }
  ];
  return lines;
}

function executiveSummary(d: ReportData): Node[] {
  const total = d.counts.reduce((n, c) => n + c.count.value, 0);
  const kev = d.findings.filter((f) => f.kev).length;
  const sev = (s: string) => d.counts.find((c) => c.severity === s)?.count.value ?? 0;
  const out: Node[] = [h1('Executive summary', true)];
  out.push(
    para(
      total === 0
        ? `No findings were produced for this repository. The overall score is ${label(d.score)}. A clean result only covers the checks Metamorph runs; it is not a guarantee.`
        : `Metamorph found ${total} distinct findings (${sev('critical')} critical, ${sev('high')} high, ${sev('medium')} medium, ${sev('low')} low, ${sev('info')} informational). The overall score is ${label(d.score)} out of 100.`
    )
  );
  if (kev > 0) out.push(para(`${kev} finding(s) concern vulnerabilities listed in the CISA Known Exploited Vulnerabilities catalog (reported by the CISA feed). Treat these first.`, { bold: true }));
  if (d.truncatedScan) out.push(para('The repository was larger than the scan limit, so some files were not inspected. Counts may be lower than reality.'));
  if (d.dependencyStats.approximate) out.push(para('Some dependency versions were derived from ranges because no lockfile was present, so vulnerability results are indicative.'));
  out.push(h2('Findings by severity'));
  out.push(
    table({
      widths: [90, 60, '*'],
      header: ['Severity', 'Count', 'Origin'],
      rows: d.counts.map((c) => [td(c.severity), td(c.count.value), td(`${c.count.origin}: ${ORIGIN_NOTE[c.count.origin]}`)])
    })
  );
  out.push(h2('Score by category'));
  out.push(
    table({
      widths: [120, 60, '*'],
      header: ['Category', 'Score', 'Origin'],
      rows: d.scoreByCategory.map((c) => [td(c.category), td(c.score.value), td(c.score.origin)])
    })
  );
  return out;
}

function findingsSection(d: ReportData, caps: Caps): Node[] {
  const out: Node[] = [h1('Findings by CWE and OWASP', true)];
  const top = d.findings.slice(0, caps.topN);
  if (d.findings.length === 0) {
    out.push(para('No findings.'));
    return out;
  }
  // Group counts per OWASP category (measured counts of findings that carry a mapping).
  const byOwasp = new Map<string, number>();
  for (const f of d.findings) for (const o of f.owasp) byOwasp.set(o, (byOwasp.get(o) ?? 0) + 1);
  if (byOwasp.size > 0) {
    out.push(h2('Findings per OWASP Top 10 (2021) category'));
    out.push(
      table({
        widths: [100, 60, '*'],
        header: ['OWASP', 'Findings', 'Origin'],
        rows: [...byOwasp.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => [td(k), td(n), td('measured (count); mapping reported by CWE tables')])
      })
    );
  }
  out.push(h2(`Top ${top.length} findings, KEV first, then severity and EPSS`));
  out.push(
    table({
      widths: [44, 80, '*', 50, 46, 40, 40, 40],
      header: ['Severity', 'Rule id', 'Finding and fix', 'CWE', 'OWASP', 'CVSS\nreported', 'EPSS\nreported', 'KEV\nreported'],
      rows: top.map(findingRow)
    })
  );
  if (d.findings.length > top.length) out.push(note(`${d.findings.length - top.length} more findings are listed in Appendix A.`));
  return out;
}

function planSection(d: ReportData): Node[] {
  const out: Node[] = [h1('Modernization plan', true)];
  if (!d.plan) {
    out.push(para('No plan was attached to this report.'));
    return out;
  }
  const pl = d.plan;
  out.push(para(`Goal: ${pl.goal}. Score before: ${label(pl.scoreBefore)}. Score after all stages: ${label(pl.scoreAfter)}. Projected scores are estimates from the plan, not results of running the changes.`));
  out.push(
    table({
      widths: [20, 100, '*', 56, 40, 38, 70],
      header: ['#', 'Stage', 'Title', 'Kind', 'Mode', 'Risk', 'Score after (projected)'],
      rows: pl.stages.map((s) => [td(s.index), td(s.id), td(s.title), td(s.kind), td(s.automated ? 'automated' : 'guided'), td(s.risk), td(`${s.scoreAfter.value} (projected)`)])
    })
  );
  if (pl.stages.length === 0) out.push(para('The plan has no stages: nothing to modernize automatically.'));
  return out;
}

function patchSection(d: ReportData, caps: Caps): Node[] {
  const out: Node[] = [h1('Patch summary')];
  if (d.patches.length === 0) {
    out.push(para('No patch was generated for this report. Use apply_stage to produce one.'));
    return out;
  }
  out.push(para('Every figure below is projected: the patch was applied to a throwaway copy and re-assessed, and the project itself was not modified or executed.'));
  out.push(
    table({
      widths: [110, '*', 40, 60, 60, 50],
      header: ['Stage', 'Title', 'Risk', 'Score before (projected)', 'Score after (projected)', 'Findings fixed (projected)'],
      rows: d.patches.map((r) => [td(r.stageId), td(r.title), td(r.risk), td(label(r.scoreBefore)), td(`${label(r.scoreAfter)}, delta ${r.scoreDelta.value}`), td(`${r.findingsFixed} fixed, ${r.remaining} remaining`)])
    })
  );
  const files = d.patches.flatMap((r) => r.files.map((f) => ({ stage: r.stageId, ...f })));
  if (files.length > 0) {
    out.push(h2('Files changed'));
    out.push(
      table({
        widths: [110, 50, '*'],
        header: ['Stage', 'Action', 'Path'],
        rows: files.slice(0, caps.patchFileRows).map((f) => [td(f.stage), td(f.action), td(f.path)])
      })
    );
    if (files.length > caps.patchFileRows) out.push(note(`${files.length - caps.patchFileRows} more changed files are omitted from this table.`));
  }
  return out;
}

function verificationSection(d: ReportData): Node[] {
  const out: Node[] = [h1('Verification results')];
  const v = d.verification;
  if (!v) {
    out.push(para(NO_RUNNER_SENTENCE + '.', { bold: true }));
    out.push(para('Scores in this report come from static analysis of the repository, or are projected. Nothing was built, installed or tested.'));
    return out;
  }
  out.push(para(`Runner: ${v.runner}. Started: ${v.startedAt ?? NOT_RECORDED}. Finished: ${v.finishedAt ?? NOT_RECORDED}.`));
  if (v.scoreBefore && v.scoreAfter) out.push(para(`Score before: ${label(v.scoreBefore)}. Score after: ${label(v.scoreAfter)}. Both measured by the runner.`));
  out.push(
    table({
      widths: [150, 50, '*', 60],
      header: ['Check', 'Status', 'Detail', 'Duration (measured)'],
      rows: v.checks.map((c) => [td(c.name), td(c.status, { bold: c.status === 'failed' }), td(c.detail ?? '-'), td(typeof c.durationMs === 'number' ? `${c.durationMs} ms` : '-')])
    })
  );
  return out;
}

function dependencySection(d: ReportData, caps: Caps): Node[] {
  const s = d.dependencyStats;
  const out: Node[] = [h1('Dependencies and SBOM summary', true)];
  out.push(
    para(
      `${label(s.total)} direct dependencies, ${label(s.checked)} checked against OSV, ${label(s.vulnerable)} with known advisories, ${label(s.urgent)} urgent. The full machine-readable list is the CycloneDX SBOM export.`
    )
  );
  if (d.fixes.length > 0) {
    out.push(h2('Available fixes (reported by OSV)'));
    out.push(
      table({
        widths: ['*', 60, 70, 70, 36],
        header: ['Package', 'Ecosystem', 'From', 'To', 'Urgent'],
        rows: d.fixes.slice(0, 60).map((f) => [td(f.name), td(f.ecosystem), td(f.from), td(f.to), td(f.urgent ? 'YES' : '-', f.urgent ? { bold: true } : {})])
      })
    );
  }
  out.push(h2('Direct dependencies (measured from manifests and lockfiles)'));
  if (d.dependencies.length === 0) out.push(para('No dependencies were found.'));
  else {
    out.push(
      table({
        widths: ['*', 60, 100, 40, 54],
        header: ['Package', 'Ecosystem', 'Version', 'Dev', 'Version source'],
        rows: d.dependencies.slice(0, caps.dependencyRows).map((x) => [td(x.name), td(x.ecosystem), td(x.version), td(x.dev ? 'dev' : 'prod'), td(x.approximate ? 'range' : 'exact')])
      })
    );
    if (d.dependencies.length > caps.dependencyRows) out.push(note(`${d.dependencies.length - caps.dependencyRows} more dependencies are in the SBOM export.`));
  }
  return out;
}

function appendix(d: ReportData, caps: Caps): Node[] {
  const out: Node[] = [h1('Appendix A: all findings', true)];
  const rest = d.findings.slice(caps.topN);
  if (rest.length === 0) out.push(para(d.findings.length === 0 ? 'No findings.' : 'All findings are already listed in the body.'));
  else {
    out.push(
      table({
        widths: [44, 100, '*', 150],
        header: ['Severity', 'Rule id', 'Title', 'Evidence'],
        rows: rest.slice(0, caps.appendixRows).map((f) => [td(f.severity), td(f.id), td(f.title), td(f.evidence ?? '-')])
      })
    );
    if (rest.length > caps.appendixRows) out.push(note(`${rest.length - caps.appendixRows} further findings are omitted to respect the page cap; the SARIF export lists every finding.`));
  }
  out.push(note(`Strings longer than ${MAX_FIELD_CHARS} characters are cut with an ellipsis in this PDF. The SARIF export holds the full text. Characters outside Latin, Greek and Cyrillic appear as "?" because the bundled font has no glyphs for them.`));
  out.push(h1('Appendix B: tool versions'));
  out.push(
    table({
      widths: ['*', 150],
      header: ['Tool', 'Version'],
      rows: d.tools.map((t) => [td(t.name), td(t.version)])
    })
  );
  out.push(h1('Appendix C: sources and fetch times'));
  if (d.sources.length === 0) out.push(para('No outside sources were consulted for this report.'));
  else {
    out.push(
      table({
        widths: [140, '*', 110],
        header: ['Source', 'URL', 'Fetched at'],
        rows: d.sources.map((s) => [td(s.name), td(s.url ?? '-'), td(s.fetchedAt)])
      })
    );
  }
  return out;
}

// ---- document ----

export function buildDocDefinition(d: ReportData, caps: Caps = DEFAULT_CAPS, maxPages: number = MAX_PAGES): DocDefinition {
  const repoShort = safeText(d.meta.repoUrl, 60, 30);
  return {
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN],
    language: 'en-US',
    tagged: true,
    displayTitle: true,
    compress: true,
    maxPagesNumber: maxPages,
    info: {
      title: `Metamorph assessment report: ${cleanText(d.meta.repoUrl, 150)}`,
      author: 'Metamorph',
      subject: 'Legacy project modernization assessment',
      keywords: 'assessment, modernization, security, SBOM',
      creator: 'Metamorph',
      creationDate: new Date(d.meta.generatedAt)
    },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: COLORS.text, lineHeight: 1.15 },
    styles: {
      title: { fontSize: 26, bold: true, color: COLORS.accent },
      subtitle: { fontSize: 12, color: COLORS.muted },
      score: { fontSize: 30, bold: true, color: COLORS.accent },
      h1: { fontSize: 16, bold: true, color: COLORS.accent, margin: [0, 0, 0, 8] },
      h2: { fontSize: 12, bold: true, margin: [0, 10, 0, 4] },
      body: { fontSize: 10, margin: [0, 0, 0, 6] },
      note: { fontSize: 8, italics: true, color: COLORS.muted, margin: [0, 4, 0, 6] },
      th: { fontSize: 8, bold: true },
      td: { fontSize: 8 },
      tdMuted: { fontSize: 8, color: COLORS.muted },
      tableBlock: { margin: [0, 2, 0, 8] }
    },
    header: () => ({
      margin: [PAGE_MARGIN, 18, PAGE_MARGIN, 0],
      columns: [
        { text: 'Metamorph assessment report', fontSize: 8, bold: true, color: COLORS.muted, width: 170 },
        { text: repoShort, fontSize: 8, color: COLORS.muted, alignment: 'right', width: '*' }
      ]
    }),
    footer: (currentPage: number, pageCount: number) => ({
      margin: [PAGE_MARGIN, 8, PAGE_MARGIN, 0],
      columns: [
        { text: `Generated ${d.meta.generatedAt.slice(0, 10)}`, fontSize: 8, color: COLORS.muted, width: '*' },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 8, color: COLORS.muted, alignment: 'right', width: 100 }
      ]
    }),
    pageBreakBefore: (current: { headlineLevel?: number }, following: unknown[]) => current.headlineLevel !== undefined && following.length === 0,
    content: [
      ...cover(d),
      ...executiveSummary(d),
      ...findingsSection(d, caps),
      ...planSection(d),
      ...patchSection(d, caps),
      ...verificationSection(d),
      ...dependencySection(d, caps),
      ...appendix(d, caps)
    ]
  };
}

// ---- render ----

export interface RenderedPdf {
  buffer: Buffer;
  pages: number;
  bytes: number;
  caps: Caps;
  reducedCaps: boolean;
}

export class ReportTooLargeError extends Error {}

export function countPages(buf: Buffer): number {
  const text = buf.toString('latin1');
  return (text.match(/\/Type \/Page(?![s\w])/g) ?? []).length;
}

function shrink(c: Caps): Caps {
  return { topN: c.topN, appendixRows: Math.floor(c.appendixRows / 2), dependencyRows: Math.floor(c.dependencyRows / 2), patchFileRows: Math.floor(c.patchFileRows / 2) };
}

// Renders the report. If the layout would run past MAX_PAGES the long tables are halved and it tries again, so the
// result never silently loses its last pages. Throws ReportTooLargeError if even the smallest layout is too big.
export async function renderPdf(d: ReportData, opts: { caps?: Caps; maxPages?: number; maxBytes?: number } = {}): Promise<RenderedPdf> {
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const maxBytes = opts.maxBytes ?? MAX_PDF_BYTES;
  let caps = opts.caps ?? DEFAULT_CAPS;
  const initial = caps;
  const pm = getEngine();
  for (let attempt = 0; attempt < 6; attempt++) {
    // maxPages + 1 so an overflow is visible instead of being cut off by pdfmake.
    const buffer = await pm.createPdf(buildDocDefinition(d, caps, maxPages + 1)).getBuffer();
    const pages = countPages(buffer);
    if (pages <= maxPages) {
      if (buffer.length > maxBytes) throw new ReportTooLargeError(`The PDF is ${buffer.length} bytes, above the ${maxBytes} byte cap.`);
      return { buffer, pages, bytes: buffer.length, caps, reducedCaps: caps !== initial };
    }
    caps = shrink(caps);
  }
  throw new ReportTooLargeError(`The report does not fit in ${maxPages} pages even with the smallest tables.`);
}
