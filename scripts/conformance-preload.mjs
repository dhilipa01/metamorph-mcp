// Test-only preload for scripts/conformance.mjs (loaded into the SERVER process with NODE_OPTIONS=--import).
// It replaces global fetch so the conformance run needs no network:
//   codeload.github.com  -> the local fixture tarball named by METAMORPH_CONF_TARBALL
//   api.osv.dev          -> a fake advisory for every queried package (so findings and fixes exist)
//   anything else        -> 503 (feeds degrade, as they do when a feed is down)
// It never ships with the server; nothing in src/ imports it.
import { readFileSync } from 'node:fs';

const tarball = process.env.METAMORPH_CONF_TARBALL;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (url.hostname === 'codeload.github.com' && tarball) {
    const body = readFileSync(tarball);
    return new Response(body, { status: 200, headers: { 'content-type': 'application/gzip', 'content-length': String(body.length) } });
  }
  if (url.hostname === 'api.osv.dev') {
    const req = init.body ? JSON.parse(String(init.body)) : {};
    const json = (v) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
    const vuln = (pkg) => ({
      id: 'GHSA-aaaa-bbbb-cccc',
      modified: '2024-01-01T00:00:00Z',
      aliases: ['CVE-2024-0001'],
      summary: 'Fake advisory used by the conformance run',
      database_specific: { severity: 'HIGH', cwe_ids: ['CWE-79'] },
      affected: pkg ? [{ package: { name: pkg.name, ecosystem: pkg.ecosystem }, ranges: [{ events: [{ introduced: '0' }, { fixed: '99.0.0' }] }] }] : []
    });
    if (url.pathname.endsWith('/querybatch')) return json({ results: (req.queries ?? []).map(() => ({ vulns: [{ id: 'GHSA-aaaa-bbbb-cccc', modified: '2024-01-01T00:00:00Z' }] })) });
    if (url.pathname.endsWith('/query')) return json({ vulns: [vuln(req.package)] });
    if (url.pathname.includes('/vulns/')) return json(vuln(undefined));
  }
  return new Response('offline in conformance run', { status: 503 });
};
