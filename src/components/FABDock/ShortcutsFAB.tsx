// src/components/FABDock/ShortcutsFAB.tsx
import { useI18n } from '../../hooks/useI18n';

export function ShortcutsFAB() {
    const { t } = useI18n();

    return (
        <div className="shortcut-fab action">
            <button className="action-button panel-surface" aria-label={t('shortcutTitle')}>
                <span className="action-icon mask-icon icon-keyboard" />
            </button>
            <div className="action-dropdown panel-surface shortcut-dropdown">
                <strong>{t('shortcutTitle')}</strong>
                <div className="shortcut-row">
                    <span className="keycap">{t('shortcutSpaceKey')}</span>
                    <span className="shortcut-label">{t('shortcutPlayLabel')}</span>
                </div>
                <div className="shortcut-row">
                    <span className="keycap keycap-arrow">
                        <span className="keycap-icon mask-icon icon-arrow-left" />
                    </span>
                    <span className="shortcut-label">{t('shortcutPrevLabel')}</span>
                </div>
                <div className="shortcut-row">
                    <span className="keycap keycap-arrow">
                        <span className="keycap-icon mask-icon icon-arrow-right" />
                    </span>
                    <span className="shortcut-label">{t('shortcutNextLabel')}</span>
                </div>
            </div>
        </div>
    );
}
