// src/components/SideEntryStack/SideEntryStack.tsx
import { Link } from '@tanstack/react-router';
import { useTooltip } from '../../hooks/useTooltip';
import { useI18n } from '../../hooks/useI18n';
import { Tooltip } from '../Tooltip';
import type { TranslationKey } from '../../libs/translations';

export function SideEntryStack() {
    const { t } = useI18n();
    const { tooltip, show, move, hide } = useTooltip();

    const handleMouseEnter = (key: TranslationKey) => (e: React.MouseEvent) => {
        show(t(key), e);
    };

    return (
        <>
            <div className="top-entry-stack">
                <Link
                    to="/gallery"
                    className="top-entry-btn panel-surface"
                    id="openGalleryBtn"
                    data-tooltip-key="tooltipGallery"
                    onMouseEnter={handleMouseEnter('tooltipGallery')}
                    onMouseMove={move}
                    onMouseLeave={hide}
                    onMouseDown={hide}
                >
                    <span className="top-entry-icon mask-icon icon-gallery" />
                </Link>
                <Link
                    to="/local-files"
                    className="top-entry-btn panel-surface"
                    id="openLocalFilesBtn"
                    data-tooltip-key="tooltipLocalFiles"
                    onMouseEnter={handleMouseEnter('tooltipLocalFiles')}
                    onMouseMove={move}
                    onMouseLeave={hide}
                    onMouseDown={hide}
                >
                    <span className="top-entry-icon mask-icon icon-folder" />
                </Link>
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
