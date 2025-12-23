import { useCallback, useMemo, useState } from 'react';
import { checkCorsProxyHealth, getCorsProxyConfig, type ProxyHealthResult } from '../../libs/fetchUtils';
import { useI18n } from '../../hooks/useI18n';

const IS_DEV = import.meta.env.DEV;

export function ProxyHealthControls() {
    const { t } = useI18n();
    const { proxyUrl, proxyPrimary } = getCorsProxyConfig();
    const [result, setResult] = useState<ProxyHealthResult | null>(null);
    const [checking, setChecking] = useState(false);

    const hasCustomProxy = useMemo(() => {
        const env = (typeof window !== 'undefined' && window.__READCAST_ENV__) || {};
        return Boolean(String(env.READCAST_CORS_PROXY_URL || '').trim());
    }, []);

    const showAdvanced = IS_DEV || hasCustomProxy;

    const modeLabel = useMemo(() => {
        return proxyPrimary ? t('proxyModeProxyFirst') : t('proxyModeDirectFirst');
    }, [proxyPrimary, t]);

    const handleCheck = useCallback(async () => {
        if (checking) return;
        setChecking(true);
        try {
            const res = await checkCorsProxyHealth();
            setResult(res);
        } finally {
            setChecking(false);
        }
    }, [checking]);

    const statusLine = useMemo(() => {
        if (!result) return null;
        if (result.ok) {
            return showAdvanced
                ? `${t('proxyOk')} · ${result.elapsedMs}ms · ${result.proxyType}`
                : `${t('proxyOk')} · ${result.elapsedMs}ms`;
        }
        if (!showAdvanced) {
            return `${t('proxyFail')}`;
        }
        const statusSuffix = typeof result.status === 'number' ? ` (HTTP ${result.status})` : '';
        return `${t('proxyFail')}: ${result.error}${statusSuffix} · ${result.elapsedMs}ms · ${result.proxyType}`;
    }, [result, t]);

    return (
        <div style={{ padding: '12px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}>
                {t('proxyTitle')}
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                {showAdvanced && (
                    <div>
                        {t('proxyUrlLabel')}: <span style={{ color: 'var(--color-text)' }}>{proxyUrl}</span>
                    </div>
                )}
                {showAdvanced && (
                    <div>
                        {t('proxyModeLabel')}: <span style={{ color: 'var(--color-text)' }}>{modeLabel}</span>
                    </div>
                )}
                {statusLine && (
                    <div style={{ color: result?.ok ? 'var(--color-success)' : 'var(--color-error)' }}>
                        {statusLine}
                    </div>
                )}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button
                    type="button"
                    className="dev-cache-btn"
                    onClick={handleCheck}
                    disabled={checking}
                    title={t('proxyTest')}
                >
                    {checking ? t('proxyTesting') : t('proxyTest')}
                </button>
            </div>
        </div>
    );
}
