// src/libs/selection/dictCache.ts
import { type DictEntry } from './types';
import { DICT_CACHE_KEY, DICT_CACHE_MAX_ENTRIES } from './constants';
import { initLookupHighlight, rebuildHighlights, highlightWordInSubtitles } from '../highlightManager';
import { error as logError } from '../logger';

const dictCache = new Map<string, DictEntry>();
let highlightInitialized = false;

export function loadDictCache(): void {
    try {
        const raw = localStorage.getItem(DICT_CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            Object.entries(parsed).forEach(([key, value]) => {
                dictCache.set(key, value as DictEntry);
            });
        }
        highlightInitialized = initLookupHighlight();
    } catch (err) {
        logError('[DictCache] Failed to load cache:', err);
    }
}

export function saveDictCache(): void {
    try {
        if (dictCache.size > DICT_CACHE_MAX_ENTRIES) {
            const keysToRemove = Array.from(dictCache.keys()).slice(0, dictCache.size - DICT_CACHE_MAX_ENTRIES);
            keysToRemove.forEach(key => dictCache.delete(key));
        }
        const obj = Object.fromEntries(dictCache.entries());
        localStorage.setItem(DICT_CACHE_KEY, JSON.stringify(obj));
    } catch (err) {
        logError('[DictCache] Failed to save cache:', err);
    }
}

export function getCachedEntry(word: string): DictEntry | undefined {
    return dictCache.get(word.toLowerCase());
}

export function setCachedEntry(word: string, entry: DictEntry): void {
    dictCache.set(word.toLowerCase(), entry);
    saveDictCache();
    if (highlightInitialized) {
        highlightWordInSubtitles(word.toLowerCase());
    }
}

export function getCachedWords(): string[] {
    return Array.from(dictCache.keys());
}

export function refreshHighlights(): number {
    if (!highlightInitialized) return 0;
    return rebuildHighlights(getCachedWords());
}
