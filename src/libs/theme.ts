// scripts/modules/theme.ts

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedThemeMode = 'light' | 'dark';

const MODE_CLASS_MAP: Record<ResolvedThemeMode, string> = {
    light: 'theme-mode-light',
    dark: 'theme-mode-dark',
};

const DEFAULT_CANVAS_COLORS = [
    '#FFFFFF',
    '#F8F9FA',
    '#F5FAFF',
    '#FFFCE8',
    '#FDF8F6',
] as const;
const DARK_BASE = '#0d1117';

export interface ThemeModeResult {
    resolved: ResolvedThemeMode;
    mode: ThemeMode;
}

export function getCanvasPresets(): readonly string[] {
    return DEFAULT_CANVAS_COLORS;
}

export function applyThemeMode(
    mode: ThemeMode,
    body: HTMLElement | null = document.body
): ThemeModeResult {
    if (!body) return { resolved: 'light', mode };

    const resolved = resolveMode(mode);
    body.classList.remove(
        ...Object.values(MODE_CLASS_MAP),
        'theme-mode-system'
    );
    body.dataset.themeMode = mode;
    body.dataset.themeResolved = resolved;
    body.classList.add(MODE_CLASS_MAP[resolved]);

    // Note: Theme toggle icon is now controlled by React (ThemeAction component)
    // No DOM manipulation needed here

    return { resolved, mode };
}

export function applyCanvasBackground(
    color: string | null | undefined,
    body: HTMLElement | null = document.body
): string {
    const target = body || document.documentElement;
    let canvas = normalizeHex(color);
    if (!canvas) {
        const computed = target
            ? getComputedStyle(target).getPropertyValue('--bg-color').trim()
            : '';
        canvas = normalizeHex(computed) || DEFAULT_CANVAS_COLORS[1];
    }
    const themeMode: string =
        target.dataset.themeResolved || target.dataset.themeMode || 'light';
    const tinted = tintForMode(canvas, themeMode as ResolvedThemeMode);
    target.style.setProperty('--canvas-color', tinted);
    return canvas;
}

export function watchSystemTheme(
    onChange: (mode: ResolvedThemeMode) => void
): () => void {
    if (
        typeof window === 'undefined' ||
        typeof window.matchMedia !== 'function' ||
        typeof onChange !== 'function'
    ) {
        return () => { };
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent): void =>
        onChange(event.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
}

function resolveMode(mode: ThemeMode): ResolvedThemeMode {
    if (mode === 'dark' || mode === 'light') return mode;
    if (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function'
    ) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
    }
    return 'light';
}

function normalizeHex(color: unknown): string | null {
    if (typeof color !== 'string') return null;
    let hex = color.trim();
    if (!hex.startsWith('#')) {
        hex = `#${hex}`;
    }
    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex)) {
        if (hex.length === 4) {
            hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
        }
        return hex.toUpperCase();
    }
    return null;
}

function tintForMode(color: string, mode: ResolvedThemeMode): string {
    if (mode === 'dark') {
        return mixColors(DARK_BASE, color, 0.4);
    }
    return color;
}

function mixColors(
    base: string,
    overlay: string,
    overlayRatio = 0.5
): string {
    const baseHex = normalizeHex(base);
    const overlayHex = normalizeHex(overlay);
    if (!baseHex || !overlayHex) return overlay || base || '#000000';
    const baseInt = parseInt(baseHex.slice(1), 16);
    const overlayInt = parseInt(overlayHex.slice(1), 16);
    const br = (baseInt >> 16) & 255;
    const bg = (baseInt >> 8) & 255;
    const bb = baseInt & 255;
    const or = (overlayInt >> 16) & 255;
    const og = (overlayInt >> 8) & 255;
    const ob = overlayInt & 255;
    const ratio = Math.min(Math.max(overlayRatio, 0), 1);
    const r = Math.round(br * (1 - ratio) + or * ratio);
    const g = Math.round(bg * (1 - ratio) + og * ratio);
    const b = Math.round(bb * (1 - ratio) + ob * ratio);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value: number): string {
    return value.toString(16).padStart(2, '0').toUpperCase();
}
