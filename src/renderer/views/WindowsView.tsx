import * as React from 'react';
import { Button } from '@fluentui/react-components';
import { CheckmarkCircleRegular, DesktopPulseRegular, SearchRegular, WarningRegular } from '@fluentui/react-icons';
import type { DiagnosticEvidence, SymptomCategory } from '../../shared/contracts';
import { findPlan, latestRunForPlan, type ViewProps } from '../types';
import { PlanDetail } from '../components/PlanDetail';
import { SymptomForm } from '../components/SymptomForm';

const CATEGORIES = ['all', 'network', 'performance', 'startup', 'storage', 'integrity', 'services', 'other'] as const;
function categoryOf(item: DiagnosticEvidence): string {
  const value = item.category.toLowerCase();
  if (/network|dns|proxy/.test(value)) return 'network';
  if (/startup/.test(value)) return 'startup';
  if (/storage|disk/.test(value)) return 'storage';
  if (/integrity|system file/.test(value)) return 'integrity';
  if (/service/.test(value)) return 'services';
  if (/memory|cpu|perform/.test(value)) return 'performance';
  return 'other';
}

function symptomCategoryOf(item: DiagnosticEvidence): SymptomCategory | undefined {
  const value = item.category.toLowerCase();
  if (/network|dns|proxy|connect/.test(value)) return 'connectivity';
  if (/update/.test(value)) return 'updates';
  if (/memory|cpu|perform|startup/.test(value)) return 'performance';
  if (item.area === 'app') return 'app';
  return undefined;
}

export function WindowsView(props: ViewProps): React.ReactElement {
  const { state, busy } = props;
  const diagnostics = state.snapshot?.diagnostics ?? [];
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]>('all');
  const visible = diagnostics.filter(item => category === 'all' || categoryOf(item) === category);
  const selectedPlan = findPlan(state, props.selectedPlanId);
  return (
    <div>
      <div className="pb-windows-grid">
        <section className="pb-section pb-diagnostics" aria-labelledby="windows-diagnostics">
          <div className="pb-section-head"><h2 className="pb-section-title" id="windows-diagnostics">Diagnostic findings</h2><span className="pb-note">{diagnostics.length} findings</span></div>
          <div className="pb-category-bar" role="group" aria-label="Diagnostic categories">
            {CATEGORIES.map(key => <Button key={key} appearance="subtle" size="small" aria-pressed={category===key} onClick={() => setCategory(key)}>{key === 'all' ? 'All findings' : key.charAt(0).toUpperCase()+key.slice(1)}</Button>)}
          </div>
          {!state.snapshot ? <div className="pb-empty"><SearchRegular /><h3>Start with a scan</h3><p>Collect current Windows diagnostics before investigating a repair.</p><Button appearance="secondary" disabled={busy.scan} onClick={() => void props.onScan()}>Scan this PC</Button></div>
            : !visible.length ? <div className="pb-empty"><CheckmarkCircleRegular /><h3>No findings in this category</h3><p>Describe a symptom to investigate a problem that the scan didn’t detect.</p></div>
              : <ul className="pb-list">{visible.map(item => <li key={item.id} className="pb-row pb-diagnostic-row">
                <div className={'pb-finding-icon pb-severity-'+item.severity}>{item.severity==='info' ? <DesktopPulseRegular /> : <WarningRegular />}</div>
                <div className="pb-row-main"><div className="pb-finding-heading"><span className="pb-row-title">{item.title}</span><span className={'pb-severity-label pb-severity-'+item.severity}>{item.severity==='info'?'Information':item.severity}</span></div><p className="pb-row-sub">{item.observed}</p>
                  <details className="pb-technical"><summary>Technical evidence</summary><ul className="pb-detail-list">{item.details.map((detail,index)=><li key={index}>{detail}</li>)}</ul>{item.suggestedOperation && <code>{item.suggestedOperation}</code>}</details>
                  <Button appearance="secondary" size="small" disabled={busy.investigating} onClick={() => { const category = symptomCategoryOf(item); void props.onInvestigate({symptom:item.title,evidenceId:item.id,...(category?{category}:{})}); }}>Investigate</Button>
                </div>
              </li>)}</ul>}
        </section>
        <section className="pb-section pb-windows-composer" aria-label="Investigate a Windows problem"><div className="pb-eyebrow"><span className="pb-status-dot" /> WINDOWS REPAIR</div><SymptomForm {...props} /></section>
      </div>
      {selectedPlan && <PlanDetail plan={selectedPlan} busy={busy} latestRun={latestRunForPlan(state,selectedPlan.id)} onApply={props.onApply} onOpenExternal={props.onOpenExternal} />}
    </div>
  );
}

