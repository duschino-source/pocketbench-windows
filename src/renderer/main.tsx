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
    <FluentProvider theme={{...webDarkTheme,fontFamilyBase:'"Segoe UI Variable", "Segoe UI", sans-serif',fontSizeBase300:'16px',lineHeightBase300:'24px'}} className="pb-provider">
      <App />
    </FluentProvider>
  </React.StrictMode>,
);
