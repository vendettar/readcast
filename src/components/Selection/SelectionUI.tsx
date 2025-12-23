// src/components/Selection/SelectionUI.tsx
// Context menu and Lookup popover components

import { useI18n } from '../../hooks/useI18n';
import type { SelectionState, DictEntry } from '../../libs/selection';
import './SelectionUI.css';

interface ContextMenuProps {
    state: SelectionState;
    onCopy: () => void;
    onSearch: () => void;
    onLookup: () => void;
    onClose: () => void;
}

export function ContextMenu({ state, onCopy, onSearch, onLookup, onClose }: ContextMenuProps) {
    const { t } = useI18n();

    if (!state.showMenu) return null;

    const isEligibleForLookup = state.menuMode === 'word' &&
        /^[A-Za-z][A-Za-z0-9]*(?:[''-][A-Za-z0-9]+)*$/.test(state.selectedText) &&
        state.selectedText.length <= 64;

    return (
        <>
            <div className="context-menu-backdrop" onClick={onClose} />
            <div
                className="context-menu panel-surface"
                style={{
                    left: state.menuPosition.x,
                    top: state.menuPosition.y,
                    transform: 'translate(-50%, -100%)',
                }}
            >
                <button className="context-menu-item" onClick={onCopy}>
                    <span className="mask-icon icon-copy" />
                    {t('copyLine')}
                </button>
                <button className="context-menu-item" onClick={onSearch}>
                    <span className="mask-icon icon-search" />
                    {t('searchWeb')}
                </button>
                {isEligibleForLookup && (
                    <button className="context-menu-item" onClick={onLookup}>
                        <span className="mask-icon icon-book" />
                        {t('lookUp')}
                    </button>
                )}
            </div>
        </>
    );
}

interface LookupPopoverProps {
    state: SelectionState;
    onClose: () => void;
}

export function LookupPopover({ state, onClose }: LookupPopoverProps) {
    const { t } = useI18n();
    if (!state.showLookup) return null;

    // Position calculation
    const margin = 10;
    let left = state.lookupPosition.x;
    let top = state.lookupPosition.y;

    // Ensure within viewport
    const popoverWidth = 320;
    const popoverHeight = 300;

    if (left + popoverWidth > window.innerWidth - margin) {
        left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    if (top + popoverHeight / 2 > window.innerHeight - margin) {
        top = window.innerHeight - popoverHeight / 2 - margin;
    }
    if (top - popoverHeight / 2 < margin) {
        top = popoverHeight / 2 + margin;
    }

    return (
        <>
            <div className="lookup-backdrop" onClick={onClose} />
            <div
                className="lookup-popover panel-surface"
                style={{
                    left,
                    top,
                    transform: 'translateY(-50%)',
                }}
            >
                <div className="lookup-header">
                    <div className="lookup-title">{state.lookupWord}</div>
                    <button className="lookup-close" onClick={onClose}>
                        <span className="mask-icon icon-close" />
                    </button>
                </div>
                <div className="lookup-body">
                    {state.lookupLoading && (
                        <div className="lookup-loading">{t('loading')}</div>
                    )}
                    {state.lookupError && (
                        <div className="lookup-error">{state.lookupError}</div>
                    )}
                    {state.lookupResult && (
                        <DictContent entry={state.lookupResult} />
                    )}
                </div>
            </div>
        </>
    );
}

function DictContent({ entry }: { entry: DictEntry }) {
    return (
        <div className="dict-content">
            {entry.phonetic && (
                <div className="dict-phonetic">{entry.phonetic}</div>
            )}
            {entry.meanings.map((meaning, idx: number) => (
                <div key={idx} className="dict-meaning">
                    <div className="dict-pos">{meaning.partOfSpeech}</div>
                    <ol className="dict-definitions">
                        {meaning.definitions.map((def, defIdx: number) => (
                            <li key={defIdx} className="dict-definition">
                                <div className="dict-def-text">{def.definition}</div>
                                {def.example && (
                                    <div className="dict-example">"{def.example}"</div>
                                )}
                            </li>
                        ))}
                    </ol>
                </div>
            ))}
        </div>
    );
}

interface WordHoverOverlayProps {
    rects: DOMRect[];
    isPressed?: boolean;
}

export function WordHoverOverlay({ rects, isPressed }: WordHoverOverlayProps) {
    if (rects.length === 0) return null;

    return (
        <div className="word-hover-overlay">
            {rects.map((rect, idx) => (
                <div
                    key={idx}
                    className={`word-hover-rect ${isPressed ? 'is-pressed' : ''}`}
                    style={{
                        left: rect.left - 2,
                        top: rect.top - 2,
                        width: rect.width + 4,
                        height: rect.height + 4,
                    }}
                />
            ))}
        </div>
    );
}
