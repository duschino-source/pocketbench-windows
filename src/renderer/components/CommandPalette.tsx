import * as React from 'react';
import { SearchBox } from '@fluentui/react-components';
import { moveIndex, searchPalette, type PaletteItem } from '../search';

export interface CommandPaletteProps {
  open: boolean;
  items: readonly PaletteItem[];
  onClose: () => void;
  onAction: (item: PaletteItem) => void;
}

const KIND_LABELS: Record<PaletteItem['kind'], string> = {
  nav: 'Go to',
  app: 'App',
  finding: 'Finding',
  plan: 'Plan',
  run: 'Activity',
  action: 'Action',
};

/**
 * Ctrl+K palette. It navigates and opens review surfaces only; applying a
 * repair still requires the stored-plan review flow, and the index holds
 * no settings values or secrets (see buildPaletteItems).
 */
export function CommandPalette({ open, items, onClose, onAction }: CommandPaletteProps): React.ReactElement | null {
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const results = React.useMemo(() => searchPalette(items, query), [items, query]);

  React.useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open ]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  React.useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, results]);

  if (!open) return null;

  const activate = (item: PaletteItem | undefined) => {
    if (!item) return;
    onAction(item);
    onClose();
  };

  return (
    <div
      className="pb-palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="pb-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search PocketBench"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((current) =>
              moveIndex(current, event.key === 'ArrowDown' ? 1 : -1, results.length),
            );
          } else if (event.key === 'Enter') {
            event.preventDefault();
            activate(results[activeIndex]);
          }
        }}
      >
        <SearchBox
          autoFocus
          placeholder="Search apps, findings, plans…"
          aria-label="Search apps, findings, and plans" dismiss={query ? undefined : null}
          value={query}
          onChange={(_, data) => setQuery(data.value ?? '')}
        />
        <div className="pb-palette-list" role="listbox" aria-label="Search results" ref={listRef}>
          {results.length === 0 ? (
            <p className="pb-palette-empty">No matches. Try an app name, a finding, or a plan title.</p>
          ) : (
            results.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className="pb-palette-item"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => activate(item)}
              >
                <span className="pb-palette-kind">{KIND_LABELS[item.kind]}</span>
                <span className="pb-palette-title">{item.title}</span>
                <span className="pb-palette-hint">{item.hint}</span>
              </button>
            ))
          )}
        </div>
        <div className="pb-palette-foot" aria-hidden="true">
          <span>↑↓ Navigate</span>
          <span>Enter Open</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
