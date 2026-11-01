// GET / : a self-contained landing page that replaces the SDK's generic one. No external requests: system fonts, inline
// CSS/JS (allowed by CSP hashes only), the logo as inline SVG. Static content except the endpoint line, which is built
// from the request host and escaped. The key is never printed.
import { createHash } from 'node:crypto';
import { LOGO_D64 } from './landing-logo.js';

export const REPO_URL = 'https://github.com/dhilipa01/metamorph-mcp';
export const README_URL = `${REPO_URL}#readme`;

// Keep in step with the @Tool decorators: tests/unit/landing.test.ts compares this table with the source.
export const TOOLS: ReadonlyArray<{ name: string; scope: 'read' | 'plan' | 'write'; purpose: string }> = [
  { name: 'assess_project', scope: 'read', purpose: 'Score a public GitHub repo: end-of-life runtimes, vulnerable dependencies, legacy patterns.' },
  { name: 'analyze_advisory', scope: 'read', purpose: 'Check packages or CVE ids against OSV, CISA KEV and EPSS.' },
  { name: 'check_watch', scope: 'read', purpose: 'What changed since a date: KEV, EPSS, end-of-life dates, PHP and Node releases.' },
  { name: 'plan_modernization', scope: 'plan', purpose: 'Order the fixes into stages. Only four stage types change files.' },
  { name: 'preview_changes', scope: 'read', purpose: 'Show the real diff for one automated stage and return an approval token.' },
  { name: 'apply_stage', scope: 'write', purpose: 'Projected re-score of one approved stage on a temporary copy. Your repo is not changed.' },
  { name: 'verify_patch', scope: 'write', purpose: 'Build and test a patch on an isolated GitHub Actions runner.' },
  { name: 'generate_report', scope: 'read', purpose: 'PDF, SARIF and CycloneDX SBOM with signed, expiring download links.' },
  { name: 'cloud_inventory', scope: 'read', purpose: 'Read-only AWS inventory of Lambda, RDS, EKS and EC2 runtimes.' }
];

export const RESOURCES: ReadonlyArray<{ uri: string; purpose: string }> = [
  { uri: 'metamorph://report/{id}.pdf', purpose: 'PDF report from generate_report (kept 10 minutes).' },
  { uri: 'metamorph://report/{id}.sarif', purpose: 'SARIF 2.1.0 findings from generate_report.' },
  { uri: 'metamorph://report/{id}.cdx.json', purpose: 'CycloneDX 1.5 SBOM from generate_report.' },
  { uri: 'metamorph://aws/readonly-role.yaml', purpose: 'CloudFormation template for the read-only role used by cloud_inventory.' }
];

// Mirrors the labels in docs/EVIDENCE.md.
export const EVIDENCE: ReadonlyArray<{ item: string; label: 'LIVE' | 'FIXTURE' | 'EMULATOR' | 'PROJECTED' | 'NOT BUILT'; note: string }> = [
  { item: 'assess_project, analyze_advisory, check_watch', label: 'LIVE', note: 'Real public feeds. Scoring rules are our own.' },
  { item: 'plan_modernization, preview_changes', label: 'LIVE', note: 'Real diffs on real fetched repos.' },
  { item: 'generate_report, signed downloads', label: 'LIVE', note: 'PDF, SARIF and SBOM. GitHub code scanning acceptance not tested.' },
  { item: 'MCP prompts', label: 'LIVE', note: 'Local only; not yet confirmed in NitroStudio.' },
  { item: 'apply_stage', label: 'PROJECTED', note: 'Real patch, simulated re-score.' },
  { item: 'verify_patch', label: 'FIXTURE', note: 'Tested against a fake GitHub, not yet live through this server.' },
  { item: 'cloud_inventory (AWS)', label: 'EMULATOR', note: 'Moto only; no real AWS account.' },
  { item: 'Private repos, PR creation, tickets, Azure', label: 'NOT BUILT', note: 'Public GitHub repos only.' }
];

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const CSS = `
:root{--bg:#D5DAD0;--card:#EFE7D6;--ink:#1B1D19;--mute:#555A50;--accent:#6B1F2A;--line:#1B1D1933;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#151614;--card:#1E3527;--ink:#ECE9DF;--mute:#A9AFA2;--accent:#D1344A;--line:#ECE9DF33;color-scheme:dark}}
:root[data-theme=dark]{--bg:#151614;--card:#1E3527;--ink:#ECE9DF;--mute:#A9AFA2;--accent:#D1344A;--line:#ECE9DF33;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Helvetica Neue",Helvetica,Arial,"Liberation Sans",system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:40px 24px 64px}
header{display:flex;align-items:center;gap:20px;margin-bottom:8px}
svg.logo{width:72px;height:72px;flex:none;color:var(--accent)}
h1{font:700 44px/1.05 "Helvetica Neue",Helvetica,Arial,sans-serif;letter-spacing:-.02em;margin:0}
.lede{font-size:19px;color:var(--mute);margin:8px 0 0}
.top{margin-left:auto}
button{font:inherit;font-size:13px;color:var(--ink);background:none;border:1px solid var(--line);border-radius:4px;padding:4px 10px;cursor:pointer}
h2{font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin:40px 0 12px}
.card{background:var(--card);border-radius:6px;padding:18px 20px}
code,pre{font:14px/1.4 ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
pre{margin:0;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:8px 10px 8px 0;border-bottom:1px solid var(--line);vertical-align:top;font-size:15px}
th{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);font-weight:600}
td.n{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;white-space:nowrap}
.big{font-family:Georgia,"Times New Roman",serif;font-size:28px;line-height:1}
.first{margin:0 0 8px}
.note{font-size:15px;color:var(--mute)}
a{color:var(--accent)}
footer{margin-top:40px;font-size:14px;color:var(--mute)}
@media (max-width:640px){h1{font-size:32px}main{padding:24px 16px 48px}svg.logo{width:52px;height:52px}td.n{white-space:normal}}
`.trim();

const JS = `(function(){var r=document.documentElement,b=document.getElementById('theme');try{var t=localStorage.getItem('metamorph-theme');if(t==='light'||t==='dark')r.setAttribute('data-theme',t)}catch(e){}if(b)b.addEventListener('click',function(){var dark=r.getAttribute('data-theme')==='dark'||(!r.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme: dark)').matches);var n=dark?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('metamorph-theme',n)}catch(e){}})})();`;

const sha = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;
export const CSP = `default-src 'none'; style-src ${sha(CSS)}; script-src ${sha(JS)}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

export function renderLanding(endpoint: string): string {
  const e = escapeHtml;
  const tools = TOOLS.map((t) => `<tr><td class="n">${e(t.name)}</td><td>${e(t.scope)}</td><td>${e(t.purpose)}</td></tr>`).join('');
  const res = RESOURCES.map((r) => `<tr><td class="n">${e(r.uri)}</td><td>${e(r.purpose)}</td></tr>`).join('');
  const ev = EVIDENCE.map((r) => `<tr><td>${e(r.item)}</td><td class="n">${e(r.label)}</td><td>${e(r.note)}</td></tr>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Metamorph MCP</title>
<meta name="description" content="Assess, plan and verify legacy PHP and Node upgrades from your AI client.">
<style>${CSS}</style></head>
<body><main>
<header><svg class="logo" viewBox="0 0 64 64" shape-rendering="crispEdges" fill="currentColor" role="img" aria-label="Metamorph logo"><path d="${LOGO_D64}"/></svg>
<div><h1>Metamorph</h1><p class="lede">Assess, plan and verify legacy PHP and Node upgrades from your AI client.</p></div>
<div class="top"><a href="/app">Open the dashboard</a> <button id="theme" type="button">Toggle theme</button></div></header>

<h2>Connect</h2>
<div class="card"><p class="first">MCP endpoint (Streamable HTTP)</p><pre>${e(endpoint)}</pre>
<p>Send your key as <code>Authorization: Bearer &lt;key&gt;</code>. Keys carry one of three cumulative scopes: <code>read</code>, <code>plan</code> (includes read), <code>write</code> (includes plan). Ask the server owner for a key.</p></div>

<h2>Tools</h2>
<table><thead><tr><th>Tool</th><th>Scope</th><th>Purpose</th></tr></thead><tbody>${tools}</tbody></table>

<h2>Resources</h2>
<table><thead><tr><th>URI</th><th>Purpose</th></tr></thead><tbody>${res}</tbody></table>

<h2>What is real and what is not</h2>
<table><thead><tr><th>Item</th><th>Label</th><th>Note</th></tr></thead><tbody>${ev}</tbody></table>
<p class="note">Nothing here changes your repository. Full list: docs/EVIDENCE.md in the repository.</p>

<footer><a href="${REPO_URL}">GitHub repository</a> &middot; <a href="${README_URL}">README</a></footer>
</main><script>${JS}</script></body></html>`;
}

// ---- request handling and route replacement ----
interface Req {
  protocol?: string;
  get?(name: string): string | undefined;
  headers?: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): unknown;
  send(body: string): unknown;
}

function header(req: Req, name: string): string {
  const v = req.get ? req.get(name) : req.headers?.[name.toLowerCase()];
  return (Array.isArray(v) ? v[0] : v ?? '').split(',')[0].trim();
}

// Public origin set by the deployment owner (same variable the report links use): http(s) only, no credentials/query.
function publicOrigin(): string | undefined {
  const raw = process.env.METAMORPH_PUBLIC_URL?.trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return undefined;
    return u.origin;
  } catch {
    return undefined;
  }
}

export function endpointFor(req: Req): string {
  const configured = publicOrigin();
  if (configured) return `${configured}/mcp`;
  const fp = header(req, 'x-forwarded-proto').toLowerCase();
  const host = (header(req, 'x-forwarded-host') || header(req, 'host') || 'localhost').slice(0, 255);
  // NitroCloud's proxy does not send x-forwarded-proto: a non-local host behind it is served over https.
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(host);
  const proto = fp === 'http' || fp === 'https' ? fp : req.protocol === 'https' || !local ? 'https' : 'http';
  return `${proto}://${host}/mcp`;
}

export function handleLanding(req: Req, res: Res): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(renderLanding(endpointFor(req)));
}

interface LayerLike {
  route?: { path?: string; methods?: Record<string, boolean> };
}
export interface LandingApp {
  get(path: string, handler: (req: never, res: never) => void): unknown;
  router?: { stack?: LayerLike[] }; // Express 5
  _router?: { stack?: LayerLike[] }; // Express 4
}

// Removes the SDK's GET '/' layer, registers ours, and moves it into the freed position so anything registered after the
// SDK page keeps its order. Relies on Express internals (router.stack); if they are not found, ours is simply added.
export function installLanding(app: LandingApp, warn: (msg: string) => void = (m) => console.warn(m)): boolean {
  // Express 4 keeps the stack on _router (and its `router` getter throws); Express 5 on router.
  const stackOf = (read: () => LayerLike[] | undefined): LayerLike[] | undefined => {
    try {
      return read();
    } catch {
      return undefined;
    }
  };
  const stack = stackOf(() => app._router?.stack) ?? stackOf(() => app.router?.stack);
  const idx = stack ? stack.findIndex((l) => l.route?.path === '/' && l.route.methods?.get) : -1;
  if (stack && idx >= 0) stack.splice(idx, 1);
  app.get('/', ((req: Req, res: Res) => handleLanding(req, res)) as (req: never, res: never) => void);
  if (stack && idx >= 0 && stack.length > idx) stack.splice(idx, 0, stack.pop() as LayerLike);
  if (idx < 0) warn('landing: SDK GET / layer not found; custom page registered anyway and may be shadowed');
  return idx >= 0;
}
