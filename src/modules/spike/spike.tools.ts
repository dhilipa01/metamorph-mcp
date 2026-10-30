import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir, totalmem, freemem, cpus } from 'node:os';
import { join } from 'node:path';

// ponytail: THROWAWAY spike for S1/S2 (does the host allow git, npm, tmp writes, network? same instance?). Delete after G1.
const run = promisify(execFile);
const BOOT_ID = randomUUID();
const STARTED = Date.now();
const MARKER = join(tmpdir(), 'metamorph-spike-marker');

async function cmd(file: string, args: string[]) {
  try {
    const { stdout } = await run(file, args, { timeout: 15000, maxBuffer: 64 * 1024 });
    return { ok: true, out: stdout.trim().slice(0, 80) };
  } catch (e: any) {
    return { ok: false, err: String(e?.code ?? e?.message ?? e).slice(0, 80) };
  }
}

async function cgroupLimit() {
  for (const p of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try { return (await readFile(p, 'utf8')).trim(); } catch { /* try next */ }
  }
  return 'unreadable';
}

export class SpikeTools {
  @Tool({
    name: 'spike_probe',
    description: 'Temporary host probe: reports runtime, tools, tmp write, network and instance identity. Remove after spike S1/S2.',
    inputSchema: z.object({
      sleep_seconds: z.number().min(0).max(120).default(0).describe('Hold the request this long to find the host timeout')
    })
  })
  async spikeProbe(input: { sleep_seconds?: number }, ctx: ExecutionContext) {
    const t0 = Date.now();
    ctx.logger.info('spike_probe called', { boot_id: BOOT_ID });

    let marker: { found: boolean; boot_id?: string } = { found: false };
    try { marker = { found: true, boot_id: (await readFile(MARKER, 'utf8')).trim() }; } catch { /* first call on this disk */ }
    let tmpWritable = false;
    try { await writeFile(MARKER, BOOT_ID); tmpWritable = (await readFile(MARKER, 'utf8')).trim() === BOOT_ID; } catch { /* stays false */ }

    const [git, npm, gitRemote, npmView] = await Promise.all([
      cmd('git', ['--version']),
      cmd('npm', ['--version']),
      cmd('git', ['ls-remote', 'https://github.com/lodash/lodash.git', 'HEAD']),
      cmd('npm', ['view', 'lodash', 'version'])
    ]);

    let osv: string;
    try { osv = String((await fetch('https://api.osv.dev/v1/vulns/GHSA-35jh-r3h4-6jhm', { signal: AbortSignal.timeout(10000) })).status); }
    catch (e: any) { osv = `error: ${String(e?.message ?? e).slice(0, 60)}`; }

    const sleep = input.sleep_seconds ?? 0;
    if (sleep > 0) await new Promise((r) => setTimeout(r, sleep * 1000));

    return {
      boot_id: BOOT_ID,
      pid: process.pid,
      uptime_s: Math.round((Date.now() - STARTED) / 1000),
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      cpus: cpus().length,
      mem_mb: { total: Math.round(totalmem() / 1048576), free: Math.round(freemem() / 1048576), cgroup_limit: await cgroupLimit() },
      tmp: { dir: tmpdir(), writable: tmpWritable, previous_marker: marker },
      tools: { git, npm },
      network: { osv_status: osv, git_ls_remote: gitRemote, npm_view: npmView },
      slept_s: sleep,
      elapsed_ms: Date.now() - t0
    };
  }
}
