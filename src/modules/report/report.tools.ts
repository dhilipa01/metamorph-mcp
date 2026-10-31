import { ToolDecorator as Tool, ResourceDecorator as Resource, UseGuards, ExecutionContext, z } from '@nitrostack/core';
import { scopeGuard } from '../../common/auth/scope.guard.js';
import { assessFull } from '../assessment/assess.js';
import { withRepo } from '../assessment/repo-source.js';
import type { Goal } from '../assessment/types.js';
import { parseGithubRepo } from '../../common/safe-archive.js';
import { buildPlan } from '../planning/plan.js';
import { MIME, generateReport, lookupResource, type ReportFormat } from './report.js';
import { buildReportData } from './report-data.js';

const GOALS = ['patch_advisory', 'upgrade_runtime', 'modernize_all'] as const;

function refOf(repoUrl: string): string | undefined {
  try {
    return parseGithubRepo(repoUrl).ref;
  } catch {
    return undefined;
  }
}

export class ReportTools {
  @Tool({
    name: 'generate_report',
    description:
      'Generate an assessment report for a public GitHub repository: a PDF (cover, summary, findings by CWE/OWASP with KEV and EPSS, plan, patch summary, verification, dependencies, appendix), a SARIF 2.1.0 file and a CycloneDX 1.5 SBOM. Every number is labelled measured, projected or reported. Formats under 1 MB are returned embedded in the result (PDF as base64, SARIF and SBOM as text); all are also readable as metamorph://report/<id> resources for 10 minutes. Read-only: nothing is changed.',
    inputSchema: z.object({
      repo_url: z.string().min(10).max(300).describe('Public GitHub repository URL, e.g. https://github.com/owner/repo (a /tree/<branch> link works)'),
      subfolder: z.string().max(200).optional().describe('Optional folder inside the repository, e.g. apps/api'),
      formats: z.array(z.enum(['pdf', 'sarif', 'sbom'])).min(1).max(3).optional().describe('Formats to produce; default ["pdf"]'),
      goal: z.enum(GOALS).optional().describe('Plan goal used for the plan section: patch_advisory, upgrade_runtime or modernize_all (default)')
    }),
    examples: {
      request: { repo_url: 'https://github.com/owner/legacy-app', formats: ['pdf', 'sarif'] },
      response: {
        reportId: 'a1b2c3d4e5f60718293a4b5c',
        score: { overall: 52, origin: 'measured' },
        findings: { total: 9, critical: 0, high: 3, medium: 4, low: 2, info: 0 },
        pages: 8,
        formats: [{ format: 'pdf', bytes: 180000, mimeType: 'application/pdf', uri: 'metamorph://report/a1b2c3d4e5f60718293a4b5c.pdf', embedded: true }],
        message: 'All requested formats are embedded. They are also readable as resources for 10 minutes.'
      }
    }
  })
  @UseGuards(scopeGuard('read'))
  async generateReport(input: { repo_url: string; subfolder?: string; formats?: ReportFormat[]; goal?: Goal }, ctx: ExecutionContext) {
    const goal = input.goal ?? 'modernize_all';
    ctx.logger.info('generate_report', { goal, formats: (input.formats ?? ['pdf']).join(',') });
    const { full, plan } = await withRepo(input.repo_url, input.subfolder, ctx, async (dir) => {
      const f = await assessFull(dir);
      return { full: f, plan: buildPlan({ stack: f.assessment.stack, findings: f.findings, fixes: f.fixes, goal }) };
    });
    const ref = refOf(input.repo_url);
    const data = buildReportData({
      full,
      plan,
      meta: { repoUrl: input.repo_url, subfolder: input.subfolder, commit: ref ? `ref ${ref} (branch or tag, not a commit sha)` : undefined, generatedAt: new Date().toISOString() }
    });
    return generateReport(data, input.formats ?? ['pdf']);
  }
}

// The SDK's resource handler matches {id} templates against the requested URI and returns Buffer as a binary blob.
export class ReportResources {
  @Resource({
    uri: 'metamorph://report/{id}.pdf',
    name: 'Metamorph PDF report',
    description: 'A PDF report produced by generate_report. Kept in memory for 10 minutes (at most 5 reports).',
    mimeType: MIME.pdf
  })
  async pdf(uri: string) {
    return this.read(uri);
  }

  @Resource({
    uri: 'metamorph://report/{id}.sarif',
    name: 'Metamorph SARIF report',
    description: 'SARIF 2.1.0 findings produced by generate_report. Kept in memory for 10 minutes.',
    mimeType: MIME.sarif
  })
  async sarif(uri: string) {
    return this.read(uri);
  }

  @Resource({
    uri: 'metamorph://report/{id}.cdx.json',
    name: 'Metamorph CycloneDX SBOM',
    description: 'CycloneDX 1.5 SBOM produced by generate_report. Kept in memory for 10 minutes.',
    mimeType: MIME.sbom
  })
  async sbom(uri: string) {
    return this.read(uri);
  }

  private read(uri: string) {
    const a = lookupResource(uri);
    if (!a) throw new Error('Report not found or expired. Run generate_report again.');
    return a.format === 'pdf' ? { type: 'binary' as const, data: a.data } : { type: 'text' as const, data: a.data.toString('utf8') };
  }
}
