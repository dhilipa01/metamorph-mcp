// Download token for report links: HMAC-SHA256 over (report id, file extension, expiry), same shape and secret rules as
// approval-token.ts. It proves the link was issued by this server for exactly this file and has not expired.
// It is a bearer link: anyone holding the URL can fetch that one file until it expires (10 minutes by default).
import { createHmac, timingSafeEqual } from 'node:crypto';

export const MIN_SECRET_LEN = 32;
export const DOWNLOAD_TTL_SECONDS = 600;
const MAX_TOKEN_LEN = 512;
const B64URL = /^[A-Za-z0-9_-]+$/;

export type DownloadVerify = { ok: true } | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'mismatch' };

export function hasValidSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LEN;
}

function checkSecret(secret: string): void {
  if (!hasValidSecret(secret)) throw new Error(`download token secret must be at least ${MIN_SECRET_LEN} characters`);
}

// Domain-separated from approval tokens, which use the same secret.
function sign(secret: string, part: string): Buffer {
  return createHmac('sha256', secret).update(`metamorph-download.${part}`).digest();
}

export function signDownloadToken(
  claim: { id: string; ext: string; ttlSeconds?: number },
  secret: string,
  now: number = Math.floor(Date.now() / 1000)
): string {
  checkSecret(secret);
  const ttl = claim.ttlSeconds ?? DOWNLOAD_TTL_SECONDS;
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > 3600) throw new Error('ttlSeconds must be an integer from 1 to 3600');
  const part = Buffer.from(JSON.stringify({ v: 1, id: claim.id, ext: claim.ext, exp: now + ttl })).toString('base64url');
  return `${part}.${sign(secret, part).toString('base64url')}`;
}

export function verifyDownloadToken(
  token: unknown,
  expected: { id: string; ext: string },
  secret: string,
  now: number = Math.floor(Date.now() / 1000)
): DownloadVerify {
  checkSecret(secret); // configuration error, not bad input
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LEN) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every((p) => B64URL.test(p))) return { ok: false, reason: 'malformed' };
  const [part, sig] = parts;
  const given = Buffer.from(sig, 'base64url');
  const want = sign(secret, part);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return { ok: false, reason: 'bad_signature' };
  let p: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'malformed' };
    p = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (p.v !== 1 || typeof p.id !== 'string' || typeof p.ext !== 'string' || !Number.isInteger(p.exp)) return { ok: false, reason: 'malformed' };
  if (now >= (p.exp as number)) return { ok: false, reason: 'expired' };
  if (p.id !== expected.id || p.ext !== expected.ext) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}
