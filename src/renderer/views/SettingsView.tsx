import * as React from 'react';
import { Badge, Button, Input, ProgressBar } from '@fluentui/react-components';
import {
  ArrowClockwiseRegular,
  ArrowDownloadRegular,
  DismissRegular,
  OpenRegular,
} from '@fluentui/react-icons';
import { formatUSD, isHttpsUrl, updateStatusLabel } from '../format';
import { isBusy, type ViewProps } from '../types';

function realPercent(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

export function SettingsView(props: ViewProps): React.ReactElement {
  const { state, busy, updates } = props;
  const [keyInput, setKeyInput] = React.useState('');
  const active = isBusy(busy);
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
  const manualGate = Boolean(update && (!update.supported || !update.trustedPublisher));
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
      <section className="pb-section" aria-labelledby="settings-connection">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="settings-connection">
            Research connection
          </h2>
          <div className="pb-section-action">
            <Badge appearance="tint" color="subtle">
              {settings.hasApiKey ? 'Key saved' : 'No key saved'}
            </Badge>
          </div>
        </div>
        <p className="pb-note">
          A model key enables deeper research. Without a key, scans and local checks still work offline. The stored key
          is never displayed; only whether one is saved.
        </p>
        <form
          className="pb-form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = keyInput.trim();
            if (trimmed.length === 0 || active) return;
            setKeyInput('');
            void props.onSaveKey(trimmed);
          }}
        >
          <label className="pb-note" htmlFor="settings-api-key">
            {settings.hasApiKey ? 'Replace saved API key' : 'New API key'}
          </label>
          <Input
            id="settings-api-key"
            type="password"
            autoComplete="off"
            value={keyInput}
            onChange={(_, data) => setKeyInput(data.value)}
            placeholder={settings.hasApiKey ? 'Paste a replacement key' : 'Paste a new key to save it'}
            disabled={active}
          />
          <p className="pb-note">
            The key is encrypted with Windows credential protection and stays on this computer.
          </p>
          <div className="pb-form-row">
            <Button
              type="submit"
              appearance="primary"
              disabled={active || keyInput.trim().length === 0}
            >
              {busy.savingKey ? 'Saving…' : 'Save key'}
            </Button>
            {settings.hasApiKey && (
              <Button
                appearance="secondary"
                icon={<DismissRegular />}
                disabled={active}
                onClick={() => {
                  void props.onClearKey();
                }}
              >
                {busy.clearingKey ? 'Clearing…' : 'Clear saved key'}
              </Button>
            )}
          </div>
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
            This build does not expose update controls. Download the latest published release manually; PocketBench
            cannot install it for you.
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
                    disabled={checking || updating || downloading || active}
                    onClick={() => void updates.check()}
                  >
                    {checking ? 'Checking…' : 'Check now'}
                  </Button>
                )}
                {updates.canInstall && (
                  <Button
                    appearance="primary"
                    size="small"
                    icon={<ArrowDownloadRegular />}
                    disabled={!installReady || updating || active}
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
            {manualGate && (
              <p className="pb-note pb-update-gate">
                This build is unsigned or its publisher is not trusted, so it will not install updates automatically.
                Download a release manually and verify it before running.
              </p>
            )}
          </>
        )}

        <p className="pb-note">
          Installed, supported builds check for updates automatically at startup. Unsigned builds require a manual
          download. A restart to install never runs repairs in the background.
        </p>
      </section>

      <section className="pb-section pb-advanced" aria-label="Advanced settings">
        <details className="pb-advanced-disclosure">
          <summary>
            <span className="pb-advanced-title">Advanced</span>
            <span className="pb-advanced-hint">Budget estimates, model, local data</span>
          </summary>
          <div className="pb-advanced-body">
            <h3 className="pb-subsection-title">Research budget</h3>
            <p className="pb-note">
              Estimates include reserved requests. They are not a bill; actual charges appear in your Meta billing
              account.
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

            <h3 className="pb-subsection-title">Local configuration</h3>
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
