// src/components/DropZone/EmptyPanel.tsx
import React from 'react';
import { useI18n } from '../../hooks/useI18n';
import { WarningBanner } from './WarningBanner';
import type { TranslationKey } from '../../libs/translations';

interface EmptyPanelProps {
    audioLoaded: boolean;
    subtitlesLoaded: boolean;
    warnings?: TranslationKey[];
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onClick: () => void;
}

export function EmptyPanel({
    audioLoaded,
    subtitlesLoaded,
    warnings = [],
    onDragOver,
    onDragLeave,
    onDrop,
    onClick,
}: EmptyPanelProps) {
    const { t } = useI18n();

    return (
        <div className="empty-panel">
            <div
                className="combined-card"
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
            >
                <p className="intro-lead">{t('introLead')}</p>
                <div className="drop-wrapper drop-wrapper-empty">
                    <div
                        className="file-drop-zone file-drop-zone--empty"
                        onClick={onClick}
                    >
                        <p className="drop-title">
                            <span className="drop-title-text">
                                {t('dropTitleIntro')}
                            </span>
                        </p>
                        <div className="media-support">
                            <label className="media-check">
                                <input type="checkbox" checked={audioLoaded} disabled readOnly />
                                <span>{t('formatMp3')}</span>
                            </label>
                            <label className="media-check">
                                <input type="checkbox" checked={subtitlesLoaded} disabled readOnly />
                                <span>{t('formatSrt')}</span>
                            </label>
                        </div>
                    </div>
                    <WarningBanner warnings={warnings} />
                </div>
                <p className="intro-meta intro-meta-bottom">
                    {t('introPrivacy')}
                </p>
            </div>
        </div>
    );
}
