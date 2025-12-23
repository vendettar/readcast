// src/__tests__/useSession.test.ts
import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useSession } from '../hooks/useSession';
import { DB } from '../libs/dexieDb';
import { usePlayerStore } from '../store/playerStore';
import { generateSessionId } from '../libs/session';

// Mock DB
vi.mock('../libs/dexieDb', () => ({
    DB: {
        getLastSession: vi.fn().mockResolvedValue(null),
        createSession: vi.fn().mockResolvedValue(undefined),
        updateSession: vi.fn().mockResolvedValue(undefined),
        getSession: vi.fn().mockResolvedValue(null),
    }
}));

// Mock logger to keep output clean
vi.mock('../libs/logger', () => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));

// Mock sessionId generator
vi.mock('../libs/session', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../libs/session')>();
    return {
        ...actual,
        generateSessionId: vi.fn(() => 'mock-session-id'),
    };
});

describe('useSession', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        // Reset player store
        usePlayerStore.setState({
            audioLoaded: false,
            subtitlesLoaded: false,
            progress: 0,
            duration: 0,
            sessionId: null,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should restore last session on mount if progress exists', async () => {
        const mockLastSession = {
            id: 'last-session-id',
            progress: 120,
            duration: 300,
            audioId: null,
            subtitleId: null,
            audioFilename: '',
            subtitleFilename: '',
            createdAt: 0,
            updatedAt: 0,
            lastOpenedAt: 0,
        };
        vi.mocked(DB.getLastSession).mockResolvedValue(mockLastSession);

        renderHook(() => useSession());

        // Wait for async initSession
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        expect(usePlayerStore.getState().sessionId).toBe('last-session-id');
    });

    it('should create a new session when audio is loaded', async () => {
        vi.mocked(DB.getLastSession).mockResolvedValue(undefined);

        renderHook(() => useSession());

        // Simulate loading audio
        act(() => {
            usePlayerStore.setState({ audioLoaded: true, duration: 300 });
        });

        // Wait for async createNewSession
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        expect(generateSessionId).toHaveBeenCalled();
        expect(usePlayerStore.getState().sessionId).toBe('mock-session-id');
        expect(DB.createSession).toHaveBeenCalledWith('mock-session-id', {
            progress: 0,
            duration: 300,
        });
    });

    it('should save progress every 5 seconds', async () => {
        usePlayerStore.setState({ sessionId: 'active-session', progress: 10, duration: 100 });

        renderHook(() => useSession());

        // First save should happen immediately because lastSave is 0
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(DB.updateSession).toHaveBeenCalledTimes(1);

        // Advance time by 6 seconds (total 6s)
        await act(async () => {
            vi.advanceTimersByTime(6000);
        });

        // Update progress AFTER advancing time to trigger call where interval has passed
        act(() => {
            usePlayerStore.setState({ progress: 20 });
        });

        await act(async () => {
            await vi.runAllTimersAsync();
        });

        expect(DB.updateSession).toHaveBeenCalledTimes(2);
        expect(DB.updateSession).toHaveBeenLastCalledWith('active-session', {
            progress: 20,
            duration: 100,
        });
    });

    it('should save progress on unmount', async () => {
        usePlayerStore.setState({ sessionId: 'unmount-session', progress: 50, duration: 200 });

        const { unmount } = renderHook(() => useSession());

        // Initial save
        await act(async () => {
            await vi.runAllTimersAsync();
        });

        // Mock updateSession for unmount
        vi.mocked(DB.updateSession).mockClear();

        unmount();

        expect(DB.updateSession).toHaveBeenCalledWith('unmount-session', {
            progress: 50,
            duration: 200,
        });
    });
});
