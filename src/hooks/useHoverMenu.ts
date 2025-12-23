// src/hooks/useHoverMenu.ts
import { useState, useCallback, useRef, useEffect } from 'react';

const HOVER_DELAY = 160; // ms - match original

export interface UseHoverMenuOptions {
    /** Enable click to toggle (default: true) */
    clickToggle?: boolean;
    /** Enable ESC to close (default: true) */
    escClose?: boolean;
}

export function useHoverMenu(options: UseHoverMenuOptions = {}) {
    const { clickToggle = true, escClose = true } = options;
    const [isOpen, setIsOpen] = useState(false);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLElement | null>(null);

    const clearPendingClose = useCallback(() => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }, []);

    const open = useCallback(() => {
        clearPendingClose();
        setIsOpen(true);
    }, [clearPendingClose]);

    const scheduleClose = useCallback(() => {
        clearPendingClose();
        closeTimerRef.current = setTimeout(() => {
            setIsOpen(false);
        }, HOVER_DELAY);
    }, [clearPendingClose]);

    const close = useCallback(() => {
        clearPendingClose();
        setIsOpen(false);
    }, [clearPendingClose]);

    const toggle = useCallback(() => {
        clearPendingClose();
        setIsOpen(prev => !prev);
    }, [clearPendingClose]);

    // Handle ESC key
    useEffect(() => {
        if (!escClose || !isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                close();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [escClose, isOpen, close]);

    // Handle click outside
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                close();
            }
        };

        // Delay adding listener to avoid immediate close from the opening click
        const timeoutId = setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 0);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('click', handleClickOutside);
        };
    }, [isOpen, close]);

    // Event handlers for the container element
    const containerProps = {
        ref: (el: HTMLElement | null) => { containerRef.current = el; },
        onMouseEnter: open,
        onMouseLeave: scheduleClose,
        onFocus: open,
        onBlur: (e: React.FocusEvent) => {
            const container = e.currentTarget;
            if (!container.contains(e.relatedTarget as Node)) {
                scheduleClose();
            }
        },
    };

    // Button props for click toggle
    const buttonProps = clickToggle ? {
        onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            toggle();
        },
    } : {};

    return {
        isOpen,
        open,
        close,
        toggle,
        scheduleClose,
        containerProps,
        buttonProps,
    };
}
