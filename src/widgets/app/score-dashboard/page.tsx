'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useWidgetSDK } from '@nitrostack/widgets';
import { AssessmentFull, AssessmentInline, EmptyState, ErrorState, LoadingState, type Actions } from '../../components/AssessmentView';
import { SEVERITY_LABEL, SeverityIcon } from '../../components/Severity';
import { CloudView, WatchView } from '../../components/MonitorViews';
import { PlanView } from '../../components/PlanView';
import { ReportView } from '../../components/ReportView';
import { VerifyView } from '../../components/VerifyView';
import { Shell, ThemeSwitch, useLayout, useTheme, type StepIndex } from '../../components/Shell';
import { repoLabel, shortSha } from '../../lib/calls';
import { tokensFor } from '../../lib/theme';
import { outputFromMessage } from '../../lib/tool-output';
import { UNRECOGNISED_HEADLINE, describeUnrecognised, scoreBand, toViewModel, unrecognisedDetail, type ViewModel, type ApplyVM, type PlanVM, type ReportFileVM, type ReportVM, type Severity, type StageVM, type VerifyVM, type RunVM } from '../../lib/view-model';
import '../tokens.css';
import '../mm.css';
import '../parts.css';
import '../report.css';
import '../verify.css';
import '../plan.css';
import '../monitor.css';
import './dashboard.css';

const R = 52;
const CIRC = 2 * Math.PI * R;

function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span className={`chip ${severity}`}>
      <SeverityIcon severity={severity} />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const band = scoreBand(score);
  const offset = CIRC * (1 - score / 100);
  return (
    <svg className="ring" viewBox="0 0 120 120" role="img" aria-label={`${label} ${score} out of 100`}>
      <circle className="ring-track" cx="60" cy="60" r={R} />
      <circle className={`ring-arc ${band}`} cx="60" cy="60" r={R} style={{ ['--circ' as string]: CIRC.toFixed(2), ['--off' as string]: offset.toFixed(2) }} />
      <text className="ring-value" x="60" y="66" textAnchor="middle">
        {score}
      </text>
      <text className="ring-sub" x="60" y="84" textAnchor="middle">
        out of 100
      </text>
    </svg>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <span className="bar-track" aria-hidden="true">
      <span className={`bar-fill ${scoreBand(value)}`} style={{ width: `${value}%` }} />
    </span>
  );
}

function Apply({ vm }: { vm: ApplyVM }) {
  const delta = vm.scoreDelta;
  const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
  return (
    <>
      <p className="projected" role="note">
        <span className="chip guided">Projected</span> Projected result, nothing in your repo was changed.
      </p>
      <div className="card compare">
        <div className="compare-col">
          <ScoreRing score={vm.scoreBefore} label="Score before" />
          <p className="meta">Before</p>
        </div>
        <div className="compare-mid">
          <span className={`chip delta ${delta > 0 ? 'low' : delta < 0 ? 'high' : 'neutral'}`} aria-label={`Score change ${deltaText}`}>
            {deltaText}
          </span>
          <span className="arrow" aria-hidden="true">
            →
          </span>
        </div>
        <div className="compare-col">
          <ScoreRing score={vm.scoreAfter} label="Projected score after" />
          <p className="meta">After (projected)</p>
        </div>
      </div>
      <p className="meta" style={{ marginTop: 8 }}>
        Stage {vm.stage.index !== undefined ? `${vm.stage.index}: ` : ''}
        {vm.stage.title} · {vm.stage.risk} risk
      </p>

      <section aria-labelledby="sd-fixed">
        <h2 id="sd-fixed">Findings fixed ({vm.fixedCount})</h2>
        {vm.findingsFixed.length === 0 ? (
          <div className="card muted">No findings were fixed by this stage.</div>
        ) : (
          <ul className="card plain">
            {vm.findingsFixed.map((f, i) => (
              <li key={`${f}-${i}`} className="mono">
                {f}
              </li>
            ))}
          </ul>
        )}
        {vm.fixedCount > vm.findingsFixed.length && <p className="meta" style={{ marginTop: 8 }}>Showing {vm.findingsFixed.length} of {vm.fixedCount}.</p>}
      </section>

      <section aria-labelledby="sd-rem">
        <h2 id="sd-rem">Still remaining ({vm.remainingCount})</h2>
        {vm.remaining.length === 0 ? (
          <div className="card muted">Nothing remaining.</div>
        ) : (
          <ul className="list">
            {vm.remaining.map((r, i) => (
              <li key={`${r.id}-${i}`} className="finding">
                <div className="chips" style={{ marginTop: 0 }}>
                  <SeverityChip severity={r.severity} />
                </div>
                <h3>{r.title}</h3>
              </li>
            ))}
          </ul>
        )}
        {vm.remainingCount > vm.remaining.length && <p className="meta" style={{ marginTop: 8 }}>Showing {vm.remaining.length} of {vm.remainingCount}.</p>}
      </section>

      {vm.files.length > 0 && (
        <section aria-labelledby="sd-files">
          <h2 id="sd-files">Files in the patch ({vm.fileCount})</h2>
          <ul className="card plain">
            {vm.files.map((f, i) => (
              <li key={`${f.path}-${i}`}>
                <span className="chip neutral">{f.action}</span> <span className="mono">{f.path}</span>
              </li>
            ))}
          </ul>
          {vm.fileCount > vm.files.length && <p className="meta" style={{ marginTop: 8 }}>Showing {vm.files.length} of {vm.fileCount}.</p>}
        </section>
      )}
      {vm.note && <p className="meta" style={{ marginTop: 12 }}>{vm.note}</p>}
    </>
  );
}

class ResultBoundary extends React.Component<{ raw: unknown; children: React.ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.name : 'an error' };
  }
  componentDidUpdate(prev: { raw: unknown }) {
    if (prev.raw !== this.props.raw && this.state.error) this.setState({ error: undefined });
  }
  render() {
    if (this.state.error) {
      const vm = describeUnrecognised(this.props.raw);
      return <ErrorState headline={UNRECOGNISED_HEADLINE} detail={unrecognisedDetail(vm, this.state.error)} />;
    }
    return this.props.children;
  }
}

type OpenAiGlobal = { toolOutput?: unknown };

// The host can hand over the result in the first injection, in a later one, or as a separate message, and the SDK
// only re-renders on one of those. Listen for all of them and poll window.openai as a last resort.
function useToolOutput(): unknown {
  const [output, setOutput] = useState<unknown>(null);
  useEffect(() => {
    let seen: unknown;
    const read = () => {
      const v = (window as unknown as { openai?: OpenAiGlobal }).openai?.toolOutput;
      if (v === undefined || v === null || v === seen) return;
      seen = v;
      setOutput(v);
    };
    const onMessage = (e: MessageEvent) => {
      const v = outputFromMessage(e.data);
      if (v !== undefined) setOutput(v);
      // The SDK layout sets window.openai in its own listener; read again after it ran.
      setTimeout(read, 0);
      setTimeout(read, 150);
    };
    read();
    window.addEventListener('message', onMessage);
    for (const ev of ['openai:set_globals', 'openai:ready', 'mcp:ready']) window.addEventListener(ev, read);
    const poll = setInterval(read, 400);
    return () => {
      window.removeEventListener('message', onMessage);
      for (const ev of ['openai:set_globals', 'openai:ready', 'mcp:ready']) window.removeEventListener(ev, read);
      clearInterval(poll);
    };
  }, []);
  return output;
}

// Which step of the journey (Assess > Plan > Preview > Apply/Verify > Report) a result belongs to.
function stepOf(vm: ViewModel): StepIndex | null {
  switch (vm.kind) {
    case 'watch':
    case 'cloud':
      return null;
    case 'plan':
      return 1;
    case 'apply':
      return 2;
    case 'verify':
      return 3;
    case 'report':
      return 4;
    default:
      return 0;
  }
}

function Legacy({ vm, open }: { vm: ViewModel; open: (url: string) => void }) {
  const title = vm.kind === 'report' ? 'Assessment report' : vm.kind === 'verify' ? 'Verification' : vm.kind === 'plan' ? 'Modernization plan' : 'Projected result';
  return (
    <div className="sd">
      <h1>{title}</h1>
      {vm.kind === 'apply' ? <Apply vm={vm} /> : null}
    </div>
  );
}

function Body({ vm, layout, actions, open }: { vm: ViewModel; layout: 'full' | 'inline'; actions: Actions; open: (url: string) => void }) {
  switch (vm.kind) {
    case 'empty':
      return <EmptyState />;
    case 'unknown':
      return <ErrorState headline={UNRECOGNISED_HEADLINE} detail={unrecognisedDetail(vm)} />;
    case 'report':
      return <ReportView vm={vm} actions={actions} />;
    case 'verify':
      return <VerifyView vm={vm} actions={actions} />;
    case 'plan':
      return <PlanView vm={vm} actions={actions} />;
    case 'watch':
      return <WatchView vm={vm} />;
    case 'cloud':
      return <CloudView vm={vm} />;
    case 'assessment':
      return layout === 'inline' ? <AssessmentInline vm={vm} actions={actions} /> : <AssessmentFull vm={vm} actions={actions} />;
    default:
      return <Legacy vm={vm} open={open} />;
  }
}

const timeOf = (iso: string | undefined): string => {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function ScoreDashboardPage() {
  const { isReady, theme: hostTheme, displayMode, openExternal, callTool, requestFullscreen } = useWidgetSDK();
  const raw = useToolOutput();
  const { theme, pref, cycle } = useTheme(hostTheme);
  const layout = useLayout(displayMode);

  // The page background outside the root element follows the theme too (inline mode can be shorter than the frame).
  useEffect(() => {
    if (!theme) return;
    const t = tokensFor(theme);
    document.documentElement.style.background = t['--base'];
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const vm = useMemo(() => toViewModel(raw), [raw]);
  // First render equals the server HTML (a skeleton); the real state follows after mount, so hydration never mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const loading = !mounted || (!isReady && raw === null);
  const [received, setReceived] = useState('');
  useEffect(() => {
    if (raw !== null) setReceived(timeOf(vm.kind === 'assessment' ? vm.generatedAt : undefined));
  }, [raw, vm]);
  const open = (url: string) => {
    try {
      openExternal(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };
  const actions: Actions = { callTool, requestFullscreen, openExternal };
  const a = vm.kind === 'assessment' ? vm : undefined;
  const meta = { repo: repoLabel(a?.repoUrl) ?? (a?.assessmentId ? `assessment ${a.assessmentId.slice(0, 8)}` : undefined), sha: shortSha(a?.commit), time: received || undefined };
  // Only the assessment view has an inline layout so far; the other views always use the full one.
  const shellLayout = vm.kind === 'assessment' || loading ? layout : 'full';

  return (
    <Shell theme={theme} layout={shellLayout} step={stepOf(vm)} meta={meta} sw={<ThemeSwitch pref={pref} onCycle={cycle} theme={theme} />}>
      <div aria-busy={loading}>
        {loading ? (
          <LoadingState />
        ) : (
          <ResultBoundary raw={raw}>
            <Body vm={vm} layout={layout} actions={actions} open={open} />
          </ResultBoundary>
        )}
      </div>
    </Shell>
  );
}
