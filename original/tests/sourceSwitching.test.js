/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import StateManager from '../scripts/modules/stateManager.js';
import { ReadcastPlayer } from '../scripts/app.js';

function createBarePlayer({ subtitlesLoaded = true } = {}) {
    document.body.innerHTML = `
        <audio id="audioPlayer"></audio>
        <div id="transcript-container"></div>
    `;
    const container = document.getElementById('transcript-container');
    container.innerHTML = '<div>old subtitles</div>';

    const stateManager = new StateManager({
        subtitles: subtitlesLoaded ? [{ text: 'old', element: null }] : [],
        currentIndex: subtitlesLoaded ? 0 : -1,
        subtitlesLoaded,
        audioLoaded: false,
        currentMediaId: 's1',
        attemptedNavWithoutSubtitles: true
    });

    const player = {
        stateManager,
        uiManager: {
            elements: {
                container,
                audioPlayer: document.getElementById('audioPlayer')
            },
            updatePlayButtonIcon: vi.fn(),
            updateFollowButtonState: vi.fn(),
            updateProgress: vi.fn()
        },
        mediaManager: {
            loadAudio: vi.fn(() => ({ loaded: true, filename: 'a.mp3', objectUrl: 'blob:a' })),
            loadAudioUrl: vi.fn(() => ({ loaded: true, objectUrl: 'https://example.com/a.mp3' })),
            togglePlayPause: vi.fn(),
            isPaused: vi.fn(() => true)
        },
        coverObjectUrl: null,
        stopSubtitleSync: vi.fn(),
        isScrubbingProgress: false,
        audioDuration: 0
    };

    player.clearSubtitlesDisplay = ReadcastPlayer.prototype.clearSubtitlesDisplay;
    player.saveLastPlaybackState = vi.fn();
    player.updateRemotePlaybackProgress = vi.fn();

    return { player, container, stateManager };
}

describe('Source switching clears subtitles', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('clears subtitle state and DOM when loading a new audio file', () => {
        const { player, container, stateManager } = createBarePlayer({ subtitlesLoaded: true });
        const file = new File(['x'], 'a.mp3', { type: 'audio/mpeg' });

        ReadcastPlayer.prototype.loadAudio.call(player, file, true, '', 's2');

        const state = stateManager.getState();
        expect(state.subtitlesLoaded).toBe(false);
        expect(state.subtitles).toEqual([]);
        expect(state.currentIndex).toBe(-1);
        expect(state.attemptedNavWithoutSubtitles).toBe(false);
        expect(container.innerHTML).toBe('');
    });

    it('clears subtitle state and DOM when switching to a remote episode', () => {
        const { player, container, stateManager } = createBarePlayer({ subtitlesLoaded: true });

        ReadcastPlayer.prototype.playRemoteEpisode.call(player, {
            title: 'Episode',
            audioUrl: 'https://example.com/a.mp3',
            podcast: { title: 'Pod', artworkUrl: '' }
        });

        const state = stateManager.getState();
        expect(state.subtitlesLoaded).toBe(false);
        expect(state.subtitles).toEqual([]);
        expect(state.currentIndex).toBe(-1);
        expect(container.innerHTML).toBe('');
    });
});
