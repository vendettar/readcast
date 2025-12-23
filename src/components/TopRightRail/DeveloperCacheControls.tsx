// src/components/TopRightRail/DeveloperCacheControls.tsx
// Dev-only cache clearing controls

import { DB } from '../../libs/db';

// Only render in development mode
const IS_DEV = import.meta.env.DEV;

async function clearLocalStorage(): Promise<void> {
    if (!confirm('Clear all localStorage data? (theme, language, search cache, dictionary cache)')) {
        return;
    }
    localStorage.clear();
    location.reload();
}

async function clearIndexedDB(): Promise<void> {
    if (!confirm('Clear IndexedDB? This will delete ALL local files, sessions, subscriptions, and favorites!')) {
        return;
    }
    if (!confirm('Are you REALLY sure? This cannot be undone!')) {
        return;
    }
    try {
        await DB.clearAllData();
    } catch (err) {
        console.error('[DevCache] Failed to clear IndexedDB:', err);
    }
    location.reload();
}

async function clearCacheStorage(): Promise<void> {
    if (!confirm('Clear CacheStorage? (PWA cached resources)')) {
        return;
    }
    try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
    } catch (err) {
        console.error('[DevCache] Failed to clear CacheStorage:', err);
    }
    location.reload();
}

async function unregisterServiceWorkers(): Promise<void> {
    if (!confirm('Unregister all Service Workers?')) {
        return;
    }
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
    } catch (err) {
        console.error('[DevCache] Failed to unregister service workers:', err);
    }
    location.reload();
}

export function DeveloperCacheControls() {
    if (!IS_DEV) {
        return null;
    }

    return (
        <div className="dev-cache-controls">
            <div className="dev-cache-header">
                🛠️ Developer Cache
            </div>
            <div className="dev-cache-buttons">
                <button
                    className="dev-cache-btn"
                    onClick={clearLocalStorage}
                    title="Clear localStorage"
                >
                    Clear localStorage
                </button>
                <button
                    className="dev-cache-btn dev-cache-btn-danger"
                    onClick={clearIndexedDB}
                    title="Clear IndexedDB (local files, sessions, subscriptions, favorites)"
                >
                    Clear IndexedDB
                </button>
                <button
                    className="dev-cache-btn"
                    onClick={clearCacheStorage}
                    title="Clear CacheStorage"
                >
                    Clear CacheStorage
                </button>
                <button
                    className="dev-cache-btn"
                    onClick={unregisterServiceWorkers}
                    title="Unregister Service Workers"
                >
                    Unregister SW
                </button>
            </div>
        </div>
    );
}
