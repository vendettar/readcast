import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { DB } from '../dexieDb';

// Use a separate test database to avoid conflicts
const TEST_DB_NAME = 'readcast-v2-test';

describe('Dexie database operations', () => {
    beforeEach(async () => {
        // Delete the test database before each test to ensure clean state
        await Dexie.delete(TEST_DB_NAME);
    });

    it('can create and retrieve sessions', async () => {
        await DB.createSession('test_session_1', {
            progress: 12,
            duration: 345,
            audioFilename: 'test.mp3',
        });

        const session = await DB.getSession('test_session_1');
        expect(session).toBeDefined();
        expect(session?.id).toBe('test_session_1');
        expect(session?.progress).toBe(12);
        expect(session?.duration).toBe(345);
        expect(session?.audioFilename).toBe('test.mp3');
    });

    it('can update existing sessions', async () => {
        await DB.createSession('test_session_2', { progress: 0 });
        await DB.updateSession('test_session_2', { progress: 100 });

        const session = await DB.getSession('test_session_2');
        expect(session?.progress).toBe(100);
    });

    it('can store and retrieve settings', async () => {
        await DB.setSetting('country', 'us');
        const value = await DB.getSetting('country');
        expect(value).toBe('us');
    });

    it('returns null for non-existent settings', async () => {
        const value = await DB.getSetting('non_existent_key');
        expect(value).toBeNull();
    });

    it('can get last session ordered by lastOpenedAt', async () => {
        // Use unique IDs and far future dates to ensure this session is last
        const oldId = 'last_test_old_' + Date.now();
        const newId = 'last_test_new_' + Date.now();
        await DB.createSession(oldId, { lastOpenedAt: 1000 });
        await DB.createSession(newId, { lastOpenedAt: Date.now() + 1000000 });

        const lastSession = await DB.getLastSession();
        expect(lastSession?.id).toBe(newId);
    });
});
