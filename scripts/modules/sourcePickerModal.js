import { translations } from './translations.js';
import GalleryRemote, {
  GALLERY_COUNTRY_OPTIONS,
  RECOMMENDED_CATEGORY_IDS,
  debounce,
  safeJsonParse,
  normalizeUrl,
  parseCssPx,
  computeSelectWidthPx,
} from './galleryRemote.js';
import { escapeHtml, safeExternalUrl } from './domUtils.js';
import { lockBodyScroll, unlockBodyScroll } from './bodyScrollLock.js';
import {
  createModalInputLock,
  DEFAULT_MODAL_BLOCKED_KEY_CODES,
  DEFAULT_MODAL_BLOCKED_KEYS,
} from './modalInputLock.js';

export { computeSelectWidthPx } from './galleryRemote.js';

const LIBRARY_STORAGE_KEY = 'readcastLibraryV1';
const FAVORITES_STORAGE_KEY = 'readcastEpisodeFavoritesV1';
const RECOMMENDED_PER_CATEGORY = 3;
const RECOMMENDED_INITIAL_CATEGORIES = 4;
const RECOMMENDED_LOAD_MORE_CATEGORIES = 2;
const RECOMMENDED_SCROLL_BOTTOM_PX = 140;
const GALLERY_COUNTRY_OVERRIDE_KEY = 'readcastGalleryCountryOverrideV1';
const GALLERY_CATEGORY_FILTER_KEY = 'readcastGalleryCategoryFilterV1';
const REMOTE_SEARCH_DEBOUNCE_MS = 380;

export default class SourcePickerModal {
  constructor({
    t,
    onPlayEpisode,
  } = {}) {
    this.t = typeof t === 'function' ? t : (key) => key;
    this.onPlayEpisode =
      typeof onPlayEpisode === 'function' ? onPlayEpisode : null;

    this.remote = new GalleryRemote();

    this.backdrop = null;
    this.modal = null;
    this.countrySelect = null;
    this.categorySelect = null;
    this.searchInput = null;
    this.tabsEl = null;
    this.contentEl = null;
    this.currentAbort = null;
    this.countryOverride = '';
    this.categoryFilter = 'all';
    this.galleryLanguage = '';
    this.selectMeasureCtx = null;

    this.modalScrollLock = null;
    this.modalInputLock = createModalInputLock({
      isOpen: () => this.isOpen(),
      getContainer: () => this.modal,
      onRequestClose: () => this.close(),
      onActivate: () => this.lockPageScroll(),
      onDeactivate: () => this.unlockPageScroll(),
      trapTab: true,
      blockCtrlZoomKeys: true,
      blockedKeyCodes: DEFAULT_MODAL_BLOCKED_KEY_CODES,
      blockedKeys: DEFAULT_MODAL_BLOCKED_KEYS,
      preventGestureStart: true,
    });

    this.view = 'search';
    this.viewBeforePodcast = 'search';
    this.searchResults = [];
    this.recommendedGroups = [];
    this.recommendedLoaded = false;
    this.recommendedLoading = false;
    this.recommendedRenderRaf = 0;
    this.recommendedAllLoaded = false;
    this.recommendedLocaleKey = '';
    this.recommendedTriedCategoryIds = new Set();
    this.selectedPodcast = null;
    this.selectedEpisode = null;
    this.episodes = [];
    this.rssError = null;
    this.podcastInfoOpen = false;

    this.recommendedDomKey = '';
    this.recommendedRenderedGroupKeys = new Set();
    this.recommendedFeedIndex = new Map();
    this.recommendedClickDelegated = false;
    this.recommendedScrollHandler = null;
    this.recommendedScrollRaf = 0;
  }

  isOpen() {
    return Boolean(this.modal && !this.modal.hasAttribute('hidden'));
  }

  getSelectMeasureContext() {
    if (this.selectMeasureCtx) return this.selectMeasureCtx;
    try {
      const canvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(1, 1)
          : document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      this.selectMeasureCtx = ctx || null;
    } catch {
      this.selectMeasureCtx = null;
    }
    return this.selectMeasureCtx;
  }

  lockPageScroll() {
    if (this.modalScrollLock) return;
    this.modalScrollLock = lockBodyScroll({ bodyClass: 'gallery-modal-open' });
  }

  unlockPageScroll() {
    if (!this.modalScrollLock) return;
    const lock = this.modalScrollLock;
    this.modalScrollLock = null;
    unlockBodyScroll(lock);
  }

  activateModalLock() {
    this.modalInputLock.activate();
  }

  deactivateModalLock() {
    this.modalInputLock.deactivate();
  }

  updateCategorySelectWidth() {
    if (!this.categorySelect) return;
    const option =
      this.categorySelect.selectedOptions &&
      this.categorySelect.selectedOptions[0];
    const label = option ? option.textContent : '';
    const styles = window.getComputedStyle
      ? window.getComputedStyle(this.categorySelect)
      : null;
    const width = computeSelectWidthPx({
      text: label,
      font: styles ? styles.font : '',
      paddingLeft: parseCssPx(styles && styles.paddingLeft),
      paddingRight: parseCssPx(styles && styles.paddingRight),
      borderLeft: parseCssPx(styles && styles.borderLeftWidth),
      borderRight: parseCssPx(styles && styles.borderRightWidth),
      extra: 30,
      min: 56,
      max: 520,
      measureContext: this.getSelectMeasureContext(),
    });
    this.categorySelect.style.width = `${width}px`;
  }

  getRecommendationLocaleKey() {
    return `${this.getGalleryLanguage()}|${this.getRecommendedCountry()}`;
  }

  getGalleryLanguage() {
    const stored = (this.galleryLanguage || '').trim();
    if (stored) return stored;
    const fallback =
      (document.documentElement && document.documentElement.lang) || 'en';
    return (fallback || 'en').split('-')[0].toLowerCase();
  }

  getLanguageForCountry(country) {
    const code = (country || '').trim().toLowerCase();
    const map = {
      us: 'en',
      sg: 'en',
      cn: 'zh',
      jp: 'ja',
      kr: 'ko',
      de: 'de',
      es: 'es',
    };
    return map[code] || 'en';
  }

  ensureGalleryLanguagePinned() {
    if (this.galleryLanguage) return false;
    const current = (
      (document.documentElement && document.documentElement.lang) ||
      'en'
    )
      .split('-')[0]
      .toLowerCase();
    this.galleryLanguage = current || 'en';
    return true;
  }

  tg(key, vars = {}) {
    const lang = this.getGalleryLanguage();
    const fallbackPack = translations.en || {};
    const pack = (translations && translations[lang]) || fallbackPack;
    let template = pack[key] || fallbackPack[key] || key;
    Object.keys(vars).forEach((token) => {
      template = template.replace(`{{${token}}}`, vars[token]);
    });
    return template;
  }

  syncRecommendationLocale() {
    const nextKey = this.getRecommendationLocaleKey();
    if (this.recommendedLocaleKey && this.recommendedLocaleKey === nextKey)
      return false;
    this.recommendedLocaleKey = nextKey;

    this.recommendedLoaded = false;
    this.recommendedLoading = false;
    this.recommendedGroups = [];
    this.recommendedAllLoaded = false;
    this.recommendedTriedCategoryIds = new Set();
    return true;
  }

  syncLanguageFromCountryOverride() {
    if (!this.countryOverride) return false;
    const next = this.getLanguageForCountry(this.countryOverride);
    if (this.galleryLanguage === next) return false;
    this.galleryLanguage = next;
    return true;
  }

  onLocaleChanged() {
    const changed = this.syncRecommendationLocale();
    if (!changed) return;

    if (this.countrySelect && !this.countryOverride) {
      this.countrySelect.value = this.getRecommendedCountry();
    }
    if (this.categorySelect) {
      this.refreshCategoryOptions();
      if (
        !this.categorySelect.querySelector(
          `option[value="${this.categoryFilter}"]`
        )
      ) {
        this.categoryFilter = 'all';
        this.saveCategoryFilter(this.categoryFilter);
      }
      this.categorySelect.value = this.categoryFilter;
      this.updateCategorySelectWidth();
    }

    const modalOpen = this.modal && !this.modal.hasAttribute('hidden');
    if (!modalOpen) return;
    if (this.view !== 'search') return;

    const query = this.searchInput ? this.searchInput.value.trim() : '';
    const hasSearchResults =
      Array.isArray(this.searchResults) && this.searchResults.length > 0;
    if (query || hasSearchResults) return;

    if (this.currentAbort) this.currentAbort.abort();
    this.currentAbort = null;
    this.ensureRecommendedLoaded();
    this.render();
  }

  scheduleRecommendedRender() {
    if (this.recommendedRenderRaf) return;
    this.recommendedRenderRaf = requestAnimationFrame(() => {
      this.recommendedRenderRaf = 0;
      if (!this.modal || !this.contentEl) return;
      if (this.view !== 'search') return;
      const query = this.searchInput ? this.searchInput.value.trim() : '';
      const results = this.searchResults || [];
      if (query || results.length > 0) return;
      this.renderRecommended();
    });
  }

  scheduleRecommendedScrollCheck() {
    if (this.recommendedScrollRaf) return;
    this.recommendedScrollRaf = requestAnimationFrame(() => {
      this.recommendedScrollRaf = 0;
      this.maybeLoadMoreRecommended();
    });
  }

  maybeLoadMoreRecommended() {
    if (!this.contentEl) return;
    if (!this.isOpen()) return;
    if (this.view !== 'search') return;
    const query = this.searchInput ? this.searchInput.value.trim() : '';
    const results = Array.isArray(this.searchResults) ? this.searchResults : [];
    if (query || results.length > 0) return;
    if (this.categoryFilter !== 'all') return;
    if (this.recommendedAllLoaded) return;
    if (this.recommendedLoading) return;

    const scrollTop = this.contentEl.scrollTop || 0;
    const clientHeight = this.contentEl.clientHeight || 0;
    const scrollHeight = this.contentEl.scrollHeight || 0;
    const remaining = scrollHeight - (scrollTop + clientHeight);
    if (remaining <= RECOMMENDED_SCROLL_BOTTOM_PX) {
      this.ensureRecommendedMoreLoaded();
    }
  }

  updateRecommendedScrollListener() {
    if (!this.contentEl) return;
    const query = this.searchInput ? this.searchInput.value.trim() : '';
    const results = Array.isArray(this.searchResults) ? this.searchResults : [];
    const shouldBind =
      this.isOpen() &&
      this.view === 'search' &&
      !query &&
      results.length === 0 &&
      this.categoryFilter === 'all';

    if (!shouldBind) {
      if (this.recommendedScrollHandler) {
        this.contentEl.removeEventListener('scroll', this.recommendedScrollHandler);
        this.recommendedScrollHandler = null;
      }
      return;
    }

    if (!this.recommendedScrollHandler) {
      this.recommendedScrollHandler = (event) => {
        if (event && event.isTrusted === false) return;
        this.scheduleRecommendedScrollCheck();
      };
      this.contentEl.addEventListener('scroll', this.recommendedScrollHandler, {
        passive: true,
      });
    }
  }

  init() {
    if (this.modal) return;

    this.ensureGalleryLanguagePinned();
    this.countryOverride = this.loadCountryOverride();
    this.syncLanguageFromCountryOverride();
    this.categoryFilter = this.loadCategoryFilter();

    const backdrop = document.createElement('div');
    backdrop.className = 'gallery-backdrop';
    backdrop.setAttribute('hidden', 'true');
    backdrop.addEventListener('click', (event) => {
      if (event && event.cancelable) event.preventDefault();
      if (event) event.stopPropagation();
    });
    document.body.appendChild(backdrop);
    this.backdrop = backdrop;

    const modal = document.createElement('div');
    modal.className = 'gallery-modal panel-surface';
    modal.setAttribute('hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    modal.innerHTML = `
            <div class="gallery-nav-row">
                <button type="button" class="gallery-refresh" aria-label="Refresh">
                    <span class="mask-icon gallery-nav-icon icon-refresh" aria-hidden="true"></span>
                </button>
                <div class="gallery-tabs" role="tablist" aria-label="Gallery tabs"></div>
                <button type="button" class="gallery-close" aria-label="Close">
                    <span class="mask-icon gallery-nav-icon icon-close" aria-hidden="true"></span>
                </button>
            </div>
            <div class="gallery-toolbar">
                <select class="gallery-country" aria-label="Country"></select>
                <select class="gallery-category" aria-label="Category"></select>
                <input class="gallery-search" type="search" placeholder="Search podcasts…" />
            </div>
            <div class="gallery-content"></div>
        `;
    backdrop.appendChild(modal);
    this.modal = modal;
    this.countrySelect = modal.querySelector('.gallery-country');
    this.categorySelect = modal.querySelector('.gallery-category');
    this.searchInput = modal.querySelector('.gallery-search');
    this.tabsEl = modal.querySelector('.gallery-tabs');
    this.contentEl = modal.querySelector('.gallery-content');

    if (this.countrySelect) {
      this.countrySelect.innerHTML = GALLERY_COUNTRY_OPTIONS.map(
        (option) =>
          `<option value="${escapeHtml(option.code)}">${escapeHtml(option.label)}</option>`
      ).join('');
      this.countrySelect.value =
        this.countryOverride || this.getRecommendedCountry();
      this.countrySelect.addEventListener('change', () => {
        this.countryOverride = this.countrySelect
          ? this.countrySelect.value
          : '';
        this.saveCountryOverride(this.countryOverride);
        this.syncLanguageFromCountryOverride();
        if (this.categorySelect) {
          this.refreshCategoryOptions();
          this.updateCategorySelectWidth();
        }

        const query = this.searchInput ? this.searchInput.value.trim() : '';
        if (query) this.performSearch(query);
        else this.onLocaleChanged();
      });
    }

    if (this.categorySelect) {
      this.refreshCategoryOptions();
      this.categorySelect.value = this.categoryFilter;
      this.updateCategorySelectWidth();
      this.categorySelect.addEventListener('change', () => {
        this.categoryFilter = this.categorySelect
          ? this.categorySelect.value
          : 'all';
        this.saveCategoryFilter(this.categoryFilter);
        this.updateCategorySelectWidth();

        const query = this.searchInput ? this.searchInput.value.trim() : '';
        const hasSearchResults =
          Array.isArray(this.searchResults) && this.searchResults.length > 0;
        if (!query && !hasSearchResults && this.view === 'search') {
          this.renderRecommended();
        }
      });
    }

    const closeBtn = modal.querySelector('.gallery-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const refreshBtn = modal.querySelector('.gallery-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.handleRefresh());
    }

    if (this.searchInput) {
      const trigger = debounce(
        () => this.performSearch(this.searchInput.value),
        REMOTE_SEARCH_DEBOUNCE_MS
      );
      this.searchInput.addEventListener('input', trigger);
      this.searchInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        this.performSearch(this.searchInput.value);
      });
    }

    this.render();
  }

  setToolbarVisible(visible) {
    const shouldShow = Boolean(visible);
    if (!this.modal) return;
    const toolbar = this.modal.querySelector('.gallery-toolbar');
    if (!toolbar) return;
    toolbar.toggleAttribute('hidden', !shouldShow);

    const country = toolbar.querySelector('.gallery-country');
    const category = toolbar.querySelector('.gallery-category');
    const search = toolbar.querySelector('.gallery-search');
    if (country) country.disabled = !shouldShow;
    if (category) category.disabled = !shouldShow;
    if (search) search.disabled = !shouldShow;
  }

  abortCurrentRequest() {
    if (!this.currentAbort) return;
    this.currentAbort.abort();
    this.currentAbort = null;
  }

  handleRefresh() {
    if (this.view === 'search') {
      const query = this.searchInput ? this.searchInput.value.trim() : '';
      if (query) {
        this.performSearch(query);
      } else {
        this.abortCurrentRequest();
        this.recommendedLoading = false;
        this.recommendedLoaded = false;
        this.recommendedGroups = [];
        this.recommendedAllLoaded = false;
        this.recommendedTriedCategoryIds = new Set();
        this.ensureRecommendedLoaded();
      }
      return;
    }

    this.render();
  }

  handleBack() {
    if (this.view === 'episode') {
      this.view = 'podcast';
      this.selectedEpisode = null;
      this.podcastInfoOpen = false;
      this.render();
      return;
    }

    const nextView =
      this.viewBeforePodcast && this.viewBeforePodcast !== 'podcast'
        ? this.viewBeforePodcast
        : 'search';
    this.view = nextView;
    this.selectedPodcast = null;
    this.selectedEpisode = null;
    this.episodes = [];
    this.rssError = null;
    this.podcastInfoOpen = false;
    this.render();

    if (this.view === 'search') {
      const query = this.searchInput ? this.searchInput.value.trim() : '';
      const hasSearchResults =
        Array.isArray(this.searchResults) && this.searchResults.length > 0;
      if (!query && !hasSearchResults) {
        this.ensureRecommendedLoaded();
      }
    }
  }

  renderInlineNav(title) {
    return `
            <div class="gallery-header-bg" aria-hidden="true"></div>
            <div class="gallery-inline-nav" aria-hidden="false">
                <button type="button" class="gallery-inline-back" aria-label="Back">
                    <span class="mask-icon gallery-nav-icon icon-arrow-back" aria-hidden="true"></span>
                </button>
                <div class="gallery-inline-title">${escapeHtml(title || '')}</div>
                <button type="button" class="gallery-inline-close" aria-label="Close">
                    <span class="mask-icon gallery-nav-icon icon-close" aria-hidden="true"></span>
                </button>
            </div>
        `;
  }

  bindInlineNavHandlers() {
    if (!this.contentEl) return;
    const backBtn = this.contentEl.querySelector('.gallery-inline-back');
    if (backBtn) {
      backBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.handleBack();
      });
    }
    const closeBtn = this.contentEl.querySelector('.gallery-inline-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      });
    }
  }

  setupScrollAnimation() {
    if (!this.contentEl) return;
    if (this.scrollHandler) {
      this.contentEl.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }

    const scrollContainer = this.contentEl;
    const headerBg = this.contentEl.querySelector('.gallery-header-bg');
    const backBtn = this.contentEl.querySelector('.gallery-inline-back');
    const closeBtn = this.contentEl.querySelector('.gallery-inline-close');
    const titleEl = this.contentEl.querySelector('.gallery-inline-title');

    if (!headerBg || !backBtn || !closeBtn) return;

    let ticking = false;
    const update = () => {
      const scrollTop = scrollContainer.scrollTop;
      const threshold = 60;
      const progress = Math.min(Math.max(scrollTop / threshold, 0), 1);

      headerBg.style.opacity = progress.toString();
      if (titleEl) titleEl.style.opacity = progress.toString();
      const scale = 1 - progress * 0.15;
      const transform = `scale(${scale})`;

      backBtn.style.transform = transform;
      closeBtn.style.transform = transform;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };

    this.scrollHandler = onScroll;
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    update();
  }

  openView(view) {
    const normalizedView = String(view || 'search')
      .trim()
      .toLowerCase();
    const nextView = [
      'search',
      'subscriptions',
      'favorites',
    ].includes(normalizedView)
      ? normalizedView
      : 'search';

    this.init();
    this.ensureGalleryLanguagePinned();
    this.countryOverride = this.loadCountryOverride();
    this.syncLanguageFromCountryOverride();
    this.categoryFilter = this.loadCategoryFilter();

    this.abortCurrentRequest();

    this.viewBeforePodcast = nextView;
    this.view = nextView;
    this.searchResults = [];
    this.selectedPodcast = null;
    this.selectedEpisode = null;
    this.episodes = [];
    this.rssError = null;
    this.podcastInfoOpen = false;
    if (this.searchInput) this.searchInput.value = '';

    if (nextView === 'search') {
      if (this.countrySelect)
        this.countrySelect.value =
          this.countryOverride || this.getRecommendedCountry();
      if (this.categorySelect) {
        this.refreshCategoryOptions();
        if (
          !this.categorySelect.querySelector(
            `option[value="${this.categoryFilter}"]`
          )
        ) {
          this.categoryFilter = 'all';
          this.saveCategoryFilter(this.categoryFilter);
        }
        this.categorySelect.value = this.categoryFilter;
        this.updateCategorySelectWidth();
      }
      this.syncRecommendationLocale();
    }

    if (this.backdrop) this.backdrop.removeAttribute('hidden');
    if (this.modal) this.modal.removeAttribute('hidden');
    this.activateModalLock();

    if (nextView === 'search') {
      this.ensureRecommendedLoaded();
    }

    this.render();
  }

  open() {
    this.openView('search');
  }

  openSubscriptions() {
    this.openView('subscriptions');
  }

  openFavorites() {
    this.openView('favorites');
  }

  close() {
    this.deactivateModalLock();
    this.abortCurrentRequest();
    if (this.backdrop) this.backdrop.setAttribute('hidden', 'true');
    if (this.modal) this.modal.setAttribute('hidden', 'true');
    this.podcastInfoOpen = false;
    this.updateRecommendedScrollListener();
  }

  loadLibrary() {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
    const parsed = raw ? safeJsonParse(raw, {}) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  }

  loadFavorites() {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    const parsed = raw ? safeJsonParse(raw, {}) : {};
    const favorites = parsed && typeof parsed === 'object' ? parsed : {};
    const normalized = {};
    Object.entries(favorites).forEach(([key, entry]) => {
      if (!entry || typeof entry !== 'object') return;
      const feedUrl = normalizeUrl(entry.feedUrl);
      const audioUrl = normalizeUrl(entry.audioUrl);
      if (!feedUrl || !audioUrl) return;
      const k =
        typeof key === 'string' && key
          ? key
          : `${feedUrl.toLowerCase()}::${audioUrl.toLowerCase()}`;
      normalized[k] = entry;
    });
    return normalized;
  }

  saveFavorites(favorites) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        FAVORITES_STORAGE_KEY,
        JSON.stringify(favorites || {})
      );
    } catch {
      // ignore
    }
  }

  getFavoriteEpisodeKey(podcast, episode) {
    const feedUrl = normalizeUrl(podcast && podcast.feedUrl);
    const audioUrl = normalizeUrl(episode && episode.audioUrl);
    if (!feedUrl || !audioUrl) return '';
    return `${feedUrl.toLowerCase()}::${audioUrl.toLowerCase()}`;
  }

  isEpisodeFavorited(podcast, episode) {
    const key = this.getFavoriteEpisodeKey(podcast, episode);
    if (!key) return false;
    const favorites = this.loadFavorites();
    return Boolean(favorites[key]);
  }

  toggleFavoriteEpisode(podcast, episode) {
    const key = this.getFavoriteEpisodeKey(podcast, episode);
    if (!key) return;

    const feedUrl = normalizeUrl(podcast && podcast.feedUrl);
    const audioUrl = normalizeUrl(episode && episode.audioUrl);
    if (!feedUrl || !audioUrl) return;

    const favorites = this.loadFavorites();
    if (favorites[key]) {
      delete favorites[key];
    } else {
      favorites[key] = {
        feedUrl,
        audioUrl,
        episodeId: normalizeUrl(episode.id) || audioUrl,
        episodeTitle: episode.title || audioUrl,
        episodeDate: episode.pubDate || '',
        podcastTitle: podcast.title || '',
        podcastAuthor: podcast.author || '',
        podcastArtworkUrl: podcast.artworkUrl || '',
        addedAt: Date.now(),
      };
    }
    this.saveFavorites(favorites);
    this.render();
  }

  loadCountryOverride() {
    if (typeof localStorage === 'undefined') return '';
    const raw = localStorage.getItem(GALLERY_COUNTRY_OVERRIDE_KEY);
    const value = (raw || '').trim().toLowerCase();
    if (!value) return '';
    return GALLERY_COUNTRY_OPTIONS.some((opt) => opt.code === value)
      ? value
      : '';
  }

  loadCategoryFilter() {
    if (typeof localStorage === 'undefined') return 'all';
    const raw = localStorage.getItem(GALLERY_CATEGORY_FILTER_KEY);
    const value = (raw || '').trim().toLowerCase();
    return value || 'all';
  }

  saveCategoryFilter(filter) {
    if (typeof localStorage === 'undefined') return;
    const value = (filter || '').trim().toLowerCase();
    try {
      localStorage.setItem(GALLERY_CATEGORY_FILTER_KEY, value || 'all');
    } catch {
      // ignore
    }
  }

  saveCountryOverride(country) {
    if (typeof localStorage === 'undefined') return;
    const value = (country || '').trim().toLowerCase();
    try {
      if (!value) localStorage.removeItem(GALLERY_COUNTRY_OVERRIDE_KEY);
      else localStorage.setItem(GALLERY_COUNTRY_OVERRIDE_KEY, value);
    } catch {
      // ignore
    }
  }

  getFeedFetchabilityStatus(feedUrl) {
    return this.remote.getFeedFetchabilityStatus(
      this.getRecommendedCountry(),
      feedUrl
    );
  }

  setFeedFetchabilityStatus(feedUrl, ok, reason = '') {
    this.remote.setFeedFetchabilityStatus(
      this.getRecommendedCountry(),
      feedUrl,
      ok,
      reason
    );
  }

  async validateFeedFetchable(feedUrl, signal) {
    return this.remote.validateFeedFetchable(
      this.getRecommendedCountry(),
      feedUrl,
      signal
    );
  }

  saveLibrary(library) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library || {}));
    } catch {
      // ignore
    }
  }

  isSubscribed(feedUrl) {
    const key = normalizeUrl(feedUrl);
    if (!key) return false;
    const library = this.loadLibrary();
    return Boolean(library[key]);
  }

  toggleSubscribe(podcast) {
    if (!podcast || !podcast.feedUrl) return;
    const feedUrl = normalizeUrl(podcast.feedUrl);
    if (!feedUrl) return;
    const library = this.loadLibrary();
    if (library[feedUrl]) {
      delete library[feedUrl];
    } else {
      library[feedUrl] = {
        feedUrl,
        title: podcast.title || '',
        author: podcast.author || '',
        artworkUrl: podcast.artworkUrl || '',
        addedAt: Date.now(),
      };
    }
    this.saveLibrary(library);
    this.render();
  }

  setLoading(message) {
    if (!this.contentEl) return;
    this.contentEl.innerHTML = `<div class="gallery-empty">${escapeHtml(message)}</div>`;
  }

  async performSearch(termRaw) {
    const term = (termRaw || '').trim();
    if (!term) {
      this.searchResults = [];
      this.render();
      return;
    }

    this.abortCurrentRequest();
    this.currentAbort = new AbortController();

    this.view = 'search';
    this.selectedPodcast = null;
    this.episodes = [];
    this.setLoading('Loading…');

    try {
      const results = await this.remote.performSearch({
        term,
        country: this.getRecommendedCountry(),
        signal: this.currentAbort.signal,
      });
      this.searchResults = Array.isArray(results)
        ? results.filter((it) => it && it.title)
        : [];
      this.render();
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      this.searchResults = [];
      this.setLoading('Search failed.');
    }
  }

  async openPodcast(podcast) {
    if (!podcast || !podcast.feedUrl) return;
    const feedUrl = normalizeUrl(podcast.feedUrl);
    if (!feedUrl) return;

    this.abortCurrentRequest();
    this.currentAbort = new AbortController();

    if (this.view && this.view !== 'podcast') {
      this.viewBeforePodcast = this.view;
    }
    this.view = 'podcast';
    this.selectedPodcast = { ...podcast, feedUrl };
    this.episodes = [];
    this.rssError = null;
    this.podcastInfoOpen = false;
    this.render();
    this.setLoading('Loading RSS…');

    try {
      const parsed = await this.remote.fetchAndParseFeed({
        feedUrl,
        signal: this.currentAbort.signal,
      });
      this.setFeedFetchabilityStatus(feedUrl, true, 'ok');
      this.episodes = parsed.episodes;
      this.selectedPodcast = {
        ...this.selectedPodcast,
        title: this.selectedPodcast.title || parsed.title,
        description: this.selectedPodcast.description || parsed.description,
        artworkUrl: this.selectedPodcast.artworkUrl || parsed.artworkUrl,
      };
      this.render();
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      this.episodes = [];
      this.setFeedFetchabilityStatus(feedUrl, false, 'fetch_failed');
      this.rssError = {
        type: 'rss-fetch-failed',
        message:
          'This feed cannot be fetched in the browser yet, so episodes cannot be listed inside Readcast.',
      };
      this.render();
    }
  }

  getRecommendedCountry() {
    const override = (this.countryOverride || '').trim().toLowerCase();
    if (
      override &&
      GALLERY_COUNTRY_OPTIONS.some((opt) => opt.code === override)
    )
      return override;

    const key = this.getGalleryLanguage();
    const map = {
      zh: 'cn',
      en: 'us',
      ja: 'jp',
      ko: 'kr',
      de: 'de',
      es: 'es',
    };
    return map[key] || 'us';
  }

  getRecommendedCategories() {
    return RECOMMENDED_CATEGORY_IDS.map((id) => ({
      id,
      label: this.tg(`galleryCategory_${id}_label`),
      term: this.tg(`galleryCategory_${id}_term`),
    })).filter((category) => category.term && category.label);
  }

  refreshCategoryOptions() {
    if (!this.categorySelect) return;
    const categories = this.getRecommendedCategories();
    const options = [
      { id: 'all', label: this.tg('galleryCategoryAll'), term: '' },
    ].concat(categories);
    this.categorySelect.innerHTML = options
      .map(
        (category) =>
          `<option value="${escapeHtml(category.id)}">${escapeHtml(category.label)}</option>`
      )
      .join('');
  }

  getRecommendedCacheKey() {
    return this.remote.getRecommendedCacheKey(
      this.getRecommendedCountry(),
      this.getGalleryLanguage()
    );
  }

  readRecommendedCache() {
    return this.remote.readRecommendedCache(
      this.getRecommendedCountry(),
      this.getGalleryLanguage()
    );
  }

  writeRecommendedCache(groups) {
    this.remote.writeRecommendedCache(
      this.getRecommendedCountry(),
      this.getGalleryLanguage(),
      groups
    );
  }

  async pickCorsAllowedRecommended(
    items,
    { signal, desired = RECOMMENDED_PER_CATEGORY, seen = null } = {}
  ) {
    const country = this.getRecommendedCountry();
    return this.remote.pickCorsAllowedRecommended(country, items, {
      signal,
      desired,
      seen,
      validate: (feedUrl, validateSignal) =>
        this.validateFeedFetchable(feedUrl, validateSignal),
    });
  }

  async ensureRecommendedLoaded() {
    if (this.recommendedLoading) return;
    if (
      this.searchInput &&
      this.searchInput.value &&
      this.searchInput.value.trim()
    )
      return;

    const categories = this.getRecommendedCategories();
    const existingGroups = Array.isArray(this.recommendedGroups)
      ? this.recommendedGroups.filter(Boolean)
      : [];
    const alreadySeeded = this.recommendedLoaded
      ? true
      : existingGroups.length >= RECOMMENDED_INITIAL_CATEGORIES;
    if (alreadySeeded || this.recommendedAllLoaded) return;

    if (existingGroups.length === 0) {
      const cached = this.readRecommendedCache();
      if (cached && cached.length > 0) {
        this.recommendedGroups = cached;
        const seeded = cached.length >= RECOMMENDED_INITIAL_CATEGORIES;
        this.recommendedLoaded = seeded;
        this.recommendedAllLoaded = cached.length >= categories.length;
        this.recommendedLoading = false;
        this.render();
        if (seeded || this.recommendedAllLoaded) return;
      }
    }

    await this.loadRecommendedBatch({
      desiredGroups: Math.max(
        RECOMMENDED_INITIAL_CATEGORIES - existingGroups.length,
        0
      ),
      mode: 'seed',
    });
  }

  async ensureRecommendedMoreLoaded() {
    if (this.recommendedLoading) return;
    if (this.recommendedAllLoaded) return;
    if (this.categoryFilter !== 'all') return;
    const query = this.searchInput ? this.searchInput.value.trim() : '';
    const results = Array.isArray(this.searchResults) ? this.searchResults : [];
    if (query || results.length > 0) return;

    await this.loadRecommendedBatch({
      desiredGroups: RECOMMENDED_LOAD_MORE_CATEGORIES,
      mode: 'more',
    });
  }

  async loadRecommendedBatch({ desiredGroups = 0, mode = 'seed' } = {}) {
    if (desiredGroups <= 0) {
      this.recommendedLoaded =
        this.recommendedLoaded ||
        (Array.isArray(this.recommendedGroups)
          ? this.recommendedGroups.length >= RECOMMENDED_INITIAL_CATEGORIES
          : false);
      return;
    }

    this.abortCurrentRequest();
    this.currentAbort = new AbortController();
    const signal = this.currentAbort.signal;

    const existingGroups = Array.isArray(this.recommendedGroups)
      ? this.recommendedGroups.filter(Boolean)
      : [];
    const groups = existingGroups.slice();
    const categories = this.getRecommendedCategories();
    const country = this.getRecommendedCountry();

    this.recommendedLoading = true;
    if (groups.length === 0 && this.view === 'search') this.setLoading('Loading…');
    this.scheduleRecommendedRender();

    try {
      const seenFeeds = new Set();
      const doneCategoryIds = new Set(this.recommendedTriedCategoryIds);
      groups.forEach((group) => {
        if (group && group.id) doneCategoryIds.add(group.id);
        (group && group.items ? group.items : []).forEach((item) => {
          const feedUrl =
            item && item.feedUrl ? String(item.feedUrl).toLowerCase() : '';
          if (feedUrl) seenFeeds.add(feedUrl);
        });
      });

      const pendingCategories = categories.filter(
        (category) => category && !doneCategoryIds.has(category.id)
      );

      let added = 0;
      for (const category of pendingCategories) {
        if (signal.aborted)
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        if (!category) continue;

        let candidates = [];
        try {
          candidates = await this.remote.fetchRecommendedCandidates({
            category,
            country,
            signal,
          });
        } catch (error) {
          if (error && error.name === 'AbortError') throw error;
          continue;
        }

        let picked = [];
        try {
          picked = await this.pickCorsAllowedRecommended(candidates, {
            signal,
            desired: RECOMMENDED_PER_CATEGORY,
            seen: seenFeeds,
          });
        } catch (error) {
          if (error && error.name === 'AbortError') throw error;
          picked = [];
        } finally {
          if (category && category.id && !signal.aborted) {
            this.recommendedTriedCategoryIds.add(category.id);
          }
        }

        if (picked.length === 0) continue;

        groups.push({
          id: category.id,
          label: category.label,
          term: category.term,
          items: picked,
        });
        added += 1;
        this.recommendedGroups = groups.slice();
        this.scheduleRecommendedRender();

        if (mode === 'seed') {
          if (groups.length >= RECOMMENDED_INITIAL_CATEGORIES) break;
        } else if (added >= desiredGroups) {
          break;
        }
      }

      const doneIds = new Set(this.recommendedTriedCategoryIds);
      groups.forEach((group) => {
        if (group && group.id) doneIds.add(group.id);
      });
      this.recommendedAllLoaded = categories.every((cat) => doneIds.has(cat.id));

      this.recommendedGroups = groups;
      this.writeRecommendedCache(groups);
      this.recommendedLoaded =
        groups.length >= RECOMMENDED_INITIAL_CATEGORIES || this.recommendedAllLoaded;
      this.recommendedLoading = false;
      this.render();
    } catch (error) {
      if (error && error.name === 'AbortError') {
        this.recommendedLoading = false;
        this.render();
        return;
      }
      this.recommendedLoading = false;
      this.render();
    }
  }

  render() {
    if (!this.modal || !this.contentEl) return;

    if (this.scrollHandler) {
      this.contentEl.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }

    this.modal.classList.toggle(
      'gallery-modal--narrow',
      this.view === 'favorites'
    );
    this.modal.setAttribute('data-view', this.view);

    const navRow = this.modal.querySelector('.gallery-nav-row');
    if (navRow)
      navRow.toggleAttribute(
        'hidden',
        ['podcast', 'episode'].includes(this.view)
      );

    this.setToolbarVisible(this.view === 'search');
    this.renderHomeTabs();

    if (
      this.view === 'episode' &&
      this.selectedPodcast &&
      this.selectedEpisode
    ) {
      this.renderEpisodeDetail();
      this.bindInlineNavHandlers();
      return;
    }

    if (this.view === 'podcast' && this.selectedPodcast) {
      this.renderPodcastDetail();
      this.bindInlineNavHandlers();
      return;
    }

    if (this.view === 'subscriptions') {
      this.renderSubscriptions();
      return;
    }

    if (this.view === 'favorites') {
      this.renderFavorites();
      return;
    }

    this.renderSearchResults();
    this.updateRecommendedScrollListener();
  }

  renderHomeTabs() {
    if (!this.modal) return;
    const tabsEl = this.tabsEl || this.modal.querySelector('.gallery-tabs');
    if (!tabsEl) return;

    const showTabs = ['search', 'subscriptions', 'favorites'].includes(
      this.view
    );
    tabsEl.toggleAttribute('hidden', !showTabs);
    if (!showTabs) return;

    const tabs = [
      { view: 'search', label: this.tg('navRecommended') },
      { view: 'subscriptions', label: this.tg('navSubscriptions') },
      { view: 'favorites', label: this.tg('navFavorites') },
    ];

    tabsEl.innerHTML = tabs
      .map(({ view, label }) => {
        const selected = this.view === view;
        return `
          <button
            type="button"
            class="gallery-tab ${selected ? 'is-active' : ''}"
            data-tab="${escapeHtml(view)}"
            role="tab"
            aria-selected="${selected ? 'true' : 'false'}"
          >
            ${escapeHtml(label)}
          </button>
        `;
      })
      .join('');

    tabsEl.querySelectorAll('.gallery-tab').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = btn.dataset.tab || '';
        this.switchHomeTab(next);
      });
    });
  }

  switchHomeTab(nextView) {
    const next = String(nextView || '')
      .trim()
      .toLowerCase();
    if (!['search', 'subscriptions', 'favorites'].includes(next)) return;
    if (!this.isOpen()) {
      this.openView(next);
      return;
    }
    if (this.view === next) return;

    if (!this.recommendedLoading) {
      this.abortCurrentRequest();
      this.currentAbort = null;
    }

    this.viewBeforePodcast = next;
    this.view = next;
    this.selectedPodcast = null;
    this.selectedEpisode = null;
    this.episodes = [];
    this.rssError = null;
    this.podcastInfoOpen = false;

    if (next === 'search') {
      this.searchResults = [];
      if (this.searchInput) this.searchInput.value = '';
      this.ensureRecommendedLoaded();
    }

    this.render();
  }

  renderSubscriptions() {
    if (!this.contentEl) return;
    const library = this.loadLibrary();
    const items = Object.values(library || {}).sort(
      (a, b) => (b.addedAt || 0) - (a.addedAt || 0)
    );
    if (items.length === 0) {
      this.contentEl.innerHTML = `<div class="gallery-empty">${escapeHtml(this.tg('galleryNoSubscriptions'))}</div>`;
      return;
    }

    const cards = items
      .map((podcast) => {
        const artworkUrl = safeExternalUrl(podcast.artworkUrl);
        const artwork = artworkUrl
          ? `<img class="gallery-art" src="${escapeHtml(artworkUrl)}" alt="" />`
          : '';
        const title = escapeHtml(podcast.title || '');
        const author = escapeHtml(podcast.author || '');
        return `
	                    <button type="button" class="gallery-card" data-feed="${encodeURIComponent(podcast.feedUrl || '')}">
	                        ${artwork}
	                        <div class="gallery-meta">
	                            <div class="gallery-name">${title}</div>
	                            <div class="gallery-author">${author}</div>
	                        </div>
	                    </button>
	                `;
      })
      .join('');

    this.contentEl.innerHTML = `<div class="gallery-grid">${cards}</div>`;
    this.contentEl.querySelectorAll('.gallery-card').forEach((btn, index) => {
      btn.addEventListener('click', () => {
        const podcast = items[index];
        this.openPodcast(podcast);
      });
    });
  }

  renderFavorites() {
    if (!this.contentEl) return;
    const favorites = this.loadFavorites();
    const items = Object.values(favorites || {})
      .filter((fav) => fav && fav.audioUrl)
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    if (items.length === 0) {
      this.contentEl.innerHTML = `<div class="gallery-empty">${escapeHtml(this.tg('galleryNoFavorites'))}</div>`;
      return;
    }

    const rows = items
      .map((fav, idx) => {
        const podcastTitle = escapeHtml(fav.podcastTitle || '');
        const episodeTitle = escapeHtml(fav.episodeTitle || fav.audioUrl || '');
        const date = escapeHtml(fav.episodeDate || '');
        const key = this.getFavoriteEpisodeKey(
          { feedUrl: fav.feedUrl },
          { audioUrl: fav.audioUrl }
        );
        const artworkUrl = safeExternalUrl(fav.podcastArtworkUrl);
        const artwork = artworkUrl
          ? `<img class="gallery-episode-art" src="${escapeHtml(artworkUrl)}" alt="" />`
          : `<div class="gallery-episode-art placeholder" aria-hidden="true"></div>`;
        return `
	                    <div class="gallery-episode-row" data-idx="${idx}" data-fav="${encodeURIComponent(key)}">
	                        <button type="button" class="gallery-episode gallery-episode-main">
	                            ${artwork}
	                            <div class="gallery-fav-meta">
	                                <div class="gallery-fav-episode-title" title="${episodeTitle}">
	                                    <span class="gallery-fav-episode-title-text">${episodeTitle}</span>
	                                </div>
	                                <div class="gallery-fav-podcast-title" title="${podcastTitle}">${podcastTitle}</div>
	                                <div class="gallery-fav-episode-date">${date}</div>
	                            </div>
	                        </button>
	                        <button type="button" class="gallery-favorite-btn gallery-episode-fav is-active" aria-label="${escapeHtml(
                            this.tg('galleryFavorited')
                          )}">
	                            <span class="mask-icon gallery-favorite-icon icon-star-full" aria-hidden="true"></span>
	                        </button>
	                    </div>
	                `;
      })
      .join('');

    this.contentEl.innerHTML = `<div class="gallery-episodes">${rows}</div>`;

    const marqueeTitles = Array.from(
      this.contentEl.querySelectorAll('.gallery-fav-episode-title')
    );
    marqueeTitles.forEach((titleEl) => {
      const textEl = titleEl.querySelector('.gallery-fav-episode-title-text');
      if (!textEl) return;

      const start = () => {
        if (!titleEl.isConnected) return;
        titleEl.classList.remove('is-marquee');
        titleEl.style.removeProperty('--marquee-distance');
        titleEl.style.removeProperty('--marquee-duration');

        const distance = Math.max(0, textEl.scrollWidth - titleEl.clientWidth);
        if (!distance) return;
        titleEl.style.setProperty('--marquee-distance', `${distance}px`);
        const duration = Math.min(12, Math.max(4, distance / 40));
        titleEl.style.setProperty('--marquee-duration', `${duration}s`);
        titleEl.classList.add('is-marquee');
      };

      const stop = () => {
        titleEl.classList.remove('is-marquee');
        titleEl.style.removeProperty('--marquee-distance');
        titleEl.style.removeProperty('--marquee-duration');
      };

      titleEl.addEventListener('mouseenter', start);
      titleEl.addEventListener('mouseleave', stop);
      titleEl.addEventListener('focusin', start);
      titleEl.addEventListener('focusout', stop);
    });

    this.contentEl.querySelectorAll('.gallery-episode-row').forEach((row) => {
      const idx = Number(row.dataset.idx);
      const fav = items[idx];
      if (!fav) return;

      const mainBtn = row.querySelector('.gallery-episode-main');
      if (mainBtn) {
        mainBtn.addEventListener('click', () => {
          if (!this.onPlayEpisode) return;
          this.onPlayEpisode({
            title: fav.episodeTitle || '',
            audioUrl: fav.audioUrl,
            podcast: {
              title: fav.podcastTitle || '',
              author: fav.podcastAuthor || '',
              artworkUrl: fav.podcastArtworkUrl || '',
              feedUrl: fav.feedUrl || '',
            },
          });
          this.close();
        });
      }

      const favBtn = row.querySelector('.gallery-episode-fav');
      if (favBtn) {
        favBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.toggleFavoriteEpisode(
            {
              feedUrl: fav.feedUrl,
              title: fav.podcastTitle,
              author: fav.podcastAuthor,
              artworkUrl: fav.podcastArtworkUrl,
            },
            {
              audioUrl: fav.audioUrl,
              id: fav.episodeId,
              title: fav.episodeTitle,
              pubDate: fav.episodeDate,
            }
          );
        });
      }
    });
  }

  renderSearchResults() {
    if (!this.contentEl) return;
    const results = this.searchResults || [];
    const query = this.searchInput ? this.searchInput.value.trim() : '';
    if (results.length === 0 && !query) {
      this.renderRecommended();
      return;
    }
    if (results.length === 0) {
      this.contentEl.innerHTML = `<div class="gallery-empty">No results.</div>`;
      return;
    }

    const cards = results
      .map((podcast) => {
        const artworkUrl = safeExternalUrl(podcast.artworkUrl);
        const artwork = artworkUrl
          ? `<img class="gallery-art" src="${escapeHtml(artworkUrl)}" alt="" />`
          : '';
        const title = escapeHtml(podcast.title || '');
        const author = escapeHtml(podcast.author || '');
        const canAdd = Boolean(podcast.feedUrl);
        const disabledClass = canAdd ? '' : 'disabled';
        return `
	                    <button type="button" class="gallery-card ${disabledClass}" data-feed="${encodeURIComponent(
                        podcast.feedUrl || ''
                      )}" ${canAdd ? '' : 'disabled'}>
	                        ${artwork}
	                        <div class="gallery-meta">
	                            <div class="gallery-name">${title}</div>
	                            <div class="gallery-author">${author}</div>
	                        </div>
	                    </button>
	                `;
      })
      .join('');

    this.contentEl.innerHTML = `<div class="gallery-grid">${cards}</div>`;
    this.contentEl.querySelectorAll('.gallery-card').forEach((btn, index) => {
      btn.addEventListener('click', () => {
        const podcast = results[index];
        this.openPodcast(podcast);
      });
    });
    this.updateRecommendedScrollListener();
  }

  renderPodcastDetail() {
    if (!this.contentEl || !this.selectedPodcast) return;
    const podcast = this.selectedPodcast;
    const subscribed = this.isSubscribed(podcast.feedUrl);
    const buttonLabel = subscribed
      ? this.tg('gallerySubscribed')
      : this.tg('gallerySubscribe');
    const episodes = Array.isArray(this.episodes) ? this.episodes : [];
    const showDesc = String(podcast.description || '').trim();
    const showGenre = String(podcast.genre || '').trim();
    const showDescSnippet = showDesc
      ? showDesc.replace(/\s+/g, ' ').trim()
      : '';
    const shouldShowMore = showDescSnippet.length > 180;
    const podcastTitle = escapeHtml(podcast.title || '');
    const podcastAuthor = escapeHtml(podcast.author || '');
    const podcastArtworkUrl = safeExternalUrl(podcast.artworkUrl);
    const podcastArtworkHtml = podcastArtworkUrl
      ? `<img class="gallery-detail-art" src="${escapeHtml(podcastArtworkUrl)}" alt="" />`
      : `<div class="gallery-detail-art placeholder"></div>`;
    const buttonLabelText = escapeHtml(buttonLabel);
    const collectionUrl = safeExternalUrl(podcast.collectionViewUrl);

    const fallback =
      this.rssError && this.rssError.type
        ? `
		            <div class="gallery-error">
		                <div class="gallery-error-title">Episodes unavailable</div>
		                <div class="gallery-error-text">${escapeHtml(this.rssError.message || '')}</div>
		                ${
                      collectionUrl
                        ? `<div class="gallery-error-actions">
		                    <a class="gallery-link-btn" href="${escapeHtml(collectionUrl)}" target="_blank" rel="noreferrer">Open in Apple Podcasts</a>
		                </div>`
                        : ''
                    }
		            </div>
		        `
        : '';

    const header = `
	            ${this.renderInlineNav(podcastTitle)}
	            <div class="gallery-detail">
	                <div class="gallery-detail-row">
	                    ${podcastArtworkHtml}
	                    <div class="gallery-detail-meta">
	                        <div class="gallery-detail-title">${podcastTitle}</div>
	                        <div class="gallery-detail-author">${podcastAuthor}</div>
	                        ${showGenre ? `<div class="gallery-detail-genre">${escapeHtml(showGenre)}</div>` : ''}
	                        ${
                            showDescSnippet
                              ? `<div class="gallery-detail-desc">
	                            <div class="gallery-detail-desc-text">${escapeHtml(showDescSnippet)}</div>
	                            ${
                                shouldShowMore
                                  ? `<button type="button" class="gallery-detail-more">${escapeHtml(
                                      this.tg('galleryMore')
                                    )}</button>`
                                  : ''
                              }
	                        </div>`
                              : ''
                          }
	                        <div class="gallery-detail-actions">
	                            <button type="button" class="gallery-subscribe">${buttonLabelText}</button>
	                        </div>
	                    </div>
	                </div>
	            </div>
	        `;

    const list =
      episodes.length === 0
        ? `${fallback || `<div class="gallery-empty">No episodes.</div>`}`
        : `<div class="gallery-episodes">
                    ${episodes
                      .slice(0, 80)
                      .map((ep, idx) => {
                        const isFav = this.isEpisodeFavorited(podcast, ep);
                        const title = escapeHtml(ep.title || '');
                        const date = escapeHtml(ep.pubDate || '');
                        const desc = escapeHtml(ep.description || '');
                        return `
	                                <div class="gallery-episode-row gallery-episode-row--with-fav-overlay" data-ep="${idx}">
	                                    <div class="gallery-episode gallery-episode-main">
	                                        <button type="button" class="gallery-episode-play-btn" aria-label="${escapeHtml(
                                            this.tg('galleryPlay')
                                          )}">
	                                            <span class="mask-icon gallery-episode-play-icon icon-play-full" aria-hidden="true"></span>
	                                        </button>
	                                        <div class="gallery-episode-body">
	                                            <button type="button" class="gallery-episode-title-btn" aria-label="${escapeHtml(
                                                this.tg('galleryEpisodeDetails')
                                              )}">${title}</button>
	                                            ${desc ? `<div class="gallery-episode-desc">${desc}</div>` : ''}
	                                            <div class="gallery-episode-date">${date}</div>
	                                        </div>
	                                    </div>
	                                    <button
	                                        type="button"
	                                        class="gallery-favorite-btn gallery-episode-fav ${isFav ? 'is-active' : ''}"
	                                        aria-label="${escapeHtml(
                                            isFav
                                              ? this.tg('galleryFavorited')
                                              : this.tg('galleryFavorite')
                                          )}"
	                                    >
	                                        <span class="mask-icon gallery-favorite-icon ${
                                            isFav
                                              ? 'icon-star-full'
                                              : 'icon-star'
                                          }" aria-hidden="true"></span>
	                                    </button>
                                </div>
                            `;
                      })
                      .join('')}
                </div>`;

    this.contentEl.innerHTML = `${header}${list}`;

    const subBtn = this.contentEl.querySelector('.gallery-subscribe');
    if (subBtn)
      subBtn.addEventListener('click', () => this.toggleSubscribe(podcast));

    const moreBtn = this.contentEl.querySelector('.gallery-detail-more');
    if (moreBtn) {
      moreBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.podcastInfoOpen = true;
        this.render();
      });
    }

    if (this.podcastInfoOpen && showDesc) {
      const content = this.modal
        ? this.modal.querySelector('.gallery-content')
        : null;
      if (content && !content.querySelector('.gallery-info-overlay')) {
        const bodyHtml = escapeHtml(showDesc).replace(/\n/g, '<br />');
        content.insertAdjacentHTML(
          'beforeend',
          `
	                    <div class="gallery-info-overlay" role="dialog" aria-modal="true">
	                        <div class="gallery-info-panel panel-surface">
	                            <div class="gallery-info-header">
	                                <div class="gallery-info-title">${podcastTitle}</div>
	                                <button type="button" class="gallery-info-close" aria-label="Close">
	                                    <span class="mask-icon gallery-nav-icon icon-close" aria-hidden="true"></span>
	                                </button>
	                            </div>
	                            <div class="gallery-info-body">${bodyHtml}</div>
                        </div>
                    </div>
                `
        );

        const overlay = content.querySelector('.gallery-info-overlay');
        const closeBtn = content.querySelector('.gallery-info-close');
        if (overlay) {
          overlay.addEventListener('click', () => {
            this.podcastInfoOpen = false;
            this.render();
          });
        }
        if (closeBtn) {
          closeBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.podcastInfoOpen = false;
            this.render();
          });
        }
        const panel = content.querySelector('.gallery-info-panel');
        if (panel)
          panel.addEventListener('click', (event) => event.stopPropagation());
      }
    }

    this.contentEl.querySelectorAll('.gallery-episode-row').forEach((row) => {
      const idx = Number(row.dataset.ep);
      const ep = episodes[idx];
      if (!ep) return;

      const playBtn = row.querySelector('.gallery-episode-play-btn');
      if (playBtn) {
        playBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!ep.audioUrl) return;
          if (this.onPlayEpisode) {
            this.onPlayEpisode({
              title: ep.title,
              audioUrl: ep.audioUrl,
              podcast,
            });
          }
          this.close();
        });
      }

      const titleBtn = row.querySelector('.gallery-episode-title-btn');
      if (titleBtn) {
        titleBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.openEpisodeDetail(ep);
        });
      }

      const favBtn = row.querySelector('.gallery-episode-fav');
      if (favBtn) {
        favBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.toggleFavoriteEpisode(podcast, ep);
        });
      }
    });

    this.setupScrollAnimation();
  }

  openEpisodeDetail(episode) {
    if (!episode || !this.selectedPodcast) return;
    this.view = 'episode';
    this.selectedEpisode = episode;
    this.render();
  }

  renderEpisodeDetail() {
    if (!this.contentEl || !this.selectedPodcast || !this.selectedEpisode)
      return;
    const podcast = this.selectedPodcast;
    const ep = this.selectedEpisode;
    const isFav = this.isEpisodeFavorited(podcast, ep);
    const title = escapeHtml(ep.title || '');
    const date = escapeHtml(ep.pubDate || '');
    const desc = escapeHtml(ep.description || '');

    this.contentEl.innerHTML = `
	            ${this.renderInlineNav(title)}
	            <div class="gallery-episode-detail">
	                <div class="gallery-episode-detail-title">${title}</div>
                <div class="gallery-episode-detail-meta">
                    <div class="gallery-episode-detail-podcast">${escapeHtml(podcast.title || '')}</div>
                    <div class="gallery-episode-detail-date">${date}</div>
                </div>
	                <div class="gallery-episode-detail-actions">
	                    <button type="button" class="gallery-subscribe gallery-episode-detail-play">
	                        <span class="mask-icon gallery-nav-icon icon-play" aria-hidden="true"></span>
	                        ${escapeHtml(this.tg('galleryPlay'))}
	                    </button>
	                    <button type="button" class="gallery-favorite-btn gallery-episode-detail-fav ${
                        isFav ? 'is-active' : ''
                      }" aria-label="${escapeHtml(
                        isFav
                          ? this.tg('galleryFavorited')
                          : this.tg('galleryFavorite')
                      )}">
	                        <span class="mask-icon gallery-favorite-icon ${
                            isFav ? 'icon-star-full' : 'icon-star'
                          }" aria-hidden="true"></span>
                    </button>
                </div>
                ${desc ? `<div class="gallery-episode-detail-desc">${desc}</div>` : ''}
            </div>
        `;

    const playBtn = this.contentEl.querySelector(
      '.gallery-episode-detail-play'
    );
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (!ep.audioUrl) return;
        if (this.onPlayEpisode) {
          this.onPlayEpisode({
            title: ep.title,
            audioUrl: ep.audioUrl,
            podcast,
          });
        }
        this.close();
      });
    }

    const favBtn = this.contentEl.querySelector('.gallery-episode-detail-fav');
    if (favBtn) {
      favBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleFavoriteEpisode(podcast, ep);
        this.renderEpisodeDetail();
      });
    }

    this.setupScrollAnimation();
  }

  renderRecommended() {
    if (!this.contentEl) return;
    const rawGroups = this.recommendedGroups || [];
    if (rawGroups.length === 0) {
      if (this.recommendedLoading || !this.recommendedLoaded) {
        this.contentEl.innerHTML = `<div class="gallery-empty">Loading…</div>`;
      } else {
        this.contentEl.innerHTML = `<div class="gallery-empty">Type to search podcasts.</div>`;
      }
      return;
    }

    const categories = this.getRecommendedCategories();
    const labelByTerm = new Map(
      categories.map((category) => [category.term, category.label])
    );
    const labelById = new Map(
      categories.map((category) => [category.id, category.label])
    );

    const groups =
      this.categoryFilter && this.categoryFilter !== 'all'
        ? rawGroups.filter((group) => {
            if (!group) return false;
            if (group.id === this.categoryFilter) return true;
            if (
              group.term &&
              categories.some(
                (cat) =>
                  cat.id === this.categoryFilter && cat.term === group.term
              )
            )
              return true;
            return false;
          })
        : rawGroups;

    if (groups.length === 0) {
      this.contentEl.innerHTML = `<div class="gallery-empty">No recommendations for this category yet.</div>`;
      return;
    }

    const feedIndex = new Map();
    groups.forEach((group) => {
      (group.items || []).forEach((podcast) => {
        if (podcast && podcast.feedUrl) feedIndex.set(podcast.feedUrl, podcast);
      });
    });
    this.recommendedFeedIndex = feedIndex;

    const domKey = `${this.getRecommendationLocaleKey()}|${this.categoryFilter}`;
    const allowIncremental = this.categoryFilter === 'all';
    const existingRoot = this.contentEl.querySelector('.gallery-reco-groups');

    if (!this.recommendedClickDelegated) {
      this.recommendedClickDelegated = true;
      this.contentEl.addEventListener('click', (event) => {
        const target = event.target;
        const btn =
          target && target.closest ? target.closest('.gallery-card') : null;
        if (!btn || !this.contentEl || !this.contentEl.contains(btn)) return;
        const feedUrl = btn.dataset.feed
          ? decodeURIComponent(btn.dataset.feed)
          : '';
        const podcast = feedUrl ? this.recommendedFeedIndex.get(feedUrl) : null;
        if (podcast) this.openPodcast(podcast);
      });
    }

    if (
      !allowIncremental ||
      !existingRoot ||
      this.recommendedDomKey !== domKey
    ) {
      this.recommendedDomKey = domKey;
      this.recommendedRenderedGroupKeys = new Set();
      this.contentEl.innerHTML = `<div class="gallery-reco-groups"></div>`;
    }

    const root = this.contentEl.querySelector('.gallery-reco-groups');
    if (!root) return;

    if (!allowIncremental) {
      root.innerHTML = '';
      this.recommendedRenderedGroupKeys = new Set();
    }

    const existingFooter = root.querySelector('.gallery-reco-footer');
    if (existingFooter) existingFooter.remove();
    const existingDivider = root.querySelector('.gallery-reco-divider');
    if (existingDivider) existingDivider.remove();

    groups.forEach((group) => {
      if (!group) return;
      const groupKey = String(group.id || group.term || group.label || '');
      const label =
        (group.id && labelById.get(group.id)) ||
        (group.term && labelByTerm.get(group.term)) ||
        group.label ||
        'Category';

      if (allowIncremental && this.recommendedRenderedGroupKeys.has(groupKey))
        return;
      const cards = (group.items || [])
        .map((podcast) => {
          const artworkUrl = safeExternalUrl(podcast.artworkUrl);
          const artwork = artworkUrl
            ? `<img class="gallery-art" src="${escapeHtml(artworkUrl)}" alt="" />`
            : '';
          return `
            <button type="button" class="gallery-card" data-feed="${encodeURIComponent(podcast.feedUrl || '')}">
              ${artwork}
              <div class="gallery-meta">
                <div class="gallery-name">${escapeHtml(podcast.title || '')}</div>
                <div class="gallery-author">${escapeHtml(podcast.author || '')}</div>
              </div>
            </button>
          `;
        })
        .join('');

      root.insertAdjacentHTML(
        'beforeend',
        `
	                <div class="gallery-reco-group" data-group="${encodeURIComponent(groupKey)}">
	                    <div class="gallery-reco-header">
	                        <div class="gallery-reco-label">${escapeHtml(label)}</div>
	                        <span class="mask-icon gallery-reco-arrow icon-arrow-forward" aria-hidden="true"></span>
	                    </div>
	                    <div class="gallery-reco-row">${cards}</div>
	                </div>
            `
      );
      this.recommendedRenderedGroupKeys.add(groupKey);
    });

    if (allowIncremental) {
      if (this.recommendedAllLoaded && !this.recommendedLoading) {
        root.insertAdjacentHTML(
          'beforeend',
          `<div class="gallery-reco-divider" aria-hidden="true"></div>`
        );
      } else if (this.recommendedLoading) {
        const footerMessage = this.tg('galleryRecoLoadingMore');
        root.insertAdjacentHTML(
          'beforeend',
          `<div class="gallery-reco-footer" role="status" aria-live="polite">${escapeHtml(
            footerMessage
          )}</div>`
        );
      }
    }
    this.updateRecommendedScrollListener();
  }
}
