import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';
import { applyThemePreference, getInitialThemePreference } from './domain/theme-mode';
import './styles.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Root element #root was not found.');
}

applyThemePreference(getInitialThemePreference());

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
