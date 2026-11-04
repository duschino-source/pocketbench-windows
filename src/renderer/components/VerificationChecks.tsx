import * as React from 'react';
import type { VerificationResult } from '../../shared/contracts';

export function VerificationChecks({ checks }: { checks: VerificationResult['checks'] }): React.ReactElement {
  return (
    <ul className="pb-verification-checks">
      {checks.map((check, index) => (
        <li key={`${check.name}-${index}`}>
          <div className="pb-verification-heading">
            <strong>{check.name}</strong>
            <span className={check.passed ? 'pb-check-pass' : 'pb-check-fail'}>
              {check.passed ? 'Passed' : 'Failed'}
            </span>
          </div>
          <dl className="pb-before-after">
            <div><dt>Before</dt><dd>{check.before?.trim() || 'Not recorded'}</dd></div>
            <div><dt>After</dt><dd>{check.after?.trim() || 'Not recorded'}</dd></div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
