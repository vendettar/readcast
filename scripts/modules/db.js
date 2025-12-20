const DB_NAME = 'readcast_db';
const DB_VERSION = 5;
const STORE_SESSIONS = 'sessions';
const STORE_AUDIOS = 'audios';
const STORE_SUBTITLES = 'subtitles';
const STORE_PODCASTS = 'podcasts';
const STORE_FAVORITES = 'favorites';

let dbInstance = null;

export const DB = {
    async open() {
        if (dbInstance) return dbInstance;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('Database error:', event.target.error);
                reject(event.target.error);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create new stores if they don't exist
                if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
                    const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
                    store.createIndex('lastOpenedAt', 'lastOpenedAt', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORE_AUDIOS)) {
                    const store = db.createObjectStore(STORE_AUDIOS, { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORE_SUBTITLES)) {
                    const store = db.createObjectStore(STORE_SUBTITLES, { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORE_PODCASTS)) {
                    const store = db.createObjectStore(STORE_PODCASTS, { keyPath: 'feedUrl' });
                    store.createIndex('addedAt', 'addedAt', { unique: false });
                    store.createIndex('title', 'title', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORE_FAVORITES)) {
                    const store = db.createObjectStore(STORE_FAVORITES, { keyPath: 'key' });
                    store.createIndex('addedAt', 'addedAt', { unique: false });
                    store.createIndex('feedUrl', 'feedUrl', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                resolve(dbInstance);
            };
        });
    },

    // --- Capacity Checks ---

    async count(storeName) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // --- CRUD: Audio ---

    async addAudio(id, blob, metadata = {}) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_AUDIOS], 'readwrite');
            const store = transaction.objectStore(STORE_AUDIOS);
            store.add({
                id,
                blob,
                size: blob.size,
                type: blob.type,
                createdAt: Date.now(),
                ...metadata
            });
            transaction.oncomplete = () => resolve(id);
            transaction.onerror = (e) => reject(e.target.error);
        });
    },

    async getAudio(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_AUDIOS], 'readonly');
            const store = transaction.objectStore(STORE_AUDIOS);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async deleteAudio(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_AUDIOS], 'readwrite');
            const store = transaction.objectStore(STORE_AUDIOS);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // --- CRUD: Subtitle ---

    async addSubtitle(id, content, metadata = {}) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_SUBTITLES], 'readwrite');
            const store = transaction.objectStore(STORE_SUBTITLES);
            store.add({
                id,
                content,
                size: new Blob([content]).size,
                createdAt: Date.now(),
                ...metadata
            });
            transaction.oncomplete = () => resolve(id);
            transaction.onerror = (e) => reject(e.target.error);
        });
    },

    async getSubtitle(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_SUBTITLES], 'readonly');
            const store = transaction.objectStore(STORE_SUBTITLES);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async deleteSubtitle(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_SUBTITLES], 'readwrite');
            const store = transaction.objectStore(STORE_SUBTITLES);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // --- CRUD: Session ---

    async createSession(id, data = {}) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_SESSIONS], 'readwrite');
            const store = transaction.objectStore(STORE_SESSIONS);
            store.add({
                id,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lastOpenedAt: Date.now(),
                progress: 0,
                duration: 0,
                audioId: null,
                subtitleId: null,
                ...data
            });
            transaction.oncomplete = () => resolve(id);
            transaction.onerror = (e) => reject(e.target.error);
        });
    },

    async updateSession(id, updates) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_SESSIONS], 'readwrite');
            const store = transaction.objectStore(STORE_SESSIONS);
            const getReq = store.get(id);

            getReq.onsuccess = () => {
                const session = getReq.result;
                if (!session) {
                    reject(new Error(`Session ${id} not found`));
                    return;
                }
                const updatedSession = { 
                    ...session, 
                    ...updates, 
                    updatedAt: Date.now() 
                };
                // If progress is updated, touch lastOpenedAt
                if (updates.progress !== undefined || updates.lastOpenedAt) {
                    updatedSession.lastOpenedAt = updates.lastOpenedAt || Date.now();
                }
                const putReq = store.put(updatedSession);
                putReq.onsuccess = () => resolve(updatedSession);
                putReq.onerror = (e) => reject(e.target.error);
            };
            getReq.onerror = (e) => reject(e.target.error);
        });
    },

    async getSession(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_SESSIONS], 'readonly');
            const store = transaction.objectStore(STORE_SESSIONS);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAllSessions() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_SESSIONS], 'readonly');
            const store = transaction.objectStore(STORE_SESSIONS);
            const request = store.getAll();
            request.onsuccess = () => {
                const sessions = request.result || [];
                // Sort by lastOpenedAt desc
                sessions.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
                resolve(sessions);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async deleteSession(id) {
        // Note: cascading delete (deleting linked audio/subtitle) is logic level responsibility
        // DB level just deletes the session record for now
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_SESSIONS], 'readwrite');
            const store = transaction.objectStore(STORE_SESSIONS);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // --- CRUD: Podcasts (Library / Subscriptions) ---

    async upsertPodcast(podcast) {
        const db = await this.open();
        const entry = podcast && typeof podcast === 'object' ? podcast : {};
        const feedUrl = typeof entry.feedUrl === 'string' ? entry.feedUrl.trim() : '';
        if (!feedUrl) throw new Error('missing-feedUrl');

        const normalized = {
            feedUrl,
            title: entry.title || '',
            author: entry.author || '',
            artworkUrl: entry.artworkUrl || '',
            collectionViewUrl: entry.collectionViewUrl || '',
            addedAt: typeof entry.addedAt === 'number' ? entry.addedAt : Date.now(),
            updatedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_PODCASTS], 'readwrite');
            const store = transaction.objectStore(STORE_PODCASTS);
            store.put(normalized);
            transaction.oncomplete = () => resolve(normalized);
            transaction.onerror = (e) => reject(e.target.error);
        });
    },

    async deletePodcast(feedUrl) {
        const db = await this.open();
        const key = typeof feedUrl === 'string' ? feedUrl.trim() : '';
        if (!key) return;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_PODCASTS], 'readwrite');
            const store = transaction.objectStore(STORE_PODCASTS);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getAllPodcasts() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_PODCASTS], 'readonly');
            const store = transaction.objectStore(STORE_PODCASTS);
            const request = store.getAll();
            request.onsuccess = () => {
                const items = request.result || [];
                items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
                resolve(items);
            };
            request.onerror = () => reject(request.error);
        });
    },

    // --- CRUD: Favorites (Episode bookmarks) ---

    async upsertFavorite(favorite) {
        const db = await this.open();
        const entry = favorite && typeof favorite === 'object' ? favorite : {};
        const key = typeof entry.key === 'string' ? entry.key.trim() : '';
        const feedUrl = typeof entry.feedUrl === 'string' ? entry.feedUrl.trim() : '';
        const audioUrl = typeof entry.audioUrl === 'string' ? entry.audioUrl.trim() : '';
        if (!key || !feedUrl || !audioUrl) throw new Error('missing-favorite-key');

        const normalized = {
            key,
            feedUrl,
            audioUrl,
            episodeId: entry.episodeId || audioUrl,
            episodeTitle: entry.episodeTitle || audioUrl,
            episodeDate: entry.episodeDate || '',
            podcastTitle: entry.podcastTitle || '',
            podcastAuthor: entry.podcastAuthor || '',
            podcastArtworkUrl: entry.podcastArtworkUrl || '',
            addedAt: typeof entry.addedAt === 'number' ? entry.addedAt : Date.now(),
            updatedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_FAVORITES], 'readwrite');
            const store = transaction.objectStore(STORE_FAVORITES);
            store.put(normalized);
            transaction.oncomplete = () => resolve(normalized);
            transaction.onerror = (e) => reject(e.target.error);
        });
    },

    async deleteFavorite(key) {
        const db = await this.open();
        const id = typeof key === 'string' ? key.trim() : '';
        if (!id) return;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_FAVORITES], 'readwrite');
            const store = transaction.objectStore(STORE_FAVORITES);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getAllFavorites() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_FAVORITES], 'readonly');
            const store = transaction.objectStore(STORE_FAVORITES);
            const request = store.getAll();
            request.onsuccess = () => {
                const items = request.result || [];
                items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
                resolve(items);
            };
            request.onerror = () => reject(request.error);
        });
    },

    // --- Maintenance ---

    async vacuum() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_SESSIONS, STORE_AUDIOS, STORE_SUBTITLES], 'readwrite');
            const sessionsStore = tx.objectStore(STORE_SESSIONS);
            const audiosStore = tx.objectStore(STORE_AUDIOS);
            const subtitlesStore = tx.objectStore(STORE_SUBTITLES);

            let deletedCount = { audios: 0, subtitles: 0 };
            let activeAudioIds = new Set();
            let activeSubtitleIds = new Set();

            // 1. Get all sessions to find active IDs
            const sessionsReq = sessionsStore.getAll();

            sessionsReq.onsuccess = () => {
                const sessions = sessionsReq.result || [];
                sessions.forEach(s => {
                    if (s.audioId) activeAudioIds.add(s.audioId);
                    if (s.subtitleId) activeSubtitleIds.add(s.subtitleId);
                });

                // 2. Scan and clean Audios
                const audioCursor = audiosStore.openKeyCursor();
                audioCursor.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        if (!activeAudioIds.has(cursor.key)) {
                            // Found an orphan audio
                            cursor.delete();
                            deletedCount.audios++;
                        }
                        cursor.continue();
                    }
                };

                // 3. Scan and clean Subtitles
                const subCursor = subtitlesStore.openKeyCursor();
                subCursor.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        if (!activeSubtitleIds.has(cursor.key)) {
                            // Found an orphan subtitle
                            cursor.delete();
                            deletedCount.subtitles++;
                        }
                        cursor.continue();
                    }
                };
            };

            tx.oncomplete = () => {
                if (deletedCount.audios > 0 || deletedCount.subtitles > 0) {
                    console.log('[DB] Vacuum complete. Cleaned orphans:', deletedCount);
                }
                resolve(deletedCount);
            };
            
            tx.onerror = (e) => reject(e.target.error);
        });
    }
};
