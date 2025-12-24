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
                <div className="p-3 text-[0.8125rem] text-muted-foreground">
                    {t('settingsComingSoon')}\n                </div>
            </div>
        </div>
    );
}
