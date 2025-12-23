// src/components/Transcript/SubtitleLine.tsx
import { useState, useCallback } from 'react';
import { formatTimeLabel } from '../../libs/subtitles';
import { useI18n } from '../../hooks/useI18n';

interface SubtitleLineProps {
    start: number;
    text: string;
    isActive: boolean;
    onClick: () => void;
}

type CopyState = 'default' | 'success' | 'error';

export function SubtitleLine({ start, text, isActive, onClick }: SubtitleLineProps) {
    const { t } = useI18n();
    const [copyState, setCopyState] = useState<CopyState>('default');

    const handleCopy = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                setCopyState('success');
            } else {
                // Legacy fallback
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.top = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                setCopyState('success');
            }
        } catch {
            setCopyState('error');
        }

        // Reset after delay
        setTimeout(() => setCopyState('default'), 1500);
    }, [text]);

    const getIconClass = () => {
        switch (copyState) {
            case 'success': return 'icon-check';
            case 'error': return 'icon-error';
            default: return 'icon-copy';
        }
    };

    return (
        <div
            className={`subtitle-line ${isActive ? 'is-active' : ''}`}
            onClick={onClick}
        >
            <div className="subtitle-time">{formatTimeLabel(start)}</div>
            <div className="subtitle-text">{text}</div>
            <button
                type="button"
                className={`subtitle-copy-btn ${copyState === 'success' ? 'copied' : ''} ${copyState === 'error' ? 'copy-error' : ''}`}
                onClick={handleCopy}
                aria-label={copyState === 'success' ? t('ariaCopied') : copyState === 'error' ? t('ariaCopyFailed') : t('ariaCopy')}
            >
                <span className={`subtitle-copy-icon mask-icon ${getIconClass()}`} aria-hidden="true" />
            </button>
        </div>
    );
}
