const STATE_LABELS = {
    default: 'copyLine',
    success: 'copySuccess',
    error: 'copyFail'
};

const DEFAULT_FEEDBACK_DELAY = 1500;

export function createCopyButton(text, { t, feedbackDelay = DEFAULT_FEEDBACK_DELAY } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'subtitle-copy-btn';
    button.dataset.copyState = 'default';
    button.setAttribute('aria-label', resolveLabel('default', t));

    const icon = document.createElement('span');
    icon.className = 'subtitle-copy-icon mask-icon icon-copy';
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);

    button.addEventListener('click', (event) => {
        event.stopPropagation();
        copySubtitleText(text)
            .then(() => setCopyButtonState(button, 'success', t, feedbackDelay))
            .catch(() => setCopyButtonState(button, 'error', t, feedbackDelay));
    });

    return button;
}

export function refreshCopyButtonLabels(t) {
    if (typeof t !== 'function') return;
    document.querySelectorAll('.subtitle-copy-btn').forEach((button) => {
        const state = button.dataset.copyState || 'default';
        button.setAttribute('aria-label', resolveLabel(state, t));
    });
}

function setCopyButtonState(button, state, t, feedbackDelay) {
    button.dataset.copyState = state;
    button.classList.toggle('copied', state === 'success');
    button.classList.toggle('copy-error', state === 'error');
    button.setAttribute('aria-label', resolveLabel(state, t));

    const iconEl = button.querySelector('.subtitle-copy-icon');
    if (iconEl) {
        iconEl.classList.remove('icon-copy', 'icon-check', 'icon-error');
        iconEl.classList.add(state === 'success' ? 'icon-check' : state === 'error' ? 'icon-error' : 'icon-copy');
    }

    if (state !== 'default') {
        setTimeout(() => {
            button.classList.remove('copy-error');
            setCopyButtonState(button, 'default', t, feedbackDelay);
        }, feedbackDelay);
    }
}

function resolveLabel(state, t) {
    const labelKey = STATE_LABELS[state] || STATE_LABELS.default;
    return typeof t === 'function' ? t(labelKey) : labelKey;
}

function copySubtitleText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(() => {
            if (attemptLegacyCopy(text)) {
                return Promise.resolve();
            }
            return Promise.reject(new Error('copy-failed'));
        });
    }

    return attemptLegacyCopy(text) ? Promise.resolve() : Promise.reject(new Error('copy-failed'));
}

function attemptLegacyCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let success = false;
    try {
        success = document.execCommand('copy');
    } catch {
        success = false;
    }
    document.body.removeChild(textarea);
    return success;
}
