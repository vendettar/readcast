// src/store/playerStore.ts
import { create } from 'zustand';
import type { Subtitle } from '../libs/subtitles';
import { parseSrt } from '../libs/subtitles';

interface PlayerState {
    // 音频状态
    audioLoaded: boolean;
    audioUrl: string;
    audioTitle: string;
    coverArtUrl: string;
    isPlaying: boolean;
    progress: number;
    duration: number;
    pendingSeek: number | null;  // 当设置时，App 应同步到 audio element
    currentBlobUrl: string | null;  // Track blob URLs for cleanup

    // Session tracking for progress persistence
    sessionId: string | null;

    // 字幕状态
    subtitles: Subtitle[];
    subtitlesLoaded: boolean;
    currentIndex: number;

    // Actions
    setProgress: (progress: number) => void;
    setDuration: (duration: number) => void;
    setCurrentIndex: (index: number) => void;
    setAudioUrl: (url: string, title?: string, coverArt?: string) => void;
    setSubtitles: (subtitles: Subtitle[]) => void;
    setSessionId: (id: string | null) => void;
    seekTo: (time: number) => void;  // 统一 seek 入口
    clearPendingSeek: () => void;
    play: () => void;
    pause: () => void;
    togglePlayPause: () => void;
    reset: () => void;
    loadAudio: (file: File) => void;
    loadSubtitles: (file: File) => Promise<void>;
}

const initialState = {
    audioLoaded: false,
    audioUrl: '',
    audioTitle: '',
    coverArtUrl: '',
    isPlaying: false,
    progress: 0,
    duration: 0,
    pendingSeek: null as number | null,
    sessionId: null as string | null,
    currentBlobUrl: null as string | null,
    subtitles: [] as Subtitle[],
    subtitlesLoaded: false,
    currentIndex: -1,
};

export const usePlayerStore = create<PlayerState>((set) => ({
    ...initialState,

    setProgress: (progress) => set({ progress }),
    setDuration: (duration) => set({ duration }),
    setCurrentIndex: (index) => set({ currentIndex: index }),
    setAudioUrl: (url, title = '', coverArt = '') => set((state) => {
        // Revoke old blob URL if exists
        if (state.currentBlobUrl && state.currentBlobUrl !== url) {
            URL.revokeObjectURL(state.currentBlobUrl);
        }

        // Track new blob URL if it's a blob
        const isBlobUrl = url.startsWith('blob:');

        return {
            audioUrl: url,
            audioLoaded: !!url,
            audioTitle: title,
            coverArtUrl: coverArt,
            currentBlobUrl: isBlobUrl ? url : null,
        };
    }),
    setSubtitles: (subtitles) => set({ subtitles, subtitlesLoaded: subtitles.length > 0 }),
    setSessionId: (id) => set({ sessionId: id }),

    // 统一 seek 入口：设置 pendingSeek，App 层监听并同步到 audio element
    seekTo: (time) => set((state) => {
        const clampedTime = Math.max(0, Math.min(time, state.duration || Infinity));
        return { pendingSeek: clampedTime, progress: clampedTime };
    }),
    clearPendingSeek: () => set({ pendingSeek: null }),

    play: () => set({ isPlaying: true }),
    pause: () => set({ isPlaying: false }),
    togglePlayPause: () => set((state) => ({ isPlaying: !state.isPlaying })),

    reset: () => {
        // Revoke any existing blob URLs
        const state = usePlayerStore.getState();
        if (state.currentBlobUrl) {
            URL.revokeObjectURL(state.currentBlobUrl);
        }
        set(initialState);
    },

    loadAudio: (file) => {
        // Revoke old blob URL if exists
        const state = usePlayerStore.getState();
        if (state.currentBlobUrl) {
            URL.revokeObjectURL(state.currentBlobUrl);
        }
        const url = URL.createObjectURL(file);
        set({
            audioUrl: url,
            audioLoaded: true,
            audioTitle: file.name,
            coverArtUrl: '',
            currentBlobUrl: url,
        });
    },

    loadSubtitles: async (file) => {
        const content = await file.text();
        const subtitles = parseSrt(content);
        set({
            subtitles,
            subtitlesLoaded: true,
            currentIndex: -1,  // Reset to avoid stale index from previous subtitles
        });
    },
}));
