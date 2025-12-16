import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto'; // Mock indexedDB globally
import { DB } from '../scripts/modules/db.js';

describe('IndexedDB Module', () => {
    // Helper to create a dummy file
    const createDummyFile = (size = 1024) => {
        return new Blob(['a'.repeat(size)], { type: 'audio/mpeg' });
    };

    const TEST_ID = 'test-uuid-123';

    it('should open the database without error', async () => {
        const db = await DB.open();
        expect(db).toBeDefined();
        expect(db.name).toBe('readcast_db');
    });

    it('should add audio file and retrieve it correctly', async () => {
        const file = createDummyFile();
        const meta = { title: 'Test Audio' };

        await DB.addAudio(TEST_ID, file, meta);

        // Verify Audio
        const savedData = await DB.getAudio(TEST_ID);
        expect(savedData).toBeDefined();
        expect(savedData.size).toBe(1024);
        expect(savedData.title).toBe('Test Audio');
        expect(savedData.blob).toBeInstanceOf(Blob);
    });

    it('should create sessions and retrieve them sorted by lastOpenedAt', async () => {
        const id1 = 'session-1';
        const id2 = 'session-2';

        // Create sessions with different lastOpenedAt times
        await DB.createSession(id1, { title: 'Old', lastOpenedAt: 1000 });
        await DB.createSession(id2, { title: 'New', lastOpenedAt: 2000 });

        const sessions = await DB.getAllSessions();

        // Check sort order: The item with higher lastOpenedAt (id2) should appear before (id1)
        const relevantItems = sessions.filter(i => i.id === id1 || i.id === id2);

        expect(relevantItems).toHaveLength(2);
        expect(relevantItems[0].id).toBe(id2); // 2000 > 1000
        expect(relevantItems[1].id).toBe(id1);
    });

    it('should update session', async () => {
        const sessionId = 'upd-session';
        await DB.createSession(sessionId, { title: 'Original', progress: 0 });

        await DB.updateSession(sessionId, { progress: 50, lastOpenedAt: 9999 });

        const updated = await DB.getSession(sessionId);
        expect(updated.progress).toBe(50);
        expect(updated.lastOpenedAt).toBe(9999);
        expect(updated.title).toBe('Original'); // Should remain
    });

    it('should delete session', async () => {
        const delId = 'del-session';
        await DB.createSession(delId, { title: 'To Delete' });

        await DB.deleteSession(delId);

        const session = await DB.getSession(delId);

        expect(session).toBeUndefined();
    });

    it('should handle non-existent audio retrieval', async () => {
        const result = await DB.getAudio('non-existent');
        expect(result).toBeUndefined(); 
    });
});