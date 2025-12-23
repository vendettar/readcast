// src/components/Gallery/SubscriptionsView.tsx
import { useGalleryStore } from '../../store/galleryStore';
import { useI18n } from '../../hooks/useI18n';

export function SubscriptionsView() {
    const { t } = useI18n();
    const { subscriptions, selectPodcast } = useGalleryStore();

    if (subscriptions.length === 0) {
        return (
            <div className="gallery-content">
                <div className="gallery-empty">{t('noSubscriptions')}</div>
            </div>
        );
    }

    return (
        <div className="gallery-content">
            <div className="gallery-grid">
                {subscriptions.map(sub => (
                    <button
                        type="button"
                        key={sub.feedUrl}
                        className="gallery-card"
                        onClick={() => selectPodcast({
                            collectionId: 0,
                            collectionName: sub.title,
                            artistName: sub.author,
                            artworkUrl100: sub.artworkUrl,
                            artworkUrl600: sub.artworkUrl,
                            feedUrl: sub.feedUrl,
                            collectionViewUrl: '',
                            genres: [],
                        })}
                    >
                        <img
                            className="gallery-card-art"
                            src={sub.artworkUrl}
                            alt={sub.title}
                            loading="lazy"
                        />
                        <div className="gallery-card-info">
                            <div className="gallery-card-title">{sub.title}</div>
                            <div className="gallery-card-author">{sub.author}</div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
