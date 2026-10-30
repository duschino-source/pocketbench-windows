import * as React from 'react';
import { Button, Textarea } from '@fluentui/react-components';
import { ArrowRightRegular, SearchRegular } from '@fluentui/react-icons';
import type { AppTarget } from '../../shared/contracts';
import type { ViewProps } from '../types';

type Props = Pick<ViewProps, 'state' | 'busy' | 'onInvestigate' | 'onNavigate'> & { app?: AppTarget };

export function SymptomForm({ state, busy, app, onInvestigate, onNavigate }: Props): React.ReactElement {
  const [symptom, setSymptom] = React.useState('');
  const input = React.useRef<HTMLTextAreaElement>(null);
  const id = React.useId();
  React.useEffect(() => setSymptom(''), [app?.id]);
  const presets = app ? ['Won’t open', 'Connection problems', 'Slow or unresponsive'] : ['Internet connection', 'Slow startup', 'Windows Update'];
  const available = Boolean(state.snapshot && state.settings.hasApiKey);
  return (
    <form className="pb-composer" onSubmit={event => {
      event.preventDefault();
      if (!available || busy.investigating || !symptom.trim()) return;
      void onInvestigate({ symptom: symptom.trim(), ...(app ? { appId: app.id } : {}) });
    }}>
      <label htmlFor={id} className="pb-composer-label">{app ? 'What’s happening with ' + app.name + '?' : 'What needs fixing?'}</label>
      <p className="pb-composer-description">Describe the problem. PocketBench will investigate and prepare a repair for you to review.</p>
      <Textarea ref={input} id={id} value={symptom} onChange={(_, data) => setSymptom(data.value)}
        placeholder={app ? 'What went wrong, and when does it happen?' : 'For example, Wi-Fi connects but websites won’t load…'}
        rows={3} resize="vertical" className="pb-symptom-input" />
      <div className="pb-presets" aria-label="Example symptoms">
        {presets.map(preset => <Button key={preset} size="small" appearance="subtle" onClick={() => { setSymptom(preset); input.current?.focus(); }}>{preset}<ArrowRightRegular /></Button>)}
      </div>
      <div className="pb-composer-actions">
        <span className="pb-note">{!state.snapshot ? 'Scan this PC to get started.' : !state.settings.hasApiKey ? 'Connect Meta to investigate.' : 'Sources and impact shown before you apply.'}</span>
        {!state.settings.hasApiKey
          ? <Button appearance="primary" onClick={() => onNavigate('settings')}>Connect Meta <ArrowRightRegular /></Button>
          : <Button type="submit" appearance="primary" icon={<SearchRegular />} disabled={!available || busy.investigating || !symptom.trim()}>{busy.investigating ? 'Investigating…' : 'Investigate'}</Button>}
      </div>
    </form>
  );
}

