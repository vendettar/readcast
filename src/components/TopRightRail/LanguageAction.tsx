// src/components/TopRightRail/LanguageAction.tsx
import { useI18n } from '../../hooks/useI18n';
import { useHoverMenu } from '../../hooks/useHoverMenu';
import type { Language } from '../../libs/translations';

export function LanguageAction() {
    const { t, language, setLanguage, languages } = useI18n();
    const { isOpen, containerProps } = useHoverMenu();

    return (
        <div
            className={`action ${isOpen ? 'open' : ''}`}
            id="languageAction"
            {...containerProps}
        >
            <button className="action-button panel-surface" aria-label={t('ariaLanguage')}>
                <span className="action-icon mask-icon icon-language" />
            </button>
            <div className="action-dropdown panel-surface">
                {(Object.entries(languages) as [Language, string][]).map(([code, name]) => (
                    <button
                        key={code}
                        className={language === code ? 'active' : ''}
                        onClick={() => setLanguage(code)}
                    >
                        {name}
                    </button>
                ))}
            </div>
        </div>
    );
}
