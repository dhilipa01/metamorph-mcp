import { ToolDecorator as Tool, UseGuards, ExecutionContext, z } from '@nitrostack/core';
import { scopeGuard } from '../../common/auth/scope.guard.js';
import { archiveUrl, createWorkdir, extractTarGz, fetchArchive, parseGithubRepo, resolveInside } from '../../common/safe-archive.js';
import { assessDirectory } from './assess.js';

export class AssessmentTools {
  @Tool({
    name: 'assess_project',
    description:
      'Assess a legacy project from a public GitHub repository. Detects the stack (Node/JavaScript, PHP), runtime end-of-life, outdated or deprecated packages, known vulnerabilities, risky legacy code patterns and hosting setup, then returns a score and the top findings. Read-only: nothing is changed.',
    inputSchema: z.object({
      repo_url: z.string().min(10).max(300).describe('Public GitHub repository URL, e.g. https://github.com/owner/repo (a /tree/<branch> link works)'),
      subfolder: z.string().max(200).optional().describe('Optional folder inside the repository to assess, e.g. apps/api')
    }),
    examples: {
      request: { repo_url: 'https://github.com/owner/legacy-app' },
      response: { stack: 'node', score: { overall: 61 }, topFindings: [{ id: 'node-runtime-eol', severity: 'high' }] }
    }
  })
  @UseGuards(scopeGuard('read'))
  async assessProject(input: { repo_url: string; subfolder?: string }, ctx: ExecutionContext) {
    let repo: ReturnType<typeof parseGithubRepo>;
    try {
      repo = parseGithubRepo(input.repo_url);
    } catch {
      throw new Error('Invalid repository URL. Use a public GitHub link like https://github.com/owner/repo.');
    }
    ctx.logger.info('assess_project', { owner: repo.owner, repo: repo.repo, ref: repo.ref ?? 'HEAD' });

    const work = await createWorkdir(process.env.METAMORPH_SANDBOX_DIR);
    try {
      let archive: Buffer;
      try {
        archive = await fetchArchive(archiveUrl(repo.owner, repo.repo, repo.ref));
      } catch {
        throw new Error('Could not download the repository. Only public GitHub repositories up to 25 MB are supported; check the URL and branch name.');
      }
      try {
        await extractTarGz(archive, work.dir);
      } catch {
        throw new Error('The repository archive could not be unpacked safely (too large, too many files, or unexpected content).');
      }
      let root: string;
      try {
        root = await resolveInside(work.dir, input.subfolder ?? '');
      } catch {
        throw new Error('The subfolder is not valid. Use a path inside the repository, like apps/api.');
      }
      return await assessDirectory(root);
    } finally {
      await work.cleanup();
    }
  }
}
