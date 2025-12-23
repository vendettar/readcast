// src/components/TopRightRail/SettingsAction.tsx
import { useHoverMenu } from '../../hooks/useHoverMenu';
import { useI18n } from '../../hooks/useI18n';
import { DeveloperCacheControls } from './DeveloperCacheControls';
import { ProxyHealthControls } from './ProxyHealthControls';

export function SettingsAction() {
    const { isOpen, containerProps } = useHoverMenu();
    const { t } = useI18n();

    return (
        <div
            className={`action settings-fab ${isOpen ? 'open' : ''}`}
            id="settingsAction"
            {...containerProps}
        >
            <button
                className="action-button panel-surface"
                aria-label={t('ariaSettings')}
                aria-haspopup="true"
                aria-expanded={isOpen}
            >
                <span className="action-icon mask-icon icon-settings" />
            </button>
            <div className="action-dropdown panel-surface" id="settingsDropdown">
                <ProxyHealthControls />
                <DeveloperCacheControls />
                <div style={{
                    padding: '12px',
                    fontSize: '0.8125rem',
                    color: 'var(--color-muted)'
                }}>
                    {t('settingsComingSoon')}
                </div>
            </div>
        </div>
    );
}
