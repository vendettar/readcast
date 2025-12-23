// src/components/Tooltip/Tooltip.tsx
import { useRef, useLayoutEffect } from 'react';
import './Tooltip.css';

interface TooltipProps {
    visible: boolean;
    text: string;
    x: number;
    y: number;
}

export function Tooltip({ visible, text, x, y }: TooltipProps) {
    const ref = useRef<HTMLDivElement>(null);

    // Use ref to directly update styles without triggering re-render
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !visible) return;

        const gap = 14;
        const margin = 10;

        let left = x + gap;
        let top = y + gap;

        const width = el.offsetWidth || 0;
        const height = el.offsetHeight || 0;

        if (left + width > window.innerWidth - margin) {
            left = x - width - gap;
        }
        if (top + height > window.innerHeight - margin) {
            top = y - height - gap;
        }

        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        left = clamp(left, margin, Math.max(margin, window.innerWidth - width - margin));
        top = clamp(top, margin, Math.max(margin, window.innerHeight - height - margin));

        // Direct DOM manipulation to avoid setState in effect
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }, [visible, x, y]);

    if (!visible || !text) return null;

    return (
        <div
            ref={ref}
            className="top-rail-tooltip visible"
            role="tooltip"
        >
            {text}
        </div>
    );
}
