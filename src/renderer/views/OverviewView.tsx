import * as React from 'react';
import { Badge, Button, ProgressBar } from '@fluentui/react-components';
import { ArrowRightRegular, CheckmarkCircleRegular, DesktopRegular, HistoryRegular, SearchRegular, WarningRegular } from '@fluentui/react-icons';
import type { ViewProps } from '../types';
import { formatBytes, formatDateTime, formatUptime, runStatusLabel } from '../format';
import { SymptomForm } from '../components/SymptomForm';
import { PlanDetail } from '../components/PlanDetail';
import { findPlan, latestRunForPlan } from '../types';

export function OverviewView(props: ViewProps): React.ReactElement {
  const { state, busy } = props;
  const snapshot = state.snapshot;
  const diagnostics = snapshot?.diagnostics ?? [];
  const issues = diagnostics.filter(item => item.severity !== 'info');
  const findings = issues.length ? issues : diagnostics;
  const selectedPlan = findPlan(state, props.selectedPlanId);
  const recent = state.history.slice(0, 3);
  const memoryUsed = snapshot ? snapshot.machine.memoryTotal - snapshot.machine.memoryFree : 0;
  const diskUsed = snapshot ? snapshot.metrics.diskTotal - snapshot.metrics.diskFree : 0;

  return (
    <div className="pb-overview">
      <div className="pb-stat-strip" aria-label="Latest scan summary">
        <div><span className="pb-stat-label">Needs attention</span><strong className={issues.length ? 'pb-severity-warning' : ''}>{snapshot ? issues.length : '—'}</strong><span>{snapshot ? 'Warning & critical findings' : 'Run your first scan'}</span></div>
        <div><span className="pb-stat-label">Installed apps</span><strong>{snapshot ? snapshot.apps.length : '—'}</strong><span>Available to investigate</span></div>
        <div><span className="pb-stat-label">Ready to apply</span><strong>{state.plans.filter(plan => plan.status === 'ready').length}</strong><span>Reviewed repair plans</span></div>
        <div><span className="pb-stat-label">Verified repairs</span><strong>{state.history.filter(run => run.status === 'fixed').length}</strong><span>Independent checks passed</span></div>
      </div>
      <div className="pb-overview-grid">
        <div className="pb-overview-primary">
          <section className="pb-section pb-repair-surface" aria-label="Start a repair">
            <div className="pb-eyebrow"><span className="pb-status-dot" /> REPAIR WORKSPACE <span className="pb-model-tag">Muse Spark</span></div>
            <SymptomForm {...props} />
            <div className="pb-workflow" aria-label="Repair workflow"><span><b>01</b> Investigate</span><ArrowRightRegular /><span><b>02</b> Review impact</span><ArrowRightRegular /><span><b>03</b> Apply & verify</span></div>
          </section>
          <section className="pb-section pb-findings" aria-labelledby="overview-issues">
            <div className="pb-section-head"><h2 className="pb-section-title" id="overview-issues">Latest findings</h2><Button appearance="subtle" size="small" icon={<ArrowRightRegular />} iconPosition="after" onClick={() => props.onNavigate('windows')}>View all</Button></div>
            {!snapshot ? <div className="pb-quiet-empty"><SearchRegular /><div><h3>A clear picture starts with a scan</h3><p>Check Windows, services, startup, and installed applications.</p><Button appearance="secondary" disabled={busy.scan} onClick={() => void props.onScan()}>{busy.scan ? 'Scanning…' : 'Scan this PC'}</Button></div></div>
              : !findings.length ? <div className="pb-quiet-empty"><CheckmarkCircleRegular /><div><h3>No findings in this scan</h3><p>You can still describe a problem above.</p></div></div>
                : <ul className="pb-list">{findings.slice(0, 3).map(item => <li className="pb-row" key={item.id}><div className={'pb-finding-icon pb-severity-' + item.severity}>{item.severity === 'info' ? <DesktopRegular /> : <WarningRegular />}</div><div className="pb-row-main"><div className="pb-row-title">{item.title}</div><div className="pb-row-sub">{item.observed}</div></div><Button appearance="subtle" size="small" disabled={busy.investigating} onClick={() => void props.onInvestigate({symptom:item.title,evidenceId:item.id})}>Investigate <ArrowRightRegular /></Button></li>)}</ul>}
          </section>
        </div>
        <aside className="pb-overview-secondary">
          <section className="pb-section pb-device" aria-labelledby="overview-device">
            <div className="pb-device-icon"><DesktopRegular /></div><h2 id="overview-device">{snapshot?.machine.name || 'This PC'}</h2>
            <p className="pb-note">{snapshot?.machine.os || 'Windows 11 · Local diagnostics'}</p>
            <Badge appearance="tint" color={!snapshot ? 'subtle' : issues.length ? 'warning' : 'success'}>{!snapshot ? 'Not scanned' : issues.length ? issues.length + ' need attention' : 'No warnings found'}</Badge>
            {snapshot ? <div className="pb-device-metrics">
              <div><div className="pb-meter-label"><span>Memory</span><strong>{formatBytes(memoryUsed)} / {formatBytes(snapshot.machine.memoryTotal)}</strong></div><ProgressBar value={snapshot.machine.memoryTotal ? memoryUsed/snapshot.machine.memoryTotal : 0} aria-label="Memory used" /></div>
              <div><div className="pb-meter-label"><span>System drive</span><strong>{formatBytes(snapshot.metrics.diskFree)} free</strong></div><ProgressBar value={snapshot.metrics.diskTotal ? diskUsed/snapshot.metrics.diskTotal : 0} aria-label="System drive used" /></div>
              <div className="pb-device-line"><span>CPU load</span><strong>{snapshot.metrics.cpuPercent === null ? 'Unavailable' : snapshot.metrics.cpuPercent.toFixed(0) + '%'}</strong></div>
              <div className="pb-device-line"><span>Uptime</span><strong>{formatUptime(snapshot.machine.uptime)}</strong></div>
              <p className="pb-device-time">Last scan {formatDateTime(snapshot.scannedAt)}</p>
            </div> : <div className="pb-device-placeholder"><p>Hardware readings appear after your first scan.</p></div>}
          </section>
          <section className="pb-section pb-recent" aria-labelledby="overview-activity"><div className="pb-section-head"><h2 className="pb-section-title" id="overview-activity">Recent activity</h2><Button appearance="subtle" size="small" icon={<ArrowRightRegular />} aria-label="View activity" onClick={() => props.onNavigate('activity')} /></div>
            {!recent.length ? <div className="pb-quiet-empty pb-quiet-empty-small"><HistoryRegular /><div><h3>No repairs yet</h3><p>Your changes and verification results will appear here.</p></div></div> : <ul className="pb-list">{recent.map(run => <li key={run.id} className="pb-row"><div className="pb-row-main"><div className="pb-row-title">{run.title}</div><div className="pb-row-sub">{runStatusLabel(run.status)} · {formatDateTime(run.createdAt)}</div></div></li>)}</ul>}
          </section>
        </aside>
      </div>
      {selectedPlan && <PlanDetail plan={selectedPlan} busy={busy} latestRun={latestRunForPlan(state,selectedPlan.id)} onApply={props.onApply} onOpenExternal={props.onOpenExternal} />}
    </div>
  );
}

