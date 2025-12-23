// src/components/Toast/ToastContainer.tsx
import { useState, useEffect, useCallback } from 'react';
import { toast } from '../../libs/toast';
import type { TranslationKey } from '../../libs/translations';
import { useI18n } from '../../hooks/useI18n';
import './Toast.css';

interface ToastItem {
    id: string;
    message?: string;
    messageKey?: TranslationKey;
    type: 'error' | 'success' | 'info';
}

export function ToastContainer() {
    const { t: translate } = useI18n();
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    useEffect(() => {
        return toast.subscribe(({ message, messageKey, type, duration = 3000 }) => {
            const id = Math.random().toString(36).slice(2, 9);
            setToasts(prev => [...prev, { id, message, messageKey, type }]);

            setTimeout(() => {
                removeToast(id);
            }, duration);
        });
    }, [removeToast]);

    if (toasts.length === 0) return null;

    return (
        <div className="toast-container" aria-live="polite">
            {toasts.map(toastItem => (
                <div key={toastItem.id} className={`toast-item is-${toastItem.type}`}>
                    <span className="toast-message">
                        {toastItem.messageKey ? translate(toastItem.messageKey) : (toastItem.message || '')}
                    </span>
                </div>
            ))}
        </div>
    );
}
