import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { I18nProvider } from './hooks/useI18n'
import { RootErrorBoundary } from './components/RootErrorBoundary'
import { DB } from './libs/dexieDb'
import { router } from './router'
import './index.css'

declare global {
  interface Window {
    __READCAST_TEST__?: {
      clearAppData: () => Promise<void>;
    };
  }
}

if (import.meta.env.DEV && import.meta.env.VITE_E2E === '1') {
  window.__READCAST_TEST__ = {
    clearAppData: async () => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch { /* ignore */ }
      try {
        await DB.clearAllData();
      } catch {
        // best-effort (may fail if blocked by other tabs)
      }
    },
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <RootErrorBoundary>
        <RouterProvider router={router} />
      </RootErrorBoundary>
    </I18nProvider>
  </StrictMode>,
)

