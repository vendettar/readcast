// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useRef, useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useTheme } from '../hooks/useTheme';
import { useFileHandler } from '../hooks/useFileHandler';
import { useSession } from '../hooks/useSession';
import { Header } from '../components/Header';
import { TopRightRail } from '../components/TopRightRail';
import { SideEntryStack } from '../components/SideEntryStack';
import { FABDock } from '../components/FABDock';
import { ToastContainer } from '../components/Toast';

function RootLayout() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const { themeMode, resolvedTheme, canvasColor, changeThemeMode, changeCanvasColor } = useTheme();
    const { handleFileChange } = useFileHandler();
    const { restoreProgress } = useSession();

    const {
        audioUrl,
        audioLoaded,
        subtitlesLoaded,
        setProgress,
        setDuration,
        isPlaying,
        pendingSeek,
        clearPendingSeek,
    } = usePlayerStore();


    // Apply ready class to body when mounted
    useEffect(() => {
        document.body.classList.add('ready');
    }, []);

    // Control empty-panel vs floating-panel visibility
    useEffect(() => {
        if (!audioLoaded && !subtitlesLoaded) {
            document.body.classList.add('state-empty');
        } else {
            document.body.classList.remove('state-empty');
        }
    }, [audioLoaded, subtitlesLoaded]);

    // Audio event handlers - persistent across routes
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => setProgress(audio.currentTime);
        const onDurationChange = () => setDuration(audio.duration);
        const onPlay = () => usePlayerStore.getState().play();
        const onPause = () => usePlayerStore.getState().pause();

        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('durationchange', onDurationChange);
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);

        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('durationchange', onDurationChange);
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
        };
    }, [setProgress, setDuration]);

    // Restore session progress when a new audio source is loaded
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !audioUrl) return;

        const onLoadedMetadata = () => {
            restoreProgress(audio);
        };

        audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
        return () => {
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        };
    }, [audioUrl, restoreProgress]);

    // Sync play state
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !audioUrl) return;

        if (isPlaying) {
            audio.play().catch(() => { });
        } else {
            audio.pause();
        }
    }, [isPlaying, audioUrl]);

    // Monitor pendingSeek and sync to audio element
    useEffect(() => {
        if (pendingSeek !== null && audioRef.current) {
            audioRef.current.currentTime = pendingSeek;
            clearPendingSeek();
        }
    }, [pendingSeek, clearPendingSeek]);

    return (
        <>
            <Header />
            <TopRightRail
                themeMode={themeMode}
                resolvedTheme={resolvedTheme}
                canvasColor={canvasColor}
                onChangeTheme={changeThemeMode}
                onChangeCanvas={changeCanvasColor}
            />
            <SideEntryStack />
            <input
                ref={fileInputRef}
                type="file"
                id="fileInput"
                multiple
                accept=".mp3,.srt"
                onChange={handleFileChange}
                className="hidden"
            />
            {/* Audio element is persistent across all routes */}
            {audioUrl && <audio ref={audioRef} src={audioUrl} />}

            <Outlet />

            <FABDock />
            <ToastContainer />
        </>
    );
}

export const Route = createRootRoute({
    component: RootLayout,
});
