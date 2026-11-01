import * as React from 'react';
import { Button, Textarea } from '@fluentui/react-components';
import { ArrowRightRegular, SearchRegular } from '@fluentui/react-icons';
import type { AppTarget, SymptomCategory } from '../../shared/contracts';
import type { ViewProps } from '../types';

type Props = Pick<ViewProps, 'state' | 'busy' | 'onInvestigate' | 'onNavigate'> & { app?: AppTarget };

const CATEGORIES: Array<{ value: SymptomCategory; label: string }> = [
  { value: 'performance', label: 'Performance' },
  { value: 'connectivity', label: 'Connectivity' },
  { value: 'updates', label: 'Updates' },
  { value: 'app', label: 'App' },
];

const PRESETS: Record<SymptomCategory, string[]> = {
  performance: ['Slow startup', 'High memory use', 'Freezes under load'],
  connectivity: ['Wi-Fi connects but no internet', 'DNS lookups fail', 'Proxy blocks traffic'],
  updates: ['Windows Update fails', 'Update stuck downloading', 'Restart loop after updating'],
  app: ['App won’t open', 'App crashes on launch', 'Feature stopped working'],
};

const GENERAL_PRESETS = ['Internet connection', 'Slow startup', 'Windows Update'];

export function SymptomForm({ state, busy, app, onInvestigate, onNavigate }: Props): React.ReactElement {
  const [symptom, setSymptom] = React.useState('');
  const [category, setCategory] = React.useState<SymptomCategory | null>(app ? 'app' : null);
  const input = React.useRef<HTMLTextAreaElement>(null);
  const id = React.useId();
  const categoryId = React.useId();

  React.useEffect(() => {
    setSymptom('');
    setCategory(app ? 'app' : null);
  }, [app?.id]);

  const presets = category ? PRESETS[category] : GENERAL_PRESETS;
  const available = Boolean(state.snapshot && category);
  const selectedLabel = category ? CATEGORIES.find((item) => item.value === category)?.label : null;

  return (
    <form
      className="pb-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!available || busy.investigating || !symptom.trim()) return;
        void onInvestigate({
          symptom: symptom.trim(),
          ...(app ? { appId: app.id } : {}),
          ...(category ? { category } : {}),
        });
      }}
    >
      <label htmlFor={id} className="pb-composer-label">
        {app ? 'What’s happening with ' + app.name + '?' : 'What needs fixing?'}
      </label>
      <p className="pb-composer-description">
        Describe the problem. PocketBench will investigate and prepare a repair for you to review.
      </p>

      <span className="pb-field-label" id={categoryId}>
        Which area is affected?
      </span>
      <div className="pb-category-picker" role="group" aria-labelledby={categoryId}>
        {CATEGORIES.map((item) => (
          <Button
            key={item.value}
            type="button"
            size="small"
            appearance="subtle"
            aria-pressed={category === item.value}
            onClick={() => setCategory((current) => (current === item.value ? null : item.value))}
          >
            {item.label}
          </Button>
        ))}
      </div>

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
        rows={3}
        resize="vertical"
        className="pb-symptom-input"
      />

      <div className="pb-presets" aria-label="Example symptoms">
        {presets.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="small"
            appearance="subtle"
            onClick={() => {
              setSymptom(preset);
              input.current?.focus();
            }}
          >
            {preset}
            <ArrowRightRegular />
          </Button>
        ))}
      </div>

      <div className="pb-composer-actions">
        <span className="pb-note">
          {!state.snapshot
            ? 'Scan this PC to get started.'
            : !category
              ? 'Choose an affected area above, then investigate. Local checks work offline.'
              : !state.settings.hasApiKey
                ? 'Local checks work offline. Meta enables deeper research.'
                : 'Sources and impact shown before you apply.'}
        </span>
        {!state.settings.hasApiKey && !state.snapshot ? (
          <Button type="button" appearance="primary" onClick={() => onNavigate('settings')}>
            Connect Meta <ArrowRightRegular />
          </Button>
        ) : (
          <Button
            type="submit"
            appearance="primary"
            icon={<SearchRegular />}
            disabled={!available || busy.investigating || !symptom.trim()}
            title={!state.snapshot ? 'Scan this PC first' : !category ? 'Choose an affected area first' : 'Investigate'}
          >
            {busy.investigating ? 'Investigating…' : 'Investigate'}
          </Button>
        )}
      </div>
    </form>
  );
}
