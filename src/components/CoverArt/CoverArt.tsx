// src/components/CoverArt/CoverArt.tsx
import { usePlayerStore } from '../../store/playerStore';
import './CoverArt.css';

export function CoverArt() {
    const { coverArtUrl, audioTitle, audioLoaded } = usePlayerStore();

    if (!audioLoaded || !coverArtUrl) return null;

    return (
        <div className="cover-art-container">
            <img
                className="cover-art-image"
                src={coverArtUrl}
                alt={audioTitle || 'Cover art'}
                loading="lazy"
            />
            {audioTitle && (
                <div className="cover-art-title">{audioTitle}</div>
            )}
        </div>
    );
}
