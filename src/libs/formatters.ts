// src/libs/formatters.ts
// Pure formatting utilities - fully testable without dependencies

/**
 * Format file size in bytes to human-readable string
 */
export function formatFileSize(bytes: number): string {
    if (!isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Format timestamp to human-readable date string
 */
export function formatTimestamp(timestamp: number, locale?: string): string {
    if (!isFinite(timestamp) || timestamp <= 0) return 'Invalid date';

    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid date';

    return date.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Format duration in seconds to MM:SS format
 */
export function formatDuration(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0 || isNaN(seconds)) return '--:--';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format time in seconds to M:SS format (for playback time labels)
 */
export function formatTimeLabel(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format number with thousand separators
 */
export function formatNumber(num: number, locale?: string): string {
    if (!isFinite(num)) return '0';
    return num.toLocaleString(locale);
}
