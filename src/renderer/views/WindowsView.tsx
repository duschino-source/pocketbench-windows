import * as React from 'react';
import { Button, SearchBox } from '@fluentui/react-components';
import { searchFindings } from '../search';
import { CheckmarkCircleRegular, DesktopPulseRegular, SearchRegular, WarningRegular } from '@fluentui/react-icons';
import type { DiagnosticEvidence } from '../../shared/contracts';
import { isBusy, type ViewProps } from '../types';
import { SymptomForm, symptomCategoryFromEvidence } from '../components/SymptomForm';

const CATEGORIES = ['all', 'updates', 'network', 'performance', 'startup', 'storage', 'services', 'integrity', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  all: 'All findings',
  updates: 'Updates',
  network: 'Network',
  performance: 'Performance',
  startup: 'Startup',
  storage: 'Storage',
  services: 'Services',
  integrity: 'Integrity',
  other: 'Other',
};

const SEVERITY_LABELS: Record<DiagnosticEvidence['severity'], string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};

const SEVERITY_RANK: Record<DiagnosticEvidence['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function categoryOf(item: DiagnosticEvidence): Category {
  const value = item.category.toLowerCase();
  // Windows Update is its own review category, not a generic "other" bucket.
  if (/update|wuauserv|patch|servicing/.test(value)) return 'updates';
  if (/network|dns|proxy/.test(value)) return 'network';
  if (/startup/.test(value)) return 'startup';
  if (/storage|disk/.test(value)) return 'storage';
  if (/integrity|system file/.test(value)) return 'integrity';
  if (/service/.test(value)) return 'services';
  if (/memory|cpu|perform/.test(value)) return 'performance';
  return 'other';
}

function symptomCategoryOf(item: DiagnosticEvidence): ReturnType<typeof symptomCategoryFromEvidence> {
  return symptomCategoryFromEvidence(item.category, item.area);
}

function readStoredFindingsQuery(): string {
  try {
    if (typeof sessionStorage === 'undefined') return '';
    const value = sessionStorage.getItem('pocketbench:findings-query') ?? '';
    sessionStorage.removeItem('pocketbench:findings-query');
    return value;
  } catch {
    return '';
  }
}

export function WindowsView(props: ViewProps): React.ReactElement {
  const { state, busy } = props;
  const active = isBusy(busy);
  const diagnostics = state.snapshot?.diagnostics ?? [];
  const [category, setCategory] = React.useState<Category>('all');
  const [query, setQuery] = React.useState(readStoredFindingsQuery);

  React.useEffect(() => {
    const onSearchFindings = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (typeof value === 'string') setQuery(value);
    };
    window.addEventListener('pocketbench:search-findings', onSearchFindings);
    return () => window.removeEventListener('pocketbench:search-findings', onSearchFindings);
  }, []);

  const counts = React.useMemo(() => {
    const result: Record<string, number> = { all: diagnostics.length };
    for (const item of diagnostics) {
      const key = categoryOf(item);
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  }, [diagnostics]);

  const visible = React.useMemo(() => {
    const inCategory = diagnostics.filter(
      (item) => category === 'all' || categoryOf(item) === category,
    );
    // With a query, relevance ranks results; without one, urgency does.
    return query.trim()
      ? searchFindings(inCategory, query)
      : inCategory.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  }, [category, diagnostics, query]);

  const categoryLabel = CATEGORY_LABELS[category];

  return (
    <div>
      <section className="pb-section pb-diagnostics" aria-labelledby="windows-diagnostics">
        <div className="pb-section-head">
          <h2 className="pb-section-title" id="windows-diagnostics">
            Diagnostic findings
          </h2>
          <span className="pb-note">
            {diagnostics.length} finding{diagnostics.length === 1 ? '' : 's'}
          </span>
        </div>

        {!state.snapshot ? (
          <div className="pb-empty">
            <SearchRegular />
            <h3>Start with a scan</h3>
            <p>Collect current Windows diagnostics, then investigate one finding at a time.</p>
            <Button appearance="primary" disabled={active} onClick={() => void props.onScan()}>
              {busy.scan ? 'Scanning…' : 'Scan this PC'}
            </Button>
          </div>
        ) : (
          <>
            <div className="pb-findings-search">
              <SearchBox
                placeholder="Search findings…"
                aria-label="Search diagnostic findings" dismiss={query ? undefined : null}
                value={query}
                onChange={(_, data) => setQuery(data.value ?? '')}
              />
              {query.trim() && (
                <span className="pb-note" role="status">
                  {visible.length} match{visible.length === 1 ? '' : 'es'}
                </span>
              )}
            </div>

            <div className="pb-category-bar" role="group" aria-label="Filter diagnostic findings by category">
              {CATEGORIES.map((key) => (
                <Button
                  key={key}
                  appearance="subtle"
                  size="small"
                  aria-pressed={category === key}
                  disabled={active}
                  onClick={() => setCategory(key)}
                >
                  {CATEGORY_LABELS[key]}
                  <span className="pb-category-count" aria-hidden="true">
                    {counts[key] ?? 0}
                  </span>
                </Button>
              ))}
            </div>

            {!visible.length ? (
              <div className="pb-empty pb-empty-compact">
                <CheckmarkCircleRegular />
                <h3>
                  {query.trim()
                    ? 'No findings match your search'
                    : diagnostics.length
                      ? `No findings in ${categoryLabel.toLowerCase()}`
                      : 'No findings in this scan'}
                </h3>
                <p>
                  {query.trim()
                    ? 'Try different words, or clear the search to see every finding in this category.'
                    : diagnostics.length
                      ? 'Try another category. A clean scan only means no known issue was detected.'
                      : 'Scan again after making changes, or describe a problem the scan did not detect.'}
                </p>
                <div className="pb-empty-actions">
                  {query.trim() && (
                    <Button appearance="secondary" size="small" disabled={active} onClick={() => setQuery('')}>
                      Clear search
                    </Button>
                  )}
                  {category !== 'all' && (
                    <Button appearance="secondary" size="small" disabled={active} onClick={() => setCategory('all')}>
                      Show all findings
                    </Button>
                  )}
                  <Button appearance="secondary" size="small" disabled={active} onClick={() => void props.onScan()}>
                    {busy.scan ? 'Scanning…' : 'Scan again'}
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="pb-list pb-win-list">
                {visible.map((item) => {
                  const label = SEVERITY_LABELS[item.severity];
                  const categoryKey = symptomCategoryOf(item);
                  return (
                    <li key={item.id} className="pb-row pb-diagnostic-row pb-win-row">
                      <div className={'pb-finding-icon pb-severity-' + item.severity} aria-hidden="true">
                        {item.severity === 'info' ? <DesktopPulseRegular /> : <WarningRegular />}
                      </div>
                      <div className="pb-row-main">
                        <div className="pb-finding-heading">
                          <span className="pb-row-title">{item.title}</span>
                          <span className={'pb-severity-label pb-severity-' + item.severity}>{label}</span>
                        </div>
                        <p className="pb-row-sub">{item.observed}</p>
                        {item.details.length > 0 && (
                          <p className="pb-win-evidence">
                            <span className="pb-win-evidence-label">Evidence</span>
                            {item.details[0]}
                          </p>
                        )}
                        {item.details.length > 1 && (
                          <details className="pb-technical">
                            <summary>
                              Technical evidence ({item.details.length})
                            </summary>
                            <ul className="pb-detail-list">
                              {item.details.map((detail, index) => (
                                <li key={index}>{detail}</li>
                              ))}
                            </ul>
                            {item.suggestedOperation && <code>{item.suggestedOperation}</code>}
                          </details>
                        )}
                      </div>
                      <div className="pb-row-side pb-win-action">
                        <Button
                          appearance="secondary"
                          size="small"
                          disabled={active}
                          onClick={() => {
                            void props.onInvestigate({
                              symptom: item.title,
                              evidenceId: item.id,
                              ...(categoryKey ? { category: categoryKey } : {}),
                            });
                          }}
                        >
                          Investigate
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        <details className="pb-windows-composer pb-win-composer">
          <summary className="pb-win-composer-summary">
            <span>Describe a problem the scan missed</span>
            <span className="pb-note">Optional</span>
          </summary>
          <div className="pb-win-composer-body">
            <SymptomForm {...props} />
          </div>
        </details>
      </section>
    </div>
  );
}
