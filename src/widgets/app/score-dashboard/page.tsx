'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useWidgetSDK } from '@nitrostack/widgets';
import { outputFromMessage } from '../../lib/tool-output';
import { UNRECOGNISED_HEADLINE, describeUnrecognised, scoreBand, toViewModel, unrecognisedDetail, type UnknownVM, type ViewModel, type ApplyVM, type AssessmentVM, type FindingVM, type PlanVM, type ReportFileVM, type ReportVM, type Severity, type StageVM, type VerifyVM, type RunVM } from '../../lib/view-model';
import './dashboard.css';

const R = 52;
const CIRC = 2 * Math.PI * R;

const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };

function SeverityIcon({ severity }: { severity: Severity }) {
  // A different shape per level, so severity is readable without colour.
  const common = { viewBox: '0 0 12 12', 'aria-hidden': true, focusable: false } as const;
  switch (severity) {
    case 'critical':
      return (
        <svg {...common}>
          <path d="M4 1h4l3 3v4l-3 3H4L1 8V4z" fill="currentColor" />
          <path d="M4 4l4 4M8 4L4 8" className="cut" />
        </svg>
      );
    case 'high':
      return (
        <svg {...common}>
          <path d="M6 1l5.5 10h-11z" fill="currentColor" />
          <path d="M6 4.5v3M6 9v.5" className="cut" />
        </svg>
      );
    case 'medium':
      return (
        <svg {...common}>
          <path d="M6 1l5 5-5 5-5-5z" fill="currentColor" />
        </svg>
      );
    case 'low':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="5" fill="currentColor" />
          <path d="M6 5.5v3M6 3.5v.5" className="cut" />
        </svg>
      );
  }
}

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

function FindingItem({ f }: { f: FindingVM }) {
  return (
    <li className="finding">
      <div className="chips" style={{ marginTop: 0 }}>
        <SeverityChip severity={f.severity} />
        <span className="chip neutral cap">{f.category}</span>
      </div>
      <h3>{f.title}</h3>
      {f.evidence && <p className="evidence mono">{f.evidence}</p>}
      {f.recommendation && (
        <details>
          <summary>Recommendation</summary>
          <div className="detail-body">{f.recommendation}</div>
        </details>
      )}
    </li>
  );
}

function Assessment({ vm }: { vm: AssessmentVM }) {
  const band = scoreBand(vm.score);
  const bandText = band === 'ok' ? 'Healthy' : band === 'warn' ? 'Needs work' : 'At risk';
  const bandIcon: Severity = band === 'ok' ? 'low' : band === 'warn' ? 'medium' : 'high';
  const active = vm.counts.filter((c) => c.count > 0);
  const d = vm.dependencies;
  return (
    <>
      <div className="card top">
        <ScoreRing score={vm.score} label="Score" />
        <div>
          <p className={`band ${band}`}>
            <span className="sr-only">Status: </span>
            {bandText}
          </p>
          <p className="muted">
            Stack: <span className="mono">{vm.stack}</span> · {vm.findingCount} finding{vm.findingCount === 1 ? '' : 's'}
          </p>
          <div className="chips">
            {active.length === 0 ? (
              <span className="chip low">
                <SeverityIcon severity={bandIcon} />
                No findings
              </span>
            ) : (
              active.map((c) => (
                <span key={c.severity} className={`chip ${c.severity}`}>
                  <SeverityIcon severity={c.severity} />
                  <span className="num">{c.count}</span> {SEVERITY_LABEL[c.severity]}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {vm.byCategory.length > 0 && (
        <section className="card" aria-labelledby="sd-cat">
          <h2 id="sd-cat">Score by category</h2>
          <ul className="bars">
            {vm.byCategory.map((c) => (
              <li key={c.category} className="bar-row" aria-label={`${c.category} ${c.score} out of 100`}>
                <span className="cap">{c.category}</span>
                <Bar value={c.score} />
                <span className="bar-score num">{c.score}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="sd-find">
        <h2 id="sd-find">Top findings</h2>
        {vm.findings.length === 0 ? (
          <div className="card muted">No findings to show.</div>
        ) : (
          <ul className="list">
            {vm.findings.map((f, i) => (
              <FindingItem key={`${f.id}-${i}`} f={f} />
            ))}
          </ul>
        )}
        {vm.findingCount > vm.findings.length && <p className="meta" style={{ marginTop: 8 }}>Showing {vm.findings.length} of {vm.findingCount} findings.</p>}
      </section>

      <div className="grid2">
        {d && (
          <section className="card" aria-labelledby="sd-dep">
            <h2 id="sd-dep">Dependencies</h2>
            <dl className="facts">
              <div className="fact">
                <dt>Checked</dt>
                <dd className="num">{d.checked}</dd>
              </div>
              <div className="fact">
                <dt>Vulnerable</dt>
                <dd className={`num ${d.vulnerable > 0 ? 'danger' : ''}`}>{d.vulnerable}</dd>
              </div>
              <div className="fact">
                <dt>Urgent</dt>
                <dd className={`num ${d.urgent > 0 ? 'danger' : ''}`}>{d.urgent}</dd>
              </div>
            </dl>
            {d.approximateVersions && <p className="meta" style={{ marginTop: 8 }}>Some versions are approximate (no lockfile).</p>}
          </section>
        )}
        <section className="card" aria-labelledby="sd-rt">
          <h2 id="sd-rt">Runtime and hosting</h2>
          <dl className="facts">
            <div className="fact">
              <dt>Runtime</dt>
              <dd className="mono">{vm.runtime.declared ?? 'not declared'}</dd>
            </div>
            <div className="fact">
              <dt>Declared in</dt>
              <dd className="mono">{vm.runtime.source ?? 'n/a'}</dd>
            </div>
            <div className="fact">
              <dt>Hosting</dt>
              <dd>{vm.hosting.length ? vm.hosting.join(', ') : 'none detected'}</dd>
            </div>
          </dl>
        </section>
      </div>
      {vm.truncated && <p className="meta" style={{ marginTop: 8 }}>Large repository: only part of it was scanned.</p>}
    </>
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

// Blob link for a file the server embedded because it could not issue a clickable link. Revoked on unmount.
function useBlobUrl(inline: ReportFileVM['inline']): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!inline) return undefined;
    let made: string | undefined;
    try {
      let part: BlobPart;
      if (inline.encoding === 'base64') {
        const bin = atob(inline.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        part = bytes;
      } else part = inline.data;
      made = URL.createObjectURL(new Blob([part], { type: inline.mimeType }));
      setUrl(made);
    } catch {
      setUrl(undefined);
    }
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [inline]);
  return url;
}

function DownloadRow({ f, open }: { f: ReportFileVM; open: (url: string) => void }) {
  const blob = useBlobUrl(f.href ? undefined : f.inline);
  return (
    <li className="dl">
      <div className="dl-info">
        <h3>{f.label}</h3>
        <p className="meta mono">
          {f.fileName} · {f.sizeLabel}
        </p>
        {!f.href && !blob && (f.path ?? f.uri) && <p className="meta mono dl-path">{f.path ?? f.uri}</p>}
      </div>
      {f.href ? (
        <a
          className="btn"
          href={f.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            open(f.href as string);
          }}
        >
          Download<span className="sr-only"> {f.label}</span>
        </a>
      ) : blob ? (
        <a className="btn" href={blob} download={f.fileName}>
          Save<span className="sr-only"> {f.label}</span>
        </a>
      ) : (
        <span className="chip neutral">No link</span>
      )}
    </li>
  );
}

function Report({ vm, open }: { vm: ReportVM; open: (url: string) => void }) {
  const band = scoreBand(vm.score);
  const active = vm.counts.filter((c) => c.count > 0);
  const linked = vm.files.some((f) => f.href);
  const saved = !linked && vm.files.some((f) => f.inline);
  return (
    <>
      <div className="card top">
        <ScoreRing score={vm.score} label="Score" />
        <div>
          <p className={`band ${band}`}>
            <span className="chip neutral">{vm.origin[0].toUpperCase() + vm.origin.slice(1)} score</span>
          </p>
          <p className="muted">
            {vm.findingTotal} finding{vm.findingTotal === 1 ? '' : 's'}
            {vm.pages !== undefined ? ` · ${vm.pages} page${vm.pages === 1 ? '' : 's'}` : ''}
          </p>
          <div className="chips">
            {active.length === 0 ? (
              <span className="chip low">
                <SeverityIcon severity="low" />
                No findings
              </span>
            ) : (
              active.map((c) => (
                <span key={c.severity} className={`chip ${c.severity}`}>
                  <SeverityIcon severity={c.severity} />
                  <span className="num">{c.count}</span> {SEVERITY_LABEL[c.severity]}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <section aria-labelledby="sd-dl">
        <h2 id="sd-dl">Download</h2>
        {vm.files.length === 0 ? (
          <div className="card muted">No files in this result. Run generate_report again.</div>
        ) : (
          <ul className="card plain dls">
            {vm.files.map((f) => (
              <DownloadRow key={f.format} f={f} open={open} />
            ))}
          </ul>
        )}
        <p className="meta" style={{ marginTop: 8 }}>
          {linked
            ? `Links work for ${vm.expiresInMinutes ?? 10} minutes. After that, run generate_report again.`
            : saved
              ? 'The server could not issue links, so the files were embedded in this result. If Save does nothing in your client, the host blocks downloads from widgets.'
              : (vm.message ?? 'This server cannot issue download links. Ask the operator to set METAMORPH_PUBLIC_URL.')}
        </p>
      </section>

      <section aria-labelledby="sd-prev">
        <h2 id="sd-prev">Report preview</h2>
        <div className="card">
          {vm.topFindings.length === 0 ? (
            <p className="muted">No findings: the report confirms a clean result.</p>
          ) : (
            <ol className="plain prev">
              {vm.topFindings.map((t, i) => (
                <li key={i}>
                  <SeverityChip severity={t.severity} /> <span>{t.title}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="meta" style={{ marginTop: 8 }}>
            The full PDF has {vm.pages ?? 'several'} pages. Open it to see the rest; a PDF viewer cannot run inside this panel.
          </p>
        </div>
      </section>
    </>
  );
}

const RUN_LABEL: Record<string, string> = { queued: 'Queued', running: 'Running', completed: 'Completed', failed: 'Failed', timed_out: 'Timed out' };

function RunLine({ label, r }: { label: string; r: RunVM }) {
  const t = r.tests;
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>
        {RUN_LABEL[r.status]}
        {r.buildOk !== undefined && <> · build {r.buildOk ? 'ok' : 'not ok'}</>}
        {t && <> · tests {t.ran === 0 ? 'none found' : `${t.passed}/${t.ran} passed`}</>}
      </dd>
    </div>
  );
}

function Verify({ vm }: { vm: VerifyVM }) {
  return (
    <>
      <div className="card">
        <div className="chips" style={{ marginTop: 0 }}>
          <span className={`chip ${vm.status === 'completed' ? 'neutral' : vm.status === 'running' || vm.status === 'queued' ? 'guided' : 'high'}`}>{RUN_LABEL[vm.status]}</span>
          <span className={`chip ${vm.verified ? 'low' : 'high'}`}>{vm.verified ? 'Verified' : 'Not verified'}</span>
        </div>
        {vm.stage && <p className="meta" style={{ marginTop: 8 }}>Stage: {vm.stage}</p>}
        <p className="meta" style={{ marginTop: 8 }}>Measured on an isolated runner, not projected.</p>
      </div>
      {!vm.verified && vm.reasons.length > 0 && (
        <section aria-labelledby="sd-why">
          <h2 id="sd-why">Why not verified ({vm.reasonCount})</h2>
          <ul className="card plain">
            {vm.reasons.map((r, i) => (
              <li key={`${r}-${i}`}>{r}</li>
            ))}
          </ul>
          {vm.reasonCount > vm.reasons.length && <p className="meta" style={{ marginTop: 8 }}>Showing {vm.reasons.length} of {vm.reasonCount}.</p>}
        </section>
      )}
      <section className="card" aria-labelledby="sd-runs">
        <h2 id="sd-runs">Before and after</h2>
        <dl className="facts">
          <RunLine label="Baseline (before)" r={vm.baseline} />
          <RunLine label="Patched (after)" r={vm.patched} />
        </dl>
      </section>
      {vm.measured && (
        <section className="card" aria-labelledby="sd-measured">
          <h2 id="sd-measured">Measured score (runner tools)</h2>
          <dl className="facts">
            <div className="fact">
              <dt>Baseline (before)</dt>
              <dd>{vm.measured.baseline} · {vm.measured.baselineFindings} distinct findings</dd>
            </div>
            <div className="fact">
              <dt>Patched (after)</dt>
              <dd>{vm.measured.patched} · {vm.measured.patchedFindings} distinct findings</dd>
            </div>
          </dl>
          <p className="meta" style={{ marginTop: 8 }}>
            {vm.measured.note ?? 'The measured score covers only what the runner tools reported; it is not the static assessment score.'}
            {!vm.verified && ' A measured score does not mean the patch is verified.'}
          </p>
        </section>
      )}
      {vm.checks.length > 0 && (
        <section aria-labelledby="sd-checks">
          <h2 id="sd-checks">Checks ({vm.checkCount})</h2>
          <ul className="card plain">
            {vm.checks.map((c, i) => (
              <li key={`${c.tool}-${i}`}>
                <span className={`chip ${c.status === 'pass' ? 'low' : c.status === 'skipped' ? 'neutral' : 'high'}`}>{c.status}</span> <span className="mono">{c.tool}</span>
              </li>
            ))}
          </ul>
          {vm.checkCount > vm.checks.length && <p className="meta" style={{ marginTop: 8 }}>Showing {vm.checks.length} of {vm.checkCount}.</p>}
        </section>
      )}
      {vm.hint && <p className="meta" style={{ marginTop: 12 }}>{vm.hint}</p>}
    </>
  );
}

function Projection({ from, to }: { from?: number; to?: number }) {
  if (to === undefined) return null;
  return (
    <div className="proj">
      <p className="meta num">
        Projected score{from !== undefined ? ` ${from} to ${to}` : `: ${to}`}
      </p>
      <div className="proj-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={to} aria-label={`Projected score ${to} out of 100`}>
        <span className="proj-to" style={{ width: `${to}%` }} />
        {from !== undefined && <span className="proj-from" style={{ width: `${Math.min(from, to)}%` }} />}
      </div>
    </div>
  );
}

function StageItem({ s, before }: { s: StageVM; before?: number }) {
  return (
    <li className="step">
      <span className="step-n" aria-hidden="true">
        {s.index}
      </span>
      <div className="step-body">
        <h3>
          <span className="sr-only">Step {s.index}: </span>
          {s.title}
        </h3>
        <div className="chips">
          <span className={`chip risk-${s.risk}`}>
            <SeverityIcon severity={s.risk === 'high' ? 'high' : s.risk === 'medium' ? 'medium' : 'low'} />
            {s.risk[0].toUpperCase() + s.risk.slice(1)} risk
          </span>
          <span className={`chip ${s.automated ? 'neutral' : 'guided'}`}>{s.automated ? 'Automated' : 'Guided'}</span>
          <span className="chip neutral cap">{s.kind}</span>
        </div>
        {s.steps.length > 0 && (
          <ol className="steps-list">
            {s.steps.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        )}
        {s.rollback && (
          <details>
            <summary>Rollback</summary>
            <div className="detail-body">{s.rollback}</div>
          </details>
        )}
        <Projection from={before} to={s.scoreAfter} />
      </div>
    </li>
  );
}

function Plan({ vm }: { vm: PlanVM }) {
  const path = [vm.scoreBefore, ...vm.stages.map((s) => s.scoreAfter)].filter((n): n is number => n !== undefined);
  return (
    <>
      <div className="card">
        <p className="meta">
          Goal: <span className="mono">{vm.goal}</span> · Stack: <span className="mono">{vm.stack}</span>
        </p>
        {path.length > 0 && (
          <p className="journey" aria-label={`Projected score path ${path.join(' to ')}`}>
            {path.join(' → ')}
          </p>
        )}
        {vm.scoreAfter !== undefined && <Projection from={vm.scoreBefore} to={vm.scoreAfter} />}
      </div>
      <section aria-labelledby="sd-stages">
        <h2 id="sd-stages">Plan stages</h2>
        {vm.stages.length === 0 ? (
          <div className="card muted">No stages: nothing to modernize for this goal.</div>
        ) : (
          <ol className="stepper">
            {vm.stages.map((s, i) => (
              <StageItem key={s.id} s={s} before={i === 0 ? vm.scoreBefore : vm.stages[i - 1].scoreAfter} />
            ))}
          </ol>
        )}
        {vm.hint && <p className="meta" style={{ marginTop: 12 }}>{vm.hint}</p>}
      </section>
    </>
  );
}

function Unrecognised({ vm, renderError }: { vm: UnknownVM; renderError?: string }) {
  return (
    <div className="card state" role="alert">
      <p>{UNRECOGNISED_HEADLINE}</p>
      <p className="muted mono">{unrecognisedDetail(vm, renderError)}</p>
    </div>
  );
}

// A render error must be visible, never a blank or a fallback to the empty state.
class ResultBoundary extends React.Component<{ raw: unknown; children: React.ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.name : 'an error' };
  }
  componentDidUpdate(prev: { raw: unknown }) {
    if (prev.raw !== this.props.raw && this.state.error) this.setState({ error: undefined });
  }
  render() {
    if (this.state.error) return <Unrecognised vm={describeUnrecognised(this.props.raw)} renderError={this.state.error} />;
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

function Body({ vm, open }: { vm: ViewModel; open: (url: string) => void }) {
  switch (vm.kind) {
    case 'empty':
      return (
        <div className="card state" role="status">
          <p>No results yet.</p>
          <p className="muted">Run assess_project, plan_modernization, apply_stage or generate_report to see results.</p>
        </div>
      );
    case 'unknown':
      return <Unrecognised vm={vm} />;
    case 'plan':
      return <Plan vm={vm} />;
    case 'report':
      return <Report vm={vm} open={open} />;
    case 'apply':
      return <Apply vm={vm} />;
    case 'verify':
      return <Verify vm={vm} />;
    default:
      return <Assessment vm={vm} />;
  }
}

export default function ScoreDashboardPage() {
  const { isReady, theme, openExternal } = useWidgetSDK();
  const raw = useToolOutput();

  // Honour the host theme; without one the CSS falls back to prefers-color-scheme.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
  }, [theme]);

  const vm = useMemo(() => toViewModel(raw), [raw]);
  const loading = !isReady && raw === null;
  const open = (url: string) => {
    try {
      openExternal(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };
  const title = vm.kind === 'report' ? 'Assessment report' : vm.kind === 'verify' ? 'Verification' : vm.kind === 'plan' ? 'Modernization plan' : vm.kind === 'apply' ? 'Projected result' : 'Modernization score';

  return (
    <main className="sd" aria-busy={loading}>
      <h1>{title}</h1>
      {loading ? (
        <div className="card" role="status" aria-live="polite">
          <span className="sr-only">Loading results</span>
          <div className="skeleton w60" />
          <div className="skeleton w90" />
          <div className="skeleton w60" />
        </div>
      ) : (
        <ResultBoundary raw={raw}>
          <Body vm={vm} open={open} />
        </ResultBoundary>
      )}
    </main>
  );
}
