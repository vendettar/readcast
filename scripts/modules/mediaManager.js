// scripts/modules/mediaManager.js
import uiManager from './uiManager.js';

class MediaManager {
  constructor(onPlay, onPause, onSeek, onError) {
    this.audioPlayer = uiManager.elements.audioPlayer;
    this.onError = onError;

    // Bind methods to preserve 'this' context for event listeners
    this.handlePlayEvent = onPlay;
    this.handlePauseEvent = onPause;
    this.handleSeekEvent = onSeek;
    this.handleErrorEvent = (e) => {
      console.error('Audio player error:', e);
      if (this.onError) this.onError(e);
    };

    if (this.audioPlayer) {
      this.audioPlayer.addEventListener('play', this.handlePlayEvent);
      this.audioPlayer.addEventListener('pause', this.handlePauseEvent);
      this.audioPlayer.addEventListener('seeked', this.handleSeekEvent);
      this.audioPlayer.addEventListener('error', this.handleErrorEvent);
    }
    this.audioObjectUrl = null;
  }

  destroy() {
    if (this.audioPlayer) {
      this.audioPlayer.removeEventListener('play', this.handlePlayEvent);
      this.audioPlayer.removeEventListener('pause', this.handlePauseEvent);
      this.audioPlayer.removeEventListener('seeked', this.handleSeekEvent);
      this.audioPlayer.removeEventListener('error', this.handleErrorEvent);
    }
    if (this.audioObjectUrl) {
      URL.revokeObjectURL(this.audioObjectUrl);
      this.audioObjectUrl = null;
    }
  }

  loadAudio(file) {
    if (!this.audioPlayer) return { loaded: false, filename: '' };

    // Always reset playback state when swapping sources
    this.audioPlayer.pause();
    this.audioPlayer.currentTime = 0;

    if (this.audioObjectUrl) {
      URL.revokeObjectURL(this.audioObjectUrl);
    }

    this.audioObjectUrl = URL.createObjectURL(file);
    this.audioPlayer.src = this.audioObjectUrl;
    return {
      loaded: true,
      filename: file.name,
      objectUrl: this.audioObjectUrl,
    };
  }

  loadAudioUrl(url) {
    if (!this.audioPlayer)
      return { loaded: false, filename: '', objectUrl: '' };
    const src = (url || '').trim();
    if (!src) return { loaded: false, filename: '', objectUrl: '' };

    this.audioPlayer.pause();
    this.audioPlayer.currentTime = 0;

    if (this.audioObjectUrl) {
      if (this.audioObjectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(this.audioObjectUrl);
      }
      this.audioObjectUrl = null;
    }

    this.audioObjectUrl = src;
    this.audioPlayer.src = src;
    return { loaded: true, filename: src, objectUrl: src };
  }

  jumpToTime(time) {
    if (!this.audioPlayer) return;
    const shouldResume = !this.audioPlayer.paused;
    this.audioPlayer.currentTime = time;
    if (shouldResume) {
      const playPromise = this.audioPlayer.play();
      this.handlePlaybackPromise(playPromise);
    }
  }

  togglePlayPause() {
    if (!this.audioPlayer) return;
    if (this.audioPlayer.paused) {
      const playPromise = this.audioPlayer.play();
      this.handlePlaybackPromise(playPromise);
    } else {
      this.audioPlayer.pause();
    }
  }

  getCurrentTime() {
    return this.audioPlayer ? this.audioPlayer.currentTime : 0;
  }

  isPaused() {
    return this.audioPlayer ? this.audioPlayer.paused : true;
  }

  handlePlaybackPromise(playPromise) {
    if (!playPromise || typeof playPromise.catch !== 'function') return;
    playPromise.catch((error) => {
      if (error && error.name === 'AbortError') {
        return;
      }
      console.warn('Audio playback failed', error);
      if (this.onError) this.onError(error);
    });
  }
}

export default MediaManager;
