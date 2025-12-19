/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SourcePickerModal, {
  computeSelectWidthPx,
} from '../scripts/modules/sourcePickerModal.js';
import LocalFilesModal from '../scripts/modules/localFilesModal.js';
import { translations } from '../scripts/modules/translations.js';

function createManager() {
  return new SourcePickerModal({
    t: (key) => key,
  });
}

describe('SourcePickerModal (recommendation locale)', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    document.body.style.cssText = '';
    localStorage.clear();
  });

  it('pins gallery language on first init, then maps country override to language', () => {
    const manager = createManager();
    manager.init();
    expect(manager.getGalleryLanguage()).toBe('en');

    manager.countryOverride = 'jp';
    manager.syncLanguageFromCountryOverride();
    expect(manager.getGalleryLanguage()).toBe('ja');

    manager.countryOverride = 'cn';
    manager.syncLanguageFromCountryOverride();
    expect(manager.getGalleryLanguage()).toBe('zh');
  });

  it('updates category dropdown labels when country changes', () => {
    const manager = createManager();
    manager.init();

    expect(manager.categorySelect).toBeTruthy();
    expect(manager.categorySelect.options[0].textContent).toBe('All');

    manager.countryOverride = 'jp';
    manager.syncLanguageFromCountryOverride();
    manager.refreshCategoryOptions();
    manager.render();
    expect(manager.categorySelect.options[0].textContent).toBe('すべて');

    manager.countryOverride = 'kr';
    manager.syncLanguageFromCountryOverride();
    manager.refreshCategoryOptions();
    manager.render();
    expect(manager.categorySelect.options[0].textContent).toBe('전체');
  });

  it('scopes recommendation cache key by country and gallery language', () => {
    const manager = createManager();
    manager.init();

    manager.countryOverride = 'cn';
    manager.syncLanguageFromCountryOverride();
    expect(manager.getRecommendedCountry()).toBe('cn');
    expect(manager.getRecommendedCacheKey()).toMatch(
      /^readcastGalleryRecommendedV2:cn:zh$/
    );

    manager.countryOverride = 'us';
    manager.syncLanguageFromCountryOverride();
    expect(manager.getRecommendedCountry()).toBe('us');
    expect(manager.getRecommendedCacheKey()).toMatch(
      /^readcastGalleryRecommendedV2:us:en$/
    );
  });

  it('loads persisted country override and applies matching category language', () => {
    localStorage.setItem('readcastGalleryCountryOverrideV1', 'jp');
    const manager = createManager();
    manager.init();

    expect(manager.getRecommendedCountry()).toBe('jp');
    expect(manager.getGalleryLanguage()).toBe('ja');
    expect(manager.categorySelect.options[0].textContent).toBe('すべて');
  });
});

describe('computeSelectWidthPx', () => {
  it('returns a larger width for longer labels', () => {
    const shortW = computeSelectWidthPx({
      text: 'All',
      paddingLeft: 10,
      paddingRight: 10,
      extra: 30,
    });
    const longW = computeSelectWidthPx({
      text: 'Religion & Spirituality',
      paddingLeft: 10,
      paddingRight: 10,
      extra: 30,
    });
    expect(longW).toBeGreaterThan(shortW);
  });

  it('clamps between min and max', () => {
    const minW = computeSelectWidthPx({ text: '', min: 80, max: 200 });
    const maxW = computeSelectWidthPx({
      text: 'x'.repeat(200),
      min: 80,
      max: 120,
    });
    expect(minW).toBe(80);
    expect(maxW).toBe(120);
  });
});

describe('SourcePickerModal (favorites)', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    document.body.style.cssText = '';
    localStorage.clear();
  });

  it('renders an empty favorites view', () => {
    const manager = new SourcePickerModal({ t: (key) => key });
    manager.ensureRecommendedLoaded = () => {};
    manager.openFavorites();
    expect(manager.isOpen()).toBe(true);
    expect(
      manager.modal.querySelector('.gallery-toolbar').hasAttribute('hidden')
    ).toBe(true);
    expect(manager.contentEl.textContent).toContain('No favorites');

    const tabs = manager.modal.querySelector('.gallery-tabs');
    expect(tabs).toBeTruthy();
    expect(tabs.hasAttribute('hidden')).toBe(false);
    const active = tabs.querySelector('.gallery-tab.is-active');
    expect(active).toBeTruthy();
    expect(active.textContent.trim()).toBe('Favorites');
  });

  it('escapes injected podcast fields when rendering search results', () => {
    const manager = createManager();
    manager.init();

    manager.searchResults = [
      {
        title: '<img src=x onerror=alert(1)>',
        author: '<script>alert(1)</script>',
        feedUrl: 'https://example.com/feed.xml',
        artworkUrl: 'javascript:alert(1)',
      },
    ];
    manager.render();

    const nameEl = manager.contentEl.querySelector('.gallery-name');
    expect(nameEl).toBeTruthy();
    expect(nameEl.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(nameEl.querySelector('img')).toBeNull();

    expect(manager.contentEl.querySelector('img.gallery-art')).toBeNull();
  });

  it('sanitizes fallback link href in podcast detail view', () => {
    const manager = createManager();
    manager.init();

    manager.view = 'podcast';
    manager.selectedPodcast = {
      title: 'Test Show',
      author: 'Author',
      feedUrl: 'https://example.com/feed.xml',
      collectionViewUrl: 'javascript:alert(1)',
      description: '',
    };
    manager.episodes = [];
    manager.rssError = { type: 'rss-fetch-failed', message: '<b>oops</b>' };
    manager.render();

    const errorText = manager.contentEl.querySelector('.gallery-error-text');
    expect(errorText).toBeTruthy();
    expect(errorText.textContent).toContain('<b>oops</b>');
    expect(errorText.querySelector('b')).toBeNull();
    expect(manager.contentEl.querySelector('a.gallery-link-btn')).toBeNull();
  });
});

describe('SourcePickerModal (podcast episode interactions)', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    document.body.style.cssText = '';
    localStorage.clear();
  });

  it('does not play on episode card click; plays via play button; opens episode details via title', () => {
    const onPlayEpisode = vi.fn();
    const manager = new SourcePickerModal({ t: (key) => key, onPlayEpisode });
    manager.ensureRecommendedLoaded = () => {};

    manager.open();
    manager.view = 'podcast';
    manager.selectedPodcast = {
      title: 'Test Podcast',
      feedUrl: 'https://example.com/feed.xml',
    };
    manager.episodes = [
      {
        title: 'Ep 1',
        audioUrl: 'https://example.com/a.mp3',
        pubDate: '2024-01-01',
        description: 'Desc',
      },
    ];
    manager.render();

    const mainCard = manager.contentEl.querySelector('.gallery-episode-main');
    expect(mainCard).toBeTruthy();
    mainCard.click();
    expect(onPlayEpisode).toHaveBeenCalledTimes(0);

    const titleBtn = manager.contentEl.querySelector(
      '.gallery-episode-title-btn'
    );
    expect(titleBtn).toBeTruthy();
    titleBtn.click();
    expect(manager.view).toBe('episode');
    expect(manager.contentEl.textContent).toContain('Desc');

    const backBtn = manager.contentEl.querySelector('.gallery-inline-back');
    expect(backBtn).toBeTruthy();
    backBtn.click();
    expect(manager.view).toBe('podcast');

    const playBtn = manager.contentEl.querySelector(
      '.gallery-episode-play-btn'
    );
    expect(playBtn).toBeTruthy();
    playBtn.click();
    expect(onPlayEpisode).toHaveBeenCalledTimes(1);
    expect(manager.isOpen()).toBe(false);
  });
});

describe('LocalFilesModal', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    document.body.style.cssText = '';
    localStorage.clear();
  });

  it('renders an empty local files view', async () => {
    const manager = new LocalFilesModal({
      t: (key) => translations.en[key] || key,
      getLocalSessions: async () => [],
    });
    manager.open();
    expect(manager.isOpen()).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(manager.contentEl.textContent).toContain('No local files');
  });

  it('shows newly created sessions even before IndexedDB list refresh completes', async () => {
    const manager = new LocalFilesModal({
      t: (key) => translations.en[key] || key,
      getLocalSessions: async () => [],
    });

    manager.notifyLocalSessionCreated({
      id: 's1',
      audioId: 'a1',
      title: 'My Audio',
    });
    manager.open();

    await new Promise((r) => setTimeout(r, 0));
    expect(manager.contentEl.textContent).toContain('My Audio');
  });
});

describe('SourcePickerModal (modal input lock)', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    document.body.style.cssText = '';
    localStorage.clear();
  });

  it('locks page scroll and blocks global shortcuts while open', () => {
    const manager = createManager();
    manager.ensureRecommendedLoaded = () => {};

    const outsideButton = document.createElement('button');
    outsideButton.type = 'button';
    outsideButton.textContent = 'outside';
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    manager.open();
    expect(manager.isOpen()).toBe(true);
    expect(document.body.classList.contains('gallery-modal-open')).toBe(true);
    expect(document.body.style.position).toBe('fixed');

    manager.backdrop.click();
    expect(manager.isOpen()).toBe(true);

    let bubbled = 0;
    document.addEventListener('keydown', () => {
      bubbled += 1;
    });

    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    const dispatchOk = document.dispatchEvent(spaceEvent);
    expect(dispatchOk).toBe(false);
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(bubbled).toBe(0);

    manager.close();
    expect(manager.isOpen()).toBe(false);
    expect(document.body.classList.contains('gallery-modal-open')).toBe(false);
    expect(document.body.style.position).toBe('');
  });

  it('prevents ctrl+wheel zoom while open', () => {
    const manager = createManager();
    manager.ensureRecommendedLoaded = () => {};
    manager.open();

    let windowWheel = 0;
    const windowListener = () => {
      windowWheel += 1;
    };
    window.addEventListener('wheel', windowListener);

    const wheelEvent = new WheelEvent('wheel', {
      deltaY: 120,
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    manager.modal.dispatchEvent(wheelEvent);
    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(windowWheel).toBe(0);

    window.removeEventListener('wheel', windowListener);
    manager.close();
  });
});

describe('LocalFilesModal (modal input lock)', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    document.body.style.cssText = '';
    localStorage.clear();
  });

  it('locks page scroll and blocks global shortcuts while open', () => {
    const manager = new LocalFilesModal({
      t: (key) => key,
      getLocalSessions: async () => [],
    });

    const outsideButton = document.createElement('button');
    outsideButton.type = 'button';
    outsideButton.textContent = 'outside';
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    manager.open();
    expect(manager.isOpen()).toBe(true);
    expect(document.body.classList.contains('localfiles-modal-open')).toBe(true);
    expect(document.body.style.position).toBe('fixed');

    manager.backdrop.click();
    expect(manager.isOpen()).toBe(true);

    let bubbled = 0;
    document.addEventListener('keydown', () => {
      bubbled += 1;
    });

    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    const dispatchOk = document.dispatchEvent(spaceEvent);
    expect(dispatchOk).toBe(false);
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(bubbled).toBe(0);

    manager.close();
    expect(manager.isOpen()).toBe(false);
    expect(document.body.classList.contains('localfiles-modal-open')).toBe(false);
    expect(document.body.style.position).toBe('');
  });
});

describe('SourcePickerModal (recommendations feed validation)', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    document.body.style.cssText = '';
    localStorage.clear();
  });

  it('does not auto-accept allowlisted hosts without validation', async () => {
    const manager = createManager();
    manager.init();
    manager.validateFeedFetchable = vi.fn(
      async (url) => !String(url).includes('feeds.simplecast.com')
    );

    const items = [
      { feedUrl: 'https://feeds.simplecast.com/example', title: 'Allowlisted' },
      { feedUrl: 'https://example.com/feed.xml', title: 'Unknown' },
    ];

    const picked = await manager.pickCorsAllowedRecommended(items, {
      desired: 1,
    });
    expect(picked).toHaveLength(1);
    expect(picked[0].feedUrl).toBe('https://example.com/feed.xml');
    expect(
      manager.validateFeedFetchable.mock.calls.some(([url]) =>
        String(url).includes('feeds.simplecast.com')
      )
    ).toBe(true);
  });

  it('skips blocklisted hosts without validating', async () => {
    const manager = createManager();
    manager.init();
    manager.validateFeedFetchable = vi.fn(async () => true);

    const items = [
      { feedUrl: 'https://feeds.npr.org/500005/podcast.xml', title: 'Blocked' },
      { feedUrl: 'https://example.com/feed.xml', title: 'OK' },
    ];

    const picked = await manager.pickCorsAllowedRecommended(items, {
      desired: 1,
    });
    expect(picked).toHaveLength(1);
    expect(picked[0].feedUrl).toBe('https://example.com/feed.xml');
    expect(
      manager.validateFeedFetchable.mock.calls.some(([url]) =>
        String(url).includes('feeds.npr.org')
      )
    ).toBe(false);
  });
});

describe('SourcePickerModal (podcast back navigation)', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    document.body.style.cssText = '';
    localStorage.clear();
  });

  it('returns to the previous view when backing out of a podcast', () => {
    const manager = createManager();
    manager.ensureRecommendedLoaded = () => {};

    manager.openSubscriptions();
    expect(manager.view).toBe('subscriptions');

    manager.view = 'podcast';
    manager.selectedPodcast = {
      title: 'Test',
      feedUrl: 'https://example.com/feed.xml',
    };
    manager.episodes = [];
    manager.rssError = { type: 'rss-fetch-failed', message: 'x' };
    manager.render();

    const backBtn = manager.modal.querySelector('.gallery-inline-back');
    backBtn.click();

    expect(manager.view).toBe('subscriptions');
    expect(
      manager.modal.querySelector('.gallery-toolbar').hasAttribute('hidden')
    ).toBe(true);
  });
});

describe('SourcePickerModal (recommendations resume)', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    document.body.style.cssText = '';
    localStorage.clear();
  });

  it('resumes fetching missing categories instead of freezing partial results', async () => {
    const manager = createManager();
    manager.init();

    manager.getRecommendedCategories = () => [
      { id: 'news', label: 'News', term: 'news' },
      { id: 'technology', label: 'Technology', term: 'technology' },
    ];

    manager.remote.fetchRecommendedCandidates = vi.fn(async () => [
      {
        id: 'p1',
        title: 'Example',
        author: 'Author',
        artworkUrl: '',
        feedUrl: 'https://example.com/feed.xml',
        collectionViewUrl: '',
      },
    ]);
    manager.pickCorsAllowedRecommended = vi.fn(async (items) =>
      items.slice(0, 1)
    );
    manager.writeRecommendedCache = vi.fn();

    manager.recommendedGroups = [
      {
        id: 'news',
        label: 'News',
        term: 'news',
        items: [
          {
            id: 'p0',
            title: 'Existing',
            author: '',
            artworkUrl: '',
            feedUrl: 'https://existing.example/feed.xml',
          },
        ],
      },
    ];
    manager.recommendedLoaded = false;
    manager.recommendedLoading = false;

    await manager.ensureRecommendedLoaded();

    expect(manager.remote.fetchRecommendedCandidates).toHaveBeenCalledTimes(1);
    expect(manager.recommendedGroups.map((g) => g.id)).toEqual([
      'news',
      'technology',
    ]);
    expect(manager.writeRecommendedCache).toHaveBeenCalledTimes(1);
    expect(manager.recommendedLoaded).toBe(true);
    expect(manager.recommendedLoading).toBe(false);
  });

  it('resets loading state when aborted mid-fetch so a later open can retry', async () => {
    const manager = createManager();
    manager.init();

    manager.getRecommendedCategories = () => [
      { id: 'news', label: 'News', term: 'news' },
      { id: 'technology', label: 'Technology', term: 'technology' },
    ];

    manager.remote.fetchRecommendedCandidates = vi.fn(async () => [
      {
        id: 'p1',
        title: 'Example',
        author: 'Author',
        artworkUrl: '',
        feedUrl: 'https://example.com/feed.xml',
        collectionViewUrl: '',
      },
    ]);

    manager.pickCorsAllowedRecommended = vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });

    await manager.ensureRecommendedLoaded();

    expect(manager.recommendedLoading).toBe(false);
    expect(manager.recommendedLoaded).toBe(false);
  });
});

describe('SourcePickerModal (recommendations load-more footer)', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.body.innerHTML = '';
    document.body.style.cssText = '';
    localStorage.clear();
  });

  it('shows a footer while loading more recommendations', () => {
    const manager = createManager();
    manager.init();

    manager.categoryFilter = 'all';
    manager.recommendedGroups = [
      {
        id: 'news',
        label: 'News',
        term: 'news',
        items: [
          {
            id: 'p1',
            title: 'A',
            author: '',
            artworkUrl: '',
            feedUrl: 'https://example.com/a.xml',
          },
        ],
      },
    ];

    manager.recommendedLoading = false;
    manager.recommendedAllLoaded = false;
    manager.renderRecommended();
    expect(manager.contentEl.querySelector('.gallery-reco-footer')).toBe(null);
    expect(manager.contentEl.querySelector('.gallery-reco-divider')).toBe(null);

    manager.recommendedLoading = true;
    manager.renderRecommended();
    expect(manager.contentEl.querySelector('.gallery-reco-footer').textContent).toBe(
      'Loading…'
    );

    manager.recommendedLoading = false;
    manager.recommendedAllLoaded = true;
    manager.renderRecommended();
    expect(manager.contentEl.querySelector('.gallery-reco-footer')).toBe(null);
    expect(manager.contentEl.querySelector('.gallery-reco-divider')).toBeTruthy();
  });
});
