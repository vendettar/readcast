// src/hooks/useVirtualList.ts
// Simple virtual list hook for transcript performance

import { useState, useCallback, useMemo } from 'react';

interface UseVirtualListOptions {
    /** Total number of items */
    itemCount: number;
    /** Estimated height of each item in pixels */
    itemHeight: number;
    /** Height of the container in pixels */
    containerHeight: number;
    /** Number of items to render above/below visible area */
    overscan?: number;
}

interface VirtualListResult {
    /** Start index of visible range (inclusive) */
    startIndex: number;
    /** End index of visible range (exclusive) */
    endIndex: number;
    /** Total height of the virtual scroll area */
    totalHeight: number;
    /** Offset from top for the first visible item */
    offsetY: number;
    /** Handler for scroll events */
    onScroll: (scrollTop: number) => void;
    /** Compute scrollTop that would center an index */
    getScrollTopForIndex: (index: number) => number;
    /** Current scroll position */
    scrollTop: number;
}

export function useVirtualList({
    itemCount,
    itemHeight,
    containerHeight,
    overscan = 5,
}: UseVirtualListOptions): VirtualListResult {
    const [scrollTop, setScrollTop] = useState(0);

    // Calculate visible range
    const { startIndex, endIndex, offsetY, totalHeight } = useMemo(() => {
        const visibleCount = Math.ceil(containerHeight / itemHeight);
        const rawStart = Math.floor(scrollTop / itemHeight);

        // Apply overscan
        const start = Math.max(0, rawStart - overscan);
        const end = Math.min(itemCount, rawStart + visibleCount + overscan);

        return {
            startIndex: start,
            endIndex: end,
            offsetY: start * itemHeight,
            totalHeight: itemCount * itemHeight,
        };
    }, [scrollTop, itemCount, itemHeight, containerHeight, overscan]);

    const onScroll = useCallback((newScrollTop: number) => {
        setScrollTop(newScrollTop);
    }, []);

    const getScrollTopForIndex = useCallback((index: number) => {
        if (index < 0 || index >= itemCount) return 0;
        const targetScrollTop = index * itemHeight - containerHeight / 2 + itemHeight / 2;
        return Math.max(0, Math.min(targetScrollTop, totalHeight - containerHeight));
    }, [itemCount, itemHeight, containerHeight, totalHeight]);

    return {
        startIndex,
        endIndex,
        totalHeight,
        offsetY,
        onScroll,
        getScrollTopForIndex,
        scrollTop,
    };
}

/**
 * Simple windowed rendering for lists
 * Renders only items within the visible range
 */
export function getWindowedItems<T>(
    items: T[],
    startIndex: number,
    endIndex: number
): { item: T; index: number }[] {
    const result: { item: T; index: number }[] = [];
    for (let i = startIndex; i < endIndex && i < items.length; i++) {
        result.push({ item: items[i], index: i });
    }
    return result;
}
