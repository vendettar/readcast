// src/components/Modals/RecommendedView.tsx
// Full implementation of recommended podcasts view with scroll loading

import { useEffect, useRef, useState, useCallback } from 'react';
import { useI18n } from '../../hooks/useI18n';
import {
    type RecommendedGroup,
    type RecommendedPodcast,
    readRecommendedCacheWithStatus,
    loadRecommendedBatch,
} from '../../libs/recommended';

const INITIAL_CATEGORIES = 4;
const LOAD_MORE_CATEGORIES = 2;

interface RecommendedViewProps {
    country: string;
    lang: string;
    onSelectPodcast: (podcast: {
        collectionId: number;
        collectionName: string;
        artistName: string;
        artworkUrl100: string;
        artworkUrl600: string;
        feedUrl: string;
        collectionViewUrl: string;
        genres: string[];
    }) => void;
}

export function RecommendedView({ country, lang, onSelectPodcast }: RecommendedViewProps) {
    const { t } = useI18n();
    const [groups, setGroups] = useState<RecommendedGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [allLoaded, setAllLoaded] = useState(false);
    const triedCategoriesRef = useRef<Set<string>>(new Set());
    const didUserAppendRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const inflightRef = useRef(false); // Prevent concurrent loadMore requests
    const containerRef = useRef<HTMLDivElement>(null);
    const localeKeyRef = useRef('');

    // Reset when country/lang changes
    useEffect(() => {
        const newKey = `${country}:${lang}`;
        if (localeKeyRef.current === newKey) return;
        localeKeyRef.current = newKey;

        // Reset state
        triedCategoriesRef.current = new Set();
        didUserAppendRef.current = false;
        setGroups([]);
        setAllLoaded(false);

        // Load from cache (fresh/stale/expired). Even expired remains usable until refresh succeeds.
        const cached = readRecommendedCacheWithStatus(country, lang);
        if (cached.data && cached.data.length > 0) {
            setGroups(cached.data);
            cached.data.forEach(g => triedCategoriesRef.current.add(g.id));
            // Don't set allLoaded from cache - let loadRecommendedBatch determine this
        }

        const fetchInitial = async () => {
            abortControllerRef.current?.abort();
            abortControllerRef.current = new AbortController();

            setLoading(true);
            try {
                const freshTried = new Set<string>();
                const result = await loadRecommendedBatch(
                    country,
                    lang,
                    [],
                    freshTried,
                    {
                        signal: abortControllerRef.current.signal,
                        desiredGroups: INITIAL_CATEGORIES
                    }
                );

                // If user has already appended content, avoid replacing the list mid-interaction.
                if (didUserAppendRef.current) return;

                triedCategoriesRef.current = freshTried;
                setGroups(result.groups);
                setAllLoaded(result.allLoaded);
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') return;
                console.error('Failed to load recommended:', err);
            } finally {
                setLoading(false);
            }
        };

        // If no cache, fetch inline; if stale/expired, show cache immediately and revalidate.
        if (!cached.data || cached.data.length === 0) {
            fetchInitial();
        } else if (cached.status !== 'fresh') {
            fetchInitial();
        }
    }, [country, lang]);

    const loadMore = useCallback(async () => {
        // Prevent concurrent requests
        if (loading || allLoaded || inflightRef.current) return;

        inflightRef.current = true;

        didUserAppendRef.current = true;
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        setLoading(true);
        try {
            const result = await loadRecommendedBatch(
                country,
                lang,
                groups,
                triedCategoriesRef.current,
                {
                    signal: abortControllerRef.current.signal,
                    desiredGroups: LOAD_MORE_CATEGORIES
                }
            );
            setGroups(result.groups);
            setAllLoaded(result.allLoaded);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            console.error('Failed to load more:', err);
        } finally {
            setLoading(false);
            inflightRef.current = false;
        }
    }, [country, lang, groups, loading, allLoaded]);

    // Sentinel ref for IntersectionObserver
    const sentinelRef = useRef<HTMLDivElement>(null);

    // IntersectionObserver for loading more (replaces scroll event)
    useEffect(() => {
        if (allLoaded || loading) return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        // Find the scrolling container (.gallery-content)
        const scrollContainer = sentinel.closest('.gallery-content');
        if (!scrollContainer) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !loading && !allLoaded) {
                    loadMore();
                }
            },
            {
                root: scrollContainer,
                threshold: 0.1
            }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [loading, allLoaded, loadMore]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    const handlePodcastClick = (podcast: RecommendedPodcast) => {
        onSelectPodcast({
            collectionId: parseInt(podcast.id) || 0,
            collectionName: podcast.title,
            artistName: podcast.author,
            artworkUrl100: podcast.artworkUrl,
            artworkUrl600: podcast.artworkUrl,
            feedUrl: podcast.feedUrl,
            collectionViewUrl: '',
            genres: podcast.genreNames,
        });
    };

    if (groups.length === 0 && loading) {
        return <div className="gallery-loading">{t('loadingRecommended')}</div>;
    }

    if (groups.length === 0) {
        // Empty state: show divider instead of text
        return <div className="recommended-empty-divider" />;
    }

    return (
        <div className="recommended-view" ref={containerRef}>
            {groups.map((group: RecommendedGroup) => (
                <div key={group.id} className="recommended-group">
                    <h3 className="recommended-group-title">{group.label}</h3>
                    <div className="recommended-group-grid">
                        {group.items.map((podcast: RecommendedPodcast) => (
                            <button
                                type="button"
                                key={podcast.id}
                                className="gallery-card"
                                onClick={() => handlePodcastClick(podcast)}
                            >
                                <img
                                    className="gallery-card-art"
                                    src={podcast.artworkUrl || '/placeholder-podcast.svg'}
                                    alt={podcast.title}
                                    loading="lazy"
                                />
                                <div className="gallery-card-info">
                                    <div className="gallery-card-title">{podcast.title}</div>
                                    <div className="gallery-card-author">{podcast.author}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
            {loading && (
                <div className="recommended-loading-more">{t('loadingMore')}</div>
            )}
            {!allLoaded && !loading && (
                <div ref={sentinelRef} className="recommended-load-sentinel" style={{ height: 40 }} />
            )}
            {allLoaded && groups.length > 0 && (
                <div className="recommended-end-divider" />
            )}
        </div>
    );
}
