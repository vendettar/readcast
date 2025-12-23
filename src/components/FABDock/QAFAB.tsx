// src/components/FABDock/QAFAB.tsx
import { useI18n } from '../../hooks/useI18n';

export function QAFAB() {
    const { t } = useI18n();

    return (
        <div className="qa-fab action">
            <button className="action-button panel-surface" aria-label={t('ariaQA')}>
                <span className="action-icon mask-icon icon-question" />
            </button>
            <div className="action-dropdown panel-surface qa-dropdown">
                <div className="qa-item">
                    <div className="qa-question">{t('qaQ1')}</div>
                    <div className="qa-answer">{t('qaA1')}</div>
                </div>
                <div className="qa-item">
                    <div className="qa-question">{t('qaQ2')}</div>
                    <div className="qa-answer">{t('qaA2')}</div>
                </div>
            </div>
        </div>
    );
}
