import * as React from 'react';
import { Badge, Button, Link } from '@fluentui/react-components';
import { OpenRegular, WrenchRegular } from '@fluentui/react-icons';
import type { RepairPlan, RepairRun } from '../../shared/contracts';
import { formatDateTime, isHttpsUrl, planStatusLabel, runStatusLabel } from '../format';
import type { BusyState } from '../types';
import { isBusy } from '../types';
import { VerificationChecks } from './VerificationChecks';

export interface PlanDetailProps {
  plan: RepairPlan;
  busy: BusyState;
  latestRun?: RepairRun;
  headingRef?: React.Ref<HTMLHeadingElement>;
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
  headingRef,
  onApply,
  onOpenExternal,
}: PlanDetailProps): React.ReactElement {
  const applying = busy.applyingPlanId === plan.id;
  const blockers = [
    busy.applyingPlanId && busy.applyingPlanId !== plan.id ? 'another repair is applying' : null,
    busy.scan ? 'a scan is running' : null,
    busy.investigating ? 'research is running' : null,
    busy.cancelling ? 'cancellation is running' : null,
    busy.undoingRunId ? 'an undo is running' : null,
    busy.savingKey || busy.clearingKey ? 'key settings are saving' : null,
  ].filter((value): value is string => value !== null);
  // Backend guard: only a stored, reviewed Ready plan may apply. Never relax this in UI.
  // Apply stays disabled while the SAME plan is applying; ready/approved plans
  // with steps and no run keep their existing eligibility otherwise.
  const canApply =
    plan.status === 'ready' &&
    plan.review.approved &&
    plan.steps.length > 0 &&
    blockers.length === 0 &&
    !latestRun &&
    !isBusy(busy);
  const irreversible = plan.steps.filter((step) => !step.reversible);
  const adminCount = plan.steps.filter((step) => step.requiresAdmin).length;
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
          <h2 ref={headingRef} tabIndex={-1}>{plan.title}</h2>
          <p>
            {plan.target.name} · {formatDateTime(plan.createdAt)}
          </p>
        </div>
        <Badge appearance="outline" color="subtle" className="pb-status" data-status={latestRun?.status ?? plan.status}>
          {latestRun ? runStatusLabel(latestRun.status) : planStatusLabel(plan.status)}
        </Badge>
      </div>

      {plan.status !== 'ready' && (
        <div className="pb-plan-status-note" role="status">
          <strong>{plan.status === 'blocked' ? 'Blocked.' : 'Needs validation.'}</strong> {plan.reason}
        </div>
      )}

      <div className="pb-plan-columns">
        <div className="pb-plan-main">
          <section className="pb-plan-block" aria-labelledby={'problem-' + plan.id}>
            <h3 id={'problem-' + plan.id}>What we found</h3>
            <p className="pb-plan-lede">{plan.summary}</p>
            <details className="pb-technical">
              <summary>Diagnostic evidence ({plan.evidence.length})</summary>
              {plan.evidence.length === 0 ? (
                <p className="pb-note">No linked scan evidence. This investigation used the reported symptom.</p>
              ) : (
                <ul className="pb-detail-list">
                  {plan.evidence.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}.</strong> {item.observed}
                      {item.details.length > 0 && (
                        <details className="pb-technical">
                          <summary>Evidence details</summary>
                          <ul className="pb-detail-list">
                            {item.details.map((detail, index) => (
                              <li key={index}>{detail}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </section>

          <section className="pb-plan-block" aria-labelledby={'change-' + plan.id}>
            <h3 id={'change-' + plan.id}>What will change</h3>
            {plan.steps.length === 0 ? (
              <p className="pb-note">No executable repair is available for this plan.</p>
            ) : (
              <ol className="pb-plan-steps">
                {plan.steps.map((step, index) => (
                  <li key={step.id} className="pb-plan-step">
                    <div className="pb-row-title">
                      <span className="pb-step-number">{String(index + 1).padStart(2, '0')}</span>
                      {step.title}
                    </div>
                    <p className="pb-row-sub">{step.impact}</p>
                    {step.preview && (
                      <dl className="pb-before-after pb-plan-preview">
                        <div><dt>{step.preview.resource} · current</dt><dd>{step.preview.before}</dd></div>
                        <div><dt>After this step</dt><dd>{step.preview.after}</dd></div>
                      </dl>
                    )}
                    <div className="pb-step-flags">
                      <Badge appearance="outline" color="subtle">
                        {step.reversible ? 'Backup & undo supported' : 'Cannot be undone'}
                      </Badge>
                      <Badge appearance="outline" color="subtle">
                        {step.requiresAdmin ? 'Windows admin approval' : 'Current user'}
                      </Badge>
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
            {irreversible.length > 0 && (
              <div className="pb-plan-warning" role="note">
                <strong>Irreversible effect.</strong> {irreversible.map((step) => step.title).join(', ')} cannot be undone
                after the repair is applied.
              </div>
            )}
          </section>

          <section className="pb-plan-block" aria-labelledby={'result-' + plan.id}>
            <h3 id={'result-' + plan.id}>What to expect</h3>
            {expected.length > 0 ? (
              <ul className="pb-plan-summary-list">
                {expected.map((value, index) => (
                  <li key={`${index}-${value}`}>{value}</li>
                ))}
              </ul>
            ) : (
              <p className="pb-note">No verified outcome is defined for this plan. Review the reason above before applying.</p>
            )}
          </section>
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
          <details className="pb-technical" open={plan.sources.some((source) => source.concerns.length > 0)}>
            <summary>Source information ({plan.sources.length})</summary>
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
                  <summary>Source details</summary>
                  <p>Supports: {source.supports || 'No executable operation'}</p>
                  <p>{source.applicable ? 'Applicable to this plan.' : 'Not applicable to this plan.'}</p>
                  {source.corroboratedBy.length > 0 && (
                    <p>Corroboration: {source.corroboratedBy.map(domain).join(', ')}</p>
                  )}
                </details>
              </div>
            ))
          )}
          </details>
        </aside>
      </div>

      <div className={`pb-apply-bar${latestRun ? '' : ' pb-apply-bar-sticky'}`}>
        <div className="pb-apply-copy">
          <p className="pb-note">{applyNote}{blockers.length > 0 ? ` Waiting: ${blockers.join(', ')}.` : ''}</p>
          {plan.steps.length > 0 && (
            <p className="pb-apply-facts">
              {plan.steps.length} step{plan.steps.length === 1 ? '' : 's'}
              {' · '}
              {irreversible.length > 0
                ? `${irreversible.length} cannot be undone`
                : 'Reversible where supported'}
              {' · '}
              {adminCount > 0
                ? `${adminCount} need${adminCount === 1 ? 's' : ''} Windows admin approval`
                : 'No admin approval needed'}
            </p>
          )}
        </div>
        <Button
          appearance="primary"
          icon={<WrenchRegular />}
          disabled={!canApply}
          title={!canApply && blockers.length === 0 ? applyNote : undefined}
          onClick={() => void onApply(plan.id)}
        >
          {applying ? 'Applying…' : 'Apply fix'}
        </Button>
      </div>

      {latestRun && (
        <div className="pb-plan-result">
          <div className="pb-section-head">
            <h3 className="pb-section-title">Verification result</h3>
            <Badge appearance="outline" color="subtle" className="pb-status" data-status={latestRun.status}>
              {runStatusLabel(latestRun.status)}
            </Badge>
          </div>
          {latestRun.error && <p className="pb-severity-critical">{latestRun.error}</p>}
          {latestRun.undoError && latestRun.undoError !== latestRun.error && (
            <p className="pb-severity-critical">{latestRun.undoError}</p>
          )}
          {latestRun.executions.some((execution) => execution.restoration) && (
            <div>
              <p className="pb-note">Undo result</p>
              <ul className="pb-detail-list">
                {latestRun.executions
                  .filter((execution) => execution.restoration)
                  .map((execution) => (
                    <li key={`${latestRun.id}-undo-${execution.step.id}`}>
                      <strong>
                        {execution.restoration?.status === 'restored' ? 'Restored' : 'Restore failed'}:
                      </strong>{' '}
                      {execution.step.title}. {execution.restoration?.summary}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {latestRun.verification.map((verification, index) => (
            <div key={index}>
              <p className="pb-note">{verification.summary}</p>
              <VerificationChecks checks={verification.checks} />
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
