import { GALLERY_FEED_ALLOW_HOSTS, GALLERY_FEED_BLOCK_HOSTS, getHostFromUrl, isHostListed } from './galleryFeedLists.js';
import { getCorsProxyConfig } from './runtimeConfig.js';

export const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
export const ITUNES_LOOKUP_URL = 'https://itunes.apple.com/lookup';
export const APPLE_MARKETING_RSS_BASE_URL = 'https://rss.applemarketingtools.com/api/v2';
export const RECOMMENDED_STORAGE_PREFIX = 'readcastGalleryRecommendedV2:';
export const RECOMMENDED_TTL_MS = 24 * 60 * 60 * 1000;
export const RECOMMENDED_ITUNES_LIMIT = 10;
export const FEED_FETCHABILITY_CACHE_PREFIX = 'readcastGalleryFeedFetchabilityV1:';
export const FEED_FETCHABILITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const FEED_FETCHABILITY_TIMEOUT_MS = 5000;
export const APPLE_MARKETING_RSS_TIMEOUT_MS = 8000;
export const APPLE_MARKETING_RSS_DEFAULT_LIMIT = 50;
export const RSS_DIRECT_TIMEOUT_MS = 8000;
export const RSS_PROXY_TIMEOUT_MS = 15000;
export const APPLE_CHART_CACHE_PREFIX = 'readcastAppleTopPodcastsV1:';
export const APPLE_LOOKUP_CACHE_PREFIX = 'readcastAppleTopLookupV1:';
export const APPLE_CHART_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const APPLE_CHART_CACHE_PURGE_MS = 72 * 60 * 60 * 1000;

const DEFAULT_CORS_PROXY_BASE = 'https://api.allorigins.win';

export const RECOMMENDED_CATEGORY_IDS = [
    'news',
    'technology',
    'comedy',
    'education',
    'arts',
    'business',
    'fiction',
    'government',
    'health-fitness',
    'history',
    'kids-family',
    'leisure',
    'music',
    'religion-spirituality',
    'science',
    'society-culture',
    'sports',
    'true-crime',
    'tv-film'
];

export const GALLERY_COUNTRY_OPTIONS = [
    { code: 'us', label: 'US' },
    { code: 'cn', label: 'CN' },
    { code: 'jp', label: 'JP' },
    { code: 'kr', label: 'KR' },
    { code: 'de', label: 'DE' },
    { code: 'es', label: 'ES' },
    { code: 'sg', label: 'SG' }
];

export function debounce(fn, delayMs) {
    let timer = null;
    return (...args) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delayMs);
    };
}

export function safeJsonParse(value, fallback) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

export function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.trim();
}

function extractText(node) {
    if (!node) return '';
    return (node.textContent || '').trim();
}

function htmlToPlainText(html, { bullet = '• ' } = {}) {
    const raw = String(html || '').trim();
    if (!raw) return '';

    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
    if (!looksLikeHtml) return raw.replace(/\s+/g, ' ').trim();

    const withNewlines = raw
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/\s*p\s*>/gi, '\n')
        .replace(/<\s*\/\s*li\s*>/gi, '\n')
        .replace(/<\s*li(\s[^>]*)?>/gi, `${bullet}`)
        .replace(/<\/\s*(ul|ol)\s*>/gi, '\n')
        .replace(/<\/\s*h\d\s*>/gi, '\n')
        .replace(/<\/\s*div\s*>/gi, '\n');

    if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
        const el = document.createElement('div');
        el.innerHTML = withNewlines;
        const text = (el.textContent || '').replace(/\r/g, '').trim();
        return text
            .split('\n')
            .map((line) => line.replace(/[ \t]+/g, ' ').trim())
            .filter(Boolean)
            .join('\n');
    }

    return withNewlines
        .replace(/<[^>]*>/g, '')
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
}

export function parseCssPx(value) {
    const n = Number.parseFloat(String(value || '0'));
    return Number.isFinite(n) ? n : 0;
}

function estimateTextWidthPx(text) {
    const str = String(text || '');
    let width = 0;
    for (let i = 0; i < str.length; i += 1) {
        const ch = str[i];
        if (!ch) continue;
        if (ch === ' ') width += 4;
        else if (/[A-Z0-9]/.test(ch)) width += 8;
        else if (/[a-z]/.test(ch)) width += 7;
        else if (/[\u4e00-\u9fff]/.test(ch)) width += 12;
        else width += 8;
    }
    return width;
}

export function computeSelectWidthPx({
    text,
    font = '',
    paddingLeft = 0,
    paddingRight = 0,
    borderLeft = 0,
    borderRight = 0,
    extra = 28,
    min = 52,
    max = 420,
    measureContext = null
} = {}) {
    const label = String(text || '');
    let measured = 0;
    if (measureContext && typeof measureContext.measureText === 'function') {
        try {
            if (font) measureContext.font = font;
            measured = measureContext.measureText(label).width || 0;
        } catch {
            measured = 0;
        }
    }
    if (!measured) measured = estimateTextWidthPx(label);

    const raw = measured + paddingLeft + paddingRight + borderLeft + borderRight + extra;
    const clamped = Math.max(min, Math.min(max, Math.ceil(raw)));
    return clamped;
}

export function parseRss(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) {
        throw new Error('rss-parse-failed');
    }

    const channel = doc.querySelector('channel');
    const title = extractText(channel && channel.querySelector('title'));
    const description = htmlToPlainText(extractText(channel && channel.querySelector('description')));

    const itunesImage = channel ? channel.querySelector('itunes\\:image') : null;
    const fallbackImageUrl = normalizeUrl(extractText(channel && channel.querySelector('image > url')));
    const artworkUrl = normalizeUrl((itunesImage && itunesImage.getAttribute('href')) || fallbackImageUrl);

    const items = Array.from(doc.querySelectorAll('item'));
    const episodes = items
        .map((item) => {
            const enclosure = item.querySelector('enclosure');
            const audioUrl = enclosure ? normalizeUrl(enclosure.getAttribute('url')) : '';
            if (!audioUrl) return null;

            const guid = extractText(item.querySelector('guid')) || audioUrl;
            const epTitle = extractText(item.querySelector('title')) || audioUrl;
            const epDescriptionRaw =
                extractText(item.querySelector('itunes\\:summary')) ||
                extractText(item.querySelector('description')) ||
                extractText(item.querySelector('content\\:encoded'));
            const epDescription = htmlToPlainText(epDescriptionRaw);
            const pubDateRaw = extractText(item.querySelector('pubDate'));
            let pubDate = pubDateRaw;
            if (pubDateRaw) {
                const parsed = new Date(pubDateRaw);
                if (!Number.isNaN(parsed.getTime())) {
                    pubDate = parsed.toISOString().slice(0, 10);
                } else {
                    const short = pubDateRaw.split(',').pop().trim();
                    pubDate = short.replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '');
                }
            }

            return {
                id: guid,
                title: epTitle,
                description: epDescription,
                audioUrl,
                pubDate
            };
        })
        .filter(Boolean);

    return { title, description, artworkUrl, episodes };
}

export default class GalleryRemote {
    constructor() {
        this.appleChartCache = new Map();
        this.appleChartInflight = new Map();
        this.appleLookupCache = new Map();
        this.appleLookupInflight = new Map();
    }

    normalizeCustomProxyUrl(url) {
        const raw = String(url || '').trim();
        if (!raw) return '';
        return raw;
    }

    getCorsProxyProviders() {
        const { customUrl, customPrimary } = getCorsProxyConfig();
        const normalizedCustom = this.normalizeCustomProxyUrl(customUrl);
        const allorigins = { kind: 'allorigins', base: DEFAULT_CORS_PROXY_BASE };
        if (!normalizedCustom || normalizedCustom === DEFAULT_CORS_PROXY_BASE) return [allorigins];
        const custom = { kind: 'custom', base: normalizedCustom };
        return customPrimary ? [custom, allorigins] : [allorigins, custom];
    }

    buildCustomProxyUrl(customBase, targetUrl) {
        const base = String(customBase || '').trim();
        const encoded = encodeURIComponent(String(targetUrl || ''));
        if (!base) throw new Error('missing-custom-proxy');

        if (base.includes('{url}')) {
            return base.replaceAll('{url}', encoded);
        }

        // If the user already provided a "prefix" like `...?url=` just append.
        if (/([?&])url=$/i.test(base)) return `${base}${encoded}`;

        // If the user provided something like `...?url` or `...?url=...` we won't try to be smart.
        // Treat it as a base URL and append `url=` safely.
        if (base.includes('?')) return `${base}&url=${encoded}`;
        return `${base}?url=${encoded}`;
    }

    isGalleryDebugEnabled() {
        if (typeof localStorage === 'undefined') return false;
        try {
            return String(localStorage.getItem('readcastDebugGallery') || '') === '1';
        } catch {
            return false;
        }
    }

    debugGalleryLog(...args) {
        if (!this.isGalleryDebugEnabled()) return;
        console.log('[gallery]', ...args);
    }

    async fetchJsonWithProxy(url, { signal, timeoutMs = APPLE_MARKETING_RSS_TIMEOUT_MS } = {}) {
        const targetUrl = normalizeUrl(url);
        if (!targetUrl) throw new Error('missing-target-url');

        let parsed;
        try {
            parsed = new URL(targetUrl);
        } catch {
            throw new Error('invalid-target-url');
        }
        if (parsed.protocol !== 'https:') throw new Error('invalid-target-protocol');
        if (parsed.hostname !== 'rss.applemarketingtools.com') {
            throw new Error('proxy-disallowed-host');
        }

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

        const tryFetch = async (proxyUrl, { mode } = {}) => {
            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                credentials: 'omit'
            });
            if (!response.ok) {
                throw new Error(`proxy_http_${response.status}`);
            }
            const data = await response.json();
            if (mode === 'get') {
                const contents = data && typeof data.contents === 'string' ? data.contents : '';
                if (!contents) throw new Error('proxy_missing_contents');
                return JSON.parse(contents);
            }
            return data;
        };

        const encoded = encodeURIComponent(targetUrl);
        const providers = this.getCorsProxyProviders();

        try {
            let lastError = null;
            for (const provider of providers) {
                if (provider.kind === 'allorigins') {
                    const base = provider.base;
                    const proxyGet = `${base}/get?url=${encoded}`;
                    const proxyRaw = `${base}/raw?url=${encoded}`;

                    // `get` tends to be more reliable than `raw` for some upstream hosts.
                    try {
                        this.debugGalleryLog('proxy:json:start', { provider: 'allorigins', base, mode: 'get', targetUrl });
                        return await tryFetch(proxyGet, { mode: 'get' });
                    } catch (error) {
                        if (error && error.name === 'AbortError') throw error;
                        lastError = error;
                    }

                    try {
                        this.debugGalleryLog('proxy:json:fallback', {
                            provider: 'allorigins',
                            base,
                            mode: 'raw',
                            targetUrl,
                            error: String(lastError && lastError.message ? lastError.message : lastError)
                        });
                        return await tryFetch(proxyRaw, { mode: 'raw' });
                    } catch (error) {
                        if (error && error.name === 'AbortError') throw error;
                        lastError = error;
                    }
                    continue;
                }

                const proxyUrl = this.buildCustomProxyUrl(provider.base, targetUrl);
                try {
                    this.debugGalleryLog('proxy:json:start', { provider: 'custom', proxyUrl, targetUrl });
                    const response = await fetch(proxyUrl, { signal: controller.signal, credentials: 'omit' });
                    if (!response.ok) throw new Error(`proxy_http_${response.status}`);
                    const text = await response.text();
                    return JSON.parse(text);
                } catch (error) {
                    if (error && error.name === 'AbortError') throw error;
                    lastError = error;
                }
            }

            throw lastError || new Error('proxy_failed');
        } catch (error) {
            if (error && error.name === 'AbortError' && didTimeout) {
                throw Object.assign(new Error('timeout'), { name: 'AbortError' });
            }
            this.debugGalleryLog('proxy:json:error', {
                targetUrl,
                name: error && error.name,
                message: error && error.message
            });
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    getAppleChartCacheKey(country, limit) {
        const c = String(country || '').trim().toLowerCase() || 'us';
        const safeLimit = Number.isFinite(limit)
            ? Math.max(1, Math.min(limit, 200))
            : APPLE_MARKETING_RSS_DEFAULT_LIMIT;
        return `${APPLE_CHART_CACHE_PREFIX}${c}:${safeLimit}`;
    }

    readAppleChartCache(country, limit) {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(this.getAppleChartCacheKey(country, limit));
        const parsed = raw ? safeJsonParse(raw, null) : null;
        if (!parsed || typeof parsed !== 'object') return null;
        const at = typeof parsed.at === 'number' ? parsed.at : 0;
        if (!at) return null;
        const entries = Array.isArray(parsed.entries) ? parsed.entries : null;
        if (!entries) return null;
        return { at, entries };
    }

    writeAppleChartCache(country, limit, entries) {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(
                this.getAppleChartCacheKey(country, limit),
                JSON.stringify({
                    at: Date.now(),
                    entries: Array.isArray(entries) ? entries : []
                })
            );
            this.purgeStaleAppleCaches();
        } catch {
            // ignore
        }
    }

    getAppleLookupCacheKey(country, limit) {
        const c = String(country || '').trim().toLowerCase() || 'us';
        const safeLimit = Number.isFinite(limit)
            ? Math.max(1, Math.min(limit, 200))
            : APPLE_MARKETING_RSS_DEFAULT_LIMIT;
        return `${APPLE_LOOKUP_CACHE_PREFIX}${c}:${safeLimit}`;
    }

    readAppleLookupCache(country, limit, expectedIds) {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(this.getAppleLookupCacheKey(country, limit));
        const parsed = raw ? safeJsonParse(raw, null) : null;
        if (!parsed || typeof parsed !== 'object') return null;
        const at = typeof parsed.at === 'number' ? parsed.at : 0;
        if (!at) return null;
        const items = Array.isArray(parsed.items) ? parsed.items : null;
        const ids = Array.isArray(parsed.ids) ? parsed.ids : null;
        if (!items || !ids) return null;
        if (Array.isArray(expectedIds) && expectedIds.length > 0) {
            if (ids.length !== expectedIds.length) return null;
            for (let i = 0; i < ids.length; i += 1) {
                if (String(ids[i]) !== String(expectedIds[i])) return null;
            }
        }
        return { at, items };
    }

    writeAppleLookupCache(country, limit, ids, items) {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(
                this.getAppleLookupCacheKey(country, limit),
                JSON.stringify({
                    at: Date.now(),
                    ids: Array.isArray(ids) ? ids : [],
                    items: Array.isArray(items) ? items : []
                })
            );
            this.purgeStaleAppleCaches();
        } catch {
            // ignore
        }
    }

    purgeStaleAppleCaches() {
        if (typeof localStorage === 'undefined') return;
        let keys = [];
        try {
            keys = Object.keys(localStorage);
        } catch {
            return;
        }

        const now = Date.now();
        keys.forEach((key) => {
            if (
                typeof key !== 'string' ||
                (!key.startsWith(APPLE_CHART_CACHE_PREFIX) && !key.startsWith(APPLE_LOOKUP_CACHE_PREFIX))
            )
                return;
            try {
                const raw = localStorage.getItem(key);
                const parsed = raw ? safeJsonParse(raw, null) : null;
                const at = parsed && typeof parsed === 'object' ? parsed.at : 0;
                if (typeof at !== 'number' || !at) return;
                if (now - at <= APPLE_CHART_CACHE_PURGE_MS) return;
                localStorage.removeItem(key);
            } catch {
                // ignore
            }
        });
    }

    getAppleTopPodcastsUrl(country, limit) {
        const c = String(country || '').trim().toLowerCase() || 'us';
        const safeLimit = Number.isFinite(limit)
            ? Math.max(1, Math.min(limit, 200))
            : APPLE_MARKETING_RSS_DEFAULT_LIMIT;
        return `${APPLE_MARKETING_RSS_BASE_URL}/${encodeURIComponent(c)}/podcasts/top/${safeLimit}/podcasts.json`;
    }

    normalizeAppleChartEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;
        const id = entry.id ? String(entry.id).trim() : '';
        const title = entry.name ? String(entry.name).trim() : '';
        if (!id || !title) return null;

        const author = entry.artistName ? String(entry.artistName).trim() : '';
        const artworkUrl = entry.artworkUrl100 ? String(entry.artworkUrl100).trim() : '';
        const collectionViewUrl = entry.url ? String(entry.url).trim() : '';
        const genres = Array.isArray(entry.genres) ? entry.genres : [];
        const genreNames = genres
            .map((g) => (g && g.name ? String(g.name).trim() : ''))
            .filter(Boolean);
        const genreIds = genres
            .map((g) => (g && (g.genreId || g.id) ? String(g.genreId || g.id).trim() : ''))
            .filter(Boolean);

        return {
            appleId: id,
            title,
            author,
            artworkUrl,
            collectionViewUrl,
            genreNames,
            genreIds
        };
    }

    async fetchAppleTopPodcasts(country, { signal, limit = APPLE_MARKETING_RSS_DEFAULT_LIMIT } = {}) {
        const c = String(country || '').trim().toLowerCase() || 'us';
        const key = `appleTop:${c}:${limit}`;
        const cached = this.appleChartCache.get(key);
        if (cached) return cached;

        const inflight = this.appleChartInflight.get(key);
        if (inflight) return inflight;

        const run = (async () => {
            const local = this.readAppleChartCache(c, limit);
            const fresh = local && Date.now() - local.at <= APPLE_CHART_CACHE_TTL_MS ? local.entries : null;
            if (fresh) {
                this.appleChartCache.set(key, fresh);
                return fresh;
            }

            const stale = local && Array.isArray(local.entries) ? local.entries : null;
            try {
                const url = this.getAppleTopPodcastsUrl(c, limit);
                const data = await this.fetchJsonWithProxy(url, { signal });
                const results =
                    (data && data.feed && Array.isArray(data.feed.results) && data.feed.results) ||
                    (data && Array.isArray(data.results) && data.results) ||
                    [];
                const normalized = results
                    .map((item) => this.normalizeAppleChartEntry(item))
                    .filter(Boolean);
                this.writeAppleChartCache(c, limit, normalized);
                this.appleChartCache.set(key, normalized);
                return normalized;
            } catch (error) {
                if (error && error.name === 'AbortError') throw error;
                if (stale) {
                    this.appleChartCache.set(key, stale);
                    return stale;
                }
                throw error;
            }
        })();

        this.appleChartInflight.set(key, run);
        try {
            return await run;
        } finally {
            this.appleChartInflight.delete(key);
        }
    }

    async fetchItunesPodcastsByIds({ ids, country, signal } = {}) {
        const list = Array.isArray(ids) ? ids : [];
        const cleaned = list
            .map((id) => String(id || '').trim())
            .filter(Boolean);
        if (cleaned.length === 0) return [];

        const params = new URLSearchParams({
            id: cleaned.join(','),
            entity: 'podcast',
            country: String(country || 'us')
        });
        const url = `${ITUNES_LOOKUP_URL}?${params.toString()}`;
        const response = await fetch(url, { signal });
        const data = await response.json().catch(() => null);
        const results = Array.isArray(data && data.results) ? data.results : [];
        return results
            .map((item) => ({
                id: item.collectionId || item.trackId || item.feedUrl || '',
                title: item.collectionName || item.trackName || '',
                author: item.artistName || '',
                genre: item.primaryGenreName || '',
                artworkUrl: item.artworkUrl600 || item.artworkUrl100 || '',
                feedUrl: item.feedUrl || '',
                collectionViewUrl: item.collectionViewUrl || ''
            }))
            .filter((it) => it.id && it.title && it.feedUrl);
    }

    async fetchItunesPodcastsByIdsChunked({ ids, country, signal, chunkSize = 50 } = {}) {
        const list = Array.isArray(ids) ? ids : [];
        const cleaned = list
            .map((id) => String(id || '').trim())
            .filter(Boolean);
        if (cleaned.length === 0) return [];

        const results = [];
        for (let i = 0; i < cleaned.length; i += chunkSize) {
            if (signal && signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
            const chunk = cleaned.slice(i, i + chunkSize);
            const fetched = await this.fetchItunesPodcastsByIds({ ids: chunk, country, signal });
            results.push(...fetched);
        }
        return results;
    }

    async fetchAppleTopPodcastsWithLookup(country, { signal, limit = APPLE_MARKETING_RSS_DEFAULT_LIMIT } = {}) {
        const c = String(country || '').trim().toLowerCase() || 'us';
        const key = `appleTopLookup:${c}:${limit}`;
        const cached = this.appleLookupCache.get(key);
        if (cached) return cached;

        const inflight = this.appleLookupInflight.get(key);
        if (inflight) return inflight;

        const run = (async () => {
            const chart = await this.fetchAppleTopPodcasts(c, { signal, limit });
            const ids = chart.map((entry) => entry.appleId).filter(Boolean);
            if (ids.length === 0) return [];

            const local = this.readAppleLookupCache(c, limit, ids);
            const fresh = local && Date.now() - local.at <= APPLE_CHART_CACHE_TTL_MS ? local.items : null;
            if (fresh) {
                this.appleLookupCache.set(key, fresh);
                return fresh;
            }

            const stale = local && Array.isArray(local.items) ? local.items : null;
            try {
                const lookedUp = await this.fetchItunesPodcastsByIdsChunked({
                    ids,
                    country: c,
                    signal
                });
                const byAppleId = new Map(lookedUp.map((p) => [String(p.id), p]));
                const orderIndex = new Map(chart.map((entry, idx) => [String(entry.appleId), idx]));
                const genreIndex = new Map(chart.map((entry) => [String(entry.appleId), entry]));
                const ordered = [];
                chart.forEach((entry) => {
                    const found = byAppleId.get(String(entry.appleId));
                    if (!found) return;
                    const meta = genreIndex.get(String(entry.appleId));
                    ordered.push({
                        ...found,
                        appleRank: orderIndex.get(String(entry.appleId)) ?? 0,
                        genreNames: meta && Array.isArray(meta.genreNames) ? meta.genreNames : [],
                        genreIds: meta && Array.isArray(meta.genreIds) ? meta.genreIds : []
                    });
                });
                this.writeAppleLookupCache(c, limit, ids, ordered);
                this.appleLookupCache.set(key, ordered);
                return ordered;
            } catch (error) {
                if (error && error.name === 'AbortError') throw error;
                if (stale) {
                    this.appleLookupCache.set(key, stale);
                    return stale;
                }
                throw error;
            }
        })();

        this.appleLookupInflight.set(key, run);
        try {
            return await run;
        } finally {
            this.appleLookupInflight.delete(key);
        }
    }

    matchesGenreTokens(genreNames, term) {
        const raw = String(term || '').trim();
        if (!raw) return true;
        const tokens = raw
            .toLowerCase()
            .split(/\s+/g)
            .map((t) => t.trim())
            .filter(Boolean);
        if (tokens.length === 0) return true;

        const names = Array.isArray(genreNames) ? genreNames : [];
        return names.some((name) => {
            const hay = String(name || '').toLowerCase();
            if (!hay) return false;
            return tokens.every((token) => hay.includes(token));
        });
    }

    async fetchRecommendedCandidates({ category, country, signal, limit = APPLE_MARKETING_RSS_DEFAULT_LIMIT } = {}) {
        const c = String(country || '').trim().toLowerCase() || 'us';
        const term = category && category.term ? String(category.term) : '';

        try {
            const pool = await this.fetchAppleTopPodcastsWithLookup(c, { signal, limit });
            if (pool.length === 0) throw new Error('empty-chart');
            const matched = pool.filter((entry) => this.matchesGenreTokens(entry.genreNames, term));
            if (matched.length > 0) return matched;
        } catch (error) {
            if (error && error.name === 'AbortError') throw error;
        }

        return [];
    }

    getFeedFetchabilityCacheKey(country) {
        const c = String(country || '').trim().toLowerCase() || 'us';
        return `${FEED_FETCHABILITY_CACHE_PREFIX}${c}`;
    }

    loadFeedFetchabilityCache(country) {
        if (typeof localStorage === 'undefined') return {};
        const raw = localStorage.getItem(this.getFeedFetchabilityCacheKey(country));
        const parsed = raw ? safeJsonParse(raw, {}) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    }

    saveFeedFetchabilityCache(country, cache) {
        if (typeof localStorage === 'undefined') return;
        const pruned = {};
        const now = Date.now();
        Object.entries(cache || {}).forEach(([key, entry]) => {
            if (!entry || typeof entry !== 'object') return;
            const checkedAt = typeof entry.checkedAt === 'number' ? entry.checkedAt : 0;
            if (!checkedAt || now - checkedAt > FEED_FETCHABILITY_TTL_MS) return;
            pruned[key] = {
                ok: Boolean(entry.ok),
                checkedAt,
                reason: typeof entry.reason === 'string' ? entry.reason : ''
            };
        });
        try {
            localStorage.setItem(this.getFeedFetchabilityCacheKey(country), JSON.stringify(pruned));
        } catch {
            // ignore
        }
    }

    getFeedFetchabilityStatus(country, feedUrl) {
        const key = normalizeUrl(feedUrl);
        if (!key) return null;
        const cache = this.loadFeedFetchabilityCache(country);
        const entry = cache[key];
        if (!entry || typeof entry !== 'object') return null;
        const checkedAt = typeof entry.checkedAt === 'number' ? entry.checkedAt : 0;
        if (!checkedAt || Date.now() - checkedAt > FEED_FETCHABILITY_TTL_MS) return null;
        return {
            ok: Boolean(entry.ok),
            reason: typeof entry.reason === 'string' ? entry.reason : ''
        };
    }

    setFeedFetchabilityStatus(country, feedUrl, ok, reason = '') {
        const key = normalizeUrl(feedUrl);
        if (!key) return;
        const cache = this.loadFeedFetchabilityCache(country);
        cache[key] = { ok: Boolean(ok), checkedAt: Date.now(), reason: String(reason || '') };
        this.saveFeedFetchabilityCache(country, cache);
    }

    async fetchTextWithAllOrigins(targetUrl, { signal, timeoutMs = RSS_PROXY_TIMEOUT_MS } = {}) {
        const url = normalizeUrl(targetUrl);
        if (!url) throw new Error('missing-target-url');
        let parsed;
        try {
            parsed = new URL(url);
        } catch {
            throw new Error('invalid-target-url');
        }
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            throw new Error('invalid-target-protocol');
        }

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

        const encoded = encodeURIComponent(url);
        const providers = this.getCorsProxyProviders();

        try {
            let lastError = null;
            for (const provider of providers) {
                if (provider.kind === 'allorigins') {
                    const base = provider.base;
                    const proxyGet = `${base}/get?url=${encoded}`;
                    const proxyRaw = `${base}/raw?url=${encoded}`;

                    // Prefer `get` because it tends to be more reliable.
                    try {
                        const startedAt = Date.now();
                        this.debugGalleryLog('proxy:rss:start', { provider: 'allorigins', base, mode: 'get', url });
                        const response = await fetch(proxyGet, { signal: controller.signal, credentials: 'omit' });
                        if (!response.ok) throw new Error(`proxy_http_${response.status}`);
                        const data = await response.json();
                        const contents = data && typeof data.contents === 'string' ? data.contents : '';
                        if (!contents) throw new Error('proxy_missing_contents');
                        this.debugGalleryLog('proxy:rss:ok', {
                            provider: 'allorigins',
                            base,
                            mode: 'get',
                            url,
                            ms: Date.now() - startedAt,
                            bytes: contents.length
                        });
                        return contents;
                    } catch (error) {
                        if (error && error.name === 'AbortError') throw error;
                        lastError = error;
                    }

                    try {
                        const startedAt = Date.now();
                        this.debugGalleryLog('proxy:rss:fallback', {
                            provider: 'allorigins',
                            base,
                            mode: 'raw',
                            url,
                            error: String(lastError && lastError.message ? lastError.message : lastError)
                        });
                        const response = await fetch(proxyRaw, { signal: controller.signal, credentials: 'omit' });
                        if (!response.ok) throw new Error(`proxy_http_${response.status}`);
                        const text = await response.text();
                        this.debugGalleryLog('proxy:rss:ok', {
                            provider: 'allorigins',
                            base,
                            mode: 'raw',
                            url,
                            ms: Date.now() - startedAt,
                            bytes: text.length
                        });
                        return text;
                    } catch (error) {
                        if (error && error.name === 'AbortError') throw error;
                        lastError = error;
                    }
                    continue;
                }

                const proxyUrl = this.buildCustomProxyUrl(provider.base, url);
                try {
                    const startedAt = Date.now();
                    this.debugGalleryLog('proxy:rss:start', { provider: 'custom', proxyUrl, url });
                    const response = await fetch(proxyUrl, { signal: controller.signal, credentials: 'omit' });
                    if (!response.ok) throw new Error(`proxy_http_${response.status}`);
                    const text = await response.text();
                    this.debugGalleryLog('proxy:rss:ok', {
                        provider: 'custom',
                        proxyUrl,
                        url,
                        ms: Date.now() - startedAt,
                        bytes: text.length
                    });
                    return text;
                } catch (error) {
                    if (error && error.name === 'AbortError') throw error;
                    lastError = error;
                }
            }

            throw lastError || new Error('proxy_failed');
        } catch (error) {
            if (error && error.name === 'AbortError' && didTimeout) {
                throw Object.assign(new Error('timeout'), { name: 'AbortError' });
            }
            this.debugGalleryLog('proxy:rss:error', {
                url,
                name: error && error.name,
                message: error && error.message
            });
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async fetchTextDirect(url, { signal, timeoutMs = RSS_DIRECT_TIMEOUT_MS } = {}) {
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

        try {
            const startedAt = Date.now();
            this.debugGalleryLog('direct:rss:start', { url, timeoutMs });
            const response = await fetch(url, {
                signal: controller.signal,
                credentials: 'omit',
                redirect: 'follow',
                headers: {
                    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
                }
            });
            if (!response.ok) {
                throw new Error(`http_${response.status}`);
            }
            const text = await response.text();
            this.debugGalleryLog('direct:rss:ok', {
                url,
                ms: Date.now() - startedAt,
                bytes: text.length
            });
            return text;
        } catch (error) {
            if (error && error.name === 'AbortError' && didTimeout) {
                throw Object.assign(new Error('timeout'), { name: 'AbortError' });
            }
            this.debugGalleryLog('direct:rss:error', {
                url,
                name: error && error.name,
                message: error && error.message
            });
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async validateFeedFetchable(country, feedUrl, signal) {
        const url = normalizeUrl(feedUrl);
        if (!url) return false;

        const cached = this.getFeedFetchabilityStatus(country, url);
        if (cached !== null) return Boolean(cached.ok);

        const host = getHostFromUrl(url);
        if (host && isHostListed(host, GALLERY_FEED_BLOCK_HOSTS)) {
            this.setFeedFetchabilityStatus(country, url, false, 'blocklisted');
            return false;
        }
        const isAllowlistedHost = host && isHostListed(host, GALLERY_FEED_ALLOW_HOSTS);

        try {
            try {
                const xmlText = await this.fetchTextDirect(url, { signal, timeoutMs: RSS_DIRECT_TIMEOUT_MS });
                parseRss(xmlText);
                this.setFeedFetchabilityStatus(
                    country,
                    url,
                    true,
                    isAllowlistedHost ? 'ok_allowlisted' : 'ok_direct'
                );
                return true;
            } catch (error) {
                if (error && error.name === 'AbortError') {
                    // If caller aborted, propagate. If we timed out, try proxy before giving up.
                    if (signal && signal.aborted && error.message !== 'timeout') throw error;
                    if (error.message !== 'timeout') {
                        this.setFeedFetchabilityStatus(country, url, false, 'aborted');
                        return false;
                    }
                }

                // Likely CORS / network errors: try via proxy.
                const xmlText = await this.fetchTextWithAllOrigins(url, { signal, timeoutMs: RSS_PROXY_TIMEOUT_MS });
                parseRss(xmlText);
                this.setFeedFetchabilityStatus(
                    country,
                    url,
                    true,
                    isAllowlistedHost ? 'ok_allowlisted' : 'ok_proxy'
                );
                return true;
            }
        } catch (error) {
            if (error && error.name === 'AbortError') {
                if (signal && signal.aborted && error.message !== 'timeout') throw error;
                this.setFeedFetchabilityStatus(country, url, false, error.message === 'timeout' ? 'timeout' : 'aborted');
                return false;
            }
            const message = String(error && error.message ? error.message : '');
            if (message.startsWith('proxy_http_')) {
                this.setFeedFetchabilityStatus(country, url, false, message);
                return false;
            }
            this.setFeedFetchabilityStatus(country, url, false, 'fetch_failed');
            return false;
        }
    }

    getRecommendedCacheKey(country, lang) {
        const c = String(country || '').trim().toLowerCase() || 'us';
        const l = String(lang || '').trim().toLowerCase() || 'en';
        return `${RECOMMENDED_STORAGE_PREFIX}${c}:${l}`;
    }

    readRecommendedCache(country, lang) {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(this.getRecommendedCacheKey(country, lang));
        const parsed = raw ? safeJsonParse(raw, null) : null;
        if (!parsed || typeof parsed !== 'object') return null;
        const at = typeof parsed.at === 'number' ? parsed.at : 0;
        if (!at || Date.now() - at > RECOMMENDED_TTL_MS) return null;
        const groups = Array.isArray(parsed.groups) ? parsed.groups : null;
        if (groups) return groups;
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        if (items.length === 0) return [];
        return [
            {
                id: 'recommended',
                label: 'Recommended',
                term: '',
                items
            }
        ];
    }

    writeRecommendedCache(country, lang, groups) {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(
                this.getRecommendedCacheKey(country, lang),
                JSON.stringify({
                    at: Date.now(),
                    groups: Array.isArray(groups) ? groups : []
                })
            );
        } catch {
            // ignore
        }
    }

    async fetchItunesPodcastsForTerm({ term, country, signal, limit = RECOMMENDED_ITUNES_LIMIT } = {}) {
        const params = new URLSearchParams({
            media: 'podcast',
            entity: 'podcast',
            limit: String(limit),
            country: String(country || 'us'),
            term: String(term || '')
        });
        const url = `${ITUNES_SEARCH_URL}?${params.toString()}`;
        const response = await fetch(url, { signal });
        const data = await response.json().catch(() => null);
        const results = Array.isArray(data && data.results) ? data.results : [];
        return results
            .map((item) => ({
                id: item.collectionId || item.trackId || item.feedUrl || '',
                title: item.collectionName || item.trackName || '',
                author: item.artistName || '',
                genre: item.primaryGenreName || '',
                artworkUrl: item.artworkUrl600 || item.artworkUrl100 || '',
                feedUrl: item.feedUrl || '',
                collectionViewUrl: item.collectionViewUrl || ''
            }))
            .filter((it) => it.id && it.title && it.feedUrl);
    }

    async performSearch({ term, country, signal } = {}) {
        const q = String(term || '').trim();
        if (!q) return [];
        const results = await this.fetchItunesPodcastsForTerm({ term: q, country, signal, limit: 25 });
        return results.map((item) => ({ ...item, description: '' }));
    }

    async fetchAndParseFeed({ feedUrl, signal } = {}) {
        const url = normalizeUrl(feedUrl);
        if (!url) throw new Error('missing-feed-url');
        try {
            const xmlText = await this.fetchTextDirect(url, { signal, timeoutMs: RSS_DIRECT_TIMEOUT_MS });
            return parseRss(xmlText);
        } catch (error) {
            if (error && error.name === 'AbortError') {
                // If the user aborted, propagate. If it was a timeout, try proxy before failing.
                if (signal && signal.aborted && error.message !== 'timeout') throw error;
                if (error.message !== 'timeout') throw error;
            }
        }

        const xmlText = await this.fetchTextWithAllOrigins(url, { signal, timeoutMs: RSS_PROXY_TIMEOUT_MS });
        return parseRss(xmlText);
    }

    async pickCorsAllowedRecommended(country, items, { signal, desired = 3, seen = null, validate = null } = {}) {
        const candidates = Array.isArray(items) ? items : [];
        const picked = [];
        const preferred = [];
        const unknown = [];

        const tryPick = (item) => {
            if (!item || picked.length >= desired) return;
            const feedUrl = normalizeUrl(item.feedUrl);
            if (!feedUrl) return;
            const feedKey = feedUrl.toLowerCase();
            if (seen && seen.has(feedKey)) return;
            picked.push(item);
            if (seen) seen.add(feedKey);
        };

        candidates.forEach((item) => {
            const feedUrl = normalizeUrl(item && item.feedUrl);
            if (!feedUrl) return;
            const feedKey = feedUrl.toLowerCase();
            if (seen && seen.has(feedKey)) return;

            const status = this.getFeedFetchabilityStatus(country, feedUrl);
            if (status && status.ok === true) {
                tryPick(item);
                return;
            }
            if (status && status.ok === false) return;

            const host = getHostFromUrl(feedUrl);
            if (host && isHostListed(host, GALLERY_FEED_BLOCK_HOSTS)) return;

            if (host && isHostListed(host, GALLERY_FEED_ALLOW_HOSTS)) {
                preferred.push(item);
            } else {
                unknown.push(item);
            }
        });

        if (picked.length >= desired) return picked.slice(0, desired);

        const queue = preferred.concat(unknown);
        let cursor = 0;
        const workers = Math.min(3, queue.length);
        const validateFn = typeof validate === 'function' ? validate : (feedUrl) => this.validateFeedFetchable(country, feedUrl, signal);
        const runWorker = async () => {
            while (cursor < queue.length && picked.length < desired) {
                if (signal && signal.aborted) return;
                const current = queue[cursor];
                cursor += 1;
                const ok = await validateFn(current.feedUrl, signal);
                if (!ok) continue;
                tryPick(current);
            }
        };
        await Promise.all(Array.from({ length: workers }, () => runWorker()));
        return picked.slice(0, desired);
    }
}
