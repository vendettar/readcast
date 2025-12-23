// src/components/SideEntryStack/SideEntryStack.tsx
import { useTooltip } from '../../hooks/useTooltip';
import { useI18n } from '../../hooks/useI18n';
import { Tooltip } from '../Tooltip';
import type { TranslationKey } from '../../libs/translations';

interface SideEntryStackProps {
    onGalleryClick: () => void;
    onLocalFilesClick: () => void;
}

export function SideEntryStack({ onGalleryClick, onLocalFilesClick }: SideEntryStackProps) {
    const { t } = useI18n();
    const { tooltip, show, move, hide } = useTooltip();

    const handleMouseEnter = (key: TranslationKey) => (e: React.MouseEvent) => {
        show(t(key), e);
    };

    const handleClick = (callback: () => void) => () => {
        hide();
        callback();
    };

    return (
        <>
            <div className="top-entry-stack">
                <button
                    className="top-entry-btn panel-surface"
                    id="openGalleryBtn"
                    data-tooltip-key="tooltipGallery"
                    onClick={handleClick(onGalleryClick)}
                    onMouseEnter={handleMouseEnter('tooltipGallery')}
                    onMouseMove={move}
                    onMouseLeave={hide}
                    onMouseDown={hide}
                >
                    <span className="top-entry-icon mask-icon icon-gallery" />
                </button>
                <button
                    className="top-entry-btn panel-surface"
                    id="openLocalFilesBtn"
                    data-tooltip-key="tooltipLocalFiles"
                    onClick={handleClick(onLocalFilesClick)}
                    onMouseEnter={handleMouseEnter('tooltipLocalFiles')}
                    onMouseMove={move}
                    onMouseLeave={hide}
                    onMouseDown={hide}
                >
                    <span className="top-entry-icon mask-icon icon-folder" />
                </button>
            </div>
            <Tooltip
                visible={tooltip.visible}
                text={tooltip.text}
                x={tooltip.x}
                y={tooltip.y}
            />
        </>
    );
}
