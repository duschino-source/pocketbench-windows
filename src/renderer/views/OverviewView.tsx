import * as React from 'react';
import { Button } from '@fluentui/react-components';
import {
  ArrowRightRegular,
  CheckmarkCircleRegular,
  DesktopRegular,
  HistoryRegular,
  SearchRegular,
  WarningRegular,
} from '@fluentui/react-icons';
import { formatBytes, formatDateTime, formatUptime, runStatusLabel } from '../format';
import { SymptomForm, symptomCategoryFromEvidence } from '../components/SymptomForm';
import { isBusy, sortFindingsByUrgency, type ViewProps } from '../types';

export function OverviewView(props: ViewProps): React.ReactElement {
  const { state, busy } = props;
  const snapshot = state.snapshot;
  const active = isBusy(busy);
  const diagnostics = snapshot?.diagnostics ?? [];
  const issues = sortFindingsByUrgency(diagnostics.filter((item) => item.severity !== 'info'));
  const attention = issues.slice(0, 5);
  const recent = state.history.slice(0, 3);
  const memoryUsed = snapshot ? snapshot.machine.memoryTotal - snapshot.machine.memoryFree : 0;

  if (!snapshot) {
    return (
      <div className="pb-overview pb-overview-cold">
        <div className="pb-statusline pb-statusline-cold" aria-label="Device status">
          <span className="pb-status-dot pb-status-dot-off" aria-hidden="true" />
          <span>Not scanned yet</span>
        </div>

        <section className="pb-cold-scan" aria-labelledby="overview-scan-title">
          <h2 id="overview-scan-title">Check this PC</h2>
          <p className="pb-cold-lede">
            Run a local scan of Windows and installed apps. It works offline, needs no account, and changes nothing.
          </p>
          <div className="pb-cold-actions">
            <Button
              appearance="primary"
              size="large"
              icon={<SearchRegular />}
              disabled={active}
              onClick={() => void props.onScan()}
            >
              {busy.scan ? 'Scanning…' : 'Scan this PC'}
            </Button>
            <span className="pb-note">No sign-in needed</span>
          </div>
          <ul className="pb-cold-coverage" aria-label="What the scan covers">
            <li>Windows health</li>
            <li>Updates</li>
            <li>Startup</li>
            <li>Storage and apps</li>
          </ul>
        </section>

        <p className="pb-cold-support">
          After the scan, anything that needs attention appears first. Every repair is shown for review before it can
          be applied.
        </p>
      </div>
    );
  }

  const statusCopy = issues.length
    ? `${issues.length} need${issues.length === 1 ? 's' : ''} attention`
    : 'No warnings in this scan';

  return (
    <div className="pb-overview">
      <div className="pb-statusline pb-statusline-populated" aria-label="Device status">
        <span className={'pb-status-dot' + (issues.length ? ' pb-status-dot-warn' : '')} aria-hidden="true" />
        <strong>{snapshot.machine.name || 'This PC'}</strong>
        <span>{statusCopy}</span>
        <span className="pb-statusline-meta">Last scan {formatDateTime(snapshot.scannedAt)}</span>
      </div>

      <div className="pb-overview-grid">
        <div className="pb-overview-primary">
          <section className="pb-section pb-findings" aria-labelledby="overview-issues">
            <div className="pb-section-head">
              <div>
                <h2 className="pb-section-title" id="overview-issues">
                  Needs attention
                </h2>
                <p className="pb-section-sub">
                  {issues.length ? 'Most urgent first' : 'A clean scan only means no known issue was detected'}
                </p>
              </div>
              {issues.length > 0 && (
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<ArrowRightRegular />}
                  iconPosition="after"
                  onClick={() => props.onNavigate('windows')}
                >
                  View all findings
                </Button>
              )}
            </div>

            {!issues.length ? (
              <div className="pb-quiet-empty">
                <CheckmarkCircleRegular />
                <div>
                  <h3>No warnings in this scan</h3>
                  <p>Describe a symptom below if something still seems wrong.</p>
                </div>
              </div>
            ) : (
              <ul className="pb-list pb-findings-list">
                {attention.map((item) => (
                  <li className="pb-row pb-finding-row" key={item.id}>
                    <div className={'pb-finding-icon pb-severity-' + item.severity} aria-hidden="true">
                      {item.severity === 'info' ? <DesktopRegular /> : <WarningRegular />}
                    </div>
                    <div className="pb-row-main">
                      <div className="pb-finding-line">
                        <span className="pb-row-title">{item.title}</span>
                        <span className={'pb-severity-label pb-severity-' + item.severity}>
                          {item.severity === 'critical' ? 'Critical' : 'Warning'}
                        </span>
                      </div>
                      <p className="pb-row-sub">{item.observed}</p>
                    </div>
                    <Button
                      appearance="secondary"
                      size="small"
                      disabled={active}
                      onClick={() => {
                        const guided = symptomCategoryFromEvidence(item.category, item.area);
                        props.onSelectPlan(null);
                        void props.onInvestigate({
                          symptom: item.title,
                          evidenceId: item.id,
                          ...(guided ? { category: guided } : {}),
                        });
                      }}
                    >
                      Investigate
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="pb-section pb-repair-surface pb-repair-compact"
            aria-labelledby="overview-composer-title"
          >
            <div className="pb-section-head">
              <div>
                <h2 className="pb-section-title" id="overview-composer-title">
                  Something else?
                </h2>
                <p className="pb-section-sub">Describe a problem the scan did not detect.</p>
              </div>
            </div>
            <SymptomForm {...props} compact />
          </section>
        </div>

        <aside className="pb-overview-secondary" aria-label="Device information">
          <section className="pb-section pb-device pb-device-quiet" aria-labelledby="overview-device">
            <h2 id="overview-device">{snapshot.machine.name || 'This PC'}</h2>
            <p className="pb-note">{snapshot.machine.os || 'System details unavailable'}</p>
            <div className="pb-device-lines">
              <div className="pb-device-line">
                <span>Memory</span>
                <strong>
                  {formatBytes(memoryUsed)} of {formatBytes(snapshot.machine.memoryTotal)}
                </strong>
              </div>
              <div className="pb-device-line">
                <span>System drive</span>
                <strong>{formatBytes(snapshot.metrics.diskFree)} free</strong>
              </div>
              <div className="pb-device-line">
                <span>CPU load</span>
                <strong>
                  {snapshot.metrics.cpuPercent === null ? 'Unavailable' : snapshot.metrics.cpuPercent.toFixed(0) + '%'}
                </strong>
              </div>
              <div className="pb-device-line">
                <span>Uptime</span>
                <strong>{formatUptime(snapshot.machine.uptime)}</strong>
              </div>
            </div>
          </section>

          {recent.length > 0 ? (
            <section className="pb-section pb-recent pb-recent-quiet" aria-labelledby="overview-activity">
              <div className="pb-section-head">
                <h2 className="pb-section-title" id="overview-activity">
                  Recent activity
                </h2>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<ArrowRightRegular />}
                  aria-label="View activity"
                  onClick={() => props.onNavigate('activity')}
                />
              </div>
              <ul className="pb-list">
                {recent.map((run) => (
                  <li key={run.id} className="pb-row">
                    <div className="pb-row-main">
                      <div className="pb-row-title">{run.title}</div>
                      <div className="pb-row-sub">
                        {runStatusLabel(run.status)} · {formatDateTime(run.createdAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="pb-note pb-recent-empty">
              <HistoryRegular aria-hidden="true" /> No repairs yet. Changes and verification results will appear here.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
