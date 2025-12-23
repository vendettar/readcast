// src/components/TopRightRail/ThemeAction.tsx
import { getCanvasPresets } from '../../libs/theme';
import { useI18n } from '../../hooks/useI18n';
import { useHoverMenu } from '../../hooks/useHoverMenu';

export type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeActionProps {
    themeMode: ThemeMode;
    resolvedTheme: ResolvedTheme;
    canvasColor: string;
    onChangeTheme: (mode: ThemeMode) => void;
    onChangeCanvas: (color: string) => void;
}

export function ThemeAction({ themeMode, resolvedTheme, canvasColor, onChangeTheme, onChangeCanvas }: ThemeActionProps) {
    const { t } = useI18n();
    const canvasPresets = getCanvasPresets();
    const { isOpen, containerProps } = useHoverMenu();

    // Handle click on the main theme button (toggle light/dark)
    const handleThemeButtonClick = (e: React.MouseEvent) => {
        e.preventDefault();
        // If system mode, toggle based on resolved theme
        // Otherwise, toggle between light and dark
        if (themeMode === 'system') {
            onChangeTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
        } else {
            onChangeTheme(themeMode === 'dark' ? 'light' : 'dark');
        }
    };

    return (
        <div className={`action ${isOpen ? 'open' : ''}`} id="themeAction" {...containerProps}>
            <button
                className="action-button panel-surface"
                aria-label={t('ariaTheme')}
                onClick={handleThemeButtonClick}
            >
                <span
                    className={`action-icon mask-icon ${resolvedTheme === 'dark' ? 'icon-dark-mode' : 'icon-light-mode'}`}
                    id="themeToggleIcon"
                />
            </button>
            <div className="action-dropdown panel-surface theme-dropdown" id="themeDropdown">
                {/* Theme Mode Section */}
                <div className="theme-section-label">{t('labelTheme')}</div>
                <div className="theme-row mode-row">
                    <button
                        className={`theme-mode-btn ${themeMode === 'light' ? 'active' : ''}`}
                        onClick={() => onChangeTheme('light')}
                        data-mode="light"
                        aria-pressed={themeMode === 'light'}
                    >
                        <span className="theme-mode-icon mask-icon icon-light-mode" aria-hidden="true" />
                        <span className="theme-mode-label sr-only">{t('themeModeLight')}</span>
                    </button>
                    <button
                        className={`theme-mode-btn ${themeMode === 'dark' ? 'active' : ''}`}
                        onClick={() => onChangeTheme('dark')}
                        data-mode="dark"
                        aria-pressed={themeMode === 'dark'}
                    >
                        <span className="theme-mode-icon mask-icon icon-dark-mode" aria-hidden="true" />
                        <span className="theme-mode-label sr-only">{t('themeModeDark')}</span>
                    </button>
                    <button
                        className={`theme-mode-btn ${themeMode === 'system' ? 'active' : ''}`}
                        onClick={() => onChangeTheme('system')}
                        data-mode="system"
                        aria-pressed={themeMode === 'system'}
                    >
                        <span className="theme-mode-icon mask-icon icon-computer" aria-hidden="true" />
                        <span className="theme-mode-label sr-only">{t('themeModeSystem')}</span>
                    </button>
                </div>

                {/* Canvas Background Section */}
                <div className="theme-section-label">{t('themeCanvasBg')}</div>
                <div className="theme-row canvas-row">
                    {canvasPresets.map((color) => (
                        <button
                            key={color}
                            type="button"
                            className={`canvas-swatch ${canvasColor.toUpperCase() === color.toUpperCase() ? 'active' : ''}`}
                            style={{ background: color }}
                            data-canvas={color}
                            aria-label={`${t('themeCanvasBg')} ${color}`}
                            onClick={() => onChangeCanvas(color)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

