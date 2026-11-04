import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { AppearanceProvider } from './appearance';
import App from './app';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('PocketBench: missing root element.');

createRoot(rootElement).render(
  <React.StrictMode>
    <AppearanceProvider>
      <App />
    </AppearanceProvider>
  </React.StrictMode>,
);

