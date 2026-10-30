import * as React from 'react';
import { Badge, Button, Link } from '@fluentui/react-components';
import { OpenRegular, WrenchRegular } from '@fluentui/react-icons';
import type { RepairPlan, RepairRun } from '../../shared/contracts';
import { formatDateTime, planStatusLabel, runStatusLabel } from '../format';
import type { BusyState } from '../types';

export interface PlanDetailProps {
  plan: RepairPlan;
  busy: BusyState;
  latestRun?: RepairRun;
  onApply: (planId: string) => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
}
function domain(value:string):string { try { return new URL(value).hostname; } catch { return value; } }
export function PlanDetail({plan,busy,latestRun,onApply,onOpenExternal}:PlanDetailProps):React.ReactElement {
  const applying=busy.applyingPlanId===plan.id;
  const canApply=plan.status==='ready' && !busy.applyingPlanId && !busy.scan && !busy.investigating && !latestRun;
  return (
    <section className="pb-section pb-plan-panel" aria-label={'Repair plan: '+plan.title}>
      <div className="pb-plan-heading"><div><div className="pb-eyebrow">REPAIR REVIEW</div><h2>{plan.title}</h2><p>{plan.target.name} · {formatDateTime(plan.createdAt)}</p></div><Badge appearance="tint" color="subtle">{planStatusLabel(plan.status)}</Badge></div>
      <div className="pb-plan-columns">
        <div className="pb-plan-main">
          <p>{plan.summary}</p>
          <p className="pb-note">{plan.reason}</p>
          <h3>What will change</h3>
          {!plan.steps.length?<p className="pb-note">No executable repair is available for this plan.</p>:<ol className="pb-list">{plan.steps.map((step,index)=><li key={step.id} className="pb-plan-step"><div className="pb-row-title"><span className="pb-step-number">{String(index+1).padStart(2,'0')}</span>{step.title}</div><p className="pb-row-sub">{step.impact}</p><div className="pb-step-flags"><Badge appearance="outline" color="subtle">{step.reversible?'Backup & undo supported':'Cannot be undone'}</Badge><Badge appearance="outline" color="subtle">{step.requiresAdmin?'Windows admin approval':'Current user'}</Badge></div><details className="pb-technical"><summary>Verification & technical details</summary><p>{step.verification}</p><code>{step.operation} · {step.targetId}</code></details></li>)}</ol>}
          <details className="pb-technical"><summary>Diagnostic evidence ({plan.evidence.length})</summary>{!plan.evidence.length?<p>No linked scan evidence. This investigation used the reported symptom.</p>:<ul className="pb-list">{plan.evidence.map(item=><li className="pb-row" key={item.id}><div className="pb-row-main"><div className="pb-row-title">{item.title}</div><div className="pb-row-sub">{item.observed}</div><ul className="pb-detail-list">{item.details.map((detail,index)=><li key={index}>{detail}</li>)}</ul></div></li>)}</ul>}</details>
        </div>
        <aside className="pb-plan-sources">
          <h3>Research sources</h3>
          {!plan.sources.length?<p className="pb-note">No usable sources were recorded.</p>:plan.sources.map(source=><div key={source.url} className="pb-source-card">
            <div className="pb-source-kind">{source.kind==='official'?'OFFICIAL DOCUMENTATION':'COMMUNITY SOURCE'}{!source.applicable?' · NOT APPLICABLE':''}</div>
            {/^https:\/\//i.test(source.url)?<Link href={source.url} onClick={event=>{event.preventDefault();void onOpenExternal(source.url);}}>{source.title} <OpenRegular /></Link>:<span>{source.title}</span>}
            <div className="pb-source-domain">{domain(source.url)}</div>
            {source.concerns.length>0&&<ul className="pb-detail-list pb-severity-warning">{source.concerns.map((concern,index)=><li key={index}>{concern}</li>)}</ul>}
            <details className="pb-technical"><summary>Source assessment</summary><p>Supports: {source.supports || 'No executable operation'}</p><p>{source.applicable?'Applicable to this plan.':'Not applicable to this plan.'}</p>{source.corroboratedBy.length>0&&<p>Corroboration: {source.corroboratedBy.map(domain).join(', ')}</p>}</details>
          </div>)}
          <h3>Independent review</h3><p className="pb-note"><strong>{plan.review.approved?'Approved':'Approval withheld'}.</strong> {plan.review.rationale}</p>
          {plan.review.concerns.length>0&&<ul className="pb-detail-list">{plan.review.concerns.map((concern,index)=><li key={index}>{concern}</li>)}</ul>}
        </aside>
      </div>
      <div className="pb-apply-bar"><p className="pb-note">{latestRun?'This plan has an execution record. Review its result below.':plan.status==='ready'?'Apply the changes shown above. PocketBench will record each operation and verify the result.':plan.status==='blocked'?'Execution is blocked. '+plan.reason:'More validation is required before these changes can run.'}</p><Button appearance="primary" icon={<WrenchRegular />} disabled={!canApply} onClick={()=>void onApply(plan.id)}>{applying?'Applying…':'Apply fix'}</Button></div>
      {latestRun&&<div className="pb-plan-result"><div className="pb-section-head"><h3 className="pb-section-title">Verification result</h3><Badge appearance="tint" color="subtle">{runStatusLabel(latestRun.status)}</Badge></div>{latestRun.error&&<p className="pb-severity-critical">{latestRun.error}</p>}{latestRun.verification.map((verification,index)=><div key={index}><p className="pb-note">{verification.summary}</p><ul className="pb-detail-list">{verification.checks.map(check=><li className={check.passed?'pb-check-pass':'pb-check-fail'} key={check.name}>{check.passed?'Passed':'Failed'}: {check.name}{check.before!==undefined||check.after!==undefined?' ('+(check.before??'?')+' → '+(check.after??'?')+')':''}</li>)}</ul>{verification.pendingReboot&&<div className="pb-pending-reboot" role="status">A Windows restart is required. Verification remains pending.</div>}</div>)}</div>}
    </section>
  );
}

