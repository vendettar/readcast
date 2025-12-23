// src/__tests__/useFileHandler.test.ts
import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useFileHandler } from '../hooks/useFileHandler';
import { DB } from '../libs/db';
import { usePlayerStore } from '../store/playerStore';

// Mock DB
vi.mock('../libs/db', () => ({
    DB: {
        addAudio: vi.fn().mockResolvedValue('audio-id'),
        addSubtitle: vi.fn().mockResolvedValue('subtitle-id'),
        createSession: vi.fn().mockResolvedValue(undefined),
    }
}));

// Mock logger
vi.mock('../libs/logger', () => ({
    log: vi.fn(),
    error: vi.fn(),
}));

// Mock sessionId generator
vi.mock('../libs/session', () => ({
    generateSessionId: vi.fn(() => 'mock-session-id'),
}));

describe('useFileHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset player store mocks
        usePlayerStore.setState({
            loadAudio: vi.fn(),
            loadSubtitles: vi.fn(),
            setSessionId: vi.fn(),
        });
    });

    it('should process audio files and create a session', async () => {
        const mockAudioFile = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' });

        const { result } = renderHook(() => useFileHandler());

        await act(async () => {
            await result.current.processFiles([mockAudioFile]);
        });

        const store = usePlayerStore.getState();
        expect(store.loadAudio).toHaveBeenCalledWith(mockAudioFile);
        expect(DB.addAudio).toHaveBeenCalledWith(mockAudioFile, 'test.mp3');
        expect(DB.createSession).toHaveBeenCalledWith('mock-session-id', expect.objectContaining({
            audioId: 'audio-id',
            audioFilename: 'test.mp3',
        }));
        expect(store.setSessionId).toHaveBeenCalledWith('mock-session-id');
    });

    it('should process both audio and srt files together', async () => {
        const mockAudioFile = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });
        const mockSrtFile = new File(['1\n00:00:01,000 --> 00:00:02,000\nHello'], 'test.srt');

        // Mock File.text()
        mockSrtFile.text = vi.fn().mockResolvedValue('srt content');

        const { result } = renderHook(() => useFileHandler());

        await act(async () => {
            await result.current.processFiles([mockAudioFile, mockSrtFile]);
        });

        const store = usePlayerStore.getState();
        expect(store.loadAudio).toHaveBeenCalledWith(mockAudioFile);
        expect(store.loadSubtitles).toHaveBeenCalledWith(mockSrtFile);

        expect(DB.createSession).toHaveBeenCalledWith('mock-session-id', {
            audioId: 'audio-id',
            audioFilename: 'test.mp3',
            subtitleId: 'subtitle-id',
            subtitleFilename: 'test.srt',
        });
    });

    it('should not create a session if no audio file is provided', async () => {
        const mockSrtFile = new File(['srt content'], 'test.srt');
        mockSrtFile.text = vi.fn().mockResolvedValue('srt content');

        const { result } = renderHook(() => useFileHandler());

        await act(async () => {
            await result.current.processFiles([mockSrtFile]);
        });

        expect(DB.createSession).not.toHaveBeenCalled();
        expect(usePlayerStore.getState().setSessionId).not.toHaveBeenCalled();
    });
});
