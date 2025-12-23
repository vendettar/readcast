// src/routes/gallery.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import { useGalleryStore } from '../store/galleryStore';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useModalInputLock } from '../hooks/useModalInputLock';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { ModalErrorBoundary } from '../components/ModalErrorBoundary';

const GalleryModal = lazy(() =>
    import('../components/Modals/GalleryModal').then((m) => ({ default: m.GalleryModal }))
);

function GalleryPage() {
    const navigate = useNavigate();
    const modalRef = useRef<HTMLDivElement>(null);

    // Disable keyboard shortcuts while in modal
    useKeyboardShortcuts({ isModalOpen: true });

    // Lock body scroll
    useBodyScrollLock(true);

    const handleClose = useCallback(() => {
        useGalleryStore.getState().close();
        navigate({ to: '/' });
    }, [navigate]);

    // Modal input lock
    useModalInputLock({
        isOpen: true,
        containerRef: modalRef,
        onRequestClose: handleClose,
    });

    // Initialize gallery store on mount
    useEffect(() => {
        useGalleryStore.getState().open();
        return () => {
            useGalleryStore.getState().close();
        };
    }, []);

    return (
        <div ref={modalRef}>
            <Suspense fallback={null}>
                <ModalErrorBoundary
                    isOpen={true}
                    onClose={handleClose}
                    backdropClassName="gallery-backdrop"
                    modalClassName="gallery-modal"
                    navRowClassName="gallery-nav-row"
                    contentClassName="gallery-content"
                    emptyClassName="gallery-empty"
                    closeButtonClassName="gallery-close"
                    closeIconClassName="gallery-nav-icon mask-icon icon-close"
                >
                    <GalleryModal isOpen={true} onClose={handleClose} />
                </ModalErrorBoundary>
            </Suspense>
        </div>
    );
}

export const Route = createFileRoute('/gallery')({
    component: GalleryPage,
});
