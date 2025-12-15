// scripts/modules/uiManager.js

class UIManager {
  constructor() {
    this.elements = {
      combinedCard: document.querySelector('.combined-card'),
      fileInput: document.getElementById('fileInput'),
      audioPlayer: document.getElementById('audioPlayer'),
      container: document.getElementById('transcript-container'),
      dropWrapperEmpty: document.querySelector('.drop-wrapper-empty'),
      dropWrapperFloating: null,
      dropZoneEmpty: document.getElementById('dropZoneEmpty'),
      dropZoneFloating: document.getElementById('dropZoneFloating'),
      btnPlay: document.getElementById('btnPlay'),
      btnPrev: document.getElementById('btnPrev'),
      btnNext: document.getElementById('btnNext'),
      audioIndicators: Array.from(document.querySelectorAll('.audio-status')),
      subtitleIndicators: Array.from(document.querySelectorAll('.subtitle-status')),
      languageDropdown: document.getElementById('languageDropdown'),
      themeDropdown: document.getElementById('themeDropdown'),
      languageAction: document.getElementById('languageAction'),
      themeAction: document.getElementById('themeAction'),
      shortcutAction: document.getElementById('shortcutAction'),
      qaAction: document.getElementById('qaAction'),
      zoomOutBtn: document.getElementById('zoomOutBtn'),
      zoomInBtn: document.getElementById('zoomInBtn'),
      zoomValueText: document.getElementById('zoomValueText'),
      zoomResetBtn: document.getElementById('zoomResetBtn'),
      zoomControl: document.querySelector('.zoom-direct'),
      warningsList: document.querySelector('.warnings-list'),
      emptyPanel: document.querySelector('.empty-panel'),
      floatingPanel: document.querySelector('.floating-panel'),
      followButton: document.getElementById('followCurrentBtn'),
      progressBar: document.getElementById('progressBar'),
      progressCurrent: document.getElementById('progressCurrent'),
      progressRow: document.querySelector('.progress-row'),
      coverWrapper: document.querySelector('.cover-wrapper'),
      coverCard: document.getElementById('coverCard'),
      coverImage: document.getElementById('coverImage'),
      body: document.body,
    };
    this.elements.playIcon = this.elements.btnPlay ? this.elements.btnPlay.querySelector('.play-icon') : null;
  }

  // UI manipulation methods will be added here
  togglePanels(isEmpty) {
    const { emptyPanel, floatingPanel } = this.elements;
    if (emptyPanel) {
      emptyPanel.style.display = isEmpty ? 'flex' : 'none';
    }
    if (floatingPanel) {
      floatingPanel.style.display = isEmpty ? 'none' : 'flex';
    }
  }

  updatePlayButtonIcon(isPaused) {
    if (!this.elements.playIcon) return;
    this.elements.playIcon.classList.toggle('icon-play', isPaused);
    this.elements.playIcon.classList.toggle('icon-pause', !isPaused);
  }

  updateCoverArt(coverArtUrl) {
    const { coverWrapper, coverCard, coverImage, floatingPanel } = this.elements;
    if (!coverCard || !coverImage || !coverWrapper || !floatingPanel) return;
    const hasCover = !!coverArtUrl;
    coverWrapper.classList.toggle('has-cover', hasCover);
    floatingPanel.classList.toggle('has-cover', hasCover);
    if (hasCover) {
        coverImage.src = coverArtUrl;
    } else {
        coverImage.removeAttribute('src');
    }
  }

  renderWarnings({ audioLoaded, attemptedPlayWithoutAudio, subtitlesLoaded, attemptedNavWithoutSubtitles, vbrHeaderMissing, fileError, audioError }, t) {
    const list = this.elements.warningsList;
    if (!list) return;

    // Collect active warning keys
    const warnings = [];

    // Priority 1: File Errors (transient-ish, but sticky until next drop)
    if (fileError) {
        warnings.push(fileError);
    }

    // Priority 2: Missing Media Warnings (Audio/Subtitle Missing on attempt)
    if (!audioLoaded && attemptedPlayWithoutAudio) {
        warnings.push('audioMissing');
    }
    if (!subtitlesLoaded && attemptedNavWithoutSubtitles) {
        warnings.push('subtitleMissing');
    }

    // Priority 3: Persistent/Metadata Warnings
    if (vbrHeaderMissing) {
        warnings.push('vbrWarning');
    }
    
    // Priority 4: Playback Errors
    if (audioError) {
        warnings.push('audioError');
    }

    // Clear list
    list.innerHTML = '';

    if (warnings.length === 0) return;

    // Render banners
    warnings.forEach(key => {
        const banner = document.createElement('div');
        banner.className = 'warning-banner panel-surface visible';
        banner.setAttribute('role', 'alert');
        
        const icon = document.createElement('span');
        icon.className = 'warning-icon mask-icon icon-error';
        icon.setAttribute('aria-hidden', 'true');
        
        const text = document.createElement('span');
        text.className = 'warning-text';
        text.dataset.i18n = key;
        text.textContent = t(key);
        
        banner.appendChild(icon);
        banner.appendChild(text);

        list.appendChild(banner);
    });
  }

  // Deprecated/Legacy support removed.



  setDropTitleText(isEmpty, t) {
    const zones = [this.elements.dropZoneEmpty, this.elements.dropZoneFloating].filter(Boolean);
    const key = isEmpty ? 'dropTitleIntro' : 'dropTitleShort';
    zones.forEach((zone) => {
      const titleNode = zone.querySelector('.drop-title-text');
      if (!titleNode) return;
      titleNode.setAttribute('data-i18n', key);
      titleNode.textContent = t(key);
    });
  }

  updateMediaIndicators({ audioLoaded, subtitlesLoaded }) {
    (this.elements.audioIndicators || []).forEach((el) => {
        el.checked = !!audioLoaded;
    });
    (this.elements.subtitleIndicators || []).forEach((el) => {
        el.checked = !!subtitlesLoaded;
    });
  }

  updateEmptyState({ audioLoaded, subtitlesLoaded }, t) {
    const isEmpty = !audioLoaded && !subtitlesLoaded;
    if (this.elements.body) {
        this.elements.body.classList.toggle('state-empty', isEmpty);
    }
    this.setDropTitleText(isEmpty, t);
    this.togglePanels(isEmpty);
  }

  toggleZoomControl(visible) {
    if (this.elements.zoomControl) {
        this.elements.zoomControl.style.display = visible ? 'flex' : 'none';
    }
  }

  updateFollowButtonState(isPlaying) {
    if (this.elements.followButton) {
        this.elements.followButton.classList.toggle('playing', isPlaying);
    }
  }

  formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const totalSeconds = Math.floor(seconds);
    const mins = Math.floor(totalSeconds / 60);
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  updateProgress(duration, currentTime) {
    const { progressBar, progressCurrent } = this.elements;
    if (!progressBar) return;

    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const safeCurrent = Math.min(Math.max(Number(currentTime) || 0, 0), safeDuration || 0);

    progressBar.max = safeDuration;
    progressBar.value = safeCurrent;
    progressBar.disabled = safeDuration === 0;

    if (progressCurrent) progressCurrent.textContent = this.formatTime(safeCurrent);
  }

  updateLanguageButtons(languageNativeNames, currentLanguage, onLanguageChange) {
    const { languageDropdown } = this.elements;
    if (!languageDropdown) return;

    languageDropdown.innerHTML = '';

    Object.entries(languageNativeNames).forEach(([lang, nativeName]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.language = lang;
        button.textContent = nativeName;
        button.classList.toggle('active', lang === currentLanguage);

        button.addEventListener('click', () => {
            onLanguageChange(lang)
            languageDropdown.querySelectorAll('button').forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.language === lang);
            });
        });

        languageDropdown.appendChild(button);
    });
  }

  initializeThemeControls({ themeMode, canvasColor, canvasPresets }, { onThemeModeChange, onCanvasColorChange }, t) {
    const { themeDropdown } = this.elements;
    if (!themeDropdown) return;

    themeDropdown.innerHTML = '';
    themeDropdown.classList.add('theme-dropdown');
    this.themeModeButtons = [];
    this.canvasButtons = [];

    const modeLabel = document.createElement('div');
    modeLabel.className = 'theme-section-label';
    modeLabel.textContent = t('labelTheme');
    themeDropdown.appendChild(modeLabel);

    const modeRow = document.createElement('div');
    modeRow.className = 'theme-row mode-row';
    const modes = [
        { mode: 'light', iconClass: 'icon-light-mode', labelKey: 'themeModeLight' },
        { mode: 'dark', iconClass: 'icon-dark-mode', labelKey: 'themeModeDark' },
        { mode: 'system', iconClass: 'icon-computer', labelKey: 'themeModeSystem' }
    ];

    modes.forEach(({ mode, iconClass, labelKey }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'theme-mode-btn';
        button.dataset.mode = mode;
        const iconEl = document.createElement('span');
        iconEl.className = `theme-mode-icon mask-icon ${iconClass}`;
        iconEl.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'theme-mode-label sr-only';
        label.textContent = t(labelKey);
        button.append(iconEl, label);
        button.addEventListener('click', () => onThemeModeChange(mode));
        this.themeModeButtons.push(button);
        modeRow.appendChild(button);
    });

    themeDropdown.appendChild(modeRow);

    const accentLabel = document.createElement('div');
    accentLabel.className = 'theme-section-label';
    accentLabel.textContent = t('themeCanvasBg');
    themeDropdown.appendChild(accentLabel);

    const accentRow = document.createElement('div');
    accentRow.className = 'theme-row canvas-row';

    canvasPresets.forEach((color) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'canvas-swatch';
        button.style.background = color;
        button.dataset.canvas = color;
        button.setAttribute('aria-label', `${t('themeCanvasBg')} ${color}`);
        button.addEventListener('click', () => onCanvasColorChange(color));
        this.canvasButtons.push(button);
        accentRow.appendChild(button);
    });

    themeDropdown.appendChild(accentRow);
    this.updateThemeControls(themeMode, canvasColor, t);
  }

  updateThemeControls(themeMode, canvasColor, t) {
      this.updateThemeModeButtons(themeMode);
      this.updateCanvasButtons(canvasColor);
      this.updateThemeControlLabels(t);
  }

  updateThemeModeButtons(themeMode) {
      this.themeModeButtons.forEach((button) => {
          const isActive = button.dataset.mode === themeMode;
          button.classList.toggle('active', isActive);
          button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
  }

  updateCanvasButtons(canvasColor) {
      const current = (canvasColor || '').toUpperCase();
      this.canvasButtons.forEach((button) => {
          const isActive = current && button.dataset.canvas.toUpperCase() === current;
          button.classList.toggle('active', isActive);
      });
  }

  updateThemeControlLabels(t) {
      if (!this.elements.themeDropdown) return;
      this.themeModeButtons.forEach((button) => {
          const labelKey =
              button.dataset.mode === 'light'
                  ? 'themeModeLight'
                  : button.dataset.mode === 'dark'
                      ? 'themeModeDark'
                      : 'themeModeSystem';
          const label = button.querySelector('.theme-mode-label');
          if (label) label.textContent = t(labelKey);
      });
      const labels = this.elements.themeDropdown.querySelectorAll('.theme-section-label');
      if (labels.length > 0) {
          labels[0].textContent = t('labelTheme');
      }
      if (labels.length > 1) {
          labels[1].textContent = t('themeCanvasBg');
      }
      this.canvasButtons.forEach((button) => {
          button.setAttribute('aria-label', `${t('themeCanvasBg')} ${button.dataset.canvas}`);
      });
  }

}

export default new UIManager();
