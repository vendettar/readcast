// src/components/DropZone/WarningBanner.tsx
import { useI18n } from '../../hooks/useI18n';
import type { TranslationKey } from '../../libs/translations';

interface WarningBannerProps {
    warnings: TranslationKey[];
}

export function WarningBanner({ warnings }: WarningBannerProps) {
    const { t } = useI18n();

    if (warnings.length === 0) return null;

    return (
        <div className="warnings-list">
            {warnings.map((key, idx) => (
                <div key={`${key}-${idx}`} className="warning-banner panel-surface visible" role="alert">
                    <span className="warning-icon mask-icon icon-error" aria-hidden="true" />
                    <span className="warning-text">{t(key)}</span>
                </div>
            ))}
        </div>
    );
}
