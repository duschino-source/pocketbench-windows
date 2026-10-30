import * as React from 'react';
import { Badge, Button, Textarea } from '@fluentui/react-components';
import { SearchRegular, WrenchRegular } from '@fluentui/react-icons';
import type { DiagnosticEvidence } from '../../shared/contracts';
import type { ViewProps } from '../types';

function severityColor(severity: DiagnosticEvidence['severity']): 'informative' | 'warning' | 'severe' {
  switch (severity) {
    case 'critical':
      return 'severe';
    case 'warning':
      return 'warning';
    case 'info':
      return 'informative';
  }
}

export function OverviewView(props: ViewProps): React.ReactElement {
  const { state, busy } = props;
  const snapshot = state.snapshot;
  const diagnostics = snapshot?.diagnostics ?? [];
  const critical = diagnostics.filter((item) => item.severity === 'critical');
  const warnings = diagnostics.filter((item) => item.severity === 'warning');
  const prioritized = [...critical, ...warnings].slice(0, 5);
  const recentPlans = state.plans.slice(0, 4);

  return (
    <div>
      <section className="pb-section" aria-labelledby="overview-evidence">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="overview-evidence">
            System overview
          </h2>
        </div>
        {!snapshot ? (
          <div className="pb-empty">
            <h3>Start with your PC</h3>
            <p>
              Check Windows, services, startup items, and installed apps. Investigate a problem,
              review the repair, and apply it here.
            </p>
            <Button
              appearance="primary"
              icon={<SearchRegular />}
              disabled={busy.scan}
              onClick={() => {
                void props.onScan();
              }}
            >
              {busy.scan ? 'Scanning…' : 'Run scan'}
            </Button>
          </div>
        ) : (
          <div>
            <div className="pb-grid" role="list" aria-label="Scan counts">
              <div className="pb-metric" role="listitem">
                <div className="pb-metric-label">Diagnostics</div>
                <div className="pb-metric-value">{diagnostics.length}</div>
                <div className="pb-metric-sub">
                  {critical.length} critical · {warnings.length} warning
                </div>
              </div>
              <div className="pb-metric" role="listitem">
                <div className="pb-metric-label">Applications</div>
                <div className="pb-metric-value">{snapshot.apps.length}</div>
                <div className="pb-metric-sub">Installed inventory entries</div>
              </div>
              <div className="pb-metric" role="listitem">
                <div className="pb-metric-label">Startup entries</div>
                <div className="pb-metric-value">{snapshot.startup.length}</div>
                <div className="pb-metric-sub">
                  {snapshot.startup.filter((entry) => entry.enabled).length} enabled
                </div>
              </div>
              <div className="pb-metric" role="listitem">
                <div className="pb-metric-label">Repair plans</div>
                <div className="pb-metric-value">{state.plans.length}</div>
                <div className="pb-metric-sub">
                  {state.plans.filter((plan) => plan.status === 'ready').length} ready to apply
                </div>
              </div>
            </div>
            {snapshot.labMode && (
              <p className="pb-note" style={{ marginTop: '0.75rem' }}>
                Isolated lab mode is on: changes are validated against a test profile, not the live host.
              </p>
            )}
          </div>
        )}
      </section>

      {snapshot && (
        <section className="pb-section" aria-labelledby="overview-metrics">
          <div className="pb-section-head">
            <h2 className="pb-section-title" id="overview-metrics">
              System metrics
            </h2>
          </div>
          <dl className="pb-kv">
            <dt>Operating system</dt>
            <dd>{snapshot.machine.os}</dd>
            <dt>Computer</dt>
            <dd>{snapshot.machine.name}</dd>
            <dt>Memory</dt>
            <dd>
              {(snapshot.machine.memoryFree / 1024 / 1024 / 1024).toFixed(1)} GB free of{' '}
              {(snapshot.machine.memoryTotal / 1024 / 1024 / 1024).toFixed(1)} GB
            </dd>
            <dt>Disk</dt>
            <dd>
              {(snapshot.metrics.diskFree / 1024 / 1024 / 1024).toFixed(1)} GB free of{' '}
              {(snapshot.metrics.diskTotal / 1024 / 1024 / 1024).toFixed(1)} GB
            </dd>
            <dt>CPU</dt>
            <dd>
              {snapshot.machine.cpuCount} cores
              {snapshot.metrics.cpuPercent === null
                ? ' · current load unavailable'
                : ` · ${snapshot.metrics.cpuPercent.toFixed(0)}% load`}
            </dd>
            <dt>Scanned</dt>
            <dd>{new Date(snapshot.scannedAt).toLocaleString()}</dd>
          </dl>
        </section>
      )}

      {snapshot && (
        <section className="pb-section" aria-labelledby="overview-issues">
          <div className="pb-section-head">
            <h2 className="pb-section-title" id="overview-issues">
              Prioritized issues
            </h2>
            <div className="pb-section-action">
              <Button
                appearance="secondary"
                size="small"
                onClick={() => props.onNavigate('windows')}
              >
                Open Windows diagnostics
              </Button>
            </div>
          </div>
          {prioritized.length === 0 ? (
            <p className="pb-note">
              The scan found no warning or critical diagnostics. Informational findings remain under Windows
              diagnostics.
            </p>
          ) : (
            <ul className="pb-list">
              {prioritized.map((item) => (
                <li key={item.id} className="pb-row">
                  <div className="pb-row-main">
                    <div className="pb-row-title">{item.title}</div>
                    <div className="pb-row-sub">
                      {item.category} · {item.observed}
                    </div>
                  </div>
                  <div className="pb-row-side">
                    <Badge appearance="tint" color={severityColor(item.severity)}>
                      {item.severity}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {snapshot && recentPlans.length > 0 && (
        <section className="pb-section" aria-labelledby="overview-plans">
          <div className="pb-section-head">
            <h2 className="pb-section-title" id="overview-plans">
              Recent repair plans
            </h2>
            <div className="pb-section-action">
              <Button appearance="secondary" size="small" onClick={() => props.onNavigate('activity')}>
                Open activity
              </Button>
            </div>
          </div>
          <ul className="pb-list">
            {recentPlans.map((plan) => (
              <li key={plan.id} className="pb-row">
                <div className="pb-row-main">
                  <div className="pb-row-title">{plan.title}</div>
                  <div className="pb-row-sub">
                    {plan.target.name} · {plan.status}
                  </div>
                </div>
                <div className="pb-row-side">
                  <Button
                    appearance="secondary"
                    size="small"
                    icon={<WrenchRegular />}
                    onClick={() => {
                      props.onSelectPlan(plan.id);
                      props.onNavigate('windows');
                    }}
                  >
                    Review
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pb-section" aria-labelledby="overview-start">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="overview-start">
            Getting started
          </h2>
        </div>
        <ol className="pb-detail-list">
          <li>Run a scan to collect real evidence from this computer.</li>
          <li>Investigate one issue from Windows diagnostics or one installed application.</li>
          <li>Review sources, impact, and reversibility before choosing Apply fix.</li>
          <li>Track every operation and supported undo under Activity.</li>
        </ol>
        {!snapshot && (
          <QuickSymptom starting={busy.investigating} onInvestigate={props.onInvestigate} />
        )}
      </section>
    </div>
  );
}

function QuickSymptom(props: {
  starting: boolean;
  onInvestigate: ViewProps['onInvestigate'];
}): React.ReactElement {
  const [symptom, setSymptom] = React.useState('');
  return (
    <form
      className="pb-form"
      style={{ marginTop: '0.75rem' }}
      onSubmit={(event) => {
        event.preventDefault();
        if (symptom.trim().length === 0) return;
        void props.onInvestigate({ symptom: symptom.trim() });
      }}
    >
      <label htmlFor="overview-symptom" className="pb-note">
        Describe a problem to investigate. Research uses your Meta API key.
      </label>
      <Textarea
        id="overview-symptom"
        value={symptom}
        onChange={(_, data) => setSymptom(data.value)}
        placeholder="Example: Wi-Fi connects but pages do not load"
        rows={2}
      />
      <div className="pb-form-row">
        <Button type="submit" appearance="secondary" disabled={props.starting || symptom.trim().length === 0}>
          {props.starting ? 'Researching…' : 'Research symptom'}
        </Button>
      </div>
    </form>
  );
}
