// src/components/Transcript/TranscriptView.tsx
import { useRef, useCallback, useState, useEffect } from 'react';
import type { Subtitle } from '../../libs/subtitles';
import { SubtitleLine } from './SubtitleLine';
import { useSelection } from '../../hooks/useSelection';
import { refreshHighlights } from '../../libs/selection';
import { ContextMenu, LookupPopover, WordHoverOverlay } from '../Selection';
import { useVirtualList, getWindowedItems } from '../../hooks/useVirtualList';

// Constants for virtual list
// BASE_ITEM_HEIGHT = height (48px) + margin-bottom (8px) from CSS (at zoom=1).
// Transcript CSS clamps height/margin to a minimum at zoom<1, so itemHeight must
// also clamp to avoid scroll/virtualization drift.
const BASE_ITEM_HEIGHT = 56;
const CONTAINER_HEIGHT = 400; // Default container height
const OVERSCAN = 8; // Items to render above/below visible area

interface TranscriptViewProps {
    subtitles: Subtitle[];
    currentIndex: number;
    onJumpToSubtitle: (index: number) => void;
    isFollowing: boolean;
    onFollowingChange: (following: boolean) => void;
    zoomScale: number;
}

export function TranscriptView({ subtitles, currentIndex, onJumpToSubtitle, isFollowing, onFollowingChange, zoomScale }: TranscriptViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState(CONTAINER_HEIGHT);
    const { state, copyText, searchWeb, lookupFromMenu, closeMenu, closeLookup } = useSelection(containerRef);
    const highlightRefreshHandleRef = useRef<number | null>(null);
    const isProgrammaticScrollRef = useRef(false); // Track if scroll is from code
    const lastCurrentIndexRef = useRef(currentIndex); // Track index changes for auto-scroll

    // Measure container height
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) {
                setContainerHeight(entry.contentRect.height);
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    const itemHeight = Math.round(BASE_ITEM_HEIGHT * Math.max(1, zoomScale));

    // Virtual list hook
    const {
        startIndex,
        endIndex,
        totalHeight,
        offsetY,
        onScroll,
        getScrollTopForIndex,
    } = useVirtualList({
        itemCount: subtitles.length,
        itemHeight,
        containerHeight,
        overscan: OVERSCAN,
    });

    // Handle scroll event - detect user scroll vs programmatic scroll
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        onScroll(e.currentTarget.scrollTop);

        // If this was a programmatic scroll, don't change following state
        if (isProgrammaticScrollRef.current) {
            return;
        }

        // User scrolled manually - stop following
        if (isFollowing) {
            onFollowingChange(false);
        }
    }, [onScroll, isFollowing, onFollowingChange]);

    // Auto-scroll to current subtitle when following is enabled and index changes
    useEffect(() => {
        // Only scroll if following and currentIndex actually changed
        if (!isFollowing || currentIndex < 0 || currentIndex >= subtitles.length) {
            lastCurrentIndexRef.current = currentIndex;
            return;
        }

        // Check if index changed (not just a re-render)
        if (currentIndex === lastCurrentIndexRef.current) {
            return;
        }
        lastCurrentIndexRef.current = currentIndex;

        // Check if current index is visible
        const isVisible = currentIndex >= startIndex && currentIndex < endIndex;
        if (!isVisible && scrollContainerRef.current) {
            isProgrammaticScrollRef.current = true;
            const targetTop = getScrollTopForIndex(currentIndex);
            scrollContainerRef.current.scrollTo({
                top: targetTop,
                behavior: 'smooth'
            });
            // Reset programmatic flag after scroll settles
            setTimeout(() => {
                isProgrammaticScrollRef.current = false;
            }, 500);
        }
    }, [currentIndex, subtitles.length, startIndex, endIndex, isFollowing, getScrollTopForIndex]);

    // Scroll to current index when following is re-enabled
    useEffect(() => {
        if (isFollowing && scrollContainerRef.current && currentIndex >= 0 && currentIndex < subtitles.length) {
            isProgrammaticScrollRef.current = true;
            const targetTop = getScrollTopForIndex(currentIndex);
            scrollContainerRef.current.scrollTo({
                top: targetTop,
                behavior: 'smooth'
            });
            setTimeout(() => {
                isProgrammaticScrollRef.current = false;
            }, 500);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFollowing]); // Only trigger when isFollowing changes to true

    // Get windowed items
    const windowedItems = getWindowedItems(subtitles, startIndex, endIndex);

    const scheduleHighlightsRefresh = useCallback(() => {
        if (highlightRefreshHandleRef.current !== null) return;

        highlightRefreshHandleRef.current = requestAnimationFrame(() => {
            highlightRefreshHandleRef.current = null;
            refreshHighlights();
        });
    }, []);

    // When virtualized window changes, re-apply cached-word highlights for newly-rendered lines.
    useEffect(() => {
        scheduleHighlightsRefresh();
    }, [startIndex, endIndex, subtitles.length, scheduleHighlightsRefresh]);

    useEffect(() => {
        return () => {
            if (highlightRefreshHandleRef.current !== null) {
                cancelAnimationFrame(highlightRefreshHandleRef.current);
                highlightRefreshHandleRef.current = null;
            }
        };
    }, []);

    return (
        <>
            <div
                id="transcript-container"
                ref={scrollContainerRef}
                onScroll={handleScroll}
                style={{ height: '100%', overflow: 'auto' }}
            >
                {/* Virtual scroll spacer */}
                <div style={{ height: totalHeight, position: 'relative' }}>
                    {/* Positioned container for visible items */}
                    <div
                        ref={containerRef}
                        style={{
                            position: 'absolute',
                            top: offsetY,
                            left: 0,
                            right: 0,
                        }}
                    >
                        {windowedItems.map(({ item: sub, index: idx }) => (
                            <SubtitleLine
                                key={`${sub.start}-${sub.end}`}
                                start={sub.start}
                                text={sub.text}
                                isActive={idx === currentIndex}
                                onClick={() => onJumpToSubtitle(idx)}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Selection UI */}
            <ContextMenu
                state={state}
                onCopy={copyText}
                onSearch={searchWeb}
                onLookup={lookupFromMenu}
                onClose={closeMenu}
            />
            <LookupPopover
                state={state}
                onClose={closeLookup}
            />
            <WordHoverOverlay
                rects={state.hoverRects}
                isPressed={state.showLookup}
            />
        </>
    );
}
