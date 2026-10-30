import * as React from 'react';
import {
  Badge,
  Button,
  Link,
  Subtitle1,
} from '@fluentui/react-components';
import { OpenRegular, WrenchRegular } from '@fluentui/react-icons';
import type { RepairPlan, RepairRun } from '../../shared/contracts';
import { formatDateTime } from '../format';
import { planStatusLabel } from '../format';
import type { BusyState } from '../types';

export interface PlanDetailProps {
  plan: RepairPlan;
  busy: BusyState;
  latestRun?: RepairRun;
  onApply: (planId: string) => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
}

function statusColor(status: RepairPlan['status']): 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'ready':
      return 'success';
    case 'needs-validation':
      return 'warning';
    case 'blocked':
      return 'danger';
  }
}

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

export function PlanDetail({ plan, busy, latestRun, onApply, onOpenExternal }: PlanDetailProps): React.ReactElement {
  const applying = busy.applyingPlanId === plan.id;
  const canApply = plan.status === 'ready' && !applying && busy.applyingPlanId === null && !busy.scan;

  const applyHint =
    plan.status === 'blocked'
      ? `Blocked: ${plan.reason}`
      : plan.status === 'needs-validation'
        ? 'This plan needs further validation before it can be applied.'
        : `Applies ${plan.steps.length} supported local operation${plan.steps.length === 1 ? '' : 's'}. Progress is reported at the top of the window.`;

  return (
    <section className="pb-section pb-plan-panel" aria-label={`Repair plan: ${plan.title}`}>
      <div className="pb-section-head">
        <div>
          <Subtitle1 as="h3">{plan.title}</Subtitle1>
          <div className="pb-note">
            Target: {plan.target.kind === 'app' ? 'Application' : 'Windows'} &middot; {plan.target.name} &middot; Created{' '}
            {formatDateTime(plan.createdAt)}
          </div>
        </div>
        <div className="pb-section-action">
          <Badge appearance="tint" color={statusColor(plan.status)}>
            {planStatusLabel(plan.status)}
          </Badge>
        </div>
      </div>

      <p className="pb-note">{plan.summary}</p>
      <p className="pb-note">
        <strong>Status reason:</strong> {plan.reason}
      </p>

      <Subtitle1 as="h4">Evidence</Subtitle1>
      {plan.evidence.length === 0 ? (
        <p className="pb-note">No linked evidence.</p>
      ) : (
        <ul className="pb-list">
          {plan.evidence.map((item) => (
            <li key={item.id} className="pb-row">
              <div className="pb-row-main">
                <div className="pb-row-title">{item.title}</div>
                <div className="pb-row-sub">{item.observed}</div>
                {item.details.length > 0 && (
                  <ul className="pb-detail-list">
                    {item.details.map((detail, index) => (
                      <li key={`${item.id}-detail-${index}`}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Subtitle1 as="h4">Sources</Subtitle1>
      {plan.sources.length === 0 ? (
        <p className="pb-note">No sources recorded for this plan.</p>
      ) : (
        <ul className="pb-list">
          {plan.sources.map((source) => (
            <li key={source.url} className="pb-row">
              <div className="pb-row-main">
                <div className="pb-source-head">
                  <Badge appearance="tint" color={source.kind === 'official' ? 'success' : 'warning'}>
                    {source.kind === 'official' ? 'Official' : 'Community'}
                  </Badge>
                  <Badge appearance="outline" color={source.applicable ? 'informative' : 'subtle'}>
                    {source.applicable ? 'Applicable' : 'Not applicable'}
                  </Badge>
                  {isExternalUrl(source.url) ? (
                    <Link
                      href={source.url}
                      onClick={(event) => {
                        event.preventDefault();
                        void onOpenExternal(source.url);
                      }}
                    >
                      {source.title} <OpenRegular fontSize={12} />
                    </Link>
                  ) : (
                    <span>{source.title}</span>
                  )}
                </div>
                <div className="pb-row-sub">Supports: {source.supports}</div>
                <div className="pb-row-sub pb-mono">{source.url}</div>
                {source.concerns.length > 0 && (
                  <ul className="pb-detail-list">
                    {source.concerns.map((concern, index) => (
                      <li key={`${source.url}-concern-${index}`}>Concern: {concern}</li>
                    ))}
                  </ul>
                )}
                {source.corroboratedBy.length > 0 && (
                  <div className="pb-row-sub">Corroborated by: {source.corroboratedBy.join(', ')}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Subtitle1 as="h4">Independent review</Subtitle1>
      <p className="pb-note">
        <strong>{plan.review.approved ? 'Approved' : 'Not approved'}.</strong> {plan.review.rationale}
      </p>
      {plan.review.concerns.length > 0 && (
        <ul className="pb-detail-list">
          {plan.review.concerns.map((concern, index) => (
            <li key={`review-concern-${index}`}>{concern}</li>
          ))}
        </ul>
      )}

      <Subtitle1 as="h4">Steps</Subtitle1>
      {plan.steps.length === 0 ? (
        <p className="pb-note">This plan contains no executable steps.</p>
      ) : (
        <ol className="pb-list">
          {plan.steps.map((step, index) => (
            <li key={step.id} className="pb-row">
              <div className="pb-row-main">
                <div className="pb-row-title">
                  {index + 1}. {step.title}
                </div>
                <div className="pb-row-sub pb-mono">
                  {step.operation} &middot; target {step.targetId}
                </div>
                <div className="pb-row-sub">Impact: {step.impact}</div>
                <div className="pb-row-sub">Verification: {step.verification}</div>
                <div className="pb-source-head" style={{ marginTop: '0.375rem' }}>
                  <Badge appearance="outline" color={step.requiresAdmin ? 'warning' : 'informative'}>
                    {step.requiresAdmin ? 'Requires admin' : 'No admin required'}
                  </Badge>
                  <Badge appearance="outline" color={step.reversible ? 'success' : 'severe'}>
                    {step.reversible ? 'Reversible' : 'Not reversible'}
                  </Badge>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Subtitle1 as="h4">Apply</Subtitle1>
      <p className="pb-note">{applyHint}</p>
      <div className="pb-form-row">
        <Button
          appearance="primary"
          icon={<WrenchRegular />}
          disabled={!canApply}
          onClick={() => {
            void onApply(plan.id);
          }}
        >
          {applying ? 'Applying…' : 'Apply fix'}
        </Button>
      </div>

      {latestRun && (
        <div>
          <Subtitle1 as="h4">Latest result</Subtitle1>
          <p className="pb-note">
            Run {latestRun.status} &middot; finished{' '}
            {latestRun.finishedAt ? formatDateTime(latestRun.finishedAt) : 'not finished'} &middot;{' '}
            {latestRun.executions.length} step execution{latestRun.executions.length === 1 ? '' : 's'}.
          </p>
          {latestRun.error && <p className="pb-note">Error: {latestRun.error}</p>}
          {latestRun.verification.map((result, index) => (
            <div key={`verification-${index}`}>
              <p className="pb-note">{result.summary}</p>
              <ul className="pb-detail-list">
                {result.checks.map((check) => (
                  <li key={check.name} className={check.passed ? 'pb-check-pass' : 'pb-check-fail'}>
                    {check.passed ? 'Passed' : 'Failed'}: {check.name}
                    {check.before !== undefined || check.after !== undefined
                      ? ` (${check.before ?? '?'} → ${check.after ?? '?'})`
                      : ''}
                  </li>
                ))}
              </ul>
              {result.pendingReboot && (
                <div className="pb-pending-reboot" role="status">
                  Pending reboot: this change takes full effect after Windows restarts. The result is reported
                  honestly as pending until verification completes.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
