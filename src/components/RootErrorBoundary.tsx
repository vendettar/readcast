import { useCallback, useMemo, useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { useI18n } from '../hooks/useI18n';
import { reportError } from '../libs/errorReporter';

const IS_DEV = import.meta.env.DEV;

export function RootErrorBoundary({ children }: { children: React.ReactNode }) {
    const { t } = useI18n();
    const [lastErrorText, setLastErrorText] = useState('');

    const handleReload = useCallback(() => {
        location.reload();
    }, []);

    const handleCopy = useCallback(async () => {
        if (!lastErrorText) return;
        try {
            await navigator.clipboard.writeText(lastErrorText);
        } catch {
            // ignore (clipboard may be blocked)
        }
    }, [lastErrorText]);

    const fallback = useMemo(() => {
        return ({ error, reset }: { error: Error; reset: () => void }) => {
            return (
                <div
                    className="panel-surface"
                    style={{
                        maxWidth: 720,
                        margin: '48px auto',
                        padding: 20,
                        borderRadius: 12,
                    }}
                >
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 8 }}>
                        {t('errorBoundaryTitle')}
                    </div>
                    <div style={{ color: 'var(--color-muted)', fontSize: '0.9rem', marginBottom: 12 }}>
                        {t('errorBoundaryHint')}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button type="button" className="dev-cache-btn" onClick={handleReload}>
                            {t('errorBoundaryReload')}
                        </button>
                        <button type="button" className="dev-cache-btn" onClick={reset}>
                            {t('errorBoundaryTryRecover')}
                        </button>
                    </div>

                    {/* Keep technical diagnostics out of user-facing UI in production. */}
                    {IS_DEV && (
                        <div style={{ marginTop: 12 }}>
                            <details>
                                <summary style={{ cursor: 'pointer', color: 'var(--color-muted)' }}>
                                    {t('errorBoundaryDiagnostics')}
                                </summary>
                                <div
                                    style={{
                                        marginTop: 10,
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                        fontSize: '0.8rem',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        padding: 12,
                                        borderRadius: 8,
                                        background: 'rgba(0,0,0,0.06)',
                                    }}
                                >
                                    {error.name}: {error.message}
                                </div>
                                <div style={{ marginTop: 10 }}>
                                    <button
                                        type="button"
                                        className="dev-cache-btn"
                                        onClick={handleCopy}
                                        disabled={!lastErrorText}
                                        title={t('errorBoundaryCopyHint')}
                                    >
                                        {t('errorBoundaryCopy')}
                                    </button>
                                </div>
                            </details>
                        </div>
                    )}
                </div>
            );
        };
    }, [handleCopy, handleReload, lastErrorText, t]);

    return (
        <ErrorBoundary
            fallback={fallback}
            onError={(error, info) => {
                const text = [
                    `Readcast crashed at ${new Date().toISOString()}`,
                    '',
                    `${error.name}: ${error.message}`,
                    '',
                    info.componentStack || '',
                ].join('\n');
                setLastErrorText(text);
                console.error('[ErrorBoundary]', error, info);
                // Call configured error reporter (no-op by default)
                reportError(error, info);
            }}
        >
            {children}
        </ErrorBoundary>
    );
}
