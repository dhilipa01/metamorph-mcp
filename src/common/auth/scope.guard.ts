import { Guard, ExecutionContext } from '@nitrostack/core';
import { authorize, extractKey, parseKeyTable, Scope } from './keys.js';

// Usage: @UseGuards(scopeGuard('write')). Keys come from METAMORPH_KEY_* env vars, read once at first use.
let table: ReturnType<typeof parseKeyTable> | undefined;
const keys = () => (table ??= parseKeyTable(process.env));

export function scopeGuard(required: Scope) {
  return class ScopeGuard implements Guard {
    async canActivate(context: ExecutionContext): Promise<boolean> {
      // Local STDIO has no HTTP headers. METAMORPH_AUTH=off is for local development ONLY; never set it on a deployed host.
      if (process.env.METAMORPH_AUTH === 'off') return true;
      const result = authorize(extractKey(context.metadata as Record<string, unknown> | undefined), required, keys());
      if (!result.ok) {
        context.logger.warn('auth denied', { tool: context.toolName ?? '', status: result.status, required });
        throw new Error(`${result.status}: ${result.message}`);
      }
      context.auth = { subject: result.label, scopes: [result.scope] } as typeof context.auth;
      return true;
    }
  };
}
