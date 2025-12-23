// src/__tests__/hooks.test.ts
import { describe, it, expect } from 'vitest';

// Test for stopwords
import { isStopword, stopwordsSet } from '../libs/stopwords';

describe('Stopwords', () => {
    it('should identify common stopwords', () => {
        expect(isStopword('the')).toBe(true);
        expect(isStopword('a')).toBe(true);
        expect(isStopword('is')).toBe(true);
        expect(isStopword('and')).toBe(true);
    });

    it('should not match non-stopwords', () => {
        expect(isStopword('programming')).toBe(false);
        expect(isStopword('React')).toBe(false);
        expect(isStopword('podcast')).toBe(false);
    });

    it('should be case insensitive', () => {
        expect(isStopword('THE')).toBe(true);
        expect(isStopword('The')).toBe(true);
    });

    it('should have a reasonable number of stopwords', () => {
        expect(stopwordsSet.size).toBeGreaterThan(50);
        expect(stopwordsSet.size).toBeLessThan(200);
    });
});

// Test for theme utilities
import { getCanvasPresets } from '../libs/theme';

describe('Theme', () => {
    describe('getCanvasPresets', () => {
        it('should return canvas color presets', () => {
            const presets = getCanvasPresets();

            expect(Array.isArray(presets)).toBe(true);
            expect(presets.length).toBeGreaterThan(0);

            // Each preset should be a valid hex color string
            presets.forEach(color => {
                expect(typeof color).toBe('string');
                expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
            });
        });
    });
});

// Test for translations
import { translations, languageNativeNames } from '../libs/translations';

describe('Translations', () => {
    const languages = ['zh', 'en', 'ja', 'ko', 'de', 'es'] as const;

    it('should have all required languages', () => {
        languages.forEach(lang => {
            expect(translations).toHaveProperty(lang);
        });
    });

    it('should have native names for all languages', () => {
        languages.forEach(lang => {
            expect(languageNativeNames).toHaveProperty(lang);
            expect(typeof languageNativeNames[lang]).toBe('string');
        });
    });

    it('should have tooltip translations', () => {
        languages.forEach(lang => {
            expect(translations[lang]).toHaveProperty('tooltipGallery');
            expect(translations[lang]).toHaveProperty('tooltipLocalFiles');
        });
    });

    it('should have equal keys across all languages', () => {
        const enKeys = Object.keys(translations.en);

        languages.forEach(lang => {
            const langKeys = Object.keys(translations[lang]);
            expect(langKeys.length).toBe(enKeys.length);
        });
    });
});
