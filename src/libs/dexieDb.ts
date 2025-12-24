// src/libs/dexieDb.ts
// IndexedDB via Dexie for session persistence and local file storage
import Dexie, { type EntityTable } from 'dexie';
import { log, error as logError } from './logger';

// Use new database name - fresh start per first-release policy
const DB_NAME = 'readio-v2';

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

// Dexie database class
class ReadioDB extends Dexie {
    sessions!: EntityTable<Session, 'id'>;
    audios!: EntityTable<StoredAudio, 'id'>;
    subtitles!: EntityTable<StoredSubtitle, 'id'>;
    subscriptions!: EntityTable<Subscription, 'feedUrl'>;
    favorites!: EntityTable<Favorite, 'key'>;
    settings!: EntityTable<Setting, 'key'>;

    constructor() {
        super(DB_NAME);
        this.version(1).stores({
            sessions: 'id, lastOpenedAt',
            audios: 'id, createdAt',
            subtitles: 'id, createdAt',
            subscriptions: 'feedUrl, addedAt',
            favorites: 'key, addedAt',
            settings: 'key',
        });
    }
}

const db = new ReadioDB();

function generateId(): string {
    return crypto.randomUUID();
}

export const DB = {
    // ========== Session CRUD ==========
    async createSession(id: string, data: Partial<Session> = {}): Promise<string> {
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
        await db.sessions.put(session);
        return id;
    },

    async updateSession(id: string, updates: Partial<Session>): Promise<void> {
        const existing = await db.sessions.get(id);
        if (!existing) {
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
            await db.sessions.put(newSession);
        } else {
            await db.sessions.put({
                ...existing,
                ...updates,
                updatedAt: Date.now(),
                lastOpenedAt: Date.now(),
            });
        }
    },

    async getSession(id: string): Promise<Session | undefined> {
        return db.sessions.get(id);
    },

    async getLastSession(): Promise<Session | undefined> {
        return db.sessions.orderBy('lastOpenedAt').reverse().first();
    },

    async getAllSessions(): Promise<Session[]> {
        return db.sessions.orderBy('lastOpenedAt').reverse().toArray();
    },

    async deleteSession(id: string): Promise<void> {
        await db.sessions.delete(id);
    },

    // ========== Audio CRUD ==========
    async addAudio(blob: Blob, filename: string): Promise<string> {
        const id = generateId();
        const audio: StoredAudio = {
            id,
            blob,
            size: blob.size,
            type: blob.type,
            filename,
            createdAt: Date.now(),
        };
        await db.audios.put(audio);
        return id;
    },

    async getAudio(id: string): Promise<StoredAudio | undefined> {
        return db.audios.get(id);
    },

    async getAllAudios(): Promise<StoredAudio[]> {
        return db.audios.orderBy('createdAt').reverse().toArray();
    },

    async deleteAudio(id: string): Promise<void> {
        await db.audios.delete(id);
    },

    // ========== Subtitle CRUD ==========
    async addSubtitle(content: string, filename: string): Promise<string> {
        const id = generateId();
        const subtitle: StoredSubtitle = {
            id,
            content,
            size: new Blob([content]).size,
            filename,
            createdAt: Date.now(),
        };
        await db.subtitles.put(subtitle);
        return id;
    },

    async getSubtitle(id: string): Promise<StoredSubtitle | undefined> {
        return db.subtitles.get(id);
    },

    async getAllSubtitles(): Promise<StoredSubtitle[]> {
        return db.subtitles.orderBy('createdAt').reverse().toArray();
    },

    async deleteSubtitle(id: string): Promise<void> {
        await db.subtitles.delete(id);
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
        await db.subscriptions.put(sub);
    },

    async removeSubscription(feedUrl: string): Promise<void> {
        await db.subscriptions.delete(feedUrl);
    },

    async getAllSubscriptions(): Promise<Subscription[]> {
        return db.subscriptions.orderBy('addedAt').reverse().toArray();
    },

    // ========== Favorites CRUD ==========
    async addFavorite(fav: Favorite): Promise<void> {
        await db.favorites.put(fav);
    },

    async removeFavorite(key: string): Promise<void> {
        await db.favorites.delete(key);
    },

    async getAllFavorites(): Promise<Favorite[]> {
        return db.favorites.orderBy('addedAt').reverse().toArray();
    },

    // ========== Settings CRUD ==========
    async getSetting(key: string): Promise<string | null> {
        const result = await db.settings.get(key);
        return result?.value ?? null;
    },

    async setSetting(key: string, value: string): Promise<void> {
        const setting: Setting = {
            key,
            value,
            updatedAt: Date.now(),
        };
        await db.settings.put(setting);
    },

    // ========== Development Utilities ==========
    async clearAllData(): Promise<void> {
        log('[DB] Clearing all data...');
        try {
            await db.transaction('rw',
                [db.sessions, db.audios, db.subtitles, db.subscriptions, db.favorites, db.settings],
                async () => {
                    await db.sessions.clear();
                    await db.audios.clear();
                    await db.subtitles.clear();
                    await db.subscriptions.clear();
                    await db.favorites.clear();
                    await db.settings.clear();
                }
            );
            log('[DB] All stores cleared');
        } catch (err) {
            logError('[DB] Failed to clear data:', err);
            throw err;
        }
    },
};
