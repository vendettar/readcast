// src/libs/galleryApi.ts
// iTunes API + RSS Parsing + CORS Proxy

import { fetchJsonWithFallback, fetchTextWithFallback } from './fetchUtils';
import { deduplicatedFetch, getRequestKey } from './requestManager';
import { error as logError } from './logger';

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';

// Search cache configuration
const SEARCH_MEMORY_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SEARCH_STORAGE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SEARCH_NEGATIVE_TTL_MS = 10 * 60 * 1000; // 10 minutes for empty/failed results
const SEARCH_CACHE_PREFIX = 'readcastSearchV1:';
const SEARCH_CACHE_MAX_ENTRIES = 80;

// In-memory cache
const memoryCache = new Map<string, { data: Podcast[]; at: number }>();
// Negative cache for empty/failed searches (shorter TTL)
const negativeCache = new Map<string, number>();

export interface Podcast {
    collectionId: number;
    collectionName: string;
    artistName: string;
    artworkUrl100: string;
    artworkUrl600: string;
    feedUrl: string;
    collectionViewUrl: string;
    genres: string[];
}

export interface Episode {
    id: string;
    title: string;
    description: string;
    audioUrl: string;
    pubDate: string;
}

export interface ParsedFeed {
    title: string;
    description: string;
    artworkUrl: string;
    episodes: Episode[];
}

// ========== Search Cache Utilities ==========

function normalizeSearchKey(query: string, country: string): string {
    return `${query.toLowerCase().trim()}:${country.toLowerCase()}`;
}

function readMemoryCache(key: string): Podcast[] | null {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > SEARCH_MEMORY_TTL_MS) {
        memoryCache.delete(key);
        return null;
    }
    return entry.data;
}

function writeMemoryCache(key: string, data: Podcast[]): void {
    // Limit memory cache size
    if (memoryCache.size >= SEARCH_CACHE_MAX_ENTRIES) {
        const oldestKey = memoryCache.keys().next().value;
        if (oldestKey) memoryCache.delete(oldestKey);
    }
    memoryCache.set(key, { data, at: Date.now() });
}

function readStorageCache(key: string): Podcast[] | null {
    try {
        const storageKey = `${SEARCH_CACHE_PREFIX}${key}`;
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed.data || Date.now() - parsed.at > SEARCH_STORAGE_TTL_MS) {
            return null;
        }
        return parsed.data;
    } catch {
        return null;
    }
}

function writeStorageCache(key: string, data: Podcast[]): void {
    try {
        const storageKey = `${SEARCH_CACHE_PREFIX}${key}`;
        localStorage.setItem(storageKey, JSON.stringify({
            data,
            at: Date.now()
        }));
    } catch (err) {
        logError('[GalleryApi] Failed to write search cache:', err);
    }
}

// ========== iTunes Search ==========

interface ITunesSearchResponse {
    resultCount: number;
    results: ITunesResult[];
}

interface ITunesResult {
    collectionId?: number;
    collectionName?: string;
    artistName?: string;
    artworkUrl100?: string;
    artworkUrl600?: string;
    feedUrl?: string;
    collectionViewUrl?: string;
    genres?: string[];
}

export async function searchPodcasts(
    query: string,
    country: string = 'us',
    limit: number = 20,
    signal?: AbortSignal
): Promise<Podcast[]> {
    const cacheKey = normalizeSearchKey(query, country);

    // Check negative cache first (empty/failed results with short TTL)
    const negativeAt = negativeCache.get(cacheKey);
    if (negativeAt && Date.now() - negativeAt < SEARCH_NEGATIVE_TTL_MS) {
        return [];
    }

    // Check memory cache first
    const memoryCached = readMemoryCache(cacheKey);
    if (memoryCached) return memoryCached;

    // Check localStorage cache
    const storageCached = readStorageCache(cacheKey);
    if (storageCached) {
        writeMemoryCache(cacheKey, storageCached);
        return storageCached;
    }

    const params = new URLSearchParams({
        term: query,
        country: country,
        media: 'podcast',
        limit: String(limit),
    });

    const url = `${ITUNES_SEARCH_URL}?${params}`;
    const requestKey = getRequestKey(url);

    try {
        // Use deduplicated fetch
        const results = await deduplicatedFetch<Podcast[]>(
            requestKey,
            async (fetchSignal) => {
                // Combine signals
                const controller = new AbortController();
                if (signal) {
                    signal.addEventListener('abort', () => controller.abort());
                }
                fetchSignal.addEventListener('abort', () => controller.abort());

                const data = await fetchJsonWithFallback<ITunesSearchResponse>(url, {
                    signal: controller.signal
                });

                return (data.results || []).map((item: ITunesResult) => ({
                    collectionId: item.collectionId || 0,
                    collectionName: item.collectionName || '',
                    artistName: item.artistName || '',
                    artworkUrl100: item.artworkUrl100 || '',
                    artworkUrl600: item.artworkUrl600 || '',
                    feedUrl: item.feedUrl || '',
                    collectionViewUrl: item.collectionViewUrl || '',
                    genres: item.genres || [],
                }));
            }
        );

        // Cache the results (or negative cache if empty)
        if (results.length === 0) {
            // Empty results: use shorter negative cache TTL
            negativeCache.set(cacheKey, Date.now());
        } else {
            // Clear any negative cache entry
            negativeCache.delete(cacheKey);
            writeMemoryCache(cacheKey, results);
            writeStorageCache(cacheKey, results);
        }

        return results;
    } catch (error) {
        // Log failure and cache it negatively to avoid rapid retries
        negativeCache.set(cacheKey, Date.now());
        throw error;
    }
}

// ========== RSS Parsing ==========

function extractText(node: Element | null): string {
    if (!node) return '';
    return (node.textContent || '').trim();
}

function htmlToPlainText(html: string): string {
    const raw = String(html || '').trim();
    if (!raw) return '';

    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(raw);
    if (!looksLikeHtml) return raw.replace(/\s+/g, ' ').trim();

    const el = document.createElement('div');
    el.innerHTML = raw;
    return (el.textContent || '').trim();
}

export function parseRss(xmlText: string): ParsedFeed {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    if (doc.querySelector('parsererror')) {
        throw new Error('RSS parse failed');
    }

    const channel = doc.querySelector('channel');
    const title = extractText(channel?.querySelector('title') || null);
    const description = htmlToPlainText(extractText(channel?.querySelector('description') || null));

    const itunesImage = channel?.querySelector('itunes\\:image');
    const fallbackImageUrl = extractText(channel?.querySelector('image > url') || null);
    const artworkUrl = (itunesImage?.getAttribute('href') || fallbackImageUrl || '').trim();

    const items = Array.from(doc.querySelectorAll('item'));
    const episodes: Episode[] = items
        .map((item) => {
            const enclosure = item.querySelector('enclosure');
            const audioUrl = (enclosure?.getAttribute('url') || '').trim();
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
                }
            }

            return {
                id: guid,
                title: epTitle,
                description: epDescription,
                audioUrl,
                pubDate,
            };
        })
        .filter((ep): ep is Episode => ep !== null);

    return { title, description, artworkUrl, episodes };
}

// ========== CORS Proxy Fetch ==========

export async function fetchWithProxy(
    url: string,
    signal?: AbortSignal,
    timeoutMs: number = 15000
): Promise<string> {
    return fetchTextWithFallback(url, { signal, timeoutMs });
}

// ========== RSS Cache ==========

const RSS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const rssCache = new Map<string, { data: ParsedFeed; at: number }>();

function readRssCache(feedUrl: string): ParsedFeed | null {
    const entry = rssCache.get(feedUrl);
    if (!entry) return null;
    if (Date.now() - entry.at > RSS_CACHE_TTL_MS) {
        rssCache.delete(feedUrl);
        return null;
    }
    return entry.data;
}

function writeRssCache(feedUrl: string, data: ParsedFeed): void {
    // Limit cache size
    if (rssCache.size >= 50) {
        const oldestKey = rssCache.keys().next().value;
        if (oldestKey) rssCache.delete(oldestKey);
    }
    rssCache.set(feedUrl, { data, at: Date.now() });
}

// ========== Fetch and Parse Feed ==========

export async function fetchPodcastFeed(
    feedUrl: string,
    signal?: AbortSignal
): Promise<ParsedFeed> {
    // Check cache first
    const cached = readRssCache(feedUrl);
    if (cached) return cached;

    const requestKey = getRequestKey(feedUrl);

    const result = await deduplicatedFetch<ParsedFeed>(
        requestKey,
        async (fetchSignal) => {
            const controller = new AbortController();
            if (signal) {
                signal.addEventListener('abort', () => controller.abort());
            }
            fetchSignal.addEventListener('abort', () => controller.abort());

            const xmlText = await fetchWithProxy(feedUrl, controller.signal);
            return parseRss(xmlText);
        }
    );

    writeRssCache(feedUrl, result);
    return result;
}

// ========== Country Options ==========

export const COUNTRY_OPTIONS = [
    { code: 'us', label: 'US' },
    { code: 'cn', label: 'CN' },
    { code: 'jp', label: 'JP' },
    { code: 'kr', label: 'KR' },
    { code: 'de', label: 'DE' },
    { code: 'es', label: 'ES' },
    { code: 'sg', label: 'SG' },
];
