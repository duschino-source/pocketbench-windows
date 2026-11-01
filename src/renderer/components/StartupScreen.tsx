import * as React from 'react';
import { Button } from '@fluentui/react-components';
import { ArrowClockwiseRegular, ErrorCircleRegular } from '@fluentui/react-icons';

const brandMark = new URL('../../../resources/brand/mark.svg', import.meta.url).href;

export interface StartupScreenProps {
  error: string | null;
  onRetry: () => void;
}

/**
 * The real first frame: the existing PocketBench mark while the renderer waits
 * for getState. There is no artificial hold; the app appears as soon as the
 * backend answers.
 */
export function StartupScreen({ error, onRetry }: StartupScreenProps): React.ReactElement {
  return (
    <div className="pb-boot">
      <div className="pb-boot-card">
        <div className="pb-boot-mark" aria-hidden="true">
          <img src={brandMark} alt="" />
        </div>
        <div className="pb-boot-wordmark">
          <span className="pb-boot-name">PocketBench</span>
          <span className="pb-boot-sub">Repair desktop</span>
        </div>

        {error ? (
          <div className="pb-boot-error" role="alert">
            <div className="pb-boot-error-title">
              <ErrorCircleRegular aria-hidden="true" />
              <h1>PocketBench could not start</h1>
            </div>
            <p className="pb-note">{error}</p>
            <Button appearance="primary" icon={<ArrowClockwiseRegular />} onClick={onRetry}>
              Retry
            </Button>
            <p className="pb-boot-help">
              If this keeps happening, close PocketBench completely and open it again. No repair has been attempted.
            </p>
          </div>
        ) : (
          <div className="pb-boot-loading" role="status" aria-live="polite">
            <h1>Starting PocketBench</h1>
            <p className="pb-note">Reading local application state. This usually takes a moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
