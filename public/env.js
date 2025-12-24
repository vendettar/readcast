/**
 * Readio Runtime Configuration (Default)
 *
 * This file is intentionally committed to avoid a noisy 404 in the browser console.
 * To customize (e.g., set a self-hosted proxy), edit this file or replace it during deployment.
 *
 * See: `public/env.js.example`
 */

window.__READIO_ENV__ = window.__READIO_ENV__ || {
  // Prefer direct fetch; use proxy as fallback (default behavior).
  READIO_CORS_PROXY_PRIMARY: false,
};

