// Tesler's law: the widget composes the next tool call for the user. Pure helpers, no React, never throw.
import type { AssessmentVM } from './view-model';

export interface NextCall {
  tool: string;
  // Arguments the widget can supply. Empty when the result does not carry the repository URL.
  args: Record<string, string>;
  // True when `args` is a complete call; false means the user has to fill in repo_url.
  complete: boolean;
  // The call as text (what 'Copy call' copies and what the card shows).
  text: string;
}

const PLACEHOLDER = 'https://github.com/OWNER/REPO';

export function nextCallAfterAssessment(vm: Pick<AssessmentVM, 'repoUrl' | 'subfolder'>): NextCall {
  const args: Record<string, string> = {};
  if (vm.repoUrl) args.repo_url = vm.repoUrl;
  if (vm.repoUrl && vm.subfolder) args.subfolder = vm.subfolder;
  const shown = vm.repoUrl ? args : { repo_url: PLACEHOLDER, ...(vm.subfolder ? { subfolder: vm.subfolder } : {}) };
  return { tool: 'plan_modernization', args, complete: Boolean(vm.repoUrl), text: `plan_modernization ${JSON.stringify(shown)}` };
}

// "owner/repo" from a GitHub URL, else undefined.
export function repoLabel(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = url.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/?#]|$)/i);
  return m ? `${m[1]}/${m[2]}` : undefined;
}

export const shortSha = (s: string | undefined): string | undefined => (s && /^[0-9a-f]{7,40}$/i.test(s) ? s.slice(0, 7) : undefined);
