// src/__tests__/galleryStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useGalleryStore } from '../store/galleryStore';

describe('GalleryStore', () => {
    beforeEach(() => {
        // Reset store state manually
        useGalleryStore.setState({ searchQuery: '', country: 'us', view: 'search' });
    });

    describe('Search', () => {
        it('should update search query', () => {
            const { setSearchQuery } = useGalleryStore.getState();

            setSearchQuery('technology');
            expect(useGalleryStore.getState().searchQuery).toBe('technology');
        });

        it('should update country', () => {
            const { setCountry } = useGalleryStore.getState();

            setCountry('jp');
            expect(useGalleryStore.getState().country).toBe('jp');
        });
    });

    describe('View Navigation', () => {
        it('should change view', () => {
            const { setView } = useGalleryStore.getState();

            setView('favorites');
            expect(useGalleryStore.getState().view).toBe('favorites');

            setView('subscriptions');
            expect(useGalleryStore.getState().view).toBe('subscriptions');
        });
    });

    describe('Subscriptions', () => {
        const mockPodcast = {
            collectionId: 123,
            collectionName: 'Test Podcast',
            artistName: 'Test Artist',
            artworkUrl100: 'http://example.com/art.jpg',
            artworkUrl600: 'http://example.com/art-large.jpg',
            feedUrl: 'http://example.com/feed.xml',
            collectionViewUrl: '',
            genres: [],
        };

        it('should subscribe to a podcast', async () => {
            const { subscribe, isSubscribed } = useGalleryStore.getState();

            await subscribe(mockPodcast);
            expect(isSubscribed('http://example.com/feed.xml')).toBe(true);
        });

        it('should unsubscribe from a podcast', async () => {
            const { subscribe, unsubscribe, isSubscribed } = useGalleryStore.getState();

            await subscribe(mockPodcast);
            await unsubscribe('http://example.com/feed.xml');
            expect(isSubscribed('http://example.com/feed.xml')).toBe(false);
        });
    });

    describe('Favorites', () => {
        const mockPodcast = {
            collectionId: 123,
            collectionName: 'Test Podcast',
            artistName: 'Test Artist',
            artworkUrl100: 'http://example.com/art.jpg',
            artworkUrl600: '',
            feedUrl: 'http://example.com/feed.xml',
            collectionViewUrl: '',
            genres: [],
        };

        const mockEpisode = {
            id: 'ep1',
            title: 'Episode 1',
            description: 'Test episode',
            audioUrl: 'http://example.com/ep1.mp3',
            pubDate: '2024-01-01',
        };

        it('should add a favorite', async () => {
            const { addFavorite, isFavorited } = useGalleryStore.getState();

            await addFavorite(mockPodcast, mockEpisode);
            expect(isFavorited('http://example.com/feed.xml', 'http://example.com/ep1.mp3')).toBe(true);
        });

        it('should remove a favorite', async () => {
            const { addFavorite, removeFavorite, isFavorited } = useGalleryStore.getState();

            await addFavorite(mockPodcast, mockEpisode);
            const key = `http://example.com/feed.xml::http://example.com/ep1.mp3`;
            await removeFavorite(key);

            expect(isFavorited('http://example.com/feed.xml', 'http://example.com/ep1.mp3')).toBe(false);
        });
    });
});
