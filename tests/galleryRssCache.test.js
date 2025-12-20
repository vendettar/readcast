/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import GalleryRemote from '../scripts/modules/galleryRemote.js';

describe('GalleryRemote (RSS parse cache)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('caches parsed RSS results for 30 minutes in memory', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    const remote = new GalleryRemote();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <description>Desc</description>
    <item>
      <title>Ep 1</title>
      <guid>1</guid>
      <pubDate>Tue, 01 Jan 2024 12:00:00 GMT</pubDate>
      <enclosure url="https://example.com/a.mp3" length="1" type="audio/mpeg" />
      <description>hello</description>
    </item>
  </channel>
</rss>`;

    fetchSpy.mockResolvedValue({
      ok: true,
      text: async () => xml,
    });

    const r1 = await remote.fetchAndParseFeed({
      feedUrl: 'https://example.com/feed.xml',
    });
    expect(r1.episodes).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const r2 = await remote.fetchAndParseFeed({
      feedUrl: 'https://example.com/feed.xml',
    });
    expect(r2.episodes).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2025-01-01T00:31:00Z'));
    await remote.fetchAndParseFeed({
      feedUrl: 'https://example.com/feed.xml',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

