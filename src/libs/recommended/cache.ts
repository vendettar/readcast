// src/libs/recommended/cache.ts
import { type CacheStatus, type CacheResult, type RecommendedPodcast, type RecommendedGroup } from './types';
import { error as logError } from '../logger';

const RECOMMENDED_CACHE_PREFIX = 'readcastGalleryRecommendedV2:';
const CHART_CACHE_PREFIX = 'readcastAppleTopPodcastsV1:';
const LOOKUP_CACHE_PREFIX = 'readcastAppleTopLookupV1:';
const FEED_FETCHABILITY_PREFIX = 'readcastGalleryFeedFetchabilityV1:';

export const RECOMMENDED_TTL_MS = 24 * 60 * 60 * 1000;
export const RECOMMENDED_PURGE_MS = 72 * 60 * 60 * 1000;
export const CHART_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const CHART_CACHE_PURGE_MS = 72 * 60 * 60 * 1000;
export const FEED_FETCHABILITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function safeJsonParse<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

// ============ Chart Cache ============

export function getChartCacheKey(country: string): string {
    return `${CHART_CACHE_PREFIX}${country.toLowerCase()}`;
}

export function readChartCacheWithStatus(country: string): { ids: string[]; at: number; status: CacheStatus } | null {
    const raw = localStorage.getItem(getChartCacheKey(country));
    if (!raw) return null;
    const parsed = safeJsonParse<{ ids?: string[]; at?: number }>(raw, {});
    if (!parsed.ids || !Array.isArray(parsed.ids)) return null;

    const age = Date.now() - (parsed.at || 0);
    const status: CacheStatus = age <= CHART_CACHE_TTL_MS ? 'fresh' : (age <= CHART_CACHE_PURGE_MS ? 'stale' : 'expired');

    return { ids: parsed.ids, at: parsed.at || 0, status };
}

export function writeChartCache(country: string, ids: string[]): void {
    try {
        localStorage.setItem(getChartCacheKey(country), JSON.stringify({ ids, at: Date.now() }));
    } catch (err) {
        logError('[RecommendedCache] Failed to write chart cache:', err);
    }
}

// ============ Lookup Cache ============

export function getLookupCacheKey(country: string): string {
    return `${LOOKUP_CACHE_PREFIX}${country.toLowerCase()}`;
}

export function readLookupCache(country: string): Record<string, RecommendedPodcast> | null {
    const raw = localStorage.getItem(getLookupCacheKey(country));
    const parsed = safeJsonParse<{ entries?: Record<string, RecommendedPodcast>; at?: number }>(raw, {});
    if (!parsed.entries || typeof parsed.entries !== 'object') return null;
    if (Date.now() - (parsed.at || 0) > CHART_CACHE_TTL_MS) return null;
    return parsed.entries;
}

export function writeLookupCache(country: string, entries: Record<string, RecommendedPodcast>): void {
    try {
        localStorage.setItem(getLookupCacheKey(country), JSON.stringify({ entries, at: Date.now() }));
    } catch (err) {
        logError('[RecommendedCache] Failed to write lookup cache:', err);
    }
}

// ============ Recommended Groups Cache ============

export function getRecommendedCacheKey(country: string, lang: string): string {
    return `${RECOMMENDED_CACHE_PREFIX}${country.toLowerCase()}:${lang.toLowerCase()}`;
}

export function readRecommendedCacheWithStatus(country: string, lang: string): CacheResult<RecommendedGroup[]> {
    const raw = localStorage.getItem(getRecommendedCacheKey(country, lang));
    if (!raw) return { data: null, status: 'expired', age: Infinity };

    const parsed = safeJsonParse<{ groups?: RecommendedGroup[]; at?: number }>(raw, {});
    if (!parsed.groups || !Array.isArray(parsed.groups)) {
        return { data: null, status: 'expired', age: Infinity };
    }

    const age = Date.now() - (parsed.at || 0);
    const status: CacheStatus = age <= RECOMMENDED_TTL_MS ? 'fresh' : (age <= RECOMMENDED_PURGE_MS ? 'stale' : 'expired');

    return { data: parsed.groups, status, age };
}

export function writeRecommendedCache(country: string, lang: string, groups: RecommendedGroup[]): void {
    try {
        localStorage.setItem(getRecommendedCacheKey(country, lang), JSON.stringify({ at: Date.now(), groups }));
    } catch (err) {
        logError('[RecommendedCache] Failed to write recommended cache:', err);
    }
}

// ============ Feed Fetchability Cache ============

export function getFetchabilityCacheKey(country: string): string {
    return `${FEED_FETCHABILITY_PREFIX}${country.toLowerCase()}`;
}

export function readFetchabilityCache(country: string): Record<string, { ok: boolean; at: number }> {
    const raw = localStorage.getItem(getFetchabilityCacheKey(country));
    const parsed = safeJsonParse<Record<string, unknown>>(raw, {});
    const now = Date.now();
    const result: Record<string, { ok: boolean; at: number }> = {};
    Object.entries(parsed).forEach(([key, entry]) => {
        if (entry && typeof entry === 'object' && 'ok' in entry && 'at' in entry) {
            const e = entry as { ok: boolean; at: number };
            if (now - e.at < FEED_FETCHABILITY_TTL_MS) {
                result[key] = e;
            }
        }
    });
    return result;
}

export function writeFetchabilityCache(country: string, cache: Record<string, { ok: boolean; at: number }>): void {
    try {
        localStorage.setItem(getFetchabilityCacheKey(country), JSON.stringify(cache));
    } catch (err) {
        logError('[RecommendedCache] Failed to write fetchability cache:', err);
    }
}
