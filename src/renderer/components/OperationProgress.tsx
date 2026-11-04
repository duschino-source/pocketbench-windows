import * as React from 'react';
import { Button, ProgressBar } from '@fluentui/react-components';
import { ArrowClockwiseRegular } from '@fluentui/react-icons';
import type { ProgressEvent } from '../../shared/contracts';
import { formatElapsed } from '../format';

const PHASE_LABELS: Record<ProgressEvent['phase'], string> = {
  scan: 'Collecting evidence',
  research: 'Researching',
  review: 'Independent review',
  apply: 'Applying changes',
  verify: 'Verifying result',
  undo: 'Restoring changes',
};

export interface OperationProgressProps {
  progress: ProgressEvent;
  cancelling: boolean;
  canCancel: boolean;
  onCancel: () => void;
}

function realPercent(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

export function OperationProgress({
  progress,
  cancelling,
  canCancel,
  onCancel,
}: OperationProgressProps): React.ReactElement {
  const [mountedAt] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(() => Date.now());
  const startedAt = React.useMemo(() => {
    if (!progress.startedAt) return mountedAt;
    const parsed = Date.parse(progress.startedAt);
    return Number.isFinite(parsed) ? parsed : mountedAt;
  }, [progress.startedAt, mountedAt]);

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const percent = realPercent(progress.percent);
  const stage = PHASE_LABELS[progress.phase];

  return (
    <div className="pb-progress">
      <ArrowClockwiseRegular aria-hidden="true" />
      <div className="pb-progress-copy">
        <div className="pb-progress-head">
          <strong>{stage}</strong>
          <span className="pb-progress-time" aria-hidden="true">Elapsed {formatElapsed(now - startedAt)}</span>
        </div>
        <span className="pb-progress-message" role="status" aria-live="polite">{progress.message}</span>
        {!progress.cancellable && progress.cancellationReason && (
          <p className="pb-progress-note">{progress.cancellationReason}</p>
        )}
      </div>

      <div className="pb-progress-meter">
        <ProgressBar value={percent === null ? undefined : percent / 100} aria-label={`${stage} progress`} />
        {percent !== null && <span className="pb-progress-percent">{Math.round(percent)}%</span>}
      </div>

      {canCancel && (
        <Button appearance="secondary" size="small" disabled={cancelling} onClick={onCancel}>
          {cancelling ? 'Cancelling…' : 'Cancel'}
        </Button>
      )}
    </div>
  );
}
