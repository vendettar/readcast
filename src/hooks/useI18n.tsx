// src/hooks/useI18n.ts
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { translations, languageNativeNames, Language, TranslationKey } from '../libs/translations';

interface I18nContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: TranslationKey) => string;
    languages: typeof languageNativeNames;
}

const I18nContext = createContext<I18nContextType | null>(null);

function getInitialLanguage(): Language {
    if (typeof window === 'undefined') return 'en';
    const stored = localStorage.getItem('language') as Language | null;
    if (stored && translations[stored]) return stored;

    // Try browser language
    const browserLang = navigator.language.slice(0, 2) as Language;
    if (translations[browserLang]) return browserLang;

    return 'en';
}

interface I18nProviderProps {
    children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
    const [language, setLanguageState] = useState<Language>(getInitialLanguage);

    const setLanguage = useCallback((lang: Language) => {
        if (translations[lang]) {
            setLanguageState(lang);
            localStorage.setItem('language', lang);
            document.documentElement.lang = lang;
        }
    }, []);

    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    const t = useCallback((key: TranslationKey): string => {
        const pack = translations[language] || translations.en;
        const fallback = translations.en;
        return pack[key] || fallback[key] || key;
    }, [language]);

    return (
        <I18nContext.Provider value={{ language, setLanguage, t, languages: languageNativeNames }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n() {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useI18n must be used within I18nProvider');
    }
    return context;
}
