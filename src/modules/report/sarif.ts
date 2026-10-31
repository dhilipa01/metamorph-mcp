// SARIF 2.1.0 export. One rule per distinct finding id; one result per finding.
// A location is added only when the finding's evidence is exactly "path:line" (or a bare file path); otherwise the
// result has no location rather than an invented one.
import type { ReportData, ReportFinding } from './report-data.js';
import { TOOL_NAME, TOOL_VERSION } from './report-data.js';

export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

type Level = 'error' | 'warning' | 'note';
const LEVEL: Record<ReportFinding['severity'], Level> = { critical: 'error', high: 'error', medium: 'warning', low: 'note', info: 'note' };
// Rough bands used by GitHub for "security-severity" when no CVSS score is known.
const DEFAULT_SECURITY_SEVERITY: Record<ReportFinding['severity'], string> = { critical: '9.5', high: '8.0', medium: '5.5', low: '3.0', info: '0.0' };

export interface SarifLocation {
  path: string;
  line?: number;
}

const LOCATION_RE = /^([A-Za-z0-9_@.-][A-Za-z0-9_@./-]*\.[A-Za-z0-9]{1,8})(?::(\d{1,7}))?$/;

export function locationOf(evidence: string | undefined): SarifLocation | undefined {
  if (!evidence) return undefined;
  const m = evidence.trim().match(LOCATION_RE);
  if (!m) return undefined;
  const p = m[1];
  if (p.startsWith('/') || p.split('/').includes('..')) return undefined;
  const line = m[2] ? Number(m[2]) : undefined;
  return line !== undefined && line >= 1 ? { path: p, line } : { path: p };
}

function tagsOf(f: ReportFinding): string[] {
  const tags = new Set<string>(['security', f.category]);
  for (const c of f.cwe) tags.add(`external/cwe/${c.toLowerCase()}`);
  for (const o of f.owasp) tags.add(`external/owasp/${o}`);
  if (f.kev) tags.add('cisa-kev');
  return [...tags];
}

export function buildSarif(d: ReportData): Record<string, unknown> {
  const ruleIndex = new Map<string, number>();
  const rules: Array<Record<string, unknown>> = [];
  for (const f of d.findings) {
    if (ruleIndex.has(f.id)) continue;
    ruleIndex.set(f.id, rules.length);
    rules.push({
      id: f.id,
      shortDescription: { text: f.title || f.id },
      help: { text: f.recommendation || 'See the finding message.' },
      defaultConfiguration: { level: LEVEL[f.severity] },
      properties: {
        tags: tagsOf(f),
        'security-severity': f.cvss ? f.cvss.value.toFixed(1) : DEFAULT_SECURITY_SEVERITY[f.severity]
      }
    });
  }

  const results = d.findings.map((f) => {
    const loc = locationOf(f.evidence);
    return {
      ruleId: f.id,
      ruleIndex: ruleIndex.get(f.id) ?? 0,
      level: LEVEL[f.severity],
      message: { text: `${f.title}${f.evidence ? ` (${f.evidence})` : ''}. ${f.recommendation}`.trim() },
      ...(loc
        ? {
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: loc.path },
                  ...(loc.line !== undefined ? { region: { startLine: loc.line } } : {})
                }
              }
            ]
          }
        : {}),
      properties: {
        severity: f.severity,
        category: f.category,
        ...(f.cvss ? { cvss: f.cvss.value, 'cvss-origin': f.cvss.origin } : {}),
        ...(f.epss ? { epss: f.epss.value, 'epss-origin': f.epss.origin } : {}),
        ...(f.kev ? { kev: true } : {})
      }
    };
  });

  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: TOOL_NAME, version: TOOL_VERSION, semanticVersion: TOOL_VERSION, rules } },
        invocations: [{ executionSuccessful: true, endTimeUtc: d.meta.generatedAt }],
        ...(d.meta.commitSha
          ? { versionControlProvenance: [{ repositoryUri: d.meta.repoUrl, revisionId: d.meta.commitSha, ...(d.meta.subfolder ? { mappedTo: { uriBaseId: 'SRCROOT', uri: d.meta.subfolder } } : {}) }] }
          : {}),
        results
      }
    ]
  };
}

export function renderSarif(d: ReportData): string {
  return JSON.stringify(buildSarif(d), null, 2);
}
