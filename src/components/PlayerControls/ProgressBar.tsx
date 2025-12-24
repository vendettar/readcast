// src/components/PlayerControls/ProgressBar.tsx
import React from 'react';
import { formatTimeLabel } from '../../libs/subtitles';

interface ProgressBarProps {
    progress: number;
    duration: number;
    onSeek: (time: number) => void;
}

export function ProgressBar({ progress, duration, onSeek }: ProgressBarProps) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTime = parseFloat(e.target.value);
        onSeek(newTime);
    };

    return (
        <div className="floating-card panel-surface progress-card">
            <div className="progress-row">
                <span className="time-label">{formatTimeLabel(progress)}</span>
                <input
                    className="progress-bar"
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.01"
                    value={progress}
                    onChange={handleChange}
                />
            </div>
        </div>
    );
}
