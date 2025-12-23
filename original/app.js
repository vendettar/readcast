import { Translator, translateDom } from './modules/i18n.js';
import { languageNativeNames } from './modules/translations.js';
import {
  parseSrt,
  findSubtitleIndex,
  formatTimeLabel,
} from './modules/subtitles.js';
import { createCopyButton, refreshCopyButtonLabels } from './modules/copy.js';
import {
  applyCanvasBackground,
  applyThemeMode,
  getCanvasPresets,
  watchSystemTheme,
} from './modules/theme.js';
import { setupActionMenus } from './modules/actions.js';
import StateManager from './modules/stateManager.js';
import FileManager from './modules/fileManager.js';
import MediaManager from './modules/mediaManager.js';
import SelectionManager from './modules/selectionManager.js';
import SourcePickerModal from './modules/sourcePickerModal.js';
import LocalFilesModal from './modules/localFilesModal.js';
import uiManager from './modules/uiManager.js';
import { DB } from './modules/db.js';

const PREF_STORAGE_KEY = 'readcastPrefs';
const LAST_PLAYBACK_KEY = 'readcastLastPlaybackV1';

function loadPreferences() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PREF_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('Failed to load preferences', error);
    return {};
  }
}

function savePreferences(prefs) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.warn('Failed to save preferences', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const player = new ReadcastPlayer();
  player.init();
});

export class ReadcastPlayer {
  constructor() {
    this.uiManager = uiManager;
    this.mediaManager = new MediaManager(
      () => this.handlePlay(),
      () => this.handlePause(),
      () => this.handleSeek(),
      () => this.stateManager.updateState({ audioError: true })
    );
    this.fileManager = new FileManager({
      onAudioLoad: (file, hasHeader, coverUrl, id) =>
        this.loadAudio(file, hasHeader, coverUrl, id),
    });

    this.preferences = loadPreferences();
    this.canvasPresets = getCanvasPresets();
    const initialThemeMode = this.preferences.themeMode || 'system';
    let initialCanvasColor =
      this.preferences.canvasColor || this.canvasPresets[0] || '';

    // Ensure uiManager.elements.body is available for early theme application
    // this.uiManager is already initialized at the start of the constructor
    const { resolved } = applyThemeMode(
      initialThemeMode,
      this.uiManager.elements.body
    );
    const newCanvasColor = applyCanvasBackground(
      initialCanvasColor,
      this.uiManager.elements.body
    );

    this.stateManager = new StateManager({
      subtitles: [],
      currentIndex: -1,
      audioLoaded: false,
      subtitlesLoaded: false,
      audioFilename: '',
      audioObjectUrl: '',
      currentMediaId: null, // New: DB ID for persistence
      syncAnimationId: null,
      themeMode: initialThemeMode,
      resolvedThemeMode: resolved, // Use the immediately resolved theme
      canvasColor: newCanvasColor, // Use the immediately applied canvas color
      attemptedPlayWithoutAudio: false,
      attemptedNavWithoutSubtitles: false,
      vbrHeaderMissing: false,
      fileError: null,
      audioError: false,
      coverArtUrl: '',
      isFollowing: true,
      suppressScrollDetection: false,
      scrollReleaseTimer: null,
      subtitleStorageTooLarge: false,
      subtitleStorageFailed: false,
    });

    const {
      languageAction,
      themeAction,
      shortcutAction,
      qaAction,
      settingsAction,
    } = this.uiManager.elements;
    this.actionControls = [
      languageAction,
      themeAction,
      shortcutAction,
      qaAction,
      settingsAction,
    ].filter(Boolean);

    this.isScrubbingProgress = false;
    this.audioDuration = 0;
    this.lastProgressSave = 0;

    const initialLanguage = this.preferences.language || 'en';
    this.translator = new Translator(initialLanguage);
    this.translator.setLanguage(initialLanguage);
    this.t = this.translator.t.bind(this.translator);

    this.themeModeButtons = [];
    this.canvasButtons = [];
    this.unwatchSystemTheme = null;
    this.selectionManager = new SelectionManager(this.t, {
      onLookupModalChange: (open) => this.handleLookupModalChange(open),
    });
    this.pausedForLookupModal = false;
    this.filePickerMode = 'play';
    this.sourcePickerModal = new SourcePickerModal({
      t: this.t,
      onPlayEpisode: (payload) => this.playRemoteEpisode(payload),
    });
    this.localFilesModal = new LocalFilesModal({
      t: this.t,
      onPlayLocalSession: (sessionId) => void this.playLocalSession(sessionId),
      getLocalSessions: async () => {
        const sessions = await DB.getAllSessions();
        return (sessions || []).filter((session) => session && session.audioId);
      },
      onRequestUpload: () => this.openFilePicker({ mode: 'library' }),
      onDeleteSession: async (sessionId) => {
          if (this.stateManager.getState().currentMediaId === sessionId) {
              // If deleting current playing, unload it
              this.loadAudio(null, true, '', null);
          }
          await this.fileManager.deleteSession(sessionId);
      }
    });

    this.topRailTooltipEl = null;
    this.topRailTooltipActiveKey = '';
    this.lastPlaybackState = null;
  }

  loadLastPlaybackState() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(LAST_PLAYBACK_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  saveLastPlaybackState(nextState) {
    if (typeof localStorage === 'undefined') return;
    const state = nextState && typeof nextState === 'object' ? nextState : null;
    if (!state) return;
    this.lastPlaybackState = state;
    try {
      localStorage.setItem(LAST_PLAYBACK_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  updateRemotePlaybackProgress({ progress, duration } = {}) {
    const current =
      this.lastPlaybackState && typeof this.lastPlaybackState === 'object'
        ? this.lastPlaybackState
        : null;
    if (!current || current.type !== 'remote') return;
    const next = {
      ...current,
      progress: Number.isFinite(progress) ? progress : current.progress,
      duration: Number.isFinite(duration) ? duration : current.duration,
      updatedAt: Date.now(),
    };
    this.saveLastPlaybackState(next);
  }

  async restoreLastPlayback() {
    const state = this.loadLastPlaybackState();
    if (!state || typeof state !== 'object') return false;

    if (state.type === 'remote') {
      const url = (state.audioUrl || '').trim();
      if (!url) return false;
      this.playRemoteEpisode(
        {
          title: state.title || 'Episode',
          audioUrl: url,
          podcast: state.podcast || {},
        },
        {
          autoplay: false,
          restore: {
            progress: state.progress || 0,
            duration: state.duration || 0,
          },
        }
      );
      return true;
    }

    if (state.type === 'local') {
      const sessionId = (state.sessionId || '').trim();
      if (!sessionId) return false;
      try {
        await this.playLocalSession(sessionId, {
          autoplay: false,
          touchLastOpened: false,
        });
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  clearSubtitlesDisplay() {
    this.stateManager.updateState({
      subtitles: [],
      currentIndex: -1,
      subtitlesLoaded: false,
      attemptedNavWithoutSubtitles: false,
    });
    if (this.selectionManager) {
        this.selectionManager.clearAllHighlights();
    }
    if (
      this.uiManager &&
      this.uiManager.elements &&
      this.uiManager.elements.container
    ) {
      this.uiManager.elements.container.innerHTML = '';
    }
  }

  handleLookupModalChange(open) {
    if (!open) {
      if (
        this.pausedForLookupModal &&
        this.mediaManager &&
        this.mediaManager.isPaused()
      ) {
        this.mediaManager.togglePlayPause();
      }
      this.pausedForLookupModal = false;
      return;
    }
    if (!this.mediaManager || this.mediaManager.isPaused()) return;
    this.pausedForLookupModal = true;
    this.mediaManager.audioPlayer.pause();
  }

  persistPreferences(partialPrefs) {
    this.preferences = { ...this.preferences, ...partialPrefs };
    savePreferences(this.preferences);
  }

  init() {
    this.bindFileInputs();
    this.bindControlButtons();
    this.setupKeyboardShortcuts();
    setupActionMenus(this.actionControls);
    this.bindGalleryControls();
    this.initializeLanguageControls();
    this.initializeThemeControls();
    this.setupTopRailTooltips();
    this.scheduleGalleryPrefetch();

    // Custom Theme Toggle on Click
    const themeBtn = this.uiManager.elements.themeAction
      ? this.uiManager.elements.themeAction.querySelector('button')
      : null;
    if (themeBtn) {
      themeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        const { themeMode, resolvedThemeMode } = this.stateManager.getState();
        let nextMode = 'light';
        if (themeMode === 'system') {
          nextMode = resolvedThemeMode === 'dark' ? 'light' : 'dark';
        } else {
          nextMode = themeMode === 'dark' ? 'light' : 'dark';
        }
        this.setThemeMode(nextMode);
      });
    }

    this.translateUi();
    this.applyTheme();
    this.bindFollowControls();
    this.setupProgressControls();
    this.bindZoomControls();

    this.stateManager.subscribe((state, oldState, changedKeys) => {
      const warningKeys = [
        'audioLoaded',
        'subtitlesLoaded',
        'attemptedPlayWithoutAudio',
        'attemptedNavWithoutSubtitles',
        'vbrHeaderMissing',
        'fileError',
        'audioError',
        'subtitleStorageTooLarge',
        'subtitleStorageFailed',
      ];
      if (changedKeys.some((key) => warningKeys.includes(key))) {
        this.uiManager.renderWarnings(state, this.t);
      }
      if (changedKeys.includes('coverArtUrl')) {
        this.uiManager.updateCoverArt(state.coverArtUrl);
      }
      if (
        changedKeys.some((key) =>
          ['audioLoaded', 'subtitlesLoaded', 'currentMediaId'].includes(key)
        )
      ) {
        this.uiManager.updateMediaIndicators(state);
        this.uiManager.updateEmptyState(state, this.t);
        this.uiManager.toggleZoomControl(state.subtitlesLoaded);
        this.uiManager.setDropTitleText(
          !state.audioLoaded && !state.subtitlesLoaded,
          this.t
        );
        this.uiManager.updateDropZoneAvailability(state);
      }
    });

    this.restoreLastPlayback().then((restored) => {
      if (restored) return;
      // Phase A: Restore recent audio session from IndexedDB
      this.fileManager.loadRecent().then((result) => {
        if (result && result.session) {
          const { session, subtitleContent } = result;

          // Restore subtitle
          if (subtitleContent) {
            this.loadSubtitles(subtitleContent);
          }

          // Restore playback position
          if (session.progress > 0 && this.uiManager.elements.audioPlayer) {
            if (session.duration > 0) {
              this.audioDuration = session.duration;
            }
            this.uiManager.elements.audioPlayer.currentTime = session.progress;
            this.uiManager.updateProgress(
              this.audioDuration || 0,
              session.progress
            );
          }

          // Update ID state if not set by onAudioLoad (e.g. subtitle only)
          if (session.id && !this.stateManager.getState().currentMediaId) {
            this.stateManager.updateState({ currentMediaId: session.id });
          }
        }
      });
    });

    this.uiManager.updateMediaIndicators(this.stateManager.getState());
    this.uiManager.updateEmptyState(this.stateManager.getState(), this.t);
    this.uiManager.toggleZoomControl(
      this.stateManager.getState().subtitlesLoaded
    );
    this.uiManager.updateDropZoneAvailability(this.stateManager.getState());
    this.uiManager.elements.body.classList.add('ready');
  }

  scheduleGalleryPrefetch() {
    if (!this.sourcePickerModal || !this.sourcePickerModal.ensureRecommendedLoaded)
      return;
    if (typeof navigator !== 'undefined') {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection && connection.saveData) return;
      if (navigator.onLine === false) return;
    }

    const run = () => {
      try {
        void this.sourcePickerModal.ensureRecommendedLoaded();
      } catch {
        // ignore
      }
    };

    if (typeof window !== 'undefined' && window.requestIdleCallback) {
      window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 500);
    }
  }

  setupTopRailTooltips() {
    const buttons = [
      document.getElementById('openGalleryBtn'),
      document.getElementById('openLocalFilesBtn'),
    ].filter(Boolean);
    if (buttons.length === 0) return;

    if (!this.topRailTooltipEl) {
      const tooltip = document.createElement('div');
      tooltip.className = 'top-rail-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.setAttribute('hidden', 'true');
      document.body.appendChild(tooltip);
      this.topRailTooltipEl = tooltip;
    }

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const positionTooltip = (event) => {
      const tooltip = this.topRailTooltipEl;
      if (!tooltip || tooltip.hasAttribute('hidden')) return;

      const x = event && typeof event.clientX === 'number' ? event.clientX : 0;
      const y = event && typeof event.clientY === 'number' ? event.clientY : 0;
      const gap = 14;
      const margin = 10;

      const width = tooltip.offsetWidth || 0;
      const height = tooltip.offsetHeight || 0;

      let left = x + gap;
      let top = y + gap;
      if (left + width > window.innerWidth - margin) left = x - width - gap;
      if (top + height > window.innerHeight - margin) top = y - height - gap;
      left = clamp(
        left,
        margin,
        Math.max(margin, window.innerWidth - width - margin)
      );
      top = clamp(
        top,
        margin,
        Math.max(margin, window.innerHeight - height - margin)
      );

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };

    const hide = () => {
      const tooltip = this.topRailTooltipEl;
      if (!tooltip) return;
      this.topRailTooltipActiveKey = '';
      tooltip.classList.remove('visible');
      tooltip.setAttribute('hidden', 'true');
    };

    const show = (key, event) => {
      const tooltip = this.topRailTooltipEl;
      if (!tooltip) return;
      if (!key) return;
      const text = this.t ? String(this.t(key) || '') : key;
      if (!text) return;
      this.topRailTooltipActiveKey = key;
      tooltip.textContent = text;
      tooltip.removeAttribute('hidden');
      tooltip.classList.add('visible');
      positionTooltip(event);
    };

    buttons.forEach((button) => {
      const key = button.dataset.tooltipKey || '';
      button.addEventListener('mouseenter', (event) => show(key, event));
      button.addEventListener('mousemove', (event) => positionTooltip(event));
      button.addEventListener('mouseleave', hide);
      button.addEventListener('blur', hide);
      button.addEventListener('mousedown', hide);
      button.addEventListener('click', hide);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') hide();
    });
  }

  bindGalleryControls() {
    const openGalleryBtn = document.getElementById('openGalleryBtn');
    const openLocalFilesBtn = document.getElementById('openLocalFilesBtn');

    if (openGalleryBtn) {
      openGalleryBtn.addEventListener('click', () => {
        if (
          this.selectionManager &&
          this.selectionManager.isLookupModalOpen?.()
        )
          return;
        if (this.localFilesModal && this.localFilesModal.isOpen?.()) {
          this.localFilesModal.close();
        }
        this.sourcePickerModal.open();
      });
    }

    if (openLocalFilesBtn) {
      openLocalFilesBtn.addEventListener('click', () => {
        if (
          this.selectionManager &&
          this.selectionManager.isLookupModalOpen?.()
        )
          return;
        if (this.sourcePickerModal && this.sourcePickerModal.isOpen?.()) {
          this.sourcePickerModal.close();
        }
        if (this.localFilesModal) {
          this.localFilesModal.open();
        } else {
          this.openFilePicker({ mode: 'library' });
        }
      });
    }
  }

  openFilePicker({ mode = 'play' } = {}) {
    const { fileInput } = this.uiManager.elements;
    if (!fileInput) return;
    this.filePickerMode = mode;
    fileInput.value = '';
    fileInput.click();
  }

  async playLocalSession(
    sessionId,
    { autoplay = true, touchLastOpened = true } = {}
  ) {
    const id = (sessionId || '').trim();
    if (!id) return;
    try {
      const session = await DB.getSession(id);
      if (!session) return;

      let file = null;
      let coverUrl = '';
      let hasHeader = true;

      if (session.audioId) {
        const audioData = await DB.getAudio(session.audioId);
        if (audioData) {
          file = new File(
            [audioData.blob],
            audioData.name || session.audioName || 'audio',
            {
              type: audioData.type || 'audio/mpeg',
            }
          );
          coverUrl = audioData.cover
            ? URL.createObjectURL(audioData.cover)
            : '';
          hasHeader = audioData.hasHeader !== false;
        }
      }

      let subtitleContent = '';
      if (session.subtitleId) {
        const subData = await DB.getSubtitle(session.subtitleId);
        subtitleContent = subData && subData.content ? subData.content : '';
      }

      this.loadAudio(file, hasHeader, coverUrl, session.id);
      if (subtitleContent) {
        await this.loadSubtitles(subtitleContent);
      } else {
        this.stateManager.updateState({
          subtitles: [],
          currentIndex: -1,
          subtitlesLoaded: false,
        });
        if (this.uiManager.elements.container)
          this.uiManager.elements.container.innerHTML = '';
      }

      if (session.progress > 0 && this.uiManager.elements.audioPlayer) {
        if (session.duration > 0) {
          this.audioDuration = session.duration;
        }
        this.uiManager.elements.audioPlayer.currentTime = session.progress;
        this.uiManager.updateProgress(
          this.audioDuration || 0,
          session.progress
        );
      }

      if (touchLastOpened) {
        await this.fileManager.updateProgress(session.id, {
          lastOpenedAt: Date.now(),
        });
      }
      this.saveLastPlaybackState({
        type: 'local',
        sessionId: session.id,
        updatedAt: Date.now(),
      });
      if (autoplay) this.mediaManager.togglePlayPause();
    } catch (error) {
      console.warn('Failed to play local session', error);
    }
  }

  playRemoteEpisode(
    { title, audioUrl, podcast } = {},
    { autoplay = true, restore = null } = {}
  ) {
    const url = (audioUrl || '').trim();
    if (!url) return;

    const { loaded, objectUrl } = this.mediaManager.loadAudioUrl(url);
    if (!loaded) return;

    this.clearSubtitlesDisplay();

    const label = title || (podcast && podcast.title) || 'Episode';
    const cover = podcast && podcast.artworkUrl ? podcast.artworkUrl : '';

    if (this.coverObjectUrl) {
      URL.revokeObjectURL(this.coverObjectUrl);
      this.coverObjectUrl = null;
    }

    this.stateManager.updateState({
      audioLoaded: true,
      audioFilename: label,
      audioObjectUrl: objectUrl,
      currentMediaId: null,
      attemptedPlayWithoutAudio: false,
      vbrHeaderMissing: false,
      audioError: false,
      coverArtUrl: cover,
    });

    this.uiManager.updatePlayButtonIcon(true);
    this.uiManager.updateFollowButtonState(false);
    this.stopSubtitleSync();
    this.isScrubbingProgress = false;
    const restoreProgress =
      restore && Number.isFinite(restore.progress) ? restore.progress : 0;
    const restoreDuration =
      restore && Number.isFinite(restore.duration) ? restore.duration : 0;
    this.audioDuration = restoreDuration || 0;
    if (restoreProgress > 0 && this.uiManager.elements.audioPlayer) {
      this.uiManager.elements.audioPlayer.currentTime = restoreProgress;
    }
    this.uiManager.updateProgress(
      this.audioDuration || 0,
      this.uiManager.elements.audioPlayer?.currentTime || 0
    );

    this.saveLastPlaybackState({
      type: 'remote',
      audioUrl: url,
      title: label,
      podcast: {
        title: (podcast && podcast.title) || '',
        author: (podcast && podcast.author) || '',
        artworkUrl: cover || '',
        feedUrl: (podcast && podcast.feedUrl) || '',
      },
      progress: this.uiManager.elements.audioPlayer?.currentTime || 0,
      duration: this.audioDuration || 0,
      updatedAt: Date.now(),
    });

    if (autoplay) this.mediaManager.togglePlayPause();
  }

  bindZoomControls() {
    this.zoomScale = 1;
    const MIN_ZOOM = 0.5;
    const MAX_ZOOM = 3.0;
    const ZOOM_STEP = 0.1;
    const HIDE_DELAY = 2000; // 2 seconds
    const { zoomOutBtn, zoomInBtn, zoomValueText, zoomResetBtn, zoomControl } =
      this.uiManager.elements;

    this.hideZoomBarTimer = null; // Initialize timer
    const isLookupModalOpen = () =>
      Boolean(
        this.selectionManager && this.selectionManager.isLookupModalOpen?.()
      );
    const isSourcePickerModalOpen = () =>
      Boolean(this.sourcePickerModal && this.sourcePickerModal.isOpen?.());
    const isLocalFilesModalOpen = () =>
      Boolean(this.localFilesModal && this.localFilesModal.isOpen?.());
    const isAnyModalOpen = () =>
      isLookupModalOpen() || isSourcePickerModalOpen() || isLocalFilesModalOpen();

    const hideZoomBar = () => {
      if (zoomControl) {
        zoomControl.classList.remove('show');
      }
    };

    const scheduleHide = () => {
      if (this.hideZoomBarTimer) clearTimeout(this.hideZoomBarTimer);
      this.hideZoomBarTimer = setTimeout(hideZoomBar, HIDE_DELAY);
    };

    const cancelHide = () => {
      if (this.hideZoomBarTimer) clearTimeout(this.hideZoomBarTimer);
      this.hideZoomBarTimer = null;
    };

    const showZoomBar = () => {
      if (zoomControl) {
        zoomControl.classList.add('show');
        scheduleHide(); // Always schedule hide after showing
      }
    };

    const updateZoom = (delta, absoluteValue = null) => {
      if (isAnyModalOpen()) return;
      let newScale;
      if (absoluteValue !== null) {
        newScale = Math.min(Math.max(absoluteValue, MIN_ZOOM), MAX_ZOOM);
      } else {
        newScale = Math.min(
          Math.max(this.zoomScale + delta, MIN_ZOOM),
          MAX_ZOOM
        );
      }
      this.zoomScale = newScale;
      document.body.style.setProperty('--zoom-scale', this.zoomScale);

      // Hide selection menu and clear highlight on zoom
      if (this.selectionManager) {
        this.selectionManager.hideContextMenu();
        this.selectionManager.hideWordHoverOverlay();
      }

      // Update UI
      if (zoomValueText)
        zoomValueText.textContent = `${Math.round(this.zoomScale * 100)}%`;
      showZoomBar(); // Show and schedule hide after every update
    };

    // Initial hide (if subtitles not loaded)
    if (!this.stateManager.getState().subtitlesLoaded && zoomControl) {
      zoomControl.classList.remove('show');
    } else {
      showZoomBar(); // Show initially if subtitles are already loaded (e.g., page refresh)
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        updateZoom(-ZOOM_STEP);
      });
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        updateZoom(ZOOM_STEP);
      });
    }

    if (zoomResetBtn) {
      zoomResetBtn.addEventListener('click', () => {
        updateZoom(0, 1);
      });
    }

    // Mouse interaction with the zoom bar itself
    if (zoomControl) {
      zoomControl.addEventListener('mouseenter', cancelHide);
      zoomControl.addEventListener('mouseleave', scheduleHide);
    }

    window.addEventListener(
      'wheel',
      (event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault(); // Always prevent browser zoom
          if (isAnyModalOpen()) return;
          if (this.stateManager.getState().subtitlesLoaded) {
            // Normalize delta for wheel
            const delta = -event.deltaY * 0.002;
            updateZoom(delta);
          }
        }
      },
      { passive: false }
    );

    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey) {
        if (
          event.key === '=' ||
          event.key === '+' ||
          event.code === 'NumpadAdd'
        ) {
          event.preventDefault(); // Always prevent browser zoom
          if (isAnyModalOpen()) return;
          if (this.stateManager.getState().subtitlesLoaded) {
            updateZoom(ZOOM_STEP);
          }
        } else if (event.key === '-' || event.code === 'NumpadSubtract') {
          event.preventDefault(); // Always prevent browser zoom
          if (isAnyModalOpen()) return;
          if (this.stateManager.getState().subtitlesLoaded) {
            updateZoom(-ZOOM_STEP);
          }
        } else if (event.key === '0' || event.code === 'Numpad0') {
          event.preventDefault(); // Always prevent browser zoom
          if (isAnyModalOpen()) return;
          if (this.stateManager.getState().subtitlesLoaded) {
            updateZoom(0, 1);
          }
        }
      }
    });
  }

  handlePlay() {
    this.uiManager.updatePlayButtonIcon(false);
    this.uiManager.updateFollowButtonState(true);
    this.startSubtitleSync();
  }

  handlePause() {
    this.uiManager.updatePlayButtonIcon(true);
    this.uiManager.updateFollowButtonState(false);
    this.stopSubtitleSync();

    // Save progress on pause
    const { currentMediaId } = this.stateManager.getState();
    const { audioPlayer } = this.uiManager.elements;
    if (!audioPlayer) return;
    if (currentMediaId) {
      this.fileManager.updateProgress(currentMediaId, {
        progress: audioPlayer.currentTime,
        lastPlayedAt: Date.now(),
      });
    } else {
      this.updateRemotePlaybackProgress({
        progress: audioPlayer.currentTime,
        duration: this.audioDuration || audioPlayer.duration || 0,
      });
    }
  }

  handleSeek() {
    const time = this.mediaManager.getCurrentTime();
    const { subtitles, currentIndex } = this.stateManager.getState();
    const index = findSubtitleIndex(subtitles, time, currentIndex);
    if (index !== -1) {
      this.updateActiveLine(index);
    }
  }

  bindFileInputs() {
    const { fileInput, dropZoneEmpty, dropZoneFloating, dropWrapperEmpty } =
      this.uiManager.elements;
    if (!fileInput) return;

    const preventWindowFileDrop = (event) => {
      if (
        event.dataTransfer &&
        Array.from(event.dataTransfer.types || []).includes('Files')
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener('dragover', preventWindowFileDrop);
    window.addEventListener('drop', preventWindowFileDrop);

        const handleFileSelection = async (files, { mode = 'play' } = {}) => {
            const isLibraryMode = mode === 'library';
            const { currentMediaId } = this.stateManager.getState();
            const { audioFile, subtitleFile, invalidFiles, errorType, sessionId, createdSession } = await this.fileManager.handleFiles(files, {
                loadToUi: !isLibraryMode,
                targetSessionId: isLibraryMode ? null : currentMediaId
            });

      if (isLibraryMode) {
        if (
          createdSession &&
          this.localFilesModal &&
          this.localFilesModal.notifyLocalSessionCreated
        ) {
          this.localFilesModal.notifyLocalSessionCreated(createdSession);
        }

        if (subtitleFile && !audioFile) {
          try {
            const content = await subtitleFile.text();
            await this.fileManager.createSubtitleSession(
              subtitleFile.name,
              content
            );
          } catch (error) {
            console.warn('Failed to import subtitle in library mode', error);
          }
        }

        if (fileInput) fileInput.value = '';
        return;
      }

      let newFileError = errorType;
      if (!newFileError && invalidFiles.length > 0) {
        newFileError = 'invalidFiles';
      } else if (!newFileError && !audioFile && !subtitleFile) {
        newFileError = 'invalidFiles';
      }

      const stateReset = {
        fileError: newFileError,
        attemptedPlayWithoutAudio: false,
        attemptedNavWithoutSubtitles: false,
        vbrHeaderMissing: false,
      };
      if (audioFile) {
        stateReset.coverArtUrl = '';
        // If FileManager created a session, update state
        if (sessionId) {
          stateReset.currentMediaId = sessionId;
        }
      }
      this.stateManager.updateState(stateReset);
      if (
        createdSession &&
        this.localFilesModal &&
        this.localFilesModal.notifyLocalSessionCreated
      ) {
        this.localFilesModal.notifyLocalSessionCreated(createdSession);
      }

      if (fileInput) {
        fileInput.value = '';
      }

      // Handle Subtitle Loading
      if (subtitleFile) {
        const content = await subtitleFile.text();

        if (audioFile) {
          // Scenario: Dropped both. fileManager saved them together.
          // Just load to UI.
          this.loadSubtitles(content);
        } else {
          // Scenario: Dropped only SRT.
          const { currentMediaId } = this.stateManager.getState();

          if (currentMediaId) {
            // Attach to current session
            await this.fileManager.attachSubtitleToSession(
              currentMediaId,
              subtitleFile.name,
              content
            );
            this.loadSubtitles(content);
          } else {
            // Create NEW Subtitle-Only session
            const newSessionId = await this.fileManager.createSubtitleSession(
              subtitleFile.name,
              content
            );
            if (newSessionId) {
              this.stateManager.updateState({ currentMediaId: newSessionId });
              // For subtitle-only session, we need to clear audio state
              this.loadAudio(null, true, '', newSessionId);
              this.loadSubtitles(content);
            }
          }
        }
      }
    };

    // Expose cleanup for potential teardown/testing scenarios
    this.unbindFileDrop = () => {
      window.removeEventListener('dragover', preventWindowFileDrop);
      window.removeEventListener('drop', preventWindowFileDrop);
    };

    const areas = [
      { zone: dropZoneEmpty, wrapper: dropWrapperEmpty },
      { zone: dropZoneFloating, wrapper: null },
    ].filter(({ zone }) => zone);

    areas.forEach(({ zone, wrapper }) => {
      const clickTarget = wrapper || zone;

      clickTarget.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.stateManager.updateState({
          attemptedPlayWithoutAudio: false,
          attemptedNavWithoutSubtitles: false,
          fileError: null,
          audioError: false,
        });
        this.openFilePicker({ mode: 'play' });
      });
      zone.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.stopPropagation();
        zone.classList.add('dragover');
      });
      zone.addEventListener('dragleave', (event) => {
        event.preventDefault();
        event.stopPropagation();
        zone.classList.remove('dragover');
      });
      zone.addEventListener('drop', (event) => {
        event.preventDefault();
        event.stopPropagation();
        zone.classList.remove('dragover');
        handleFileSelection(event.dataTransfer.files, { mode: 'play' });
      });

      if (wrapper) {
        wrapper.addEventListener('dragover', (event) => {
          event.preventDefault();
          event.stopPropagation();
          zone.classList.add('dragover');
        });
        wrapper.addEventListener('dragleave', (event) => {
          event.preventDefault();
          event.stopPropagation();
          zone.classList.remove('dragover');
        });
        wrapper.addEventListener('drop', (event) => {
          event.preventDefault();
          event.stopPropagation();
          zone.classList.remove('dragover');
          if (event.dataTransfer && event.dataTransfer.files) {
            handleFileSelection(event.dataTransfer.files, { mode: 'play' });
          }
        });
      }
    });

    fileInput.addEventListener('change', (event) => {
      const mode = this.filePickerMode || 'play';
      this.filePickerMode = 'play';
      handleFileSelection(event.target.files, { mode });
    });
  }

  bindControlButtons() {
    const { btnPlay, btnPrev, btnNext } = this.uiManager.elements;
    if (btnPlay)
      btnPlay.addEventListener('click', () => this.togglePlayPause());
    if (btnPrev)
      btnPrev.addEventListener('click', () => this.playPreviousSubtitle());
    if (btnNext)
      btnNext.addEventListener('click', () => this.playNextSubtitle());

    [btnPrev, btnPlay, btnNext].filter(Boolean).forEach((button) => {
      const clearFocus = () => button.blur();
      button.addEventListener('mouseup', clearFocus);
      button.addEventListener('mouseleave', clearFocus);
      button.addEventListener('touchend', clearFocus);
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      if (
        (this.sourcePickerModal && this.sourcePickerModal.isOpen?.()) ||
        (this.localFilesModal && this.localFilesModal.isOpen?.()) ||
        (this.selectionManager && this.selectionManager.isLookupModalOpen?.())
      )
        return;
      const target = event.target;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      const insideAction =
        target && target.closest && target.closest('.action-button');
      if (isEditable || insideAction) return;

      if (
        event.code === 'Space' ||
        event.key === ' ' ||
        event.key === 'Spacebar'
      ) {
        event.preventDefault();
        this.togglePlayPause();
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        this.playPreviousSubtitle();
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        this.playNextSubtitle();
      }
    });
  }

  initializeLanguageControls() {
    this.uiManager.updateLanguageButtons(
      languageNativeNames,
      this.translator.getLanguage(),
      (lang) => {
        this.translator.setLanguage(lang);
        this.translateUi();
        this.uiManager.setDropTitleText(
          !this.stateManager.getState().audioLoaded &&
            !this.stateManager.getState().subtitlesLoaded,
          this.t
        );
        this.persistPreferences({ language: lang });
      }
    );
  }

  initializeThemeControls() {
    const { themeMode, canvasColor } = this.stateManager.getState();
    this.uiManager.initializeThemeControls(
      {
        themeMode,
        canvasColor,
        canvasPresets: this.canvasPresets,
      },
      {
        onThemeModeChange: (mode) => this.setThemeMode(mode),
        onCanvasColorChange: (color) => this.setCanvasColor(color),
      },
      this.t
    );

    if (this.unwatchSystemTheme) this.unwatchSystemTheme();
    this.unwatchSystemTheme = watchSystemTheme(() => {
      if (this.stateManager.getState().themeMode === 'system') {
        this.applyTheme();
        const { themeMode, canvasColor } = this.stateManager.getState();
        this.uiManager.updateThemeControls(themeMode, canvasColor, this.t);
      }
    });
  }

  setThemeMode(mode) {
    this.stateManager.updateState({ themeMode: mode });
    this.applyTheme();
    const { themeMode, canvasColor } = this.stateManager.getState();
    this.uiManager.updateThemeControls(themeMode, canvasColor, this.t);
    this.persistPreferences({ themeMode: mode });
  }

  setCanvasColor(color) {
    const newColor = applyCanvasBackground(color, this.uiManager.elements.body);
    this.stateManager.updateState({ canvasColor: newColor });
    this.uiManager.updateCanvasButtons(newColor);
    this.persistPreferences({ canvasColor: newColor });
  }

  translateUi() {
    translateDom(this.translator);
    refreshCopyButtonLabels(this.t);
    const { audioLoaded, subtitlesLoaded } = this.stateManager.getState();
    this.uiManager.setDropTitleText(!audioLoaded && !subtitlesLoaded, this.t);
    this.uiManager.updateThemeControlLabels(this.t);
    this.uiManager.renderWarnings(this.stateManager.getState(), this.t);
    this.uiManager.updateCoverArt(this.stateManager.getState().coverArtUrl);
    this.selectionManager.updateTranslations(this.t);
    if (this.uiManager.elements.zoomResetBtn)
      this.uiManager.elements.zoomResetBtn.textContent = this.t('resetZoom');
  }

  setupProgressControls() {
    const { audioPlayer, progressBar } = this.uiManager.elements;
    if (!audioPlayer || !progressBar) return;

    const updateFromAudio = () => {
      if (this.isScrubbingProgress) return;
      const duration = this.audioDuration || audioPlayer.duration;
      const currentTime = audioPlayer.currentTime;
      this.uiManager.updateProgress(duration, currentTime);

      // Periodically save progress (every 5 seconds)
      const now = Date.now();
      if (now - this.lastProgressSave > 5000) {
        const { currentMediaId } = this.stateManager.getState();
        if (currentMediaId) {
          this.fileManager.updateProgress(currentMediaId, {
            progress: currentTime,
            duration: duration,
            lastPlayedAt: now,
          });
        } else {
          this.updateRemotePlaybackProgress({
            progress: currentTime,
            duration: duration || 0,
          });
        }
        this.lastProgressSave = now;
      }
    };

    audioPlayer.addEventListener('loadedmetadata', () => {
      const metaDuration = Number.isFinite(audioPlayer.duration)
        ? audioPlayer.duration
        : 0;
      // Freeze duration to first reliable value to avoid drift on VBR files without headers
      this.audioDuration = metaDuration || this.audioDuration;

      // Use current currentTime (which might have been restored from DB) instead of 0
      this.uiManager.updateProgress(
        this.audioDuration,
        audioPlayer.currentTime
      );

      // Save duration once known
      const { currentMediaId } = this.stateManager.getState();
      if (currentMediaId && this.audioDuration > 0) {
        this.fileManager.updateProgress(currentMediaId, {
          duration: this.audioDuration,
        });
      } else if (this.audioDuration > 0) {
        this.updateRemotePlaybackProgress({
          duration: this.audioDuration,
          progress: audioPlayer.currentTime,
        });
      }
    });
    audioPlayer.addEventListener('timeupdate', updateFromAudio);

    const commitScrub = () => {
      const duration = this.audioDuration || audioPlayer.duration || 0;
      const target = Math.min(
        Math.max(Number(progressBar.value) || 0, 0),
        duration || 0
      );
      audioPlayer.currentTime = target;
      this.isScrubbingProgress = false;
    };

    progressBar.addEventListener('input', () => {
      this.isScrubbingProgress = true;
      const duration = this.audioDuration || audioPlayer.duration;
      this.uiManager.updateProgress(duration, Number(progressBar.value) || 0);
    });
    ['change', 'pointerup', 'mouseup', 'touchend'].forEach((eventName) => {
      progressBar.addEventListener(eventName, commitScrub);
    });

    // Initialize disabled state
    this.uiManager.updateProgress(0, 0);
  }

  applyTheme() {
    let { canvasColor, themeMode } = this.stateManager.getState();
    if (!this.canvasPresets.includes(canvasColor)) {
      canvasColor = this.canvasPresets[0] || '';
      this.stateManager.updateState({ canvasColor });
    }
    const { resolved } = applyThemeMode(
      themeMode,
      this.uiManager.elements.body
    );
    this.stateManager.updateState({ resolvedThemeMode: resolved });
    const newColor = applyCanvasBackground(
      canvasColor,
      this.uiManager.elements.body
    );
    this.stateManager.updateState({ canvasColor: newColor });
  }

  bindFollowControls() {
    if (this.uiManager.elements.followButton) {
      this.uiManager.elements.followButton.addEventListener('click', () => {
        this.setFollowing(true);
        this.scrollActiveLineIntoView({ smooth: true, settleMs: 1400 });
      });
    }

    window.addEventListener(
      'scroll',
      (event) => {
        const { suppressScrollDetection, isFollowing } =
          this.stateManager.getState();
        if (suppressScrollDetection) return;
        if (event && event.isTrusted === false) return;
        const activeEl = this.getActiveSubtitleElement();
        if (!activeEl) return;
        const rect = activeEl.getBoundingClientRect();
        const viewportHeight =
          window.innerHeight || document.documentElement.clientHeight || 0;
        if (!viewportHeight) return;
        const safeTop = viewportHeight * 0.22;
        const safeBottom = viewportHeight * 0.78;
        const isComfortable = rect.top >= safeTop && rect.bottom <= safeBottom;
        if (!isComfortable && isFollowing) {
          this.setFollowing(false);
        }
      },
      { passive: true }
    );
  }

  setFollowing(nextValue) {
    this.stateManager.updateState({ isFollowing: !!nextValue });
    const { isFollowing, subtitlesLoaded } = this.stateManager.getState();
    const shouldShow = !isFollowing && subtitlesLoaded;
    if (this.uiManager.elements.followButton) {
      if (
        !shouldShow &&
        document.activeElement === this.uiManager.elements.followButton
      ) {
        this.uiManager.elements.followButton.blur();
      }
      this.uiManager.elements.followButton.classList.toggle(
        'visible',
        shouldShow
      );
      this.uiManager.elements.followButton.toggleAttribute(
        'hidden',
        !shouldShow
      );
      this.uiManager.elements.followButton.toggleAttribute(
        'aria-hidden',
        !shouldShow
      );
      this.uiManager.elements.followButton.tabIndex = shouldShow ? 0 : -1;
    }
  }

  getActiveSubtitleElement() {
    const { currentIndex, subtitles } = this.stateManager.getState();
    const current = currentIndex >= 0 ? subtitles[currentIndex] : null;
    return current ? current.element : null;
  }

  runWithScrollSuppression(callback, delay = 180) {
    this.stateManager.updateState({ suppressScrollDetection: true });
    if (typeof callback === 'function') {
      callback();
    }
    const { scrollReleaseTimer } = this.stateManager.getState();
    if (scrollReleaseTimer) {
      clearTimeout(scrollReleaseTimer);
    }
    const newTimer = setTimeout(() => {
      this.stateManager.updateState({ suppressScrollDetection: false });
    }, delay);
    this.stateManager.updateState({ scrollReleaseTimer: newTimer });
  }

  scrollActiveLineIntoView({ smooth = false, settleMs = 1000 } = {}) {
    const activeEl = this.getActiveSubtitleElement();
    if (!activeEl) return;
    this.runWithScrollSuppression(() => {
      activeEl.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'center',
      });
    }, settleMs);
  }

  loadAudio(file, hasHeader = true, coverArtUrl = '', id = null) {
    this.clearSubtitlesDisplay();

    // Handle Subtitle-Only session (file is null)
    if (!file) {
      this.stateManager.updateState({
        audioLoaded: false,
        audioFilename: '',
        audioObjectUrl: '',
        currentMediaId: id,
        attemptedPlayWithoutAudio: false,
        vbrHeaderMissing: false,
        audioError: false,
        coverArtUrl: '',
      });

      // Clear MediaManager state
      if (this.mediaManager) {
        // Manually reset media manager if needed, or just pause
        // Accessing private audioPlayer via uiManager is safer here or add a method to MediaManager
        const player = this.uiManager.elements.audioPlayer;
        if (player) {
          player.pause();
          player.removeAttribute('src'); // Unload
          player.load();
        }
      }

      this.uiManager.updatePlayButtonIcon(true);
      this.uiManager.updateFollowButtonState(false);
      this.stopSubtitleSync();
      this.isScrubbingProgress = false;
      this.audioDuration = 0;
      this.uiManager.updateProgress(0, 0);
      return;
    }

    const { loaded, filename, objectUrl } = this.mediaManager.loadAudio(file);
    if (loaded) {
      if (this.coverObjectUrl) {
        URL.revokeObjectURL(this.coverObjectUrl);
      }
      this.coverObjectUrl = coverArtUrl || null;
      this.stateManager.updateState({
        audioLoaded: true,
        audioFilename: filename,
        audioObjectUrl: objectUrl,
        currentMediaId: id, // Store DB ID
        attemptedPlayWithoutAudio: false,
        vbrHeaderMissing: !hasHeader,
        audioError: false,
        coverArtUrl: coverArtUrl || '',
      });
      if (id) {
        this.saveLastPlaybackState({
          type: 'local',
          sessionId: id,
          updatedAt: Date.now(),
        });
      }
      // Reset UI/play state when swapping sources
      this.uiManager.updatePlayButtonIcon(true);
      this.uiManager.updateFollowButtonState(false);
      this.stopSubtitleSync();
      this.isScrubbingProgress = false;
      this.audioDuration = 0;
      this.uiManager.updateProgress(0, 0);
    }
  }

  async loadSubtitles(source) {
    const { subtitlesLoaded } = this.stateManager.getState();
    const hadSubtitles = subtitlesLoaded;
    this.stateManager.updateState({
      subtitleStorageTooLarge: false,
      subtitleStorageFailed: false,
    });

    try {
      let content = '';
      if (typeof source === 'string') {
        content = source;
      } else if (source instanceof File) {
        content = await source.text();
      } else {
        throw new Error('Invalid subtitle source');
      }

      const subtitles = parseSrt(content);
      this.mountSubtitles(subtitles);

      // Note: Persistence is now handled by FileManager/DB logic
    } catch (error) {
      console.error('Failed to load subtitles', error);
      if (!hadSubtitles) {
        this.stateManager.updateState({
          subtitles: [],
          currentIndex: -1,
          subtitlesLoaded: false,
          fileError: 'invalidFiles',
        });
        if (this.uiManager.elements.container)
          this.uiManager.elements.container.innerHTML = '';
      } else {
        this.stateManager.updateState({ subtitlesLoaded: false });
      }
    }
  }

  mountSubtitles(subtitles) {
    const { container } = this.uiManager.elements;
    if (!container) return;
    container.innerHTML = '';

    const fragment = document.createDocumentFragment();
    const newSubtitles = subtitles.map((subtitle, index) => {
      const element = this.createSubtitleElement(subtitle, index);
      fragment.appendChild(element);
      return { ...subtitle, element };
    });
    container.appendChild(fragment);

    this.stateManager.updateState({
      subtitles: newSubtitles,
      currentIndex: -1,
      subtitlesLoaded: newSubtitles.length > 0,
      attemptedNavWithoutSubtitles: false,
    });

    this.setFollowing(true);
    refreshCopyButtonLabels(this.t);
  }

  createSubtitleElement(subtitle, index) {
    const template = document.getElementById('subtitle-template');
    const element = template.content.cloneNode(true).firstElementChild;

    element.querySelector('.subtitle-time').innerText = formatTimeLabel(
      subtitle.rawStart
    );
    const textEl = element.querySelector('.subtitle-text');
    if (textEl) {
      this.selectionManager.renderSubtitleText(textEl, subtitle.text);
    }

    const copyButton = createCopyButton(subtitle.text, { t: this.t });
    element.appendChild(copyButton);

    element.addEventListener('click', (event) => {
      const selection = window.getSelection ? window.getSelection() : null;
      if (selection && !selection.isCollapsed) return;
      const target =
        event.target && event.target.nodeType === Node.TEXT_NODE
          ? event.target.parentElement
          : event.target;
      if (target && target.closest('.subtitle-copy-btn')) return;

      const textEl = element.querySelector('.subtitle-text');
      if (textEl && textEl.contains(target)) {
        if (this.isPointerOnRenderedText(textEl, event)) return;
      }
      this.jumpToSubtitle(index, { forceFollow: true });
    });

    element.addEventListener('mousedown', (event) => {
      const textEl = element.querySelector('.subtitle-text');
      if (textEl) this.selectionManager.handleSelectionEvent(event, textEl);
    });

    element.addEventListener('mousemove', (event) => {
      const textEl = element.querySelector('.subtitle-text');
      if (textEl) this.selectionManager.handleSelectionEvent(event, textEl);
    });

    element.addEventListener('mouseup', (event) => {
      const textEl = element.querySelector('.subtitle-text');
      if (textEl) this.selectionManager.handleSelectionEvent(event, textEl);
    });

    element.addEventListener('mouseleave', (event) => {
      const textEl = element.querySelector('.subtitle-text');
      if (textEl) this.selectionManager.handleSelectionEvent(event, textEl);
    });

    element.addEventListener('contextmenu', (event) => {
      const textEl = element.querySelector('.subtitle-text');
      if (textEl) this.selectionManager.handleSelectionEvent(event, textEl);
    });

    return element;
  }

  isPointerOnRenderedText(textEl, event) {
    if (!textEl || !event) return false;
    const { clientX, clientY } = event;
    const textContentLength = (textEl.textContent || '').length;

    const hitTextViaRange = (rangeObj) => {
      if (!rangeObj) return false;
      const container = rangeObj.startContainer;
      if (!container || !textEl.contains(container)) return false;
      if (container.nodeType === Node.TEXT_NODE) {
        return rangeObj.startOffset < textContentLength;
      }
      return true;
    };

    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(clientX, clientY);
      if (hitTextViaRange(range)) return true;
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(clientX, clientY);
      if (pos && pos.offsetNode && textEl.contains(pos.offsetNode)) {
        if (pos.offsetNode.nodeType === Node.TEXT_NODE) {
          return pos.offset < textContentLength;
        }
        return true;
      }
    }
    return false;
  }

  jumpToSubtitle(index, { forceFollow = false } = {}) {
    const { subtitles, audioLoaded } = this.stateManager.getState();
    if (index < 0 || index >= subtitles.length) return;
    if (forceFollow) this.setFollowing(true);
    this.updateActiveLine(index);

    if (!audioLoaded) return;
    this.mediaManager.jumpToTime(subtitles[index].start + 0.01);
  }

  togglePlayPause() {
    if (!this.stateManager.getState().audioLoaded) {
      this.stateManager.updateState({ attemptedPlayWithoutAudio: true });
      return;
    }
    this.mediaManager.togglePlayPause();
  }

  playPreviousSubtitle() {
    const { subtitles } = this.stateManager.getState();
    if (!subtitles.length) {
      this.stateManager.updateState({ attemptedNavWithoutSubtitles: true });
      return;
    }
    const targetIndex = Math.max(
      this.stateManager.getState().currentIndex - 1,
      0
    );
    this.jumpToSubtitle(targetIndex);
  }

  playNextSubtitle() {
    let { subtitles, currentIndex } = this.stateManager.getState();
    if (!subtitles.length) {
      this.stateManager.updateState({ attemptedNavWithoutSubtitles: true });
      return;
    }
    let targetIndex = currentIndex + 1;
    if (currentIndex === -1) {
      const currentTime = this.mediaManager.getCurrentTime();
      targetIndex = subtitles.findIndex(
        (subtitle) => subtitle.start > currentTime
      );
    }
    if (targetIndex === -1 || targetIndex >= subtitles.length) {
      targetIndex = subtitles.length - 1;
    }
    this.jumpToSubtitle(targetIndex);
  }

  updateActiveLine(index) {
    let { currentIndex, subtitles, isFollowing } = this.stateManager.getState();
    if (currentIndex !== -1) {
      const previous = subtitles[currentIndex];
      if (previous && previous.element) {
        previous.element.classList.remove('active');
      }
    }

    this.stateManager.updateState({ currentIndex: index });
    const current = subtitles[index];
    if (current && current.element) {
      current.element.classList.add('active');
      if (isFollowing) {
        this.scrollActiveLineIntoView();
      } else {
        this.setFollowing(false);
      }
    }
  }

  startSubtitleSync() {
    let { syncAnimationId } = this.stateManager.getState();
    if (syncAnimationId !== null) return;
    const syncLoop = () => {
      if (this.mediaManager.isPaused()) {
        this.stateManager.updateState({ syncAnimationId: null });
        return;
      }
      const time = this.mediaManager.getCurrentTime();
      const { subtitles, currentIndex } = this.stateManager.getState();
      const index = findSubtitleIndex(subtitles, time, currentIndex);
      if (index !== -1 && index !== currentIndex) {
        this.updateActiveLine(index);
      }
      this.stateManager.updateState({
        syncAnimationId: requestAnimationFrame(syncLoop),
      });
    };
    this.stateManager.updateState({
      syncAnimationId: requestAnimationFrame(syncLoop),
    });
  }

  stopSubtitleSync() {
    const { syncAnimationId } = this.stateManager.getState();
    if (syncAnimationId !== null) {
      cancelAnimationFrame(syncAnimationId);
      this.stateManager.updateState({ syncAnimationId: null });
    }
  }
}
