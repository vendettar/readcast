// src/components/Modals/LocalFilesModal.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { DB, Session, StoredAudio } from '../../libs/dexieDb';
import { useI18n } from '../../hooks/useI18n';
import { usePlayerStore } from '../../store/playerStore';
import { parseSrt } from '../../libs/subtitles';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useModalInputLock } from '../../hooks/useModalInputLock';
import { warn, error as logError } from '../../libs/logger';
import { toast } from '../../libs/toast';
import { formatFileSize, formatTimestamp, formatDuration } from '../../libs/formatters';

interface LocalFilesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface LocalFile {
    session: Session;
    audio?: StoredAudio;
}

export function LocalFilesModal({ isOpen, onClose }: LocalFilesModalProps) {
    const { t } = useI18n();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const [files, setFiles] = useState<LocalFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalSize, setTotalSize] = useState(0);

    // Lock body scroll when modal is open
    useBodyScrollLock(isOpen);

    // Modal input lock: ESC, Tab trap, wheel/touch prevention
    useModalInputLock({
        isOpen,
        containerRef: modalRef,
        onRequestClose: onClose,
    });

    const { setAudioUrl, setSubtitles, setSessionId } = usePlayerStore();

    const loadFiles = useCallback(async () => {
        setLoading(true);
        try {
            const sessions = await DB.getAllSessions();
            const audios = await DB.getAllAudios();
            const audioMap = new Map(audios.map(a => [a.id, a]));

            const localFiles: LocalFile[] = sessions
                .filter(s => s.audioId) // Only sessions with stored audio
                .map(s => ({
                    session: s,
                    audio: s.audioId ? audioMap.get(s.audioId) : undefined,
                }));

            setFiles(localFiles);
            setTotalSize(audios.reduce((sum, a) => sum + a.size, 0));
        } catch (error) {
            logError('[LocalFiles] Failed to load:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadFiles();
        }
    }, [isOpen, loadFiles]);

    const handlePlay = async (file: LocalFile) => {
        try {
            // Bind the session ID first to avoid timing races with audio load events.
            setSessionId(file.session.id);

            if (file.audio) {
                const url = URL.createObjectURL(file.audio.blob);
                setAudioUrl(url);
            }

            // Load subtitle if exists
            if (file.session.subtitleId) {
                const subtitle = await DB.getSubtitle(file.session.subtitleId);
                if (subtitle) {
                    const parsed = parseSrt(subtitle.content);
                    setSubtitles(parsed);
                }
            }

            onClose();
        } catch (error) {
            logError('[LocalFiles] Failed to play:', error);
        }
    };

    const handleDelete = async (file: LocalFile) => {
        try {
            // Delete audio
            if (file.session.audioId) {
                await DB.deleteAudio(file.session.audioId);
            }
            // Delete subtitle
            if (file.session.subtitleId) {
                await DB.deleteSubtitle(file.session.subtitleId);
            }
            // Delete session
            await DB.deleteSession(file.session.id);

            // Refresh list
            await loadFiles();
        } catch (error) {
            logError('[LocalFiles] Failed to delete:', error);
            toast.errorKey('toastDeleteFailed');
        }
    };

    const handleUpload = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputFiles = e.target.files;
        if (!inputFiles || inputFiles.length === 0) return;

        try {
            let audioFile: File | null = null;
            let subtitleFile: File | null = null;

            for (const file of Array.from(inputFiles)) {
                const ext = file.name.split('.').pop()?.toLowerCase();
                if (['mp3', 'mp4', 'm4a', 'wav', 'ogg'].includes(ext || '')) {
                    audioFile = file;
                } else if (ext === 'srt') {
                    subtitleFile = file;
                }
            }

            if (!audioFile) {
                warn('[LocalFiles] No audio file selected');
                return;
            }

            // Store audio in IndexedDB
            const audioId = await DB.addAudio(audioFile, audioFile.name);

            // Store subtitle if provided
            let subtitleId: string | null = null;
            if (subtitleFile) {
                const content = await subtitleFile.text();
                subtitleId = await DB.addSubtitle(content, subtitleFile.name);
            }

            // Create session
            const sessionId = `local_${Date.now()}`;
            await DB.createSession(sessionId, {
                audioId,
                subtitleId,
                audioFilename: audioFile.name,
                subtitleFilename: subtitleFile?.name || '',
            });

            // Refresh list
            await loadFiles();

            // Reset input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            logError('[LocalFiles] Upload failed:', error);
            toast.errorKey('toastUploadFailed');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="localfiles-backdrop">
            <div
                ref={modalRef}
                className="localfiles-modal panel-surface"
                role="dialog"
                aria-modal="true"
                aria-labelledby="localfiles-modal-title"
                onClick={e => e.stopPropagation()}
            >
                <div className="localfiles-nav-row">
                    <span id="localfiles-modal-title" className="localfiles-title">{t('navLocalFiles')}</span>
                    <span style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                        {files.length} items • {formatFileSize(totalSize)}
                    </span>
                    <button type="button" className="localfiles-close" onClick={onClose} aria-label={t('ariaClose')}>
                        <span className="localfiles-nav-icon mask-icon icon-close" />
                    </button>
                </div>

                <div className="localfiles-actions">
                    <button type="button" className="localfiles-upload-btn" onClick={handleUpload}>
                        {t('localFilesUpload')}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".mp3,.mp4,.m4a,.wav,.ogg,.srt"
                        multiple
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />
                </div>

                <div className="localfiles-content">
                    {loading ? (
                        <div className="localfiles-empty">{t('localFilesLoading')}</div>
                    ) : files.length === 0 ? (
                        <div className="localfiles-empty">{t('localFilesNoFiles')}</div>
                    ) : (
                        <div className="localfiles-list">
                            {files.map(file => (
                                <div key={file.session.id} className="localfiles-item">
                                    <button type="button" className="localfiles-item-main" onClick={() => handlePlay(file)}>
                                        <div className="localfiles-item-icon">
                                            <span className="mask-icon icon-audio" />
                                        </div>
                                        <div className="localfiles-item-info">
                                            <div className="localfiles-item-title">
                                                {file.session.audioFilename || t('untitled')}
                                            </div>
                                            <div className="localfiles-item-meta">
                                                {formatDuration(file.session.duration)} •
                                                {file.audio ? formatFileSize(file.audio.size) : '--'} •
                                                {formatTimestamp(file.session.lastOpenedAt)}
                                            </div>
                                            {file.session.progress > 0 && file.session.duration > 0 && (
                                                <div className="localfiles-item-progress">
                                                    <div
                                                        className="localfiles-item-progress-bar"
                                                        style={{ width: `${(file.session.progress / file.session.duration) * 100}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        className="localfiles-item-delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(file);
                                        }}
                                        aria-label={t('ariaDelete')}
                                    >
                                        <span className="mask-icon icon-delete" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
