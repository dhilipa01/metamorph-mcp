'use client';

import React, { useEffect, useMemo } from 'react';
import { useWidgetSDK } from '@nitrostack/widgets';
import { scoreBand, toViewModel, type ApplyVM, type AssessmentVM, type FindingVM, type PlanVM, type Severity, type StageVM } from '../../lib/view-model';
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

export default function ScoreDashboardPage() {
  const { isReady, getToolOutput, theme } = useWidgetSDK();

  // Honour the host theme; without one the CSS falls back to prefers-color-scheme.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
  }, [theme]);

  const raw = isReady ? getToolOutput<unknown>() : null;
  const vm = useMemo(() => toViewModel(raw), [raw]);
  const title = vm.kind === 'plan' ? 'Modernization plan' : vm.kind === 'apply' ? 'Projected result' : 'Modernization score';

  return (
    <main className="sd" aria-busy={!isReady}>
      <h1>{title}</h1>
      {!isReady ? (
        <div className="card" role="status" aria-live="polite">
          <span className="sr-only">Loading results</span>
          <div className="skeleton w60" />
          <div className="skeleton w90" />
          <div className="skeleton w60" />
        </div>
      ) : vm.kind === 'empty' ? (
        <div className="card state" role="status">
          <p>No results yet.</p>
          <p className="muted">Run assess_project, plan_modernization or apply_stage to see results.</p>
        </div>
      ) : vm.kind === 'plan' ? (
        <Plan vm={vm} />
      ) : vm.kind === 'apply' ? (
        <Apply vm={vm} />
      ) : (
        <Assessment vm={vm} />
      )}
    </main>
  );
}
