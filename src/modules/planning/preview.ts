// Builds the preview of one automated stage: file list, a capped unified diff and, when a secret is configured,
// an approval token bound to the exact plan and patches. Pure: no I/O. File contents are never returned beyond the diff.
import { canonicalHash, signApprovalToken } from '../../common/approval-token.js';
import type { FilePatch, ModernizationPlan, PlanStage } from '../assessment/types.js';
import { unifiedDiff } from './patches.js';

const MAX_DIFF_LINES = 400;
const MIN_SECRET_LEN = 32;
const TOKEN_TTL_SECONDS = 300;

export interface Preview {
  stage: Pick<PlanStage, 'id' | 'index' | 'title' | 'automated' | 'risk' | 'steps' | 'rollback' | 'scoreAfter'>;
  automated: boolean;
  files: Array<{ path: string; action: 'create' | 'edit' | 'delete'; reason: string }>;
  diff: string;
  planHash?: string;
  patchHash?: string;
  approvalToken?: string;
  expiresInSeconds?: number;
  note?: string;
}

export interface PreviewInput {
  plan: ModernizationPlan;
  stageId: string;
  patches: FilePatch[];
  secret: string | undefined;
  now?: number; // unix seconds
}

function action(p: FilePatch): 'create' | 'edit' | 'delete' {
  if (p.after === null) return 'delete';
  return p.before === undefined ? 'create' : 'edit';
}

function combinedDiff(patches: FilePatch[]): string {
  const lines = patches
    .map((p) => unifiedDiff(p.path, p.before, p.after, Number.MAX_SAFE_INTEGER))
    .join('')
    .split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  if (lines.length <= MAX_DIFF_LINES) return lines.length === 0 ? '' : lines.join('\n') + '\n';
  return [...lines.slice(0, MAX_DIFF_LINES), '... diff truncated'].join('\n') + '\n';
}

export function buildPreview(input: PreviewInput): Preview {
  const { plan, stageId, patches, secret, now } = input;
  const stage = plan.stages.find((s) => s.id === stageId);
  if (!stage) {
    throw new RangeError(`Unknown stage "${stageId}". Valid stage ids: ${plan.stages.map((s) => s.id).join(', ') || '(none)'}.`);
  }
  const head: Preview['stage'] = {
    id: stage.id,
    index: stage.index,
    title: stage.title,
    automated: stage.automated,
    risk: stage.risk,
    steps: stage.steps,
    rollback: stage.rollback,
    scoreAfter: stage.scoreAfter
  };

  if (!stage.automated) {
    return {
      stage: head,
      automated: false,
      files: [],
      diff: '',
      note: 'This stage is guided: the client edits the code following the steps, then Metamorph re-scans to confirm the result.'
    };
  }
  if (patches.length === 0) {
    return { stage: head, automated: true, files: [], diff: '', note: 'Nothing to change for this stage: the project already looks fixed.' };
  }

  const planHash = canonicalHash(plan);
  const patchHash = canonicalHash(patches);
  const out: Preview = {
    stage: head,
    automated: true,
    files: patches.map((p) => ({ path: p.path, action: action(p), reason: p.reason })),
    diff: combinedDiff(patches),
    planHash,
    patchHash
  };
  if (typeof secret === 'string' && secret.length >= MIN_SECRET_LEN) {
    out.approvalToken = signApprovalToken({ planHash, patchHash, stage: stage.index }, secret, now);
    out.expiresInSeconds = TOKEN_TTL_SECONDS;
  } else {
    out.note = `Approval tokens are disabled until METAMORPH_TOKEN_SECRET (${MIN_SECRET_LEN}+ characters) is set on the server.`;
  }
  return out;
}
