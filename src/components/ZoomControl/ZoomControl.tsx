// src/components/ZoomControl/ZoomControl.tsx
import { useI18n } from '../../hooks/useI18n';

interface ZoomControlProps {
    zoomScale: number;
    isVisible: boolean;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomReset: () => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
}

export function ZoomControl({
    zoomScale,
    isVisible,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onMouseEnter,
    onMouseLeave,
}: ZoomControlProps) {
    const { t } = useI18n();

    if (!isVisible) return null;

    return (
        <div
            className="zoom-direct panel-surface show"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <span id="zoomValueText" className="zoom-value">
                {Math.round(zoomScale * 100)}%
            </span>
            <button
                id="zoomOutBtn"
                className="zoom-btn"
                aria-label={t('ariaZoomOut')}
                onClick={onZoomOut}
            >
                −
            </button>
            <button
                id="zoomInBtn"
                className="zoom-btn"
                aria-label={t('ariaZoomIn')}
                onClick={onZoomIn}
            >
                +
            </button>
            <button
                id="zoomResetBtn"
                className="zoom-reset-btn"
                aria-label={t('ariaResetZoom')}
                onClick={onZoomReset}
            >
                {t('resetZoom')}
            </button>
        </div>
    );
}
