function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
}

export function getCorsProxyConfig() {
  const env =
    (typeof window !== 'undefined' &&
      window.__READCAST_ENV__ &&
      typeof window.__READCAST_ENV__ === 'object' &&
      window.__READCAST_ENV__) ||
    {};

  const customUrl = String(env.READCAST_CORS_PROXY_URL || '').trim();
  const customPrimary = parseBoolean(env.READCAST_CORS_PROXY_PRIMARY, false);

  return {
    customUrl,
    customPrimary,
  };
}
