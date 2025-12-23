// src/hooks/useBodyScrollLock.ts
import { useEffect, useRef } from 'react';

interface ScrollLockState {
    scrollX: number;
    scrollY: number;
    previousStyles: {
        position: string;
        top: string;
        left: string;
        right: string;
        width: string;
        paddingRight: string;
    };
    bodyClass: string;
}

/**
 * Lock body scroll when modal is open
 * @param isLocked - Whether to lock scroll
 * @param bodyClass - Optional class to add to body when locked
 */
export function useBodyScrollLock(isLocked: boolean, bodyClass = '') {
    const lockRef = useRef<ScrollLockState | null>(null);

    useEffect(() => {
        const body = document.body;
        if (!body) return;

        if (isLocked && !lockRef.current) {
            // Lock scroll
            const scrollX = window.scrollX || window.pageXOffset || 0;
            const scrollY = window.scrollY || window.pageYOffset || 0;

            const previousStyles = {
                position: body.style.position,
                top: body.style.top,
                left: body.style.left,
                right: body.style.right,
                width: body.style.width,
                paddingRight: body.style.paddingRight,
            };

            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            if (scrollbarWidth > 0) {
                body.style.paddingRight = `${scrollbarWidth}px`;
            }

            body.style.position = 'fixed';
            body.style.top = `-${scrollY}px`;
            body.style.left = `-${scrollX}px`;
            body.style.right = '0';
            body.style.width = '100%';

            if (bodyClass) body.classList.add(bodyClass);

            lockRef.current = { scrollX, scrollY, previousStyles, bodyClass };
        } else if (!isLocked && lockRef.current) {
            // Unlock scroll
            const { scrollX, scrollY, previousStyles, bodyClass: lockedClass } = lockRef.current;

            body.style.position = previousStyles.position;
            body.style.top = previousStyles.top;
            body.style.left = previousStyles.left;
            body.style.right = previousStyles.right;
            body.style.width = previousStyles.width;
            body.style.paddingRight = previousStyles.paddingRight;

            if (lockedClass) body.classList.remove(lockedClass);
            window.scrollTo(scrollX, scrollY);

            lockRef.current = null;
        }

        // Cleanup on unmount
        return () => {
            if (lockRef.current) {
                const { scrollX, scrollY, previousStyles, bodyClass: lockedClass } = lockRef.current;
                body.style.position = previousStyles.position;
                body.style.top = previousStyles.top;
                body.style.left = previousStyles.left;
                body.style.right = previousStyles.right;
                body.style.width = previousStyles.width;
                body.style.paddingRight = previousStyles.paddingRight;

                if (lockedClass) body.classList.remove(lockedClass);
                window.scrollTo(scrollX, scrollY);

                lockRef.current = null;
            }
        };
    }, [isLocked, bodyClass]);
}
