// src/routes/local-files.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useRef, Suspense, lazy } from 'react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useModalInputLock } from '../hooks/useModalInputLock';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { ModalErrorBoundary } from '../components/ModalErrorBoundary';

const LocalFilesModal = lazy(() =>
    import('../components/Modals/LocalFilesModal').then((m) => ({ default: m.LocalFilesModal }))
);

function LocalFilesPage() {
    const navigate = useNavigate();
    const modalRef = useRef<HTMLDivElement>(null);

    // Disable keyboard shortcuts while in modal
    useKeyboardShortcuts({ isModalOpen: true });

    // Lock body scroll
    useBodyScrollLock(true);

    const handleClose = useCallback(() => {
        navigate({ to: '/' });
    }, [navigate]);

    // Modal input lock
    useModalInputLock({
        isOpen: true,
        containerRef: modalRef,
        onRequestClose: handleClose,
    });

    return (
        <div ref={modalRef}>
            <Suspense fallback={null}>
                <ModalErrorBoundary
                    isOpen={true}
                    onClose={handleClose}
                    backdropClassName="localfiles-backdrop"
                    modalClassName="localfiles-modal"
                    navRowClassName="localfiles-nav-row"
                    contentClassName="localfiles-content"
                    emptyClassName="localfiles-empty"
                    closeButtonClassName="localfiles-close"
                    closeIconClassName="localfiles-nav-icon mask-icon icon-close"
                >
                    <LocalFilesModal isOpen={true} onClose={handleClose} />
                </ModalErrorBoundary>
            </Suspense>
        </div>
    );
}

export const Route = createFileRoute('/local-files')({
    component: LocalFilesPage,
});
