// src/components/PlayerControls/PlayerControls.tsx

interface PlayerControlsProps {
    isPlaying: boolean;
    onPrev: () => void;
    onPlayPause: () => void;
    onNext: () => void;
}

export function PlayerControls({ isPlaying, onPrev, onPlayPause, onNext }: PlayerControlsProps) {
    return (
        <div className="floating-controls">
            <button className="circle-btn" onClick={onPrev}>
                <span className="control-icon icon-prev" />
            </button>
            <button className="circle-btn" onClick={onPlayPause}>
                <span className={`control-icon play-icon ${isPlaying ? 'icon-pause' : 'icon-play'}`} />
            </button>
            <button className="circle-btn" onClick={onNext}>
                <span className="control-icon icon-next" />
            </button>
        </div>
    );
}
