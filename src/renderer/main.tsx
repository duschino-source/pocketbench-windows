import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, webDarkTheme } from '@fluentui/react-components';
import App from './app';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('PocketBench: missing root element.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <FluentProvider theme={{...webDarkTheme,fontFamilyBase:'"Segoe UI Variable", "Segoe UI", sans-serif',fontSizeBase300:'16px',lineHeightBase300:'24px',colorNeutralBackground1:'#191c20',colorNeutralBackground2:'#20242a',colorNeutralBackground3:'#111316',colorNeutralForeground1:'#edf0f5',colorNeutralForeground2:'#a4adb9',colorNeutralStroke1:'#3b424d',colorBrandBackground:'#3674dd',colorBrandBackgroundHover:'#4384f0',colorBrandBackgroundPressed:'#2c61bd',colorBrandForegroundLink:'#9dc1ff',colorBrandForegroundLinkHover:'#c1d8ff',colorCompoundBrandBackground:'#5b95f5',colorCompoundBrandStroke:'#6ea4ff'}} className="pb-provider">
      <App />
    </FluentProvider>
  </React.StrictMode>,
);
