const DB_NAME = 'readcast_db';
const DB_VERSION = 2; // Bump version to force upgrade/reset
const STORE_SESSIONS = 'sessions';
const STORE_AUDIOS = 'audios';
const STORE_SUBTITLES = 'subtitles';

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

                // Cleanup old stores if they exist (Clean slate strategy)
                const oldStores = ['files', 'library'];
                oldStores.forEach(store => {
                    if (db.objectStoreNames.contains(store)) {
                        db.deleteObjectStore(store);
                    }
                });

                // Create new stores
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
    }
};
