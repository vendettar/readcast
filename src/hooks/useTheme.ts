// src/hooks/useTheme.ts
import { useEffect, useState, useCallback } from 'react';
import { applyThemeMode, applyCanvasBackground, getCanvasPresets, watchSystemTheme } from '../libs/theme';

type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'themeMode';
const CANVAS_STORAGE_KEY = 'canvasColor';

// Get initial values from localStorage
function getInitialTheme(): ThemeMode {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode) || 'system';
}

function getInitialCanvas(): string {
    if (typeof window === 'undefined') return getCanvasPresets()[0];
    return localStorage.getItem(CANVAS_STORAGE_KEY) || getCanvasPresets()[0];
}

// Resolve system theme to light or dark
function resolveTheme(mode: ThemeMode): ResolvedTheme {
    if (mode === 'light' || mode === 'dark') return mode;
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
}

export function useTheme() {
    const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
    const [canvasColor, setCanvasColor] = useState<string>(getInitialCanvas);
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getInitialTheme()));
    const canvasPresets = getCanvasPresets();

    // Apply theme mode and watch system changes
    useEffect(() => {
        const result = applyThemeMode(themeMode, document.body);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing external system state
        setResolvedTheme(result.resolved);

        // Apply canvas with the resolved theme (important for dark mode tinting)
        applyCanvasBackground(canvasColor, document.body);

        const unwatchSystemTheme = watchSystemTheme(() => {
            if (themeMode === 'system') {
                const result = applyThemeMode('system', document.body);
                setResolvedTheme(result.resolved);
                // Re-apply canvas with new resolved mode
                applyCanvasBackground(canvasColor, document.body);
            }
        });

        return () => {
            if (unwatchSystemTheme) unwatchSystemTheme();
        };
    }, [themeMode, canvasColor]);

    const changeThemeMode = useCallback((mode: ThemeMode) => {
        setThemeMode(mode);
        localStorage.setItem(THEME_STORAGE_KEY, mode);
    }, []);

    const changeCanvasColor = useCallback((color: string) => {
        setCanvasColor(color);
        localStorage.setItem(CANVAS_STORAGE_KEY, color);
    }, []);

    return {
        themeMode,
        resolvedTheme,
        canvasColor,
        canvasPresets,
        changeThemeMode,
        changeCanvasColor,
    };
}
