import { useId, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { useI18n } from '../hooks/useI18n';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useModalInputLock } from '../hooks/useModalInputLock';
import { reportError } from '../libs/errorReporter';

type ModalErrorBoundaryProps = {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    backdropClassName: string;
    modalClassName: string;
    navRowClassName: string;
    contentClassName: string;
    emptyClassName: string;
    closeButtonClassName: string;
    closeIconClassName: string;
};

function ModalCrashFallback({
    onClose,
    onRetry,
    backdropClassName,
    modalClassName,
    navRowClassName,
    contentClassName,
    emptyClassName,
    closeButtonClassName,
    closeIconClassName,
}: {
    onClose: () => void;
    onRetry: () => void;
    backdropClassName: string;
    modalClassName: string;
    navRowClassName: string;
    contentClassName: string;
    emptyClassName: string;
    closeButtonClassName: string;
    closeIconClassName: string;
}) {
    const { t } = useI18n();
    const modalRef = useRef<HTMLDivElement>(null);
    const titleId = useId();

    useBodyScrollLock(true);
    useModalInputLock({ isOpen: true, containerRef: modalRef, onRequestClose: onClose });

    return (
        <div className={backdropClassName}>
            <div
                ref={modalRef}
                className={`${modalClassName} panel-surface`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={e => e.stopPropagation()}
            >
                <div className={navRowClassName}>
                    <span id={titleId} className="font-extrabold flex-1 min-w-0">
                        {t('modalCrashedTitle')}
                    </span>
                    <button
                        type="button"
                        className={closeButtonClassName}
                        onClick={onClose}
                        aria-label={t('ariaClose')}
                    >
                        <span className={closeIconClassName} />
                    </button>
                </div>

                <div className={contentClassName}>
                    <div className={`${emptyClassName} max-w-lg mx-auto`}>
                        {t('modalCrashedHint')}
                    </div>
                    <div className="flex gap-2.5 justify-center mt-3">
                        <button type="button" className="dev-cache-btn" onClick={onRetry}>
                            {t('modalCrashedRetry')}
                        </button>
                        <button type="button" className="dev-cache-btn" onClick={onClose}>
                            {t('modalCrashedClose')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ModalErrorBoundary({
    isOpen,
    onClose,
    children,
    backdropClassName,
    modalClassName,
    navRowClassName,
    contentClassName,
    emptyClassName,
    closeButtonClassName,
    closeIconClassName,
}: ModalErrorBoundaryProps) {
    const fallback = useMemo(() => {
        return ({ reset }: { error: Error; reset: () => void }) => (
            <ModalCrashFallback
                onClose={onClose}
                onRetry={reset}
                backdropClassName={backdropClassName}
                modalClassName={modalClassName}
                navRowClassName={navRowClassName}
                contentClassName={contentClassName}
                emptyClassName={emptyClassName}
                closeButtonClassName={closeButtonClassName}
                closeIconClassName={closeIconClassName}
            />
        );
    }, [
        backdropClassName,
        closeButtonClassName,
        closeIconClassName,
        contentClassName,
        emptyClassName,
        modalClassName,
        navRowClassName,
        onClose,
    ]);

    if (!isOpen) return children;

    return (
        <ErrorBoundary
            fallback={fallback}
            onError={(error, info) => {
                console.error('[ModalErrorBoundary]', error, info);
                reportError(error, info);
            }}
        >
            {children}
        </ErrorBoundary>
    );
}
