import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles/tokens.css';
import { App } from './app/App';
import { applyAppearance, loadAppearance } from './app/appearance';
import { startLanguage } from './i18n';

applyAppearance(loadAppearance());

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The chosen language's file loads first, so the app doesn't flash English.
void startLanguage().then(() =>
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
