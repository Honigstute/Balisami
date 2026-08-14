import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DESIGN_TOKEN_CSS_VARIABLES } from '../shared/design-tokens';
import { App } from './app/App';
import './design/styles.css';

for (const [name, value] of Object.entries(DESIGN_TOKEN_CSS_VARIABLES)) {
  document.documentElement.style.setProperty(name, value);
}

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Balsamic could not find its application root.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
