import type { ExecutionContext } from '@nitrostack/core';
import { archiveUrl, createWorkdir, extractTarGz, fetchArchive, parseGithubRepo, resolveInside } from '../../common/safe-archive.js';

// Downloads a public GitHub repo into a private temp folder, runs `fn` on the (sub)folder and always cleans up.
// Error messages are safe to show to users: they never contain server paths.
export async function withRepo<T>(
  repoUrl: string,
  subfolder: string | undefined,
  ctx: Pick<ExecutionContext, 'logger'>,
  fn: (dir: string) => Promise<T>,
  deps: { fetchFn?: typeof fetch } = {}
): Promise<T> {
  let repo: ReturnType<typeof parseGithubRepo>;
  try {
    repo = parseGithubRepo(repoUrl);
  } catch {
    throw new Error('Invalid repository URL. Use a public GitHub link like https://github.com/owner/repo.');
  }
  ctx.logger.info('repo fetch', { owner: repo.owner, repo: repo.repo, ref: repo.ref ?? 'HEAD' });

  const work = await createWorkdir(process.env.METAMORPH_SANDBOX_DIR);
  try {
    let archive: Buffer;
    try {
      archive = await fetchArchive(archiveUrl(repo.owner, repo.repo, repo.ref), { fetchFn: deps.fetchFn });
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
      root = await resolveInside(work.dir, subfolder ?? '');
    } catch {
      throw new Error('The subfolder is not valid. Use a path inside the repository, like apps/api.');
    }
    return await fn(root);
  } finally {
    await work.cleanup();
  }
}
