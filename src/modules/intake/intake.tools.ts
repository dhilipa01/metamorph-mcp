import { ToolDecorator as Tool, UseGuards, ExecutionContext, z } from '@nitrostack/core';
import { scopeGuard } from '../../common/auth/scope.guard.js';
import { OsvClient } from './osv.client.js';
import { analyzePackages } from './advisory.js';
import { lookupAdvisories } from './lookup.js';

const client = new OsvClient(); // one cache per instance
const packageSchema = z.object({
  name: z.string().min(1).max(214).describe('Package name, e.g. lodash or guzzlehttp/guzzle'),
  ecosystem: z.enum(['npm', 'Packagist']),
  version: z.string().min(1).max(64).describe('Exact installed version, e.g. 4.17.15')
});

export class IntakeTools {
  @Tool({
    name: 'analyze_advisory',
    description:
      'Check advisories or installed packages against OSV. Give ids (CVE-, GHSA-, MAL-) to see which packages they affect and the fixed versions; give packages (name, ecosystem, version) to see if you are affected, how severe, what fixes exist and whether it is urgent. Either or both.',
    inputSchema: z.object({
      ids: z.array(z.string().min(1).max(40)).max(10).optional().describe('Advisory ids, up to 10'),
      packages: z.array(packageSchema).max(50).optional().describe('Installed packages, up to 50')
    }),
    examples: {
      request: { packages: [{ name: 'lodash', ecosystem: 'npm', version: '4.17.15' }] },
      response: { packages: [{ package: { name: 'lodash', version: '4.17.15' }, affected: true, findings: [{ id: 'GHSA-35jh-r3h4-6jhm', severity: 'high', fixedVersions: ['4.17.21'] }] }] }
    }
  })
  @UseGuards(scopeGuard('read'))
  async analyzeAdvisory(
    input: { ids?: string[]; packages?: Array<{ name: string; ecosystem: 'npm' | 'Packagist'; version: string }> },
    ctx: ExecutionContext
  ) {
    if (!input.ids?.length && !input.packages?.length) {
      throw new Error('Nothing to check. Pass "ids" (for example ["GHSA-35jh-r3h4-6jhm"]) or "packages" (name, ecosystem, version).');
    }
    ctx.logger.info('analyze_advisory', { ids: input.ids?.length ?? 0, packages: input.packages?.length ?? 0 });
    const advisories = input.ids?.length ? await lookupAdvisories(input.ids, client) : undefined;
    const packages = input.packages?.length ? await analyzePackages(input.packages, { client }) : undefined;
    const bare = advisories?.some((a) => a.found && a.packages.length === 0);
    return {
      advisories,
      packages,
      hint: bare ? 'Some records have no package data (common for bare CVE ids). Try the matching GHSA id or pass "packages".' : undefined
    };
  }
}
