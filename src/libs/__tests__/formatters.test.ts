// src/libs/__tests__/formatters.test.ts
import { describe, it, expect } from 'vitest';
import {
    formatFileSize,
    formatTimestamp,
    formatDuration,
    formatTimeLabel,
    formatNumber,
} from '../formatters';

describe('formatters - pure functions', () => {
    describe('formatFileSize', () => {
        it('should format bytes correctly', () => {
            expect(formatFileSize(0)).toBe('0 B');
            expect(formatFileSize(500)).toBe('500 B');
            expect(formatFileSize(1023)).toBe('1023 B');
        });

        it('should format kilobytes correctly', () => {
            expect(formatFileSize(1024)).toBe('1.0 KB');
            expect(formatFileSize(1536)).toBe('1.5 KB');
            expect(formatFileSize(1024 * 1023)).toBe('1023.0 KB');
        });

        it('should format megabytes correctly', () => {
            expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
            expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
            expect(formatFileSize(1024 * 1024 * 100)).toBe('100.0 MB');
        });

        it('should handle edge cases', () => {
            expect(formatFileSize(-100)).toBe('0 B');
            expect(formatFileSize(NaN)).toBe('0 B');
            expect(formatFileSize(Infinity)).toBe('0 B');
        });
    });

    describe('formatTimestamp', () => {
        it('should format valid timestamps', () => {
            const result = formatTimestamp(1640000000000, 'en-US'); // 2021-12-20
            expect(result).toMatch(/Dec/);
            expect(result).toMatch(/20/);
        });

        it('should handle invalid timestamps', () => {
            expect(formatTimestamp(0)).toBe('Invalid date');
            expect(formatTimestamp(-1)).toBe('Invalid date');
            expect(formatTimestamp(NaN)).toBe('Invalid date');
            expect(formatTimestamp(Infinity)).toBe('Invalid date');
        });

        it('should respect locale parameter', () => {
            const timestamp = 1640000000000;
            const enResult = formatTimestamp(timestamp, 'en-US');
            const result = formatTimestamp(timestamp);
            expect(typeof enResult).toBe('string');
            expect(typeof result).toBe('string');
        });
    });

    describe('formatDuration', () => {
        it('should format seconds correctly', () => {
            expect(formatDuration(0)).toBe('0:00');
            expect(formatDuration(30)).toBe('0:30');
            expect(formatDuration(59)).toBe('0:59');
        });

        it('should format minutes correctly', () => {
            expect(formatDuration(60)).toBe('1:00');
            expect(formatDuration(90)).toBe('1:30');
            expect(formatDuration(3599)).toBe('59:59');
        });

        it('should format hours correctly', () => {
            expect(formatDuration(3600)).toBe('60:00');
            expect(formatDuration(3661)).toBe('61:01');
            expect(formatDuration(7200)).toBe('120:00');
        });

        it('should handle edge cases', () => {
            expect(formatDuration(NaN)).toBe('--:--');
            expect(formatDuration(-10)).toBe('--:--');
            expect(formatDuration(Infinity)).toBe('--:--');
        });

        it('should pad seconds with zero', () => {
            expect(formatDuration(65)).toBe('1:05');
            expect(formatDuration(3605)).toBe('60:05');
        });
    });

    describe('formatTimeLabel', () => {
        it('should format valid times', () => {
            expect(formatTimeLabel(0)).toBe('0:00');
            expect(formatTimeLabel(45)).toBe('0:45');
            expect(formatTimeLabel(60)).toBe('1:00');
            expect(formatTimeLabel(125)).toBe('2:05');
        });

        it('should handle edge cases', () => {
            expect(formatTimeLabel(-5)).toBe('0:00');
            expect(formatTimeLabel(NaN)).toBe('0:00');
            expect(formatTimeLabel(Infinity)).toBe('0:00');
        });

        it('should match formatDuration for valid input', () => {
            const time = 125;
            expect(formatTimeLabel(time)).toBe(formatDuration(time));
        });
    });

    describe('formatNumber', () => {
        it('should format numbers with separators', () => {
            expect(formatNumber(1000)).toMatch(/1[,\s]000/);
            expect(formatNumber(1000000)).toMatch(/1[,\s]000[,\s]000/);
        });

        it('should handle edge cases', () => {
            expect(formatNumber(0)).toBe('0');
            expect(formatNumber(NaN)).toBe('0');
            expect(formatNumber(Infinity)).toBe('0');
        });

        it('should handle negative numbers', () => {
            const result = formatNumber(-1000);
            expect(result).toMatch(/-1[,\s]000/);
        });
    });
});
