import * as React from 'react';
import { Button, Textarea } from '@fluentui/react-components';
import { ArrowRightRegular, SearchRegular } from '@fluentui/react-icons';
import type { AppTarget, SymptomCategory } from '../../shared/contracts';
import { categoryFromEvidence } from '../../shared/investigation';
import { GENERAL_PRESETS, isBusy } from '../types';
import type { ViewProps } from '../types';

type Props = Pick<ViewProps, 'state' | 'busy' | 'onInvestigate' | 'onNavigate' | 'onScan'> & {
  app?: AppTarget;
  compact?: boolean;
};

const CATEGORIES: Array<{ value: SymptomCategory; label: string }> = [
  { value: 'performance', label: 'Performance' },
  { value: 'connectivity', label: 'Connectivity' },
  { value: 'updates', label: 'Updates' },
];

const PRESETS: Record<SymptomCategory, string[]> = {
  performance: ['Slow startup', 'High memory use', 'Freezes under load'],
  connectivity: ['Wi-Fi connects but no internet', 'DNS lookups fail', 'Proxy blocks traffic'],
  updates: ['Windows Update fails', 'Update stuck downloading', 'Restart loop after updating'],
  app: ['App won’t open', 'App crashes on launch', 'Feature stopped working'],
};

export function SymptomForm({ state, busy, app, onInvestigate, onNavigate, onScan, compact = false }: Props): React.ReactElement {
  const [symptom, setSymptom] = React.useState('');
  const [category, setCategory] = React.useState<SymptomCategory | null>(app ? 'app' : null);
  const input = React.useRef<HTMLTextAreaElement>(null);
  const id = React.useId();
  const categoryId = React.useId();
  const active = isBusy(busy);

  React.useEffect(() => {
    setSymptom('');
    setCategory(app ? 'app' : null);
  }, [app?.id]);

  const lockedApp = Boolean(app);
  const presets = lockedApp ? PRESETS.app : category ? PRESETS[category] : null;
  // Free text stays usable: backend classifies when no explicit category is set.
  const available = Boolean(state.snapshot) && !active;
  const selectedLabel = category ? CATEGORIES.find((item) => item.value === category)?.label : null;

  return (
    <form
      className={'pb-composer' + (compact ? ' pb-composer-compact' : '')}
      onSubmit={(event) => {
        event.preventDefault();
        if (!available || !symptom.trim()) return;
        void onInvestigate({
          symptom: symptom.trim(),
          ...(app ? { appId: app.id } : {}),
          // App category stays on app targets; general app choice routes to Apps.
          ...(category ? { category } : {}),
        });
      }}
    >
      <label htmlFor={id} className="pb-composer-label">
        {app ? 'What’s happening with ' + app.name + '?' : compact ? 'Describe another problem' : 'What needs fixing?'}
      </label>
      {!compact && (
        <p className="pb-composer-description">
          Describe the problem. PocketBench investigates and prepares a repair for review.
        </p>
      )}

      {!lockedApp && (
        <React.Fragment>
          <span className="pb-field-label" id={categoryId}>
            Affected area (optional)
          </span>
          <div className="pb-category-picker" role="group" aria-labelledby={categoryId}>
            {CATEGORIES.map((item) => (
              <Button
                key={item.value}
                type="button"
                size="small"
                appearance="subtle"
                aria-pressed={category === item.value}
                disabled={active}
                onClick={() => setCategory((current) => (current === item.value ? null : item.value))}
              >
                {item.label}
              </Button>
            ))}
            <Button type="button" size="small" appearance="subtle" onClick={() => onNavigate('apps')}>
              Specific app <ArrowRightRegular />
            </Button>
          </div>
        </React.Fragment>
      )}

      <Textarea
        ref={input}
        id={id}
        value={symptom}
        onChange={(_, data) => setSymptom(data.value)}
        placeholder={
          app
            ? 'What went wrong, and when does it happen? Include the exact message if there is one.'
            : selectedLabel
              ? `Describe the ${selectedLabel.toLowerCase()} problem, including any error message.`
              : 'For example, Wi-Fi connects but websites won’t load…'
        }
        rows={compact ? 2 : 3}
        resize="vertical"
        className="pb-symptom-input"
        disabled={active}
      />

      <div className="pb-presets" aria-label="Example symptoms">
        {presets
          ? presets.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="small"
                appearance="subtle"
                disabled={active}
                onClick={() => {
                  setSymptom(preset);
                  input.current?.focus();
                }}
              >
                {preset}
                <ArrowRightRegular />
              </Button>
            ))
          : GENERAL_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                size="small"
                appearance="subtle"
                disabled={active}
                onClick={() => {
                  setSymptom(preset.symptom);
                  setCategory(preset.category);
                  input.current?.focus();
                }}
              >
                {preset.label}
                <ArrowRightRegular />
              </Button>
            ))}
      </div>

      <div className="pb-composer-actions">
        <span className="pb-note">
          {compact
            ? 'Local checks work offline. You review every change.'
            : !state.snapshot
              ? 'Works offline. Scan first; no key needed.'
              : !state.settings.hasApiKey
                ? 'Local checks work offline. Meta enables deeper research.'
                : 'Sources and impact shown before you apply.'}
        </span>
        {!state.snapshot ? (
          <Button type="button" appearance="primary" icon={<SearchRegular />} disabled={active} onClick={() => void onScan()}>
            {busy.scan ? 'Scanning…' : 'Scan this PC'}
          </Button>
        ) : (
          <Button
            type="submit"
            appearance="primary"
            icon={<SearchRegular />}
            disabled={!available || !symptom.trim()}
            title={!state.snapshot ? 'Scan this PC first' : 'Investigate'}
          >
            {busy.investigating ? 'Investigating…' : 'Investigate'}
          </Button>
        )}
      </div>
    </form>
  );
}

export function symptomCategoryFromEvidence(category: string, area?: 'windows' | 'app'): SymptomCategory | undefined {
  return categoryFromEvidence(category, area);
}
