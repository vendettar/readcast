// src/hooks/useZoom.ts
import { useEffect, useState, useCallback, useRef } from 'react';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;
const HIDE_DELAY = 2000;

export function useZoom() {
    const [zoomScale, setZoomScale] = useState(1);
    const [showZoomBar, setShowZoomBar] = useState(false);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleHide = useCallback(() => {
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
        }
        hideTimerRef.current = setTimeout(() => {
            setShowZoomBar(false);
        }, HIDE_DELAY);
    }, []);

    const updateZoom = useCallback((delta: number, absoluteValue: number | null = null) => {
        setZoomScale(prev => {
            let newScale: number;
            if (absoluteValue !== null) {
                newScale = Math.min(Math.max(absoluteValue, MIN_ZOOM), MAX_ZOOM);
            } else {
                newScale = Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM);
            }
            document.body.style.setProperty('--zoom-scale', String(newScale));
            return newScale;
        });
        setShowZoomBar(true);
        scheduleHide();
    }, [scheduleHide]);

    const zoomIn = useCallback(() => updateZoom(ZOOM_STEP), [updateZoom]);
    const zoomOut = useCallback(() => updateZoom(-ZOOM_STEP), [updateZoom]);
    const zoomReset = useCallback(() => updateZoom(0, 1), [updateZoom]);

    // Handle Ctrl+Wheel zoom
    useEffect(() => {
        const handleWheel = (event: WheelEvent) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                if (event.deltaY < 0) {
                    zoomIn();
                } else {
                    zoomOut();
                }
            }
        };

        window.addEventListener('wheel', handleWheel, { passive: false });
        return () => window.removeEventListener('wheel', handleWheel);
    }, [zoomIn, zoomOut]);

    // Cancel hide on component unmount
    useEffect(() => {
        return () => {
            if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
            }
        };
    }, []);

    return {
        zoomScale,
        showZoomBar,
        zoomIn,
        zoomOut,
        zoomReset,
        setShowZoomBar,
        scheduleHide,
    };
}
