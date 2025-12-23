// src/libs/fetchUtils.ts
// Unified fetch utilities with direct → proxy fallback

import { log } from './logger';

const DEFAULT_CORS_PROXY = 'https://api.allorigins.win';
const DEFAULT_TIMEOUT_MS = 15000;

// Runtime config interface (can be set by index.html or /env.js)
declare global {
    interface Window {
        __READCAST_ENV__?: {
            READCAST_CORS_PROXY_URL?: string;
            READCAST_CORS_PROXY_PRIMARY?: boolean | string;
        };
    }
}

function parseBoolean(value: unknown, fallback: boolean = false): boolean {
    if (typeof value === 'boolean') return value;
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return fallback;
    if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false;
    return fallback;
}

/**
 * Normalize custom proxy URL: remove trailing slash
 */
function normalizeCustomProxyUrl(url: string): string {
    const trimmed = String(url || '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/\/+$/, '');
}

export function getCorsProxyConfig(): { proxyUrl: string; proxyPrimary: boolean } {
    const env = (typeof window !== 'undefined' && window.__READCAST_ENV__) || {};
    const customUrl = normalizeCustomProxyUrl(env.READCAST_CORS_PROXY_URL || '');
    const customPrimary = parseBoolean(env.READCAST_CORS_PROXY_PRIMARY, false);

    return {
        proxyUrl: customUrl || DEFAULT_CORS_PROXY,
        proxyPrimary: customPrimary,
    };
}

export type ProxyHealthResult =
    | {
        ok: true;
        proxyUrl: string;
        proxyType: 'allorigins' | 'custom';
        targetUrl: string;
        elapsedMs: number;
        at: number;
    }
    | {
        ok: false;
        proxyUrl: string;
        proxyType: 'allorigins' | 'custom';
        targetUrl: string;
        elapsedMs: number;
        at: number;
        error: string;
        status?: number;
    };

/**
 * Build proxy URL supporting three formats:
 * 1. Template: contains `{url}` placeholder, e.g. `https://proxy.example.com/?target={url}`
 * 2. Prefix: ends with `?url=` or `&url=`, e.g. `https://proxy.example.com/get?url=`
 * 3. Base: auto-append `?url=` or `&url=`, e.g. `https://proxy.example.com/get`
 */
function buildProxyUrl(proxyBase: string, targetUrl: string): string {
    const base = String(proxyBase || '').trim();
    const encoded = encodeURIComponent(String(targetUrl || ''));

    if (!base) throw new Error('Missing proxy base URL');

    // Template format: contains {url}
    if (base.includes('{url}')) {
        return base.split('{url}').join(encoded);
    }

    // Prefix format: ends with ?url= or &url=
    if (/([?&])url=$/i.test(base)) {
        return `${base}${encoded}`;
    }

    // Base format: auto-append
    if (base.includes('?')) {
        return `${base}&url=${encoded}`;
    }
    return `${base}?url=${encoded}`;
}

// For allorigins specifically, we use /get?url= format
function buildAlloriginsUrl(proxyBase: string, targetUrl: string): string {
    const encoded = encodeURIComponent(String(targetUrl || ''));
    return `${proxyBase}/get?url=${encoded}`;
}

async function fetchViaProxy(
    proxyBase: string,
    targetUrl: string,
    signal: AbortSignal
): Promise<{ proxyType: 'allorigins' | 'custom'; status?: number }> {
    const isAllorigins = proxyBase === DEFAULT_CORS_PROXY;
    const finalUrl = isAllorigins
        ? buildAlloriginsUrl(proxyBase, targetUrl)
        : buildProxyUrl(proxyBase, targetUrl);

    const response = await fetch(finalUrl, { signal, credentials: 'omit' });
    if (!response.ok) {
        return { proxyType: isAllorigins ? 'allorigins' : 'custom', status: response.status };
    }

    // Allorigins /get returns JSON { contents } and we must ensure it's parseable.
    if (isAllorigins) {
        const data = await response.json();
        const contents = data?.contents;
        if (typeof contents !== 'string' || contents.length === 0) {
            throw new Error('Invalid allorigins response');
        }
    } else {
        // Custom proxy: assume raw content; only check non-empty body.
        const text = await response.text();
        if (!text) throw new Error('Empty proxy response');
    }

    return { proxyType: isAllorigins ? 'allorigins' : 'custom' };
}

export async function checkCorsProxyHealth(options?: {
    targetUrl?: string;
    timeoutMs?: number;
}): Promise<ProxyHealthResult> {
    const { proxyUrl } = getCorsProxyConfig();
    const targetUrl = options?.targetUrl || 'https://example.com/';
    const timeoutMs = options?.timeoutMs ?? 8000;
    const at = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const start = performance.now();
    try {
        const result = await fetchViaProxy(proxyUrl, targetUrl, controller.signal);
        const elapsedMs = Math.round(performance.now() - start);

        if (result.status && result.status >= 400) {
            return {
                ok: false,
                proxyUrl,
                proxyType: result.proxyType,
                targetUrl,
                elapsedMs,
                at,
                status: result.status,
                error: `HTTP ${result.status}`,
            };
        }

        return {
            ok: true,
            proxyUrl,
            proxyType: result.proxyType,
            targetUrl,
            elapsedMs,
            at,
        };
    } catch (err) {
        const elapsedMs = Math.round(performance.now() - start);
        const message =
            err instanceof Error
                ? (err.name === 'AbortError' ? 'Timeout' : err.message)
                : 'Unknown error';

        const isAllorigins = proxyUrl === DEFAULT_CORS_PROXY;
        return {
            ok: false,
            proxyUrl,
            proxyType: isAllorigins ? 'allorigins' : 'custom',
            targetUrl,
            elapsedMs,
            at,
            error: message,
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

export interface FetchWithFallbackOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
    /** If true, response is JSON; otherwise text */
    json?: boolean;
}

/**
 * Fetch with direct → proxy fallback (or proxy → direct if proxyPrimary)
 * Returns the response as text or JSON based on options
 */
export async function fetchWithFallback<T = string>(
    url: string,
    options: FetchWithFallbackOptions = {}
): Promise<T> {
    const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, json = false } = options;
    const { proxyUrl, proxyPrimary } = getCorsProxyConfig();

    const controller = new AbortController();
    let didTimeout = false;

    const timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort();
    }, timeoutMs);

    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const internalSignal = controller.signal;

    // Determine if we're using allorigins or custom proxy
    const isAllorigins = proxyUrl === DEFAULT_CORS_PROXY;

    const fetchDirect = async (): Promise<T> => {
        const response = await fetch(url, {
            signal: internalSignal,
            credentials: 'omit',
        });
        if (!response.ok) throw new Error(`Direct fetch failed: ${response.status}`);
        return json ? response.json() : (response.text() as unknown as T);
    };

    const fetchProxy = async (): Promise<T> => {
        // Use appropriate URL builder based on proxy type
        const finalProxyUrl = isAllorigins
            ? buildAlloriginsUrl(proxyUrl, url)
            : buildProxyUrl(proxyUrl, url);

        const response = await fetch(finalProxyUrl, {
            signal: internalSignal,
            credentials: 'omit',
        });
        if (!response.ok) throw new Error(`Proxy fetch failed: ${response.status}`);

        // Allorigins returns JSON with contents field
        if (isAllorigins) {
            const data = await response.json();
            const contents = data?.contents;

            if (json) {
                try {
                    return JSON.parse(contents) as T;
                } catch {
                    if (!contents) throw new Error('Empty response from proxy');
                    return contents as T;
                }
            }

            return contents as T;
        }

        // Custom proxy: assume it returns raw content
        return json ? response.json() : (response.text() as unknown as T);
    };

    try {
        // Determine order based on proxyPrimary
        const primaryFetch = proxyPrimary ? fetchProxy : fetchDirect;
        const fallbackFetch = proxyPrimary ? fetchDirect : fetchProxy;

        try {
            return await primaryFetch();
        } catch (primaryError) {
            // If primary failed (not abort), try fallback
            if (primaryError instanceof Error && primaryError.name === 'AbortError') {
                throw primaryError;
            }
            log(`[fetchWithFallback] Primary failed, trying fallback:`, primaryError);
            return await fallbackFetch();
        }
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError' && didTimeout) {
            throw new Error('Request timeout');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Fetch JSON with fallback (convenience wrapper)
 */
export async function fetchJsonWithFallback<T>(
    url: string,
    options: Omit<FetchWithFallbackOptions, 'json'> = {}
): Promise<T> {
    return fetchWithFallback<T>(url, { ...options, json: true });
}

/**
 * Fetch text (RSS/XML) with fallback
 */
export async function fetchTextWithFallback(
    url: string,
    options: Omit<FetchWithFallbackOptions, 'json'> = {}
): Promise<string> {
    return fetchWithFallback<string>(url, { ...options, json: false });
}
