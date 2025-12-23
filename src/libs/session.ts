// src/libs/session.ts
// Session ID utilities - shared across hooks and handlers

/**
 * Generate a unique session ID
 * Format: session_{timestamp}_{random7chars}
 */
export function generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
