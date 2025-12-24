// src/components/DropZone/FloatingPanel.tsx
import { useI18n } from '../../hooks/useI18n';
import { PlayerControls } from '../PlayerControls/PlayerControls';
import { ProgressBar } from '../PlayerControls/ProgressBar';

interface FloatingPanelProps {
    audioLoaded: boolean;
    subtitlesLoaded: boolean;
    isPlaying: boolean;
    progress: number;
    duration: number;
    onClick: () => void;
    onPrev: () => void;
    onPlayPause: () => void;
    onNext: () => void;
    onSeek: (time: number) => void;
}

export function FloatingPanel({
    audioLoaded,
    subtitlesLoaded,
    isPlaying,
    progress,
    duration,
    onClick,
    onPrev,
    onPlayPause,
    onNext,
    onSeek,
}: FloatingPanelProps) {
    const { t } = useI18n();

    return (
        <div className="floating-panel">
            <div
                className="file-drop-zone file-drop-zone--floating floating-card panel-surface"
                onClick={onClick}
            >
                <p className="drop-title">
                    <span className="drop-title-text">{t('dropTitleShort')}</span>
                </p>
                <div className="media-support">
                    <label className="media-check">
                        <input type="checkbox" checked={audioLoaded} disabled readOnly />
                        <span>{t('formatMp3')}</span>
                    </label>
                    <label className="media-check">
                        <input type="checkbox" checked={subtitlesLoaded} disabled readOnly />
                        <span>{t('formatSrt')}</span>
                    </label>
                </div>
            </div>

            <PlayerControls
                isPlaying={isPlaying}
                onPrev={onPrev}
                onPlayPause={onPlayPause}
                onNext={onNext}
            />

            <ProgressBar
                progress={progress}
                duration={duration}
                onSeek={onSeek}
            />
        </div>
    );
}
