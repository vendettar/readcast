// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useFilePicker } from './__root';
import { useCallback, useState, useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useZoom } from '../hooks/useZoom';
import { useFileHandler } from '../hooks/useFileHandler';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { findSubtitleIndex } from '../libs/subtitles';
import { EmptyPanel, FloatingPanel } from '../components/DropZone';
import { TranscriptView } from '../components/Transcript';
import { FollowButton } from '../components/FollowButton';
import { ZoomControl } from '../components/ZoomControl';
import { CoverArt } from '../components/CoverArt';

function HomePage() {
    const { zoomScale, showZoomBar, zoomIn, zoomOut, zoomReset, setShowZoomBar, scheduleHide } = useZoom();
    const [isFollowing, setIsFollowing] = useState(true);
    const { handleDragOver, handleDragLeave, handleDrop } = useFileHandler();
    const { triggerFilePicker } = useFilePicker();

    // Keyboard shortcuts active on home page
    useKeyboardShortcuts({ isModalOpen: false });

    const {
        audioLoaded,
        subtitles,
        subtitlesLoaded,
        currentIndex,
        setCurrentIndex,
        progress,
        duration,
        isPlaying,
        togglePlayPause,
        seekTo,
    } = usePlayerStore();

    // Find current subtitle using optimized algorithm
    useEffect(() => {
        if (subtitles.length === 0) return;

        const idx = findSubtitleIndex(subtitles, progress, currentIndex);
        if (idx !== -1 && idx !== currentIndex) {
            setCurrentIndex(idx);
        }
    }, [progress, subtitles, currentIndex, setCurrentIndex]);

    const handlePrev = useCallback(() => {
        if (currentIndex > 0) {
            seekTo(subtitles[currentIndex - 1].start);
        }
    }, [currentIndex, seekTo, subtitles]);

    const handleNext = useCallback(() => {
        if (currentIndex < subtitles.length - 1) {
            seekTo(subtitles[currentIndex + 1].start);
        }
    }, [currentIndex, seekTo, subtitles]);

    const handleJumpToSubtitle = useCallback((index: number) => {
        if (subtitles[index]) {
            seekTo(subtitles[index].start);
        }
    }, [seekTo, subtitles]);

    const handleSeek = useCallback((time: number) => {
        seekTo(time);
    }, [seekTo]);

    const handleFollowClick = useCallback(() => {
        setIsFollowing(true);
    }, []);

    const showFollowButton = !isFollowing && subtitlesLoaded;

    return (
        <main id="appMain">
            <EmptyPanel
                audioLoaded={audioLoaded}
                subtitlesLoaded={subtitlesLoaded}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={triggerFilePicker}
            />

            <FloatingPanel
                audioLoaded={audioLoaded}
                subtitlesLoaded={subtitlesLoaded}
                isPlaying={isPlaying}
                progress={progress}
                duration={duration}
                onClick={triggerFilePicker}
                onPrev={handlePrev}
                onPlayPause={togglePlayPause}
                onNext={handleNext}
                onSeek={handleSeek}
            />

            {subtitlesLoaded && (
                <ZoomControl
                    zoomScale={zoomScale}
                    isVisible={showZoomBar}
                    onZoomIn={zoomIn}
                    onZoomOut={zoomOut}
                    onZoomReset={zoomReset}
                    onMouseEnter={() => setShowZoomBar(true)}
                    onMouseLeave={scheduleHide}
                />
            )}

            <TranscriptView
                subtitles={subtitles}
                currentIndex={currentIndex}
                onJumpToSubtitle={handleJumpToSubtitle}
                isFollowing={isFollowing}
                onFollowingChange={setIsFollowing}
                zoomScale={zoomScale}
            />

            <FollowButton
                isPlaying={isPlaying}
                isVisible={showFollowButton}
                onClick={handleFollowClick}
            />

            <CoverArt />
        </main>
    );
}

export const Route = createFileRoute('/')({
    component: HomePage,
});
