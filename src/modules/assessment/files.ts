import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface KeyFiles {
  paths: string[];
  contents: Record<string, string>;
  php: Array<{ path: string; content: string }>;
  truncated: boolean;
}

export const KEY_FILES: readonly string[] = [
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.nvmrc',
  '.node-version',
  'composer.json',
  'composer.lock',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'serverless.yml',
  'serverless.yaml',
  'vercel.json',
  'wrangler.toml',
  'netlify.toml',
  'Procfile',
  'app.yaml',
  '.htaccess',
  'nginx.conf',
  'components.json',
  'tsconfig.json'
];

// Lockfiles whose presence matters but whose (large) content is never stored.
const PRESENCE_ONLY = new Set(['yarn.lock', 'pnpm-lock.yaml']);
const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git', 'dist', 'build', '.next', '__pycache__']);

export interface ReadLimits {
  maxFiles: number;
  maxDepth: number;
  maxFileBytes: number;
  maxPhpFiles: number;
  maxPhpBytes: number;
}

export const DEFAULT_READ_LIMITS: ReadLimits = {
  maxFiles: 5000,
  maxDepth: 12,
  maxFileBytes: 256 * 1024,
  maxPhpFiles: 200,
  maxPhpBytes: 200 * 1024
};

// Opens without following symlinks; returns null when unreadable, or when skipLarge is set and the file is over the limit.
async function readBounded(abs: string, maxBytes: number, skipLarge: boolean): Promise<string | null> {
  try {
    const handle = await open(abs, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const st = await handle.stat();
      if (!st.isFile() || (skipLarge && st.size > maxBytes)) return null;
      const buf = Buffer.alloc(Math.min(st.size, maxBytes));
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      return buf.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

export async function readKeyFiles(dir: string, limits?: Partial<ReadLimits>): Promise<KeyFiles> {
  const lim: ReadLimits = { ...DEFAULT_READ_LIMITS, ...limits };
  let rootStat: Stats;
  try {
    rootStat = await lstat(dir);
  } catch {
    throw new Error(`Cannot read project directory: ${dir}`);
  }
  if (!rootStat.isDirectory()) throw new Error(`Not a directory: ${dir}`);

  const result: KeyFiles = { paths: [], contents: {}, php: [], truncated: false };
  const queue: Array<{ rel: string; depth: number }> = [{ rel: '', depth: 0 }];

  for (let i = 0; i < queue.length; i++) {
    const { rel, depth } = queue[i];
    let names: string[];
    try {
      names = (await readdir(join(dir, rel))).sort();
    } catch {
      continue;
    }
    for (const name of names) {
      const childRel = rel ? `${rel}/${name}` : name;
      const abs = join(dir, childRel);
      let st: Stats;
      try {
        st = await lstat(abs);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        if (depth + 1 > lim.maxDepth) result.truncated = true;
        else queue.push({ rel: childRel, depth: depth + 1 });
        continue;
      }
      if (!st.isFile()) continue;
      if (result.paths.length >= lim.maxFiles) {
        result.truncated = true;
        return result;
      }
      result.paths.push(childRel);
      if (KEY_FILES.includes(name)) {
        if (PRESENCE_ONLY.has(name)) continue;
        const text = await readBounded(abs, lim.maxFileBytes, true);
        if (text !== null) result.contents[childRel] = text;
      } else if (name.endsWith('.php') && result.php.length < lim.maxPhpFiles) {
        const text = await readBounded(abs, lim.maxPhpBytes, false);
        if (text !== null) result.php.push({ path: childRel, content: text });
      }
    }
  }
  return result;
}
