// src/hooks/useModalInputLock.ts
// Modal input lock: ESC close, Tab trap, wheel/touch/zoom prevention
// Based on original/scripts/modules/modalInputLock.js

import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => el && typeof el.focus === 'function');
}

function focusFirstElement(container: HTMLElement | null) {
    const focusables = getFocusableElements(container);
    const first = focusables[0] || container;
    if (!first || !first.focus) return;
    try {
        first.focus({ preventScroll: true });
    } catch {
        first.focus();
    }
}

function isCtrlZoomKey(event: KeyboardEvent): boolean {
    const key = event.key;
    const code = event.code;
    return (
        key === '=' ||
        key === '+' ||
        key === '-' ||
        key === '0' ||
        code === 'NumpadAdd' ||
        code === 'NumpadSubtract' ||
        code === 'Numpad0'
    );
}

interface UseModalInputLockOptions {
    isOpen: boolean;
    containerRef: React.RefObject<HTMLElement | null>;
    onRequestClose: () => void;
}

export function useModalInputLock({
    isOpen,
    containerRef,
    onRequestClose,
}: UseModalInputLockOptions) {
    const previousFocusRef = useRef<Element | null>(null);

    const containsTarget = useCallback((target: EventTarget | null): boolean => {
        const container = containerRef.current;
        if (!container || !target) return false;
        return container.contains(target as Node);
    }, [containerRef]);

    useEffect(() => {
        if (!isOpen) return;

        const container = containerRef.current;
        if (!container) return;

        // Save previous focus
        previousFocusRef.current = document.activeElement;

        const controller = new AbortController();
        const { signal } = controller;

        // Keydown handler: ESC close, Tab trap, block zoom keys
        const keydownHandler = (event: KeyboardEvent) => {
            const code = event.code;
            const key = event.key;

            // ESC to close
            if (key === 'Escape' || code === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                onRequestClose();
                return;
            }

            // Block Ctrl/Cmd + zoom keys
            if ((event.ctrlKey || event.metaKey) && isCtrlZoomKey(event)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }

            // Tab trap
            if (code === 'Tab') {
                event.preventDefault();
                event.stopImmediatePropagation();

                const focusables = getFocusableElements(container);
                if (focusables.length === 0) return;

                const current = document.activeElement;
                const currentIndex = focusables.indexOf(current as HTMLElement);
                const delta = event.shiftKey ? -1 : 1;
                const nextIndex = currentIndex === -1
                    ? 0
                    : (currentIndex + delta + focusables.length) % focusables.length;
                const next = focusables[nextIndex];
                if (next) {
                    try {
                        next.focus({ preventScroll: true });
                    } catch {
                        next.focus();
                    }
                }
                return;
            }
        };

        // Focus trap: if focus escapes, bring it back
        const focusInHandler = (event: FocusEvent) => {
            if (containsTarget(event.target)) return;
            focusFirstElement(container);
        };

        // Wheel handler: prevent scroll outside modal, block ctrl+wheel zoom
        const wheelHandler = (event: WheelEvent) => {
            const target = event.target as Node;
            if ((event.ctrlKey || event.metaKey) && event.cancelable) {
                event.preventDefault();
            }
            if (containsTarget(target)) {
                event.stopPropagation();
                return;
            }
            if (event.cancelable) event.preventDefault();
            event.stopPropagation();
        };

        // Touch move handler: prevent scroll outside modal
        const touchMoveHandler = (event: TouchEvent) => {
            if (containsTarget(event.target)) {
                event.stopPropagation();
                return;
            }
            if (event.cancelable) event.preventDefault();
            event.stopPropagation();
        };

        document.addEventListener('keydown', keydownHandler, { capture: true, signal });
        document.addEventListener('focusin', focusInHandler, { capture: true, signal });
        document.addEventListener('wheel', wheelHandler, { capture: true, passive: false, signal });
        document.addEventListener('touchmove', touchMoveHandler, { capture: true, passive: false, signal });

        // Focus first element in modal
        focusFirstElement(container);

        // Cleanup
        return () => {
            controller.abort();

            // Restore previous focus
            const previous = previousFocusRef.current;
            previousFocusRef.current = null;
            if (previous && typeof (previous as HTMLElement).focus === 'function') {
                try {
                    (previous as HTMLElement).focus({ preventScroll: true });
                } catch {
                    (previous as HTMLElement).focus();
                }
            }
        };
    }, [isOpen, containerRef, onRequestClose, containsTarget]);
}
