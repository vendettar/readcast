export default class LocalFilesStore {
    constructor({ getLocalSessions } = {}) {
        this.getLocalSessions = typeof getLocalSessions === 'function' ? getLocalSessions : async () => [];
        this.sessions = [];
        this.loading = false;
        this.drafts = new Map();
    }

    notifyCreated(session) {
        const candidate = session && typeof session === 'object' ? session : null;
        const id = candidate && candidate.id ? String(candidate.id).trim() : '';
        if (!id) return;

        const normalized = {
            ...candidate,
            id,
            lastOpenedAt: typeof candidate.lastOpenedAt === 'number' ? candidate.lastOpenedAt : Date.now()
        };

        this.drafts.set(id, normalized);
    }

    mergeSessions(loadedSessions) {
        const loaded = Array.isArray(loadedSessions) ? loadedSessions.filter(Boolean) : [];
        const byId = new Map(loaded.map((session) => [session.id, session]));

        const drafts = Array.from(this.drafts.values()).filter((session) => session && session.id);
        drafts.forEach((draft) => {
            if (byId.has(draft.id)) {
                this.drafts.delete(draft.id);
                return;
            }
            byId.set(draft.id, draft);
        });

        const merged = Array.from(byId.values());
        merged.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
        return merged;
    }

    async load() {
        this.loading = true;
        this.sessions = [];
        try {
            const sessions = await this.getLocalSessions();
            this.sessions = this.mergeSessions(sessions);
        } catch {
            this.sessions = this.mergeSessions([]);
        } finally {
            this.loading = false;
        }
        return this.sessions;
    }

    getPlayableSessions() {
        const sessions = Array.isArray(this.sessions) ? this.sessions : [];
        return sessions.filter((s) => s && s.audioId);
    }
}
