// src/components/Gallery/SearchView.tsx
import { useCallback, useEffect, useRef } from 'react';
import { useGalleryStore } from '../../store/galleryStore';
import { useI18n } from '../../hooks/useI18n';
import { COUNTRY_OPTIONS } from '../../libs/galleryApi';
import { RecommendedView } from '../Modals/RecommendedView';
import type { Podcast } from '../../libs/galleryApi';

// ========== Podcast Card ==========
export function PodcastCard({ podcast, onClick }: { podcast: Podcast; onClick: () => void }) {
    return (
        <button type="button" className="gallery-card" onClick={onClick}>
            <img
                className="gallery-card-art"
                src={podcast.artworkUrl100 || '/placeholder-podcast.svg'}
                alt={podcast.collectionName}
                loading="lazy"
            />
            <div className="gallery-card-info">
                <div className="gallery-card-title">{podcast.collectionName}</div>
                <div className="gallery-card-author">{podcast.artistName}</div>
            </div>
        </button>
    );
}

// ========== Search View ==========
export function SearchView() {
    const { t } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    const {
        searchQuery,
        setSearchQuery,
        searchResults,
        searchLoading,
        searchErrorKey,
        performSearch,
        country,
        setCountry,
        selectPodcast,
    } = useGalleryStore();

    const handleSearch = useCallback(() => {
        performSearch(searchQuery);
    }, [performSearch, searchQuery]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    }, [handleSearch]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    return (
        <>
            <div className="gallery-toolbar">
                <select
                    className="gallery-country"
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                >
                    {COUNTRY_OPTIONS.map(opt => (
                        <option key={opt.code} value={opt.code}>{opt.label}</option>
                    ))}
                </select>
                <input
                    ref={inputRef}
                    type="search"
                    className="gallery-search"
                    placeholder={t('searchPlaceholder')}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <button type="button" className="gallery-search-btn" onClick={handleSearch}>
                    <span className="mask-icon icon-search" />
                </button>
            </div>

            <div className="gallery-content">
                {searchLoading && (
                    <div className="gallery-loading">{t('loading')}</div>
                )}
                {searchErrorKey && (
                    <div className="gallery-error">{t(searchErrorKey)}</div>
                )}
                {!searchLoading && !searchErrorKey && searchResults.length === 0 && searchQuery && (
                    <div className="gallery-empty">{t('noResults')}</div>
                )}
                {!searchLoading && !searchErrorKey && searchResults.length === 0 && !searchQuery && (
                    <RecommendedView
                        country={country}
                        lang="en"
                        onSelectPodcast={selectPodcast}
                    />
                )}
                {searchResults.length > 0 && (
                    <div className="gallery-grid">
                        {searchResults.map(podcast => (
                            <PodcastCard
                                key={podcast.collectionId}
                                podcast={podcast}
                                onClick={() => selectPodcast(podcast)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
