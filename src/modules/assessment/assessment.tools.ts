import { ToolDecorator as Tool, Widget, UseGuards, ExecutionContext, z } from '@nitrostack/core';
import { scopeGuard } from '../../common/auth/scope.guard.js';
import { assessDirectory, assessRepository } from './assess.js';
import { withRepo } from './repo-source.js';

export class AssessmentTools {
  @Tool({
    name: 'assess_project',
    description:
      'Assess a legacy project from a public GitHub repository. Detects the stack (Node/JavaScript, PHP), runtime end-of-life, outdated or deprecated packages, known vulnerabilities, risky legacy code patterns and hosting setup, then returns a score and the top findings. Read-only: nothing is changed.',
    inputSchema: z.object({
      repo_url: z.string().min(10).max(300).describe('Public GitHub repository URL, e.g. https://github.com/owner/repo (a /tree/<branch> link works)'),
      subfolder: z.string().max(200).optional().describe('Optional folder inside the repository to assess, e.g. apps/api. Without it every project found (package.json or composer.json, up to 3 folders deep, at most 5) is assessed and merged')
    }),
    examples: {
      request: { repo_url: 'https://github.com/owner/legacy-app' },
      response: { stack: 'node', score: { overall: 61 }, topFindings: [{ id: 'node-runtime-eol', severity: 'high' }] }
    }
  })
  @Widget('score-dashboard')
  @UseGuards(scopeGuard('read'))
  async assessProject(input: { repo_url: string; subfolder?: string }, ctx: ExecutionContext) {
    return withRepo(input.repo_url, input.subfolder, ctx, (dir) => (input.subfolder ? assessDirectory(dir) : assessRepository(dir).then((f) => f.assessment)));
  }
}
