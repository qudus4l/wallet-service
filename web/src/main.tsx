import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { AppProvider } from './lib/app';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

// The default only watches tab switches. Also refresh when returning from another window,
// so money received while the app sat beside another window shows up.
focusManager.setEventListener((onFocus) => {
  const refresh = () => onFocus();
  window.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
  return () => {
    window.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('focus', refresh);
  };
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <App />
        </AppProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
