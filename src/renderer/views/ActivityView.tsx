import * as React from 'react';
import { Badge, Button } from '@fluentui/react-components';
import { ArrowUndoRegular } from '@fluentui/react-icons';
import { isUndoEligible } from '../../shared/contracts';
import { formatDateTime, planStatusLabel, runStatusLabel } from '../format';
import { isBusy, type ViewProps } from '../types';
import { VerificationChecks } from '../components/VerificationChecks';

export function ActivityView(props: ViewProps): React.ReactElement {
  const { state, busy } = props;
  const history = state.history;
  const active = isBusy(busy);

  return (
    <div>
      <section className="pb-section" aria-labelledby="activity-history">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="activity-history">
            Operation history
          </h2>
        </div>

        {history.length === 0 ? (
          <div className="pb-empty pb-empty-compact">
            <h3>No operations yet</h3>
            <p>
              Applied repairs, verification results, and undo actions appear here. PocketBench records only real
              history; this list stays empty until you apply a ready plan.
            </p>
          </div>
        ) : (
          <ul className="pb-list">
            {history.map((run) => {
              const undoing = busy.undoingRunId === run.id;
              const pendingReboot = run.verification.some((result) => result.pendingReboot);
              const retryingUndo = run.executions.some((execution) => execution.restoration?.status === 'failed');
              const restoredUndo = run.executions.some((execution) => execution.restoration?.status === 'restored');
              const residualEffects = run.executions.some((execution) => execution.success && !isUndoEligible(execution));
              return (
                <li key={run.id} className="pb-row">
                  <div className="pb-row-main">
                    <div className="pb-row-title">{run.title}</div>
                    <div className="pb-row-sub">
                      Started {formatDateTime(run.createdAt)}
                      {run.finishedAt ? ` · finished ${formatDateTime(run.finishedAt)}` : ' · not finished'} ·{' '}
                      {run.executions.length} step execution{run.executions.length === 1 ? '' : 's'}
                    </div>
                    {run.error && <div className="pb-row-sub">Error: {run.error}</div>}
                    {run.undoError && run.undoError !== run.error && <div className="pb-row-sub">Undo error: {run.undoError}</div>}
                    <details className="pb-technical pb-operation-details">
                      <summary>Operation details ({run.executions.length} steps)</summary>
                      {run.executions.map((execution) => (
                        <div key={execution.step.id} className="pb-row-sub">
                          {execution.success ? 'Succeeded' : 'Failed'}: {execution.step.title}
                          {execution.backupId ? ` (backup ${execution.backupId})` : ''}
                          {execution.restoration
                            ? ` · Restore ${execution.restoration.status === 'restored' ? 'complete' : 'failed'}: ${execution.restoration.summary}`
                            : ''}
                        </div>
                      ))}
                      {run.verification.map((result, index) => (
                        <div key={`${run.id}-verification-${index}`}>
                          <p className="pb-row-sub">{result.summary}</p>
                          <VerificationChecks checks={result.checks} />
                        </div>
                      ))}
                    </details>
                    {run.status === 'partially-undone' && (
                      <div className="pb-pending-reboot" role="status">
                        {!run.canUndo ? 'Reversible changes with backups were restored.' : restoredUndo ? 'Some reversible changes were restored, but restoration is incomplete.' : 'Restoration did not complete.'}
                        {residualEffects || run.executions.some((execution) => !execution.success)
                          ? ' Irreversible or failed steps may still remain in place.'
                          : ' Some restoration work is still outstanding.'}
                      </div>
                    )}
                    {pendingReboot && (
                      <div className="pb-pending-reboot" role="status">
                        Pending reboot: verification remains incomplete until Windows restarts.
                      </div>
                    )}
                  </div>
                  <div className="pb-row-side pb-activity-side">
                    <Badge appearance="outline" color="subtle" className="pb-neutral-status pb-status" data-status={run.status}>
                      Status: {runStatusLabel(run.status)}
                    </Badge>
                    {run.canUndo ? (
                      <Button
                        appearance="secondary"
                        size="small"
                        icon={<ArrowUndoRegular />}
                        disabled={active}
                        onClick={() => {
                          void props.onUndo(run.id);
                        }}
                        title="Undo restores each eligible backed-up reversible step in reverse order. Irreversible changes are never attempted and remain in place."
                      >
                        {undoing ? 'Undoing…' : retryingUndo ? 'Retry undo' : restoredUndo ? 'Continue undo' : 'Undo'}
                      </Button>
                    ) : (
                      <Badge
                        appearance="outline"
                        color="subtle"
                        title="Only supported reversible operations can be undone"
                      >
                        {run.status === 'partially-undone' ? 'Residual effects remain' : 'Undo unavailable'}
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {state.plans.length > 0 && (
        <section className="pb-section" aria-labelledby="activity-plans">
          <div className="pb-section-head">
            <h2 className="pb-section-title" id="activity-plans">
              Repair plans
            </h2>
          </div>
          <ul className="pb-list">
            {state.plans.map((plan) => (
              <li key={plan.id} className="pb-row">
                <div className="pb-row-main">
                  <div className="pb-row-title">{plan.title}</div>
                  <div className="pb-row-sub">
                    {plan.target.name}
                    {plan.status !== 'ready' && plan.reason ? ` · ${plan.reason}` : ''}
                  </div>
                </div>
                <div className="pb-row-side pb-activity-side">
                  <Badge appearance="outline" color="subtle" className="pb-neutral-status pb-status" data-status={plan.status}>
                    Status: {planStatusLabel(plan.status)}
                  </Badge>
                  <Button appearance="secondary" size="small" onClick={() => props.onSelectPlan(plan.id)}>
                    Open plan
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
