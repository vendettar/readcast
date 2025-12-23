// src/App.tsx
import { useRef, useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { usePlayerStore } from './store/playerStore';
import { useGalleryStore } from './store/galleryStore';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFileHandler } from './hooks/useFileHandler';
import { useZoom } from './hooks/useZoom';
import { useSession } from './hooks/useSession';
import { findSubtitleIndex } from './libs/subtitles';
import './styles/original.css';
import './styles/overrides.css';
import './styles/gallery.css';
import './styles/localfiles.css';

// Components
import { Header } from './components/Header';
import { TopRightRail } from './components/TopRightRail';
import { SideEntryStack } from './components/SideEntryStack';
import { EmptyPanel, FloatingPanel } from './components/DropZone';
import { TranscriptView } from './components/Transcript';
import { FABDock } from './components/FABDock';
import { FollowButton } from './components/FollowButton';
import { ZoomControl } from './components/ZoomControl';
import { CoverArt } from './components/CoverArt';
import { ToastContainer } from './components/Toast';
import { ModalErrorBoundary } from './components/ModalErrorBoundary';

const GalleryModal = lazy(() => import('./components/Modals/GalleryModal').then(m => ({ default: m.GalleryModal })));
const LocalFilesModal = lazy(() => import('./components/Modals/LocalFilesModal').then(m => ({ default: m.LocalFilesModal })));

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { themeMode, resolvedTheme, canvasColor, changeThemeMode, changeCanvasColor } = useTheme();
  const [showLocalFiles, setShowLocalFiles] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const { zoomScale, showZoomBar, zoomIn, zoomOut, zoomReset, setShowZoomBar, scheduleHide } = useZoom();

  const {
    audioUrl,
    audioLoaded,
    subtitles,
    subtitlesLoaded,
    currentIndex,
    setCurrentIndex,
    progress,
    setProgress,
    duration,
    setDuration,
    isPlaying,
    togglePlayPause,
    pendingSeek,
    seekTo,
    clearPendingSeek,
  } = usePlayerStore();

  // Gallery modal state from store (single source of truth)
  const showGallery = useGalleryStore(state => state.isOpen);

  useKeyboardShortcuts({ isModalOpen: showGallery || showLocalFiles });
  const { restoreProgress } = useSession();

  const { handleDragOver, handleDragLeave, handleDrop, handleFileChange } = useFileHandler();

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

  // Audio event handlers
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

  // Restore session progress when a new audio source is loaded.
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

  // Find current subtitle using optimized algorithm
  useEffect(() => {
    if (subtitles.length === 0) return;

    const idx = findSubtitleIndex(subtitles, progress, currentIndex);
    if (idx !== -1 && idx !== currentIndex) {
      setCurrentIndex(idx);
      // TranscriptView handles auto-scroll when isFollowing is true
    }
  }, [progress, subtitles, currentIndex, setCurrentIndex]);

  const handleDropZoneClick = () => fileInputRef.current?.click();

  const handlePrev = () => {
    if (currentIndex > 0) {
      seekTo(subtitles[currentIndex - 1].start);
    }
  };

  const handleNext = () => {
    if (currentIndex < subtitles.length - 1) {
      seekTo(subtitles[currentIndex + 1].start);
    }
  };

  const handleJumpToSubtitle = (index: number) => {
    if (subtitles[index]) {
      seekTo(subtitles[index].start);
    }
  };

  const handleSeek = (time: number) => {
    seekTo(time);
  };

  const handleCloseGallery = useCallback(() => {
    useGalleryStore.getState().close();
  }, []);

  const handleCloseLocalFiles = useCallback(() => {
    setShowLocalFiles(false);
  }, []);

  // 监听 pendingSeek 并同步到 audio element
  useEffect(() => {
    if (pendingSeek !== null && audioRef.current) {
      audioRef.current.currentTime = pendingSeek;
      clearPendingSeek();
    }
  }, [pendingSeek, clearPendingSeek]);

  const handleFollowClick = () => {
    setIsFollowing(true);
    // TranscriptView will handle the scroll when isFollowing becomes true
  };

  // Show FollowButton only when not following and subtitles loaded
  const showFollowButton = !isFollowing && subtitlesLoaded;

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
      <SideEntryStack
        onGalleryClick={() => useGalleryStore.getState().open()}
        onLocalFilesClick={() => setShowLocalFiles(true)}
      />

      <main id="appMain">
        <EmptyPanel
          audioLoaded={audioLoaded}
          subtitlesLoaded={subtitlesLoaded}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleDropZoneClick}
        />

        <FloatingPanel
          audioLoaded={audioLoaded}
          subtitlesLoaded={subtitlesLoaded}
          isPlaying={isPlaying}
          progress={progress}
          duration={duration}
          audioRef={audioRef}
          onClick={handleDropZoneClick}
          onPrev={handlePrev}
          onPlayPause={togglePlayPause}
          onNext={handleNext}
          onSeek={handleSeek}
        />

        <input
          ref={fileInputRef}
          type="file"
          id="fileInput"
          multiple
          accept=".mp3,.srt"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {audioUrl && <audio ref={audioRef} src={audioUrl} />}

        <FABDock />

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
      </main>

      <CoverArt />
      <Suspense fallback={null}>
        {showGallery && (
          <ModalErrorBoundary
            isOpen={showGallery}
            onClose={handleCloseGallery}
            backdropClassName="gallery-backdrop"
            modalClassName="gallery-modal"
            navRowClassName="gallery-nav-row"
            contentClassName="gallery-content"
            emptyClassName="gallery-empty"
            closeButtonClassName="gallery-close"
            closeIconClassName="gallery-nav-icon mask-icon icon-close"
          >
            <GalleryModal isOpen={showGallery} onClose={handleCloseGallery} />
          </ModalErrorBoundary>
        )}
        {showLocalFiles && (
          <ModalErrorBoundary
            isOpen={showLocalFiles}
            onClose={handleCloseLocalFiles}
            backdropClassName="localfiles-backdrop"
            modalClassName="localfiles-modal"
            navRowClassName="localfiles-nav-row"
            contentClassName="localfiles-content"
            emptyClassName="localfiles-empty"
            closeButtonClassName="localfiles-close"
            closeIconClassName="localfiles-nav-icon mask-icon icon-close"
          >
            <LocalFilesModal isOpen={showLocalFiles} onClose={handleCloseLocalFiles} />
          </ModalErrorBoundary>
        )}
      </Suspense>
      <ToastContainer />
    </>
  );
}

export default App;
