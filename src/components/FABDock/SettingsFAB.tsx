// src/components/FABDock/SettingsFAB.tsx
import { useI18n } from '../../hooks/useI18n';

export function SettingsFAB() {
    const { t } = useI18n();

    return (
        <div className="settings-fab action">
            <button className="action-button panel-surface" aria-label={t('ariaSettings')}>
                <span className="action-icon mask-icon icon-settings" />
            </button>
            <div className="action-dropdown panel-surface">
                <div style={{ padding: '12px', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                    {t('settingsComingSoon')}
                </div>
            </div>
        </div>
    );
}
