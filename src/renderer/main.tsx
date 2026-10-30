import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, webDarkTheme } from '@fluentui/react-components';
import App from './app';
import './styles.css';

const theme = {
  ...webDarkTheme,
  fontFamilyBase: '"Segoe UI", sans-serif',
  fontFamilyMonospace: '"Consolas", monospace',
  fontSizeBase300: '16px',
  lineHeightBase300: '24px',
  colorNeutralBackground1: '#080808',
  colorNeutralBackground1Hover: '#141414',
  colorNeutralBackground1Pressed: '#181818',
  colorNeutralBackground1Selected: '#181818',
  colorNeutralBackground2: '#0c0c0c',
  colorNeutralBackground2Hover: '#161616',
  colorNeutralBackground2Pressed: '#1c1c1c',
  colorNeutralBackground2Selected: '#1e1e1e',
  colorNeutralBackground3: '#000000',
  colorNeutralBackground4: '#050505',
  colorNeutralBackground5: '#080808',
  colorNeutralBackground6: '#121212',
  colorNeutralBackgroundDisabled: '#141414',
  colorNeutralForeground1: '#f5f5f5',
  colorNeutralForeground2: '#b3b3b3',
  colorNeutralForeground3: '#999999',
  colorNeutralForegroundDisabled: '#767676',
  colorNeutralStroke1: '#383838',
  colorNeutralStroke2: '#242424',
  colorNeutralStroke3: '#1c1c1c',
  colorStatusDangerBackground1: '#121212',
  colorStatusDangerBorder1: '#383838',
  colorStatusDangerForeground1: '#f5f5f5',
  colorStatusWarningBackground1: '#121212',
  colorStatusWarningBorder1: '#383838',
  colorStatusWarningForeground3: '#f5f5f5',
  colorStatusSuccessBackground1: '#121212',
  colorStatusSuccessBorder1: '#383838',
  colorStatusSuccessForeground1: '#f5f5f5',
  spacingHorizontalXXS: '4px',
  spacingHorizontalXS: '4px',
  spacingHorizontalSNudge: '8px',
  spacingHorizontalS: '8px',
  spacingHorizontalMNudge: '12px',
  spacingHorizontalM: '12px',
  spacingHorizontalL: '16px',
  spacingHorizontalXL: '20px',
  spacingHorizontalXXL: '24px',
  spacingHorizontalXXXL: '32px',
  spacingVerticalXXS: '4px',
  spacingVerticalXS: '4px',
  spacingVerticalSNudge: '8px',
  spacingVerticalS: '8px',
  spacingVerticalMNudge: '12px',
  spacingVerticalM: '12px',
  spacingVerticalL: '16px',
  spacingVerticalXL: '20px',
  spacingVerticalXXL: '24px',
  spacingVerticalXXXL: '32px',
  colorBrandBackground: '#285bb8',
  colorBrandBackgroundHover: '#306bce',
  colorBrandBackgroundPressed: '#234fa3',
  colorBrandForegroundLink: '#a6c5ff',
  colorBrandForegroundLinkHover: '#c5dbff',
  colorCompoundBrandBackground: '#6e9fff',
  colorCompoundBrandStroke: '#8ab2ff',
};
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('PocketBench: missing root element.');

createRoot(rootElement).render(
  <React.StrictMode>
    <FluentProvider theme={theme} className="pb-provider">
      <App />
    </FluentProvider>
  </React.StrictMode>,
);

