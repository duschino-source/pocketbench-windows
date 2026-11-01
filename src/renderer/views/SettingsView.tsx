import * as React from 'react';
import { Badge, Button, Input, ProgressBar } from '@fluentui/react-components';
import {
  ArrowClockwiseRegular,
  ArrowDownloadRegular,
  DismissRegular,
  OpenRegular,
} from '@fluentui/react-icons';
import { formatUSD, isHttpsUrl, updateStatusLabel } from '../format';
import type { ViewProps } from '../types';

function realPercent(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

export function SettingsView(props: ViewProps): React.ReactElement {
  const { state, busy, updates } = props;
  const [keyInput, setKeyInput] = React.useState('');
  const showKey = keyInput.length > 0;
  const budget = state.budget;
  const settings = state.settings;

  const update = updates.state;
  const percent = realPercent(update?.percent);
  const releaseUrl = update?.releaseUrl && isHttpsUrl(update.releaseUrl) ? update.releaseUrl : null;
  const updatesAvailable = Boolean(update) || updates.canCheck || updates.canRefresh || updates.canInstall;
  const checking = updates.action === 'check' || update?.status === 'checking';
  const updating = updates.action !== null;
  const downloading = update?.status === 'downloading';
  const installReady = update?.status === 'downloaded';
  const statusLabel = update
    ? updateStatusLabel(update.status)
    : updates.canRefresh || updates.canCheck
      ? 'Not checked'
      : 'Unavailable';
  const refreshUpdates = updates.refresh;

  React.useEffect(() => {
    if (!updates.canRefresh) return;
    void refreshUpdates();
  }, [updates.canRefresh, refreshUpdates]);

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
          whether a key is saved. Research is metered: estimates are under Advanced settings, and actual charges
          appear in your Meta billing account.
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

      <section className="pb-section" aria-labelledby="settings-updates">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="settings-updates">
            PocketBench updates
          </h2>
          <div className="pb-section-action">
            <Badge appearance="tint" color="subtle">
              {statusLabel}
            </Badge>
          </div>
        </div>

        {!updatesAvailable ? (
          <p className="pb-note">
            This build does not expose update controls. Download the latest published release directly if you need to
            update manually.
          </p>
        ) : (
          <>
            <div className="pb-update-status">
              <div className="pb-update-copy">
                {update?.message ? (
                  <p className="pb-note">{update.message}</p>
                ) : (
                  <p className="pb-note">
                    {update
                      ? 'No further update detail was reported.'
                      : 'Check now to read the current update status from this build.'}
                  </p>
                )}
                {update?.version && <p className="pb-update-version">Available version {update.version}</p>}
              </div>
              <div className="pb-update-actions">
                {releaseUrl && (
                  <Button
                    appearance="secondary"
                    size="small"
                    icon={<OpenRegular />}
                    onClick={() => void props.onOpenExternal(releaseUrl)}
                  >
                    Open release page
                  </Button>
                )}
                {updates.canCheck && (
                  <Button
                    appearance="secondary"
                    size="small"
                    icon={<ArrowClockwiseRegular />}
                    disabled={checking || updating || downloading}
                    onClick={() => void updates.check()}
                  >
                    {checking ? 'Checking…' : 'Check for updates'}
                  </Button>
                )}
                {updates.canInstall && (
                  <Button
                    appearance="primary"
                    size="small"
                    icon={<ArrowDownloadRegular />}
                    disabled={!installReady || updating}
                    onClick={() => void updates.install()}
                  >
                    Restart to install
                  </Button>
                )}
              </div>
            </div>

            {downloading && percent !== null && (
              <div className="pb-update-progress">
                <div className="pb-meter-label">
                  <span>Update download</span>
                  <strong>{Math.round(percent)}%</strong>
                </div>
                <ProgressBar value={percent / 100} aria-label="Update download progress" />
              </div>
            )}

            {updates.error && (
              <p className="pb-note pb-update-error" role="alert">
                {updates.error}
              </p>
            )}
            <p className="pb-note">
              Updates are checked on request. Restart to install only when your work is saved; a restart never runs
              repairs in the background.
            </p>
          </>
        )}
      </section>

      <section className="pb-section pb-advanced" aria-label="Advanced settings">
        <details className="pb-advanced-disclosure">
          <summary>
            <span className="pb-advanced-title">Advanced settings</span>
            <span className="pb-advanced-hint">Budget estimates, model, local data</span>
          </summary>
          <div className="pb-advanced-body">
            <h3 className="pb-subsection-title">Research budget</h3>
            <p className="pb-note">
              These are conservative estimates, including reserved requests. They are not a bill. Actual charges
              appear in your Meta billing account.
            </p>
            <div className="pb-grid" role="list" aria-label="Budget estimates">
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

            <h3 className="pb-subsection-title">Application details</h3>
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
              <p className="pb-note">
                Lab mode is conspicuous by design: repairs validate against an isolated test profile.
              </p>
            )}
          </div>
        </details>
      </section>
    </div>
  );
}
