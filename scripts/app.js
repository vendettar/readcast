import { Translator, translateDom } from './modules/i18n.js';
import { languageNativeNames } from './modules/translations.js';
import { parseSrt, findSubtitleIndex, formatTimeLabel } from './modules/subtitles.js';
import { createCopyButton, refreshCopyButtonLabels } from './modules/copy.js';
import { applyCanvasBackground, applyThemeMode, getCanvasPresets, watchSystemTheme } from './modules/theme.js';
import { setupActionMenus } from './modules/actions.js';
import StateManager from './modules/stateManager.js';
import FileManager from './modules/fileManager.js';
import MediaManager from './modules/mediaManager.js';
import uiManager from './modules/uiManager.js';

const PREF_STORAGE_KEY = 'readcastPrefs';

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

class ReadcastPlayer {
    constructor() {
        this.uiManager = uiManager;
        this.mediaManager = new MediaManager(
            () => this.handlePlay(),
            () => this.handlePause(),
            () => this.handleSeek(),
            () => this.stateManager.updateState({ audioError: true })
        );
        this.fileManager = new FileManager({
            onAudioLoad: (file, hasHeader, coverUrl) => this.loadAudio(file, hasHeader, coverUrl),
            onSubtitleLoad: (file) => this.loadSubtitles(file),
            onWarning: () => { /* handled via state now */ },
        });

        this.preferences = loadPreferences();
        this.canvasPresets = getCanvasPresets();
        const initialThemeMode = this.preferences.themeMode || 'system';
        const initialCanvasColor = this.preferences.canvasColor || this.canvasPresets[0] || '';
        this.stateManager = new StateManager({
            subtitles: [],
            currentIndex: -1,
            audioLoaded: false,
            subtitlesLoaded: false,
            audioFilename: '',
            audioObjectUrl: '',
            syncAnimationId: null,
            themeMode: initialThemeMode,
            resolvedThemeMode: 'light',
            canvasColor: initialCanvasColor,
            attemptedPlayWithoutAudio: false,
            attemptedNavWithoutSubtitles: false,
            vbrHeaderMissing: false,
            fileError: null,
            audioError: false,
            coverArtUrl: '',
            isFollowing: true,
            suppressScrollDetection: false,
            scrollReleaseTimer: null
        });

        const { languageAction, themeAction, shortcutAction, qaAction } = this.uiManager.elements;
        this.actionControls = [languageAction, themeAction, shortcutAction, qaAction].filter(Boolean);

        this.isScrubbingProgress = false;
        this.audioDuration = 0;

        const initialLanguage = this.preferences.language || 'en';
        this.translator = new Translator(initialLanguage);
        this.translator.setLanguage(initialLanguage);
        this.t = this.translator.t.bind(this.translator);

        this.themeModeButtons = [];
        this.canvasButtons = [];
        this.unwatchSystemTheme = null;
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
        this.initializeLanguageControls();
        this.initializeThemeControls();
        this.translateUi();
        this.applyTheme();
        this.bindFollowControls();
        this.setupProgressControls();

        this.stateManager.subscribe((state, oldState, changedKeys) => {
            const warningKeys = ['audioLoaded', 'subtitlesLoaded', 'attemptedPlayWithoutAudio', 'attemptedNavWithoutSubtitles', 'vbrHeaderMissing', 'fileError', 'audioError'];
            if (changedKeys.some((key) => warningKeys.includes(key))) {
                this.uiManager.renderWarnings(state, this.t);
            }
            if (changedKeys.includes('coverArtUrl')) {
                this.uiManager.updateCoverArt(state.coverArtUrl);
            }
            if (changedKeys.some((key) => ['audioLoaded', 'subtitlesLoaded'].includes(key))) {
                this.uiManager.updateMediaIndicators(state);
                this.uiManager.updateEmptyState(state, this.t);
                this.uiManager.setDropTitleText(!state.audioLoaded && !state.subtitlesLoaded, this.t);
            }
        });

        this.uiManager.updateMediaIndicators(this.stateManager.getState());
        this.uiManager.updateEmptyState(this.stateManager.getState(), this.t);
        this.uiManager.elements.body.classList.add('ready');
    }

    handlePlay() {
        this.uiManager.updatePlayButtonIcon(false);
        this.startSubtitleSync();
    }

    handlePause() {
        this.uiManager.updatePlayButtonIcon(true);
        this.stopSubtitleSync();
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
        const { fileInput, dropZoneEmpty, dropZoneFloating, dropWrapperEmpty } = this.uiManager.elements;
        if (!fileInput) return;

        const preventWindowFileDrop = (event) => {
            if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) {
                event.preventDefault();
            }
        };
        window.addEventListener('dragover', preventWindowFileDrop);
        window.addEventListener('drop', preventWindowFileDrop);

        const handleFileSelection = (files) => {
            const { audioFile, subtitleFile, invalidFiles } = this.fileManager.handleFiles(files);
            
            // Clear previous file errors when new files are dropped
            let newFileError = null;
            if (invalidFiles.length > 0) {
                newFileError = 'invalidFiles';
            } else if (!audioFile && !subtitleFile) {
                // If user selected files but none were valid mp3/srt (e.g. all ignored)
                // This logic mirrors previous behavior
                 newFileError = 'invalidFiles';
            }
            
            const stateReset = { 
                fileError: newFileError,
                // Reset attempt flags on new file interaction
                attemptedPlayWithoutAudio: false, 
                attemptedNavWithoutSubtitles: false,
                // Reset VBR warning state tentatively (will be updated by onAudioLoad if needed)
                vbrHeaderMissing: false
            };
            // Only clear cover art when an actual audio file is present (we'll replace it on load)
            if (audioFile) {
                stateReset.coverArtUrl = '';
            }
            this.stateManager.updateState(stateReset);

            if (fileInput) {
                fileInput.value = '';
            }
        };

        // Expose cleanup for potential teardown/testing scenarios
        this.unbindFileDrop = () => {
            window.removeEventListener('dragover', preventWindowFileDrop);
            window.removeEventListener('drop', preventWindowFileDrop);
        };

        const areas = [
            { zone: dropZoneEmpty, wrapper: dropWrapperEmpty },
            { zone: dropZoneFloating, wrapper: null }
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
                    audioError: false
                });
                fileInput.click();
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
                handleFileSelection(event.dataTransfer.files);
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
                        handleFileSelection(event.dataTransfer.files);
                    }
                });
            }
        });

        fileInput.addEventListener('change', (event) => handleFileSelection(event.target.files));
    }

    bindControlButtons() {
        const { btnPlay, btnPrev, btnNext } = this.uiManager.elements;
        if (btnPlay) btnPlay.addEventListener('click', () => this.togglePlayPause());
        if (btnPrev) btnPrev.addEventListener('click', () => this.playPreviousSubtitle());
        if (btnNext) btnNext.addEventListener('click', () => this.playNextSubtitle());

        [btnPrev, btnPlay, btnNext]
            .filter(Boolean)
            .forEach((button) => {
                const clearFocus = () => button.blur();
                button.addEventListener('mouseup', clearFocus);
                button.addEventListener('mouseleave', clearFocus);
                button.addEventListener('touchend', clearFocus);
            });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            const target = event.target;
            const isEditable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            const insideAction = target && target.closest && target.closest('.action-button');
            if (isEditable || insideAction) return;

            if (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar') {
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
        this.uiManager.updateLanguageButtons(languageNativeNames, this.translator.getLanguage(), (lang) => {
            this.translator.setLanguage(lang);
            this.translateUi();
            this.uiManager.setDropTitleText(!this.stateManager.getState().audioLoaded && !this.stateManager.getState().subtitlesLoaded, this.t);
            this.persistPreferences({ language: lang });
        });
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
    }

    setupProgressControls() {
        const { audioPlayer, progressBar } = this.uiManager.elements;
        if (!audioPlayer || !progressBar) return;

        const updateFromAudio = () => {
            if (this.isScrubbingProgress) return;
            const duration = this.audioDuration || audioPlayer.duration;
            this.uiManager.updateProgress(duration, audioPlayer.currentTime);
        };

        audioPlayer.addEventListener('loadedmetadata', () => {
            const metaDuration = Number.isFinite(audioPlayer.duration) ? audioPlayer.duration : 0;
            // Freeze duration to first reliable value to avoid drift on VBR files without headers
            this.audioDuration = metaDuration || this.audioDuration;
            this.uiManager.updateProgress(this.audioDuration, 0);
        });
        audioPlayer.addEventListener('timeupdate', updateFromAudio);

        const commitScrub = () => {
            const duration = this.audioDuration || audioPlayer.duration || 0;
            const target = Math.min(Math.max(Number(progressBar.value) || 0, 0), duration || 0);
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
        const { resolved } = applyThemeMode(themeMode, this.uiManager.elements.body);
        this.stateManager.updateState({ resolvedThemeMode: resolved });
        const newColor = applyCanvasBackground(canvasColor, this.uiManager.elements.body);
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
                const { suppressScrollDetection, isFollowing } = this.stateManager.getState();
                if (suppressScrollDetection) return;
                if (event && event.isTrusted === false) return;
                const activeEl = this.getActiveSubtitleElement();
                if (!activeEl) return;
                const rect = activeEl.getBoundingClientRect();
                const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
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
            if (!shouldShow && document.activeElement === this.uiManager.elements.followButton) {
                this.uiManager.elements.followButton.blur();
            }
            this.uiManager.elements.followButton.classList.toggle('visible', shouldShow);
            this.uiManager.elements.followButton.toggleAttribute('hidden', !shouldShow);
            this.uiManager.elements.followButton.toggleAttribute('aria-hidden', !shouldShow);
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
                block: 'center'
            });
        }, settleMs);
    }

    loadAudio(file, hasHeader = true, coverArtUrl = '') {
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
                attemptedPlayWithoutAudio: false,
                vbrHeaderMissing: !hasHeader,
                audioError: false,
                coverArtUrl: coverArtUrl || ''
            });
            // Reset UI/play state when swapping sources
            this.uiManager.updatePlayButtonIcon(true);
            this.stopSubtitleSync();
            this.isScrubbingProgress = false;
            this.audioDuration = 0;
            this.uiManager.updateProgress(0, 0);
        }
    }

    async loadSubtitles(file) {
        const { subtitlesLoaded } = this.stateManager.getState();
        const hadSubtitles = subtitlesLoaded;
        try {
            const content = await file.text();
            const subtitles = parseSrt(content);
            this.mountSubtitles(subtitles);
        } catch (error) {
            console.error('Failed to load subtitles', error);
            if (!hadSubtitles) {
                this.stateManager.updateState({ 
                    subtitles: [], 
                    currentIndex: -1, 
                    subtitlesLoaded: false,
                    fileError: 'invalidFiles'
                });
                if (this.uiManager.elements.container) this.uiManager.elements.container.innerHTML = '';
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
            attemptedNavWithoutSubtitles: false 
        });

        this.setFollowing(true);
        refreshCopyButtonLabels(this.t);
    }

    createSubtitleElement(subtitle, index) {
        const template = document.getElementById('subtitle-template');
        const element = template.content.cloneNode(true).firstElementChild;

        element.querySelector('.subtitle-time').innerText = formatTimeLabel(subtitle.rawStart);
        element.querySelector('.subtitle-text').innerText = subtitle.text;

        const copyButton = createCopyButton(subtitle.text, { t: this.t });
        element.appendChild(copyButton);

        element.addEventListener('click', () => {
            const selection = window.getSelection ? window.getSelection() : null;
            if (selection && !selection.isCollapsed) return;
            this.jumpToSubtitle(index);
        });

        return element;
    }

    jumpToSubtitle(index) {
        const { subtitles, audioLoaded } = this.stateManager.getState();
        if (index < 0 || index >= subtitles.length) return;
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
        const targetIndex = Math.max(this.stateManager.getState().currentIndex - 1, 0);
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
            targetIndex = subtitles.findIndex((subtitle) => subtitle.start > currentTime);
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
            this.stateManager.updateState({ syncAnimationId: requestAnimationFrame(syncLoop) });
        };
        this.stateManager.updateState({ syncAnimationId: requestAnimationFrame(syncLoop) });
    }

    stopSubtitleSync() {
        const { syncAnimationId } = this.stateManager.getState();
        if (syncAnimationId !== null) {
            cancelAnimationFrame(syncAnimationId);
            this.stateManager.updateState({ syncAnimationId: null });
        }
    }
}
