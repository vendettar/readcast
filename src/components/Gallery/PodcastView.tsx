// src/components/Gallery/PodcastView.tsx
import { useEffect, useRef, useState } from 'react';
import { useGalleryStore } from '../../store/galleryStore';
import { useI18n } from '../../hooks/useI18n';
import type { Episode, Podcast } from '../../libs/galleryApi';

// ========== Episode Item ==========
export function EpisodeItem({
    episode,
    podcast,
    onClick
}: {
    episode: Episode;
    podcast: Podcast;
    onClick: () => void;
}) {
    const { isFavorited, addFavorite, removeFavorite } = useGalleryStore();
    const favorited = isFavorited(podcast.feedUrl, episode.audioUrl);

    const handleFavorite = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (favorited) {
            removeFavorite(`${podcast.feedUrl}::${episode.audioUrl}`);
        } else {
            addFavorite(podcast, episode);
        }
    };

    return (
        <div className="gallery-episode-container">
            <button type="button" className="gallery-episode" onClick={onClick}>
                <div className="gallery-episode-info">
                    <div className="gallery-episode-title">{episode.title}</div>
                    <div className="gallery-episode-date">{episode.pubDate}</div>
                </div>
            </button>
            <button
                type="button"
                className={`gallery-favorite-btn ${favorited ? 'is-active' : ''}`}
                onClick={handleFavorite}
            >
                <span className={`mask-icon ${favorited ? 'icon-star-full' : 'icon-star'}`} />
            </button>
        </div>
    );
}

// ========== Podcast Detail View ==========
export function PodcastView() {
    const { t } = useI18n();
    const {
        selectedPodcast,
        podcastFeed,
        podcastLoading,
        podcastErrorKey,
        clearPodcast,
        selectEpisode,
        isSubscribed,
        subscribe,
        unsubscribe,
    } = useGalleryStore();

    // Incremental rendering: 8 initial + 4 per scroll-trigger
    const INITIAL_COUNT = 8;
    const LOAD_MORE_COUNT = 4;
    const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    const episodes = podcastFeed?.episodes || [];
    const visibleEpisodes = episodes.slice(0, visibleCount);
    const hasMore = visibleCount < episodes.length;

    // Intersection Observer for infinite scroll
    useEffect(() => {
        if (!hasMore || !loadMoreRef.current) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount(prev => Math.min(prev + LOAD_MORE_COUNT, episodes.length));
                }
            },
            { threshold: 0.1 }
        );

        const el = loadMoreRef.current;
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, episodes.length]);

    if (!selectedPodcast) return null;

    const subscribed = isSubscribed(selectedPodcast.feedUrl);

    const handleSubscribe = () => {
        if (subscribed) {
            unsubscribe(selectedPodcast.feedUrl);
        } else {
            subscribe(selectedPodcast);
        }
    };

    return (
        <div className="gallery-podcast-view">
            <div className="gallery-podcast-header">
                <button type="button" className="gallery-back-btn" onClick={clearPodcast}>
                    <span className="mask-icon icon-arrow-back" />
                </button>
                <img
                    className="gallery-podcast-art"
                    src={selectedPodcast.artworkUrl600 || selectedPodcast.artworkUrl100}
                    alt={selectedPodcast.collectionName}
                />
                <div className="gallery-podcast-info">
                    <h2 className="gallery-podcast-title">{selectedPodcast.collectionName}</h2>
                    <div className="gallery-podcast-author">{selectedPodcast.artistName}</div>
                    <button
                        type="button"
                        className={`gallery-subscribe-btn ${subscribed ? 'is-subscribed' : ''}`}
                        onClick={handleSubscribe}
                    >
                        {subscribed ? t('subscribed') : t('subscribe')}
                    </button>
                </div>
            </div>

            <div className="gallery-episodes">
                {podcastLoading && (
                    <div className="gallery-loading">{t('loadingEpisodes')}</div>
                )}
                {podcastErrorKey && (
                    <div className="gallery-error">{t(podcastErrorKey)}</div>
                )}
                {podcastFeed && episodes.length === 0 && (
                    <div className="gallery-empty">{t('noEpisodes')}</div>
                )}
                {visibleEpisodes.map(episode => (
                    <EpisodeItem
                        key={episode.id}
                        episode={episode}
                        podcast={selectedPodcast}
                        onClick={() => selectEpisode(episode)}
                    />
                ))}
                {hasMore && (
                    <div ref={loadMoreRef} className="gallery-load-trigger h-10" />
                )}
            </div>
        </div>
    );
}
