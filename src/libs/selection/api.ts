// src/libs/selection/api.ts
import { type DictEntry } from './types';
import { FREE_DICT_API } from './constants';
import { getCachedEntry, setCachedEntry } from './dictCache';

export async function fetchDefinition(word: string, signal?: AbortSignal): Promise<DictEntry> {
    const cached = getCachedEntry(word);
    if (cached) return cached;

    const response = await fetch(`${FREE_DICT_API}${encodeURIComponent(word.toLowerCase())}`, {
        signal,
        headers: { Accept: 'application/json' },
    });

    if (!response.ok) throw new Error('Word not found');

    const data = await response.json();
    const entry = Array.isArray(data) ? data[0] : data;

    interface ApiMeaning {
        partOfSpeech?: string;
        definitions?: Array<{ definition?: string; example?: string }>;
    }

    interface ApiEntry {
        word?: string;
        phonetic?: string;
        phonetics?: Array<{ text?: string }>;
        meanings?: ApiMeaning[];
    }

    const apiEntry = (entry && typeof entry === 'object') ? (entry as ApiEntry) : ({} as ApiEntry);

    const result: DictEntry = {
        word: apiEntry.word || word,
        phonetic: apiEntry.phonetic || apiEntry.phonetics?.[0]?.text || '',
        meanings: (apiEntry.meanings || []).map((m: ApiMeaning) => ({
            partOfSpeech: m.partOfSpeech || '',
            definitions: (m.definitions || []).slice(0, 3).map((d) => ({
                definition: d.definition || '',
                example: d.example,
            })),
        })),
    };

    setCachedEntry(word, result);
    return result;
}
