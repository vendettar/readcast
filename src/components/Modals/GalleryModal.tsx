// src/components/Modals/GalleryModal.tsx
import { useCallback, useEffect, useRef } from 'react';
import { useGalleryStore, GalleryView } from '../../store/galleryStore';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useModalInputLock } from '../../hooks/useModalInputLock';
import { useI18n } from '../../hooks/useI18n';
import {
    SearchView,
    PodcastView,
    EpisodeView,
    SubscriptionsView,
    FavoritesView,
} from '../Gallery';

interface GalleryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Navigation tabs
const NAV_TAB_KEYS: { view: GalleryView; labelKey: 'navSearch' | 'navSubs' | 'navFavs' }[] = [
    { view: 'search', labelKey: 'navSearch' },
    { view: 'subscriptions', labelKey: 'navSubs' },
    { view: 'favorites', labelKey: 'navFavs' },
];

export function GalleryModal({ isOpen, onClose }: GalleryModalProps) {
    const { t } = useI18n();
    const { view, setView, close, selectedPodcast } = useGalleryStore();
    const modalRef = useRef<HTMLDivElement>(null);

    // Lock body scroll when modal is open
    useBodyScrollLock(isOpen);

    const handleClose = useCallback(() => {
        close();
        onClose();
    }, [close, onClose]);

    // Modal input lock: ESC, Tab trap, wheel/touch prevention
    useModalInputLock({
        isOpen,
        containerRef: modalRef,
        onRequestClose: handleClose,
    });

    useEffect(() => {
        if (isOpen) {
            useGalleryStore.getState().open();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // Render views based on state
    const renderContent = () => {
        // Episode view takes precedence
        if (useGalleryStore.getState().selectedEpisode) {
            return <EpisodeView />;
        }
        // Podcast detail view
        if (selectedPodcast) {
            return <PodcastView />;
        }
        // Tab-based views
        switch (view) {
            case 'subscriptions':
                return <SubscriptionsView />;
            case 'favorites':
                return <FavoritesView />;
            case 'search':
            default:
                return <SearchView />;
        }
    };

    return (
        <div className="gallery-backdrop">
            <div
                ref={modalRef}
                className="gallery-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="gallery-modal-title"
            >
                <div className="gallery-nav-row">
                    <span id="gallery-modal-title" className="gallery-title">Gallery</span>
                    {/* Navigation tabs - only show when not in detail view */}
                    {!selectedPodcast && !useGalleryStore.getState().selectedEpisode && (
                        <div className="gallery-tabs">
                            {NAV_TAB_KEYS.map(tab => (
                                <button
                                    key={tab.view}
                                    className={`gallery-tab ${view === tab.view ? 'active' : ''}`}
                                    onClick={() => setView(tab.view)}
                                >
                                    {t(tab.labelKey)}
                                </button>
                            ))}
                        </div>
                    )}
                    <button className="gallery-close" onClick={handleClose} aria-label={t('ariaClose')}>
                        <span className="gallery-nav-icon mask-icon icon-close" />
                    </button>
                </div>

                {renderContent()}
            </div>
        </div>
    );
}
