// src/libs/db.ts
// IndexedDB for session persistence and local file storage

import { log, error as logError } from './logger';

const DB_NAME = 'readcast';  // 新版本独立数据库，不兼容旧版
const DB_VERSION = 8; // v8: Add settings store for preferences
const STORE_SESSIONS = 'sessions';
const STORE_AUDIOS = 'audios';
const STORE_SUBTITLES = 'subtitles';
const STORE_SUBSCRIPTIONS = 'subscriptions';
const STORE_FAVORITES = 'favorites';
const STORE_SETTINGS = 'settings';

let dbInstance: IDBDatabase | null = null;

export interface Session {
    id: string;
    progress: number;
    duration: number;
    audioId: string | null;
    subtitleId: string | null;
    audioFilename: string;
    subtitleFilename: string;
    createdAt: number;
    updatedAt: number;
    lastOpenedAt: number;
}

export interface StoredAudio {
    id: string;
    blob: Blob;
    size: number;
    type: string;
    filename: string;
    createdAt: number;
}

export interface StoredSubtitle {
    id: string;
    content: string;
    size: number;
    filename: string;
    createdAt: number;
}

export interface Subscription {
    feedUrl: string; // Primary key
    title: string;
    author: string;
    artworkUrl: string;
    addedAt: number;
}

export interface Favorite {
    key: string; // Primary key: feedUrl::audioUrl
    feedUrl: string;
    audioUrl: string;
    episodeTitle: string;
    podcastTitle: string;
    artworkUrl: string;
    addedAt: number;
}

export interface Setting {
    key: string; // Primary key
    value: string;
    updatedAt: number;
}

async function openDB(): Promise<IDBDatabase> {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
                const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
                store.createIndex('lastOpenedAt', 'lastOpenedAt', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORE_AUDIOS)) {
                const store = db.createObjectStore(STORE_AUDIOS, { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORE_SUBTITLES)) {
                const store = db.createObjectStore(STORE_SUBTITLES, { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }

            // V7: Add subscriptions and favorites stores
            if (!db.objectStoreNames.contains(STORE_SUBSCRIPTIONS)) {
                const store = db.createObjectStore(STORE_SUBSCRIPTIONS, { keyPath: 'feedUrl' });
                store.createIndex('addedAt', 'addedAt', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORE_FAVORITES)) {
                const store = db.createObjectStore(STORE_FAVORITES, { keyPath: 'key' });
                store.createIndex('addedAt', 'addedAt', { unique: false });
            }

            // V8: Add settings store
            if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
            }
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };
    });
}

function generateId(): string {
    return crypto.randomUUID();
}

export const DB = {
    // ========== Session CRUD ==========
    async createSession(id: string, data: Partial<Session> = {}): Promise<string> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SESSIONS], 'readwrite');
            const store = tx.objectStore(STORE_SESSIONS);
            const session: Session = {
                id,
                progress: 0,
                duration: 0,
                audioId: null,
                subtitleId: null,
                audioFilename: '',
                subtitleFilename: '',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lastOpenedAt: Date.now(),
                ...data,
            };
            store.put(session);
            tx.oncomplete = () => resolve(id);
            tx.onerror = () => reject(tx.error);
        });
    },

    async updateSession(id: string, updates: Partial<Session>): Promise<void> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SESSIONS], 'readwrite');
            const store = tx.objectStore(STORE_SESSIONS);
            const getReq = store.get(id);

            getReq.onsuccess = () => {
                const session = getReq.result as Session | undefined;
                if (!session) {
                    const newSession: Session = {
                        id,
                        progress: 0,
                        duration: 0,
                        audioId: null,
                        subtitleId: null,
                        audioFilename: '',
                        subtitleFilename: '',
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        lastOpenedAt: Date.now(),
                        ...updates,
                    };
                    store.put(newSession);
                } else {
                    store.put({
                        ...session,
                        ...updates,
                        updatedAt: Date.now(),
                        lastOpenedAt: Date.now(),
                    });
                }
            };

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    async getSession(id: string): Promise<Session | undefined> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SESSIONS], 'readonly');
            const store = tx.objectStore(STORE_SESSIONS);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getLastSession(): Promise<Session | undefined> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SESSIONS], 'readonly');
            const store = tx.objectStore(STORE_SESSIONS);
            const index = store.index('lastOpenedAt');
            const request = index.openCursor(null, 'prev');
            request.onsuccess = () => {
                const cursor = request.result;
                resolve(cursor?.value);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async getAllSessions(): Promise<Session[]> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SESSIONS], 'readonly');
            const store = tx.objectStore(STORE_SESSIONS);
            const request = store.getAll();
            request.onsuccess = () => {
                const sessions = request.result || [];
                sessions.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
                resolve(sessions);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async deleteSession(id: string): Promise<void> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SESSIONS], 'readwrite');
            const store = tx.objectStore(STORE_SESSIONS);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // ========== Audio CRUD ==========
    async addAudio(blob: Blob, filename: string): Promise<string> {
        const db = await openDB();
        const id = generateId();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_AUDIOS], 'readwrite');
            const store = tx.objectStore(STORE_AUDIOS);
            const audio: StoredAudio = {
                id,
                blob,
                size: blob.size,
                type: blob.type,
                filename,
                createdAt: Date.now(),
            };
            store.put(audio);
            tx.oncomplete = () => resolve(id);
            tx.onerror = () => reject(tx.error);
        });
    },

    async getAudio(id: string): Promise<StoredAudio | undefined> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_AUDIOS], 'readonly');
            const store = tx.objectStore(STORE_AUDIOS);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAllAudios(): Promise<StoredAudio[]> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_AUDIOS], 'readonly');
            const store = tx.objectStore(STORE_AUDIOS);
            const request = store.getAll();
            request.onsuccess = () => {
                const audios = request.result || [];
                audios.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                resolve(audios);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async deleteAudio(id: string): Promise<void> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_AUDIOS], 'readwrite');
            const store = tx.objectStore(STORE_AUDIOS);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // ========== Subtitle CRUD ==========
    async addSubtitle(content: string, filename: string): Promise<string> {
        const db = await openDB();
        const id = generateId();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SUBTITLES], 'readwrite');
            const store = tx.objectStore(STORE_SUBTITLES);
            const subtitle: StoredSubtitle = {
                id,
                content,
                size: new Blob([content]).size,
                filename,
                createdAt: Date.now(),
            };
            store.put(subtitle);
            tx.oncomplete = () => resolve(id);
            tx.onerror = () => reject(tx.error);
        });
    },

    async getSubtitle(id: string): Promise<StoredSubtitle | undefined> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SUBTITLES], 'readonly');
            const store = tx.objectStore(STORE_SUBTITLES);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAllSubtitles(): Promise<StoredSubtitle[]> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SUBTITLES], 'readonly');
            const store = tx.objectStore(STORE_SUBTITLES);
            const request = store.getAll();
            request.onsuccess = () => {
                const subtitles = request.result || [];
                subtitles.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                resolve(subtitles);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async deleteSubtitle(id: string): Promise<void> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SUBTITLES], 'readwrite');
            const store = tx.objectStore(STORE_SUBTITLES);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // ========== Utility ==========
    async getStorageStats(): Promise<{ sessions: number; audios: number; subtitles: number; totalSize: number }> {
        const sessions = await this.getAllSessions();
        const audios = await this.getAllAudios();
        const subtitles = await this.getAllSubtitles();

        const totalSize = audios.reduce((sum, a) => sum + a.size, 0) +
            subtitles.reduce((sum, s) => sum + s.size, 0);

        return {
            sessions: sessions.length,
            audios: audios.length,
            subtitles: subtitles.length,
            totalSize,
        };
    },

    // ========== Subscriptions CRUD ==========
    async addSubscription(sub: Subscription): Promise<void> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SUBSCRIPTIONS], 'readwrite');
            const store = tx.objectStore(STORE_SUBSCRIPTIONS);
            store.put(sub);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    async removeSubscription(feedUrl: string): Promise<void> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SUBSCRIPTIONS], 'readwrite');
            const store = tx.objectStore(STORE_SUBSCRIPTIONS);
            const request = store.delete(feedUrl);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getAllSubscriptions(): Promise<Subscription[]> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SUBSCRIPTIONS], 'readonly');
            const store = tx.objectStore(STORE_SUBSCRIPTIONS);
            const request = store.getAll();
            request.onsuccess = () => {
                const subs = request.result || [];
                subs.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
                resolve(subs);
            };
            request.onerror = () => reject(request.error);
        });
    },

    // ========== Favorites CRUD ==========
    async addFavorite(fav: Favorite): Promise<void> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_FAVORITES], 'readwrite');
            const store = tx.objectStore(STORE_FAVORITES);
            store.put(fav);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    async removeFavorite(key: string): Promise<void> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_FAVORITES], 'readwrite');
            const store = tx.objectStore(STORE_FAVORITES);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getAllFavorites(): Promise<Favorite[]> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_FAVORITES], 'readonly');
            const store = tx.objectStore(STORE_FAVORITES);
            const request = store.getAll();
            request.onsuccess = () => {
                const favs = request.result || [];
                favs.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
                resolve(favs);
            };
            request.onerror = () => reject(request.error);
        });
    },

    // ========== Settings CRUD ==========

    async getSetting(key: string): Promise<string | null> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SETTINGS, 'readonly');
            const store = tx.objectStore(STORE_SETTINGS);
            const request = store.get(key);
            request.onsuccess = () => {
                const result = request.result as Setting | undefined;
                resolve(result?.value ?? null);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async setSetting(key: string, value: string): Promise<void> {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SETTINGS, 'readwrite');
            const store = tx.objectStore(STORE_SETTINGS);
            const setting: Setting = {
                key,
                value,
                updatedAt: Date.now(),
            };
            const request = store.put(setting);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // ========== Development Utilities ==========
    async clearAllData(): Promise<void> {
        // Close existing connection
        if (dbInstance) {
            dbInstance.close();
            dbInstance = null;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = () => {
                log('[DB] Deleted database:', DB_NAME);
                resolve();
            };
            request.onerror = () => {
                logError('[DB] Failed to delete database:', request.error);
                reject(request.error);
            };
            request.onblocked = () => {
                logError('[DB] Database deletion blocked - close all tabs');
                reject(new Error('Database deletion blocked'));
            };
        });
    },
};
