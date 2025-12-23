// src/components/Gallery/EpisodeView.tsx
import { useGalleryStore } from '../../store/galleryStore';
import { usePlayerStore } from '../../store/playerStore';
import { useI18n } from '../../hooks/useI18n';

export function EpisodeView() {
    const { t } = useI18n();
    const { selectedEpisode, selectedPodcast, clearEpisode, close } = useGalleryStore();
    const { setAudioUrl } = usePlayerStore();

    if (!selectedEpisode || !selectedPodcast) return null;

    const handlePlay = () => {
        const coverArt = selectedPodcast.artworkUrl600 || selectedPodcast.artworkUrl100 || '';
        setAudioUrl(selectedEpisode.audioUrl, selectedEpisode.title, coverArt);
        close();
    };

    return (
        <div className="gallery-episode-view">
            <div className="gallery-episode-header">
                <button className="gallery-back-btn" onClick={clearEpisode}>
                    <span className="mask-icon icon-arrow-back" />
                </button>
                <h2 className="gallery-episode-title">{selectedEpisode.title}</h2>
            </div>
            <div className="gallery-episode-meta">
                <span>{selectedEpisode.pubDate}</span>
                <span>{selectedPodcast.collectionName}</span>
            </div>
            <div className="gallery-episode-description">
                {selectedEpisode.description || t('noDescription')}
            </div>
            <button className="gallery-play-btn" onClick={handlePlay}>
                <span className="mask-icon icon-play" />
                {t('playEpisode')}
            </button>
        </div>
    );
}
