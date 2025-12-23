// src/hooks/useSession.ts
import { useEffect, useRef, useCallback } from 'react';
import { DB } from '../libs/db';
import { usePlayerStore } from '../store/playerStore';
import { generateSessionId } from '../libs/session';
import { log, error as logError } from '../libs/logger';

const SAVE_INTERVAL = 5000; // Save progress every 5 seconds

export function useSession() {
    const lastSaveRef = useRef<number>(0);

    const {
        audioLoaded,
        subtitlesLoaded,
        progress,
        duration,
        setProgress,
        sessionId: storeSessionId,
        setSessionId: setStoreSessionId,
    } = usePlayerStore();

    // Initialize session on mount (restore last session if no storeSessionId)
    useEffect(() => {
        // If storeSessionId is already set (e.g., from useFileHandler), skip restore
        if (storeSessionId) return;

        const initSession = async () => {
            try {
                // Try to restore last session
                const lastSession = await DB.getLastSession();
                if (lastSession && lastSession.progress > 0) {
                    // Restore progress if we have a recent session
                    setStoreSessionId(lastSession.id);

                    log('[Session] Restored session:', lastSession.id, 'progress:', lastSession.progress);
                }
            } catch (err) {
                logError('[Session] Failed to restore session:', err);
            }
        };

        initSession();
    }, [storeSessionId, setStoreSessionId]);

    // Create new session when files are loaded (only if no session exists)
    useEffect(() => {
        if (!audioLoaded && !subtitlesLoaded) return;
        // If we already have a sessionId (from LocalFiles), don't create new one
        if (storeSessionId) return;

        const createNewSession = async () => {
            const id = generateSessionId();
            setStoreSessionId(id);


            try {
                await DB.createSession(id, {
                    progress: 0,
                    duration: duration || 0,
                });
                log('[Session] Created new session:', id);
            } catch (err) {
                logError('[Session] Failed to create session:', err);
            }
        };

        createNewSession();
    }, [audioLoaded, subtitlesLoaded, duration, storeSessionId, setStoreSessionId]);

    // Save progress periodically
    const saveProgress = useCallback(async () => {
        // Read from store directly to avoid effect timing races.
        const currentSessionId = usePlayerStore.getState().sessionId;
        if (!currentSessionId) return;
        if (progress <= 0) return;

        const now = Date.now();
        if (now - lastSaveRef.current < SAVE_INTERVAL) return;
        lastSaveRef.current = now;

        try {
            await DB.updateSession(currentSessionId, {
                progress,
                duration: duration || 0,
            });
            log('[Session] Saved progress:', progress.toFixed(1));
        } catch (err) {
            logError('[Session] Failed to save progress:', err);
        }
    }, [progress, duration]);

    // Auto-save on progress change
    useEffect(() => {
        if (progress > 0) {
            saveProgress();
        }
    }, [progress, saveProgress]);

    // Save on unmount
    useEffect(() => {
        return () => {
            const currentSessionId = usePlayerStore.getState().sessionId;
            const currentProgress = usePlayerStore.getState().progress;
            const currentDuration = usePlayerStore.getState().duration;

            if (currentSessionId && currentProgress > 0) {
                DB.updateSession(currentSessionId, {
                    progress: currentProgress,
                    duration: currentDuration,
                }).catch(logError);
            }
        };
    }, []);

    // Restore progress to audio element
    const restoreProgress = useCallback(async (audioElement: HTMLAudioElement) => {
        // Read from store directly to avoid effect timing races (e.g. setSessionId → canplay/loadedmetadata).
        const currentSessionId = usePlayerStore.getState().sessionId;
        if (!currentSessionId) return;

        try {
            const session = await DB.getSession(currentSessionId);
            if (session && session.progress > 0) {
                audioElement.currentTime = session.progress;
                setProgress(session.progress);
                log('[Session] Restored playback position:', session.progress);
            }
        } catch (err) {
            logError('[Session] Failed to restore progress:', err);
        }
    }, [setProgress]);

    return {
        sessionId: storeSessionId,
        saveProgress,
        restoreProgress,
    };
}
