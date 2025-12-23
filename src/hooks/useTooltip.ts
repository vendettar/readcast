// src/hooks/useTooltip.ts
// Simplified tooltip hook that returns only control functions
// Position calculation is done inside the component to avoid ref access issues

import { useState, useCallback } from 'react';

export interface TooltipProps {
    visible: boolean;
    text: string;
    x: number;
    y: number;
}

const initialState: TooltipProps = {
    visible: false,
    text: '',
    x: 0,
    y: 0,
};

export function useTooltip() {
    const [tooltip, setTooltip] = useState<TooltipProps>(initialState);

    const show = useCallback((text: string, event: React.MouseEvent) => {
        if (!text) return;
        setTooltip({
            visible: true,
            text,
            x: event.clientX,
            y: event.clientY,
        });
    }, []);

    const move = useCallback((event: React.MouseEvent) => {
        setTooltip(prev => {
            if (!prev.visible) return prev;
            return { ...prev, x: event.clientX, y: event.clientY };
        });
    }, []);

    const hide = useCallback(() => {
        setTooltip(prev => ({ ...prev, visible: false }));
    }, []);

    return { tooltip, show, move, hide };
}
