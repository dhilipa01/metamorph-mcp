// Report generation core: renders the requested formats, keeps them in a small in-memory cache and shapes the MCP
// tool result. Pure of network and repo access so it can be tested directly.
import { createHash } from 'node:crypto';
import { renderPdf } from './pdf.js';
import type { ReportData } from './report-data.js';
import { renderSarif } from './sarif.js';
import { renderSbom } from './sbom.js';

export type ReportFormat = 'pdf' | 'sarif' | 'sbom';
export const FORMATS: readonly ReportFormat[] = ['pdf', 'sarif', 'sbom'];

// Embed content in the tool result only below this size: MCP payloads are JSON (base64 adds about 33%) and clients
// struggle with big ones. Above it the caller gets the summary and a resource link.
export const EMBED_LIMIT_BYTES = 1024 * 1024;
export const CACHE_MAX_ENTRIES = 5;
export const CACHE_TTL_MS = 10 * 60 * 1000;

const SUFFIX: Record<ReportFormat, string> = { pdf: 'pdf', sarif: 'sarif', sbom: 'cdx.json' };
export const MIME: Record<ReportFormat, string> = { pdf: 'application/pdf', sarif: 'application/sarif+json', sbom: 'application/vnd.cyclonedx+json' };
export const URI_PREFIX = 'metamorph://report/';

export function reportUri(id: string, format: ReportFormat): string {
  return `${URI_PREFIX}${id}.${SUFFIX[format]}`;
}

export interface Artifact {
  format: ReportFormat;
  mimeType: string;
  data: Buffer; // pdf: PDF bytes; sarif/sbom: UTF-8 JSON
}

export class ReportCache {
  private entries = new Map<string, { at: number; artifacts: Map<ReportFormat, Artifact> }>();
  constructor(
    private readonly now: () => number = Date.now,
    private readonly max = CACHE_MAX_ENTRIES,
    private readonly ttlMs = CACHE_TTL_MS
  ) {}

  put(id: string, artifacts: Artifact[]): void {
    this.entries.delete(id); // re-insert moves it to the newest position
    this.entries.set(id, { at: this.now(), artifacts: new Map(artifacts.map((a) => [a.format, a])) });
    this.sweep();
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value as string);
  }

  get(id: string, format: ReportFormat): Artifact | undefined {
    this.sweep();
    const e = this.entries.get(id);
    if (!e) return undefined;
    this.entries.delete(id); // LRU: reading refreshes recency, not the TTL
    this.entries.set(id, e);
    return e.artifacts.get(format);
  }

  get size(): number {
    this.sweep();
    return this.entries.size;
  }

  private sweep(): void {
    const t = this.now();
    for (const [k, v] of this.entries) if (t - v.at > this.ttlMs) this.entries.delete(k);
  }
}

export const reportCache = new ReportCache();

// uri -> artifact for the @Resource handlers: metamorph://report/<id>.pdf | .sarif | .cdx.json
export function lookupResource(uri: string, cache: ReportCache = reportCache): Artifact | undefined {
  if (!uri.startsWith(URI_PREFIX)) return undefined;
  const name = uri.slice(URI_PREFIX.length);
  for (const f of FORMATS) {
    const suffix = `.${SUFFIX[f]}`;
    if (name.endsWith(suffix)) {
      const id = name.slice(0, -suffix.length);
      return /^[a-f0-9]{24}$/.test(id) ? cache.get(id, f) : undefined;
    }
  }
  return undefined;
}

export interface ReportSummary {
  reportId: string;
  score: { overall: number; origin: 'measured' };
  findings: { total: number; critical: number; high: number; medium: number; low: number; info: number };
  pages?: number;
  formats: Array<{ format: ReportFormat; bytes: number; mimeType: string; uri: string; embedded: boolean }>;
  message: string;
}

export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'resource'; resource: { uri: string; mimeType: string; text?: string; blob?: string } }
  | { type: 'resource_link'; uri: string; name: string; mimeType: string; description?: string };

export interface ReportToolResult {
  content: ToolContent[];
  structuredContent: ReportSummary;
}

export async function generateReport(data: ReportData, formats: ReportFormat[] = ['pdf'], cache: ReportCache = reportCache): Promise<ReportToolResult> {
  const wanted = FORMATS.filter((f) => formats.includes(f));
  if (wanted.length === 0) throw new Error('No valid format requested. Use pdf, sarif or sbom.');
  const artifacts: Artifact[] = [];
  let pages: number | undefined;
  for (const format of wanted) {
    if (format === 'pdf') {
      const r = await renderPdf(data);
      pages = r.pages;
      artifacts.push({ format, mimeType: MIME.pdf, data: r.buffer });
    } else {
      const text = format === 'sarif' ? renderSarif(data) : renderSbom(data);
      artifacts.push({ format, mimeType: MIME[format], data: Buffer.from(text, 'utf8') });
    }
  }
  const h = createHash('sha256');
  for (const a of artifacts) h.update(a.format).update(a.data);
  const reportId = h.digest('hex').slice(0, 24);
  cache.put(reportId, artifacts);

  const counts = Object.fromEntries(data.counts.map((c) => [c.severity, c.count.value])) as Record<string, number>;
  const content: ToolContent[] = [];
  const formatsOut: ReportSummary['formats'] = [];
  const oversized: string[] = [];
  for (const a of artifacts) {
    const uri = reportUri(reportId, a.format);
    const embedded = a.data.length < EMBED_LIMIT_BYTES;
    formatsOut.push({ format: a.format, bytes: a.data.length, mimeType: a.mimeType, uri, embedded });
    if (embedded) {
      content.push({ type: 'resource', resource: { uri, mimeType: a.mimeType, ...(a.format === 'pdf' ? { blob: a.data.toString('base64') } : { text: a.data.toString('utf8') }) } });
    } else {
      oversized.push(a.format);
      content.push({ type: 'resource_link', uri, name: `metamorph-report.${SUFFIX[a.format]}`, mimeType: a.mimeType, description: 'Too large to embed; read this resource within 10 minutes.' });
    }
  }
  const message =
    oversized.length > 0
      ? `${oversized.join(', ')} exceeded ${EMBED_LIMIT_BYTES / 1024 / 1024} MB and is not embedded. Read it through the resource link (kept in memory for 10 minutes).`
      : `All requested formats are embedded. They are also readable as resources for 10 minutes.`;
  const summary: ReportSummary = {
    reportId,
    score: { overall: data.score.value, origin: 'measured' },
    findings: {
      total: data.findings.length,
      critical: counts.critical ?? 0,
      high: counts.high ?? 0,
      medium: counts.medium ?? 0,
      low: counts.low ?? 0,
      info: counts.info ?? 0
    },
    ...(pages !== undefined ? { pages } : {}),
    formats: formatsOut,
    message
  };
  content.unshift({ type: 'text', text: JSON.stringify(summary, null, 2) });
  return { content, structuredContent: summary };
}
