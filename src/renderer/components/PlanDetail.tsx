import * as React from 'react';
import { Badge, Button, Link } from '@fluentui/react-components';
import { OpenRegular, WrenchRegular } from '@fluentui/react-icons';
import type { RepairPlan, RepairRun } from '../../shared/contracts';
import { formatDateTime, isHttpsUrl, planStatusLabel, runStatusLabel } from '../format';
import type { BusyState } from '../types';

export interface PlanDetailProps {
  plan: RepairPlan;
  busy: BusyState;
  latestRun?: RepairRun;
  onApply: (planId: string) => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
}

function domain(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

export function PlanDetail({
  plan,
  busy,
  latestRun,
  onApply,
  onOpenExternal,
}: PlanDetailProps): React.ReactElement {
  const applying = busy.applyingPlanId === plan.id;
  const localChecks = plan.evidence.filter(
    (item) => item.context?.source === 'local-read-only-tool' && item.context?.tool,
  );
  const canApply =
    plan.status === 'ready' &&
    !busy.applyingPlanId &&
    !busy.scan &&
    !busy.investigating &&
    !busy.cancelling &&
    !busy.undoingRunId &&
    !busy.savingKey &&
    !busy.clearingKey &&
    !latestRun;
  const irreversible = plan.steps.filter((step) => !step.reversible);
  const expected = plan.steps.map((step) => step.verification).filter((value) => value.trim().length > 0);

  const applyNote = latestRun
    ? 'This plan has an execution record. Review its result below.'
    : plan.status === 'ready'
      ? irreversible.length > 0
        ? `Apply the changes shown above. ${irreversible.length} of ${plan.steps.length} change${plan.steps.length === 1 ? '' : 's'} cannot be undone. PocketBench will record each operation and verify the result.`
        : 'Apply the changes shown above. PocketBench will record each operation and verify the result.'
      : plan.status === 'blocked'
        ? 'Execution is blocked. ' + plan.reason
        : 'More validation is required before these changes can run. ' + plan.reason;

  return (
    <section className="pb-section pb-plan-panel" aria-label={'Repair plan: ' + plan.title}>
      <div className="pb-plan-heading">
        <div>
          <div className="pb-eyebrow">REPAIR REVIEW</div>
          <h2>{plan.title}</h2>
          <p>
            {plan.target.name} · {formatDateTime(plan.createdAt)}
          </p>
        </div>
        <Badge appearance="tint" color="subtle">
          {planStatusLabel(plan.status)}
        </Badge>
      </div>

      {plan.status !== 'ready' && (
        <div className="pb-plan-status-note" role="status">
          <strong>{plan.status === 'blocked' ? 'Blocked.' : 'Needs validation.'}</strong> {plan.reason}
        </div>
      )}

      <div className="pb-plan-columns">
        <div className="pb-plan-main">
          <div className="pb-plan-summary" aria-label="Repair summary">
            <div className="pb-plan-summary-block">
              <h3>Problem</h3>
              <p>{plan.summary}</p>
            </div>
            <div className="pb-plan-summary-block">
              <h3>Proposed change</h3>
              {plan.steps.length > 0 ? (
                <ul className="pb-plan-summary-list">
                  {plan.steps.map((step) => (
                    <li key={step.id}>{step.title}</li>
                  ))}
                </ul>
              ) : (
                <p>No executable repair is available for this plan.</p>
              )}
            </div>
            <div className="pb-plan-summary-block">
              <h3>Expected result</h3>
              {expected.length > 0 ? (
                <ul className="pb-plan-summary-list">
                  {expected.map((value, index) => (
                    <li key={`${index}-${value}`}>{value}</li>
                  ))}
                </ul>
              ) : (
                <p>No verified outcome is defined for this plan. Review the reason above before applying.</p>
              )}
            </div>
          </div>

          <h3>Effects and disruptions</h3>
          {plan.steps.length === 0 ? (
            <p className="pb-note">No Windows or application setting will be changed by this plan.</p>
          ) : (
            <ul className="pb-list pb-effects">
              {plan.steps.map((step) => (
                <li className="pb-effect-row" key={step.id}>
                  <div className="pb-row-title">{step.title}</div>
                  <p className="pb-row-sub">{step.impact}</p>
                  <div className="pb-step-flags">
                    <Badge appearance="outline" color="subtle">
                      {step.reversible ? 'Backup & undo supported' : 'Cannot be undone'}
                    </Badge>
                    <Badge appearance="outline" color="subtle">
                      {step.requiresAdmin ? 'Windows admin approval' : 'Current user'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {irreversible.length > 0 && (
            <div className="pb-plan-warning" role="note">
              <strong>Irreversible effect.</strong> {irreversible.map((step) => step.title).join(', ')} cannot be undone
              after the repair is applied.
            </div>
          )}

          <h3>Step details</h3>
          {plan.steps.length === 0 ? (
            <p className="pb-note">No steps were produced. The reason above explains what is missing.</p>
          ) : (
            <ol className="pb-list">
              {plan.steps.map((step, index) => (
                <li key={step.id} className="pb-plan-step">
                  <div className="pb-row-title">
                    <span className="pb-step-number">{String(index + 1).padStart(2, '0')}</span>
                    {step.title}
                  </div>
                  <details className="pb-technical">
                    <summary>Verification & technical details</summary>
                    <p>{step.verification}</p>
                    <code>
                      {step.operation} · {step.targetId}
                    </code>
                  </details>
                </li>
              ))}
            </ol>
          )}

          <details className="pb-technical">
            <summary>Diagnostic evidence ({plan.evidence.length})</summary>
            {localChecks.length > 0 && (
              <p className="pb-note">
                Includes {localChecks.length} read-only local diagnostic{' '}
                {localChecks.length === 1 ? 'check' : 'checks'} collected before research.
              </p>
            )}
            {plan.evidence.length === 0 ? (
              <p>No linked scan evidence. This investigation used the reported symptom.</p>
            ) : (
              <ul className="pb-list">
                {plan.evidence.map((item) => (
                  <li className="pb-row" key={item.id}>
                    <div className="pb-row-main">
                      <div className="pb-row-title">{item.title}</div>
                      <div className="pb-row-sub">{item.observed}</div>
                      <ul className="pb-detail-list">
                        {item.details.map((detail, detailIndex) => (
                          <li key={detailIndex}>{detail}</li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>

        <aside className="pb-plan-sources">
          <h3>Independent review</h3>
          <p className="pb-note">
            <strong>{plan.review.approved ? 'Approved.' : 'Approval withheld.'}</strong>{' '}
            {plan.review.approved
              ? 'A separate review checked the proposed changes.'
              : 'This plan is not approved for execution.'}
          </p>
          <details className="pb-technical">
            <summary>Reviewer details</summary>
            <p>{plan.review.rationale}</p>
            {plan.review.concerns.length > 0 ? (
              <ul className="pb-detail-list">
                {plan.review.concerns.map((concern, index) => (
                  <li key={index}>{concern}</li>
                ))}
              </ul>
            ) : (
              <p>No reviewer concerns were recorded.</p>
            )}
          </details>

          <h3>Research sources</h3>
          {plan.sources.length === 0 ? (
            <p className="pb-note">No usable sources were recorded.</p>
          ) : (
            plan.sources.map((source) => (
              <div key={source.url} className="pb-source-card">
                <div className="pb-source-kind">
                  {source.kind === 'official' ? 'OFFICIAL DOCUMENTATION' : 'COMMUNITY SOURCE'}
                  {!source.applicable ? ' · NOT APPLICABLE' : ''}
                </div>
                {isHttpsUrl(source.url) ? (
                  <Link
                    href={source.url}
                    onClick={(event) => {
                      event.preventDefault();
                      void onOpenExternal(source.url);
                    }}
                  >
                    {source.title} <OpenRegular />
                  </Link>
                ) : (
                  <span>{source.title}</span>
                )}
                <div className="pb-source-domain">{domain(source.url)}</div>
                {source.concerns.length > 0 && (
                  <ul className="pb-detail-list pb-severity-warning">
                    {source.concerns.map((concern, index) => (
                      <li key={index}>{concern}</li>
                    ))}
                  </ul>
                )}
                <details className="pb-technical">
                  <summary>Citation details</summary>
                  <p>Supports: {source.supports || 'No executable operation'}</p>
                  <p>{source.applicable ? 'Applicable to this plan.' : 'Not applicable to this plan.'}</p>
                  {source.corroboratedBy.length > 0 && (
                    <p>Corroboration: {source.corroboratedBy.map(domain).join(', ')}</p>
                  )}
                </details>
              </div>
            ))
          )}
        </aside>
      </div>

      <div className="pb-apply-bar">
        <p className="pb-note">{applyNote}</p>
        <Button
          appearance="primary"
          icon={<WrenchRegular />}
          disabled={!canApply}
          onClick={() => void onApply(plan.id)}
        >
          {applying ? 'Applying…' : 'Apply fix'}
        </Button>
      </div>

      {latestRun && (
        <div className="pb-plan-result">
          <div className="pb-section-head">
            <h3 className="pb-section-title">Verification result</h3>
            <Badge appearance="tint" color="subtle">
              {runStatusLabel(latestRun.status)}
            </Badge>
          </div>
          {latestRun.error && <p className="pb-severity-critical">{latestRun.error}</p>}
          {latestRun.verification.map((verification, index) => (
            <div key={index}>
              <p className="pb-note">{verification.summary}</p>
              <ul className="pb-detail-list">
                {verification.checks.map((check) => (
                  <li className={check.passed ? 'pb-check-pass' : 'pb-check-fail'} key={check.name}>
                    {check.passed ? 'Passed' : 'Failed'}: {check.name}
                    {check.before !== undefined || check.after !== undefined
                      ? ' (' + (check.before ?? '?') + ' → ' + (check.after ?? '?') + ')'
                      : ''}
                  </li>
                ))}
              </ul>
              {verification.pendingReboot && (
                <div className="pb-pending-reboot" role="status">
                  A Windows restart is required. Verification remains pending.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
