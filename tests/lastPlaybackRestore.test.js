/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReadcastPlayer } from '../scripts/app.js';

describe('Last playback restore (remote)', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = `<audio id="audioPlayer"></audio><div id="transcript-container"></div>`;
    });

    it('persists remote playback when starting an episode', () => {
        const audioPlayer = document.getElementById('audioPlayer');
        const player = {
            uiManager: { elements: { audioPlayer }, updatePlayButtonIcon: vi.fn(), updateFollowButtonState: vi.fn(), updateProgress: vi.fn() },
            mediaManager: { loadAudioUrl: vi.fn(() => ({ loaded: true, objectUrl: 'https://example.com/a.mp3' })), togglePlayPause: vi.fn() },
            stateManager: { updateState: vi.fn(), getState: vi.fn(() => ({})) },
            stopSubtitleSync: vi.fn(),
            clearSubtitlesDisplay: vi.fn(),
            audioDuration: 0,
            isScrubbingProgress: false,
            lastPlaybackState: null,
            saveLastPlaybackState: ReadcastPlayer.prototype.saveLastPlaybackState
        };

        ReadcastPlayer.prototype.playRemoteEpisode.call(
            player,
            { title: 'Ep', audioUrl: 'https://example.com/a.mp3', podcast: { title: 'Pod', artworkUrl: '' } },
            { autoplay: false }
        );

        const raw = localStorage.getItem('readcastLastPlaybackV1');
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw);
        expect(parsed.type).toBe('remote');
        expect(parsed.audioUrl).toBe('https://example.com/a.mp3');
    });

    it('restores remote playback without autoplay', async () => {
        localStorage.setItem(
            'readcastLastPlaybackV1',
            JSON.stringify({
                type: 'remote',
                audioUrl: 'https://example.com/a.mp3',
                title: 'Ep',
                podcast: { title: 'Pod', artworkUrl: '' },
                progress: 12,
                duration: 120
            })
        );

        const player = {
            playRemoteEpisode: vi.fn(),
            lastPlaybackState: null,
            loadLastPlaybackState: ReadcastPlayer.prototype.loadLastPlaybackState,
            restoreLastPlayback: ReadcastPlayer.prototype.restoreLastPlayback
        };

        const ok = await ReadcastPlayer.prototype.restoreLastPlayback.call(player);
        expect(ok).toBe(true);
        expect(player.playRemoteEpisode).toHaveBeenCalledWith(
            { title: 'Ep', audioUrl: 'https://example.com/a.mp3', podcast: { title: 'Pod', artworkUrl: '' } },
            { autoplay: false, restore: { progress: 12, duration: 120 } }
        );
    });
});

