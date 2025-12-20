/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import GalleryRemote from '../scripts/modules/galleryRemote.js';

describe('GalleryRemote (search cache)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('caches search results in localStorage for 6h and in memory for 30m', async () => {
    const remote = new GalleryRemote();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            collectionId: 1,
            collectionName: 'Test Podcast',
            artistName: 'Author',
            feedUrl: 'https://example.com/feed.xml',
            artworkUrl600: 'https://example.com/art.jpg',
          },
        ],
      }),
    });

    const r1 = await remote.performSearch({ term: 'Test', country: 'us' });
    expect(r1).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const r2 = await remote.performSearch({ term: 'Test', country: 'us' });
    expect(r2).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const remote2 = new GalleryRemote();
    const r3 = await remote2.performSearch({ term: 'Test', country: 'us' });
    expect(r3).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('caches empty search results for 10 minutes (no repeated fetches)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    const remote = new GalleryRemote();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    const r1 = await remote.performSearch({ term: 'nothing', country: 'us' });
    expect(r1).toHaveLength(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const r2 = await remote.performSearch({ term: 'nothing', country: 'us' });
    expect(r2).toHaveLength(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2025-01-01T00:11:00Z'));
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const r3 = await remote.performSearch({ term: 'nothing', country: 'us' });
    expect(r3).toHaveLength(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('caches failures for 10 minutes (rethrows without refetch)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    const remote = new GalleryRemote();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(
      remote.performSearch({ term: 'oops', country: 'us' })
    ).rejects.toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await expect(
      remote.performSearch({ term: 'oops', country: 'us' })
    ).rejects.toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2025-01-01T00:11:00Z'));
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(
      remote.performSearch({ term: 'oops', country: 'us' })
    ).rejects.toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
