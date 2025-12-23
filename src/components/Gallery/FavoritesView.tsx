// src/components/Gallery/FavoritesView.tsx
import { useGalleryStore } from '../../store/galleryStore';
import { usePlayerStore } from '../../store/playerStore';
import { useI18n } from '../../hooks/useI18n';

export function FavoritesView() {
    const { t } = useI18n();
    const { favorites, removeFavorite, close } = useGalleryStore();
    const { setAudioUrl } = usePlayerStore();

    const handlePlay = (fav: typeof favorites[0]) => {
        setAudioUrl(fav.audioUrl, fav.episodeTitle, fav.artworkUrl);
        close();
    };

    if (favorites.length === 0) {
        return (
            <div className="gallery-content">
                <div className="gallery-empty">{t('noFavorites')}</div>
            </div>
        );
    }

    return (
        <div className="gallery-content">
            <div className="gallery-favorites-list">
                {favorites.map(fav => (
                    <div key={fav.key} className="gallery-favorite-item">
                        <img
                            className="gallery-favorite-art"
                            src={fav.artworkUrl}
                            alt={fav.podcastTitle}
                        />
                        <button type="button" className="gallery-favorite-info" onClick={() => handlePlay(fav)}>
                            <div className="gallery-favorite-title">{fav.episodeTitle}</div>
                            <div className="gallery-favorite-podcast">{fav.podcastTitle}</div>
                        </button>
                        <button
                            type="button"
                            className="gallery-remove-btn"
                            onClick={() => removeFavorite(fav.key)}
                        >
                            <span className="mask-icon icon-delete" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
