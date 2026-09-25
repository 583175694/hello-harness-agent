import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { ConfirmProvider } from './components/ui/confirm-provider';
import { ToastProvider } from './components/ui/toast';
import { bootstrapAppearance } from './theme';
import './theme.css';
import './styles.css';

bootstrapAppearance();

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element is missing.');
}

createRoot(root).render(
  <StrictMode>
    <ConfirmProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ConfirmProvider>
  </StrictMode>,
);
