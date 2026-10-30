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
    <FluentProvider theme={webDarkTheme} className="pb-provider">
      <App />
    </FluentProvider>
  </React.StrictMode>,
);
