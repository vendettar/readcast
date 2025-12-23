import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../db';

const DB_NAME = 'readcast';

async function openLegacyV7AndSeed(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 7);

        request.onupgradeneeded = () => {
            const db = request.result;

            // v7 stores (no settings store)
            if (!db.objectStoreNames.contains('sessions')) {
                const store = db.createObjectStore('sessions', { keyPath: 'id' });
                store.createIndex('lastOpenedAt', 'lastOpenedAt', { unique: false });
            }
            if (!db.objectStoreNames.contains('audios')) {
                const store = db.createObjectStore('audios', { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
            if (!db.objectStoreNames.contains('subtitles')) {
                const store = db.createObjectStore('subtitles', { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
            if (!db.objectStoreNames.contains('subscriptions')) {
                const store = db.createObjectStore('subscriptions', { keyPath: 'feedUrl' });
                store.createIndex('addedAt', 'addedAt', { unique: false });
            }
            if (!db.objectStoreNames.contains('favorites')) {
                const store = db.createObjectStore('favorites', { keyPath: 'key' });
                store.createIndex('addedAt', 'addedAt', { unique: false });
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('sessions', 'readwrite');
            const store = tx.objectStore('sessions');
            store.put({
                id: 'legacy_session_1',
                progress: 12,
                duration: 345,
                audioId: null,
                subtitleId: null,
                audioFilename: 'legacy.mp3',
                subtitleFilename: '',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lastOpenedAt: Date.now(),
            });
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        };
        request.onerror = () => reject(request.error);
    });
}

describe('db migration (v7 → v8)', () => {
    beforeEach(async () => {
        await DB.clearAllData();
    });

    afterEach(async () => {
        await DB.clearAllData();
    });

    it('preserves existing stores/data and adds settings store', async () => {
        await openLegacyV7AndSeed();

        // Using current DB wrapper (v8) should upgrade without deleting existing data.
        const sessions = await DB.getAllSessions();
        expect(sessions.some(s => s.id === 'legacy_session_1')).toBe(true);

        await DB.setSetting('country', 'us');
        const value = await DB.getSetting('country');
        expect(value).toBe('us');
    });
});

