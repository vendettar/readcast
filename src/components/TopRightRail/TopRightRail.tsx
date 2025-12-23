// src/components/TopRightRail/TopRightRail.tsx
import { LanguageAction } from './LanguageAction';
import { ThemeAction } from './ThemeAction';
import { SettingsAction } from './SettingsAction';

type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface TopRightRailProps {
    themeMode: ThemeMode;
    resolvedTheme: ResolvedTheme;
    canvasColor: string;
    onChangeTheme: (mode: ThemeMode) => void;
    onChangeCanvas: (color: string) => void;
}

export function TopRightRail({ themeMode, resolvedTheme, canvasColor, onChangeTheme, onChangeCanvas }: TopRightRailProps) {
    return (
        <aside className="top-right-rail">
            <div className="quick-actions">
                <LanguageAction />
                <ThemeAction
                    themeMode={themeMode}
                    resolvedTheme={resolvedTheme}
                    canvasColor={canvasColor}
                    onChangeTheme={onChangeTheme}
                    onChangeCanvas={onChangeCanvas}
                />
                <SettingsAction />
            </div>
        </aside>
    );
}

