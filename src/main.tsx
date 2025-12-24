import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { I18nProvider } from './hooks/useI18n'
import { RootErrorBoundary } from './components/RootErrorBoundary'
import { DB } from './libs/dexieDb'
import { router } from './router'
import './index.css'
import './styles/original.css'
import './styles/overrides.css'
import './styles/gallery.css'
import './styles/localfiles.css'

declare global {
  interface Window {
    __READIO_TEST__?: {
      router: typeof router;
      clearAppData: () => Promise<void>;
    }
  }
}

if (import.meta.env.DEV) {
  window.__READIO_TEST__ = {
    router,
    clearAppData: async () => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch { /* ignore */ }
      try {
        await DB.clearAllData();
      } catch {
        // best-effort
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

