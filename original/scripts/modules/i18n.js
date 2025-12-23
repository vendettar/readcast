import { translations } from './translations.js';

export class Translator {
    constructor(defaultLanguage = 'zh') {
        this.translations = translations;
        this.defaultLanguage = defaultLanguage;
        this.currentLanguage = defaultLanguage;
    }

    setLanguage(language) {
        if (language && this.translations[language]) {
            this.currentLanguage = language;
        } else {
            this.currentLanguage = this.defaultLanguage;
        }
        document.documentElement.lang = this.currentLanguage;
        return this.currentLanguage;
    }

    getLanguage() {
        return this.currentLanguage;
    }

    t(key, vars = {}) {
        const fallbackPack = this.translations.en || {};
        const pack = this.translations[this.currentLanguage] || fallbackPack;
        let template = pack[key] || fallbackPack[key] || key;
        Object.keys(vars).forEach((token) => {
            template = template.replace(`{{${token}}}`, vars[token]);
        });
        return template;
    }
}

export function translateDom(translator, { root = document, skip = new Set() } = {}) {
    if (!translator || !root) return;
    root.querySelectorAll('[data-i18n]').forEach((node) => {
        if (skip.has(node)) return;
        const key = node.getAttribute('data-i18n');
        if (!key) return;
        node.textContent = translator.t(key);
    });
}
