import * as React from 'react';
import { FluentProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components';

export type Appearance = 'system' | 'light' | 'dark';
export const APPEARANCE_KEY = 'pocketbench:appearance';

export function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(APPEARANCE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

const AppearanceContext = React.createContext<{
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
}>({ appearance: 'system', setAppearance: () => {} });

export const useAppearance = () => React.useContext(AppearanceContext);

export function AppearanceProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [appearance, setPreference] = React.useState<Appearance>(readAppearance);
  const [systemDark, setSystemDark] = React.useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const resolved = appearance === 'system' ? (systemDark ? 'dark' : 'light') : appearance;

  React.useEffect(() => {
    if (appearance !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [appearance]);

  React.useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setAppearance = React.useCallback((value: Appearance) => {
    try {
      localStorage.setItem(APPEARANCE_KEY, value);
      setPreference(value);
    } catch {
      // Follow the OS if preferences cannot be stored.
      setPreference('system');
    }
  }, []);

  const theme = React.useMemo(() => ({
    ...(resolved === 'dark' ? webDarkTheme : webLightTheme),
    fontFamilyBase: '"Segoe UI Variable", "Segoe UI", sans-serif',
    fontFamilyMonospace: '"Consolas", monospace',
    fontSizeBase300: '16px',
    lineHeightBase300: '24px',
  }), [resolved]);

  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance }}>
      <FluentProvider theme={theme} className="pb-provider">{children}</FluentProvider>
    </AppearanceContext.Provider>
  );
}
