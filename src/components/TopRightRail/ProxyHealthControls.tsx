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
        const env = (typeof window !== 'undefined' && window.__READIO_ENV__) || {};
        return Boolean(String(env.READIO_CORS_PROXY_URL || '').trim());
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
        <div className="p-3 border-b border-border">
            <div className="font-semibold text-sm mb-2">
                {t('proxyTitle')}
            </div>
            <div className="grid gap-1.5 text-[0.8125rem] text-muted-foreground">
                {showAdvanced && (
                    <div>
                        {t('proxyUrlLabel')}: <span className="text-foreground">{proxyUrl}</span>
                    </div>
                )}
                {showAdvanced && (
                    <div>
                        {t('proxyModeLabel')}: <span className="text-foreground">{modeLabel}</span>
                    </div>
                )}
                {statusLine && (
                    <div className={result?.ok ? 'text-green-600' : 'text-red-600'}>
                        {statusLine}
                    </div>
                )}
            </div>
            <div className="mt-2.5 flex gap-2">
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
