import * as React from 'react';
import { Badge, Button, Input } from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import { formatUSD } from '../format';
import type { ViewProps } from '../types';

export function SettingsView(props: ViewProps): React.ReactElement {
  const { state, busy } = props;
  const [keyInput, setKeyInput] = React.useState('');
  const showKey = keyInput.length > 0;
  const budget = state.budget;
  const settings = state.settings;

  return (
    <div>
      <section className="pb-section" aria-labelledby="settings-key">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="settings-key">
            Model API key
          </h2>
          <div className="pb-section-action">
            <Badge appearance="tint" color="subtle">
              {settings.hasApiKey ? 'Key saved' : 'No key saved'}
            </Badge>
          </div>
        </div>
        <p className="pb-note">
          Research calls the model only with a key you supply here. The stored key itself is never displayed; only
          whether a key is saved.
        </p>
        <form
          className="pb-form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = keyInput.trim();
            if (trimmed.length === 0) return;
            setKeyInput('');
            void props.onSaveKey(trimmed);
          }}
        >
          <label className="pb-note" htmlFor="settings-api-key">
            New API key
          </label>
          <Input
            id="settings-api-key"
            type="password"
            autoComplete="off"
            value={keyInput}
            onChange={(_, data) => setKeyInput(data.value)}
            placeholder="Paste a new key to save it"
          />
          <div className="pb-form-row">
            <Button
              type="submit"
              appearance="primary"
              disabled={busy.savingKey || keyInput.trim().length === 0}
            >
              {busy.savingKey ? 'Saving…' : 'Save key'}
            </Button>
            {settings.hasApiKey && (
              <Button
                appearance="secondary"
                icon={<DismissRegular />}
                disabled={busy.clearingKey}
                onClick={() => {
                  void props.onClearKey();
                }}
              >
                {busy.clearingKey ? 'Clearing…' : 'Clear saved key'}
              </Button>
            )}
          </div>
          {showKey && (
            <p className="pb-note">
              Your saved key is encrypted with Windows credential protection and stays on this computer.
            </p>
          )}
        </form>
      </section>

      <section className="pb-section" aria-labelledby="settings-budget">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="settings-budget">
            Research budget
          </h2>
        </div>
        <div className="pb-grid" role="list" aria-label="Budget amounts">
          <div className="pb-metric" role="listitem">
            <div className="pb-metric-label">Estimated spend</div>
            <div className="pb-metric-value">{formatUSD(budget.spent)}</div>
          </div>
          <div className="pb-metric" role="listitem">
            <div className="pb-metric-label">Reserved</div>
            <div className="pb-metric-value">{formatUSD(budget.reserved)}</div>
          </div>
          <div className="pb-metric" role="listitem">
            <div className="pb-metric-label">Remaining</div>
            <div className="pb-metric-value">{formatUSD(budget.remaining)}</div>
          </div>
          <div className="pb-metric" role="listitem">
            <div className="pb-metric-label">Limit</div>
            <div className="pb-metric-value">{formatUSD(budget.limit)}</div>
            <div className="pb-metric-sub">{budget.requests} requests recorded</div>
          </div>
        </div>
        <p className="pb-note" style={{ marginTop: '0.75rem' }}>
          Conservative usage estimates include reserved requests. Check Meta billing for your full account total.
        </p>
      </section>

      <section className="pb-section" aria-labelledby="settings-app">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="settings-app">
            Application
          </h2>
        </div>
        <dl className="pb-kv">
          <dt>Model</dt>
          <dd>{settings.model}</dd>
          <dt>Budget limit</dt>
          <dd>{formatUSD(settings.budgetLimit)}</dd>
          <dt>Local data directory</dt>
          <dd className="pb-mono">{settings.dataDirectory}</dd>
          <dt>Lab status</dt>
          <dd>
            <Badge appearance="tint" color="subtle">
              {settings.labMode ? 'Isolated lab mode' : 'Live mode'}
            </Badge>
          </dd>
        </dl>
        {settings.labMode && (
          <p className="pb-note" style={{ marginTop: '0.75rem' }}>
            Lab mode is conspicuous by design: repairs validate against an isolated test profile.
          </p>
        )}
      </section>
    </div>
  );
}
