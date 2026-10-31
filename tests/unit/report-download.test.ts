import { describe, it, expect } from 'vitest';
import { DOWNLOAD_TTL_SECONDS, signDownloadToken, verifyDownloadToken } from '../../src/common/download-token.js';
import { handleReportDownload, registerReportRoutes, reportRoutesActive, type Req, type Res } from '../../src/modules/report/download.js';
import { publicBase, linkProvider } from '../../src/modules/report/links.js';
import { ReportCache } from '../../src/modules/report/report.js';

const SECRET = 'a'.repeat(32);
const ID = 'a1b2c3d4e5f60718293a4b5c';
const NOW = 1_800_000_000;

describe('download token', () => {
  it('accepts a valid token', () => {
    const t = signDownloadToken({ id: ID, ext: 'pdf' }, SECRET, NOW);
    expect(verifyDownloadToken(t, { id: ID, ext: 'pdf' }, SECRET, NOW + 5)).toEqual({ ok: true });
  });
  it('lives 10 minutes', () => {
    expect(DOWNLOAD_TTL_SECONDS).toBe(600);
    const t = signDownloadToken({ id: ID, ext: 'pdf' }, SECRET, NOW);
    expect(verifyDownloadToken(t, { id: ID, ext: 'pdf' }, SECRET, NOW + 599).ok).toBe(true);
    expect(verifyDownloadToken(t, { id: ID, ext: 'pdf' }, SECRET, NOW + 600)).toEqual({ ok: false, reason: 'expired' });
  });
  it('rejects a tampered payload or signature', () => {
    const t = signDownloadToken({ id: ID, ext: 'pdf' }, SECRET, NOW);
    const [p, s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, id: ID, ext: 'pdf', exp: NOW + 99999 })).toString('base64url');
    expect(verifyDownloadToken(`${forged}.${s}`, { id: ID, ext: 'pdf' }, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(verifyDownloadToken(`${p}.${s.slice(0, -2)}AA`, { id: ID, ext: 'pdf' }, SECRET, NOW).ok).toBe(false);
  });
  it('is bound to id and extension', () => {
    const t = signDownloadToken({ id: ID, ext: 'pdf' }, SECRET, NOW);
    expect(verifyDownloadToken(t, { id: 'b'.repeat(24), ext: 'pdf' }, SECRET, NOW)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyDownloadToken(t, { id: ID, ext: 'sarif' }, SECRET, NOW)).toEqual({ ok: false, reason: 'mismatch' });
  });
  it('rejects another secret and malformed input', () => {
    const t = signDownloadToken({ id: ID, ext: 'pdf' }, SECRET, NOW);
    expect(verifyDownloadToken(t, { id: ID, ext: 'pdf' }, 'b'.repeat(32), NOW).ok).toBe(false);
    for (const bad of [undefined, '', 'x', 'a.b.c', 'a b.c', 'é.é', 'a'.repeat(600), 42]) {
      expect(verifyDownloadToken(bad, { id: ID, ext: 'pdf' }, SECRET, NOW).ok).toBe(false);
    }
  });
  it('refuses a short secret to sign or verify', () => {
    expect(() => signDownloadToken({ id: ID, ext: 'pdf' }, 'short', NOW)).toThrow(/at least 32/);
    expect(() => verifyDownloadToken('x.y', { id: ID, ext: 'pdf' }, 'short', NOW)).toThrow(/at least 32/);
  });
});

function fakeRes() {
  const r = { code: 0, headers: {} as Record<string, string | number>, body: undefined as Buffer | string | undefined };
  const res: Res = {
    status(c) {
      r.code = c;
      return res;
    },
    setHeader(n, v) {
      r.headers[n.toLowerCase()] = v;
    },
    send(b) {
      r.body = b;
    }
  };
  return { r, res };
}
const call = (file: string | undefined, query: Record<string, unknown>, deps: Parameters<typeof handleReportDownload>[2]) => {
  const { r, res } = fakeRes();
  handleReportDownload({ params: { file }, query } as Req, res, deps);
  return r;
};

describe('GET /reports/:file handler', () => {
  const cache = new ReportCache();
  const pdf = Buffer.from('%PDF-1.7 test');
  cache.put(ID, [
    { format: 'pdf', mimeType: 'application/pdf', data: pdf },
    { format: 'sarif', mimeType: 'application/sarif+json', data: Buffer.from('{"version":"2.1.0"}') },
    { format: 'sbom', mimeType: 'application/vnd.cyclonedx+json', data: Buffer.from('{"bomFormat":"CycloneDX"}') }
  ]);
  const nowSec = Math.floor(Date.now() / 1000);
  const deps = { cache, secret: SECRET, now: () => nowSec };
  const tok = (ext: string, at = nowSec) => signDownloadToken({ id: ID, ext }, SECRET, at);

  it('serves the file with download headers', () => {
    const r = call(`${ID}.pdf`, { t: tok('pdf') }, deps);
    expect(r.code).toBe(200);
    expect(r.body).toEqual(pdf);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toBe('attachment; filename="metamorph-report-a1b2c3d4.pdf"');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['content-length']).toBe(pdf.length);
  });
  it('serves sarif and cdx.json with their types', () => {
    expect(call(`${ID}.sarif`, { t: tok('sarif') }, deps).headers['content-type']).toBe('application/sarif+json');
    const r = call(`${ID}.cdx.json`, { t: tok('cdx.json') }, deps);
    expect(r.code).toBe(200);
    expect(r.headers['content-type']).toBe('application/vnd.cyclonedx+json');
  });
  it('returns 404 with a clear message when the cache has no entry', () => {
    const other = 'c'.repeat(24);
    const r = call(`${other}.pdf`, { t: signDownloadToken({ id: other, ext: 'pdf' }, SECRET, nowSec) }, deps);
    expect(r.code).toBe(404);
    expect(String(r.body)).toContain('Run generate_report again');
  });
  it('returns 404 once the cached report has expired', () => {
    let t = 0;
    const c = new ReportCache(() => t);
    c.put(ID, [{ format: 'pdf', mimeType: 'application/pdf', data: pdf }]);
    t += 10 * 60 * 1000 + 1;
    const r = call(`${ID}.pdf`, { t: tok('pdf') }, { cache: c, secret: SECRET, now: () => nowSec });
    expect(r.code).toBe(404);
  });
  it('returns 403 for a missing, wrong, tampered or expired token', () => {
    expect(call(`${ID}.pdf`, {}, deps).code).toBe(403);
    expect(call(`${ID}.pdf`, { t: tok('sarif') }, deps).code).toBe(403);
    expect(call(`${ID}.pdf`, { t: tok('pdf').slice(0, -3) + 'abc' }, deps).code).toBe(403);
    expect(call(`${ID}.pdf`, { t: ['x', 'y'] }, deps).code).toBe(403);
    const expired = call(`${ID}.pdf`, { t: tok('pdf', nowSec - 1000) }, deps);
    expect(expired.code).toBe(403);
    expect(String(expired.body)).toContain('expired');
    expect(expired.body).not.toEqual(pdf);
  });
  it('rejects path traversal and anything that is not <24 hex>.<known ext>', () => {
    for (const f of ['../../etc/passwd', `..%2f${ID}.pdf`, `${ID}.pdf/../x`, `${ID}.exe`, `${ID.toUpperCase()}.pdf`, 'index.html', '', `${ID}.pdf\u0000.txt`, undefined]) {
      const r = call(f, { t: tok('pdf') }, deps);
      expect(r.code).toBe(404);
      expect(r.body).not.toEqual(pdf);
    }
  });
  it('answers 503 when the secret is missing or short', () => {
    expect(call(`${ID}.pdf`, { t: 'x' }, { cache, secret: 'short' }).code).toBe(503);
    const saved = process.env.METAMORPH_TOKEN_SECRET;
    delete process.env.METAMORPH_TOKEN_SECRET;
    try {
      expect(call(`${ID}.pdf`, { t: 'x' }, { cache }).code).toBe(503);
    } finally {
      if (saved !== undefined) process.env.METAMORPH_TOKEN_SECRET = saved;
    }
  });
  it('registers exactly one GET route and no listing', () => {
    const paths: string[] = [];
    expect(reportRoutesActive()).toBe(false);
    registerReportRoutes({ get: (p) => paths.push(p) });
    expect(paths).toEqual(['/reports/:file']);
    expect(reportRoutesActive()).toBe(true);
  });
});

describe('link provider', () => {
  it('normalises the public URL and rejects odd ones', () => {
    expect(publicBase('https://m.example.com/')).toBe('https://m.example.com');
    expect(publicBase('https://m.example.com/mcp-host/')).toBe('https://m.example.com/mcp-host');
    expect(publicBase('http://localhost:3000')).toBe('http://localhost:3000');
    for (const bad of [undefined, '', 'javascript:alert(1)', 'ftp://x', 'not a url', 'https://u:p@x.com', 'https://x.com/?a=1']) expect(publicBase(bad)).toBeUndefined();
  });
  it('signs a link per file and verifies against the same secret', () => {
    const p = linkProvider({ secret: SECRET, publicUrl: 'https://m.example.com', routesActive: true, now: NOW });
    const l = p.link(ID, 'pdf');
    expect(l?.url).toBe(`https://m.example.com${l?.path}`);
    const token = new URL(l?.url as string).searchParams.get('t');
    expect(verifyDownloadToken(token, { id: ID, ext: 'pdf' }, SECRET, NOW + 1).ok).toBe(true);
  });
  it('has no links without routes or without a valid secret', () => {
    expect(linkProvider({ secret: SECRET, routesActive: false }).link(ID, 'pdf')).toBeUndefined();
    expect(linkProvider({ secret: 'short', routesActive: true }).link(ID, 'pdf')).toBeUndefined();
    expect(linkProvider({ secret: 'short', routesActive: true }).hint).toContain('METAMORPH_TOKEN_SECRET');
  });
});
