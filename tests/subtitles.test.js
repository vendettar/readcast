import { describe, it, expect } from 'vitest';
import { parseSrt, findSubtitleIndex, formatTimeLabel } from '../scripts/modules/subtitles.js';

describe('Subtitle Module', () => {
    describe('parseSrt', () => {
        it('should correctly parse valid SRT content', () => {
            const srtContent = `1
00:00:01,000 --> 00:00:04,000
Hello World

2
00:00:05,000 --> 00:00:08,000
Second Line`;

            const result = parseSrt(srtContent);
            
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                start: 1,
                end: 4,
                text: 'Hello World',
                rawStart: '00:00:01,000',
                rawEnd: '00:00:04,000'
            });
            expect(result[1].text).toBe('Second Line');
        });

        it('should handle HTML tags in subtitles', () => {
            const srtContent = `1
00:00:01,000 --> 00:00:04,000
<i>Italic</i> and <b>Bold</b>`;

            const result = parseSrt(srtContent);
            expect(result[0].text).toBe('Italic and Bold');
        });

        it('should return empty array for empty input', () => {
            expect(parseSrt('')).toEqual([]);
            expect(parseSrt(null)).toEqual([]);
        });
    });

    describe('findSubtitleIndex', () => {
        const subtitles = [
            { start: 0, end: 5 },
            { start: 5, end: 10 },
            { start: 10, end: 15 }
        ];

        it('should find correct index for a given time', () => {
            expect(findSubtitleIndex(subtitles, 2, -1)).toBe(0);
            expect(findSubtitleIndex(subtitles, 7, -1)).toBe(1);
            expect(findSubtitleIndex(subtitles, 12, -1)).toBe(2);
        });

        it('should return -1 if time is not within any subtitle', () => {
            expect(findSubtitleIndex(subtitles, 20, -1)).toBe(-1);
        });

        it('should use binary search for random access', () => {
            // Simulate a jump
            expect(findSubtitleIndex(subtitles, 12, 0)).toBe(2);
        });

        it('should optimize for sequential access (next)', () => {
            // If current is 0, and we ask for time inside 1, it should check 1 first
            expect(findSubtitleIndex(subtitles, 7, 0)).toBe(1);
        });
    });

    describe('formatTimeLabel', () => {
        it('should format time correctly removing hours if 00', () => {
            expect(formatTimeLabel('00:01:30,000')).toBe('01:30');
            expect(formatTimeLabel('00:10:05,500')).toBe('10:05');
        });

        it('should keep hours if not 00', () => {
            expect(formatTimeLabel('01:00:00,000')).toBe('01:00:00');
        });

        it('should handle missing milliseconds separator gracefully', () => {
            expect(formatTimeLabel('00:05:00')).toBe('05:00');
        });
    });
});
