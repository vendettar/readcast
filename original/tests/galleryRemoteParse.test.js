/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { parseRss } from '../scripts/modules/galleryRemote.js';

describe('parseRss (description sanitization)', () => {
    it('strips HTML tags from item description and preserves readable text', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Test</title>
    <description><![CDATA[<p>Hello <strong>world</strong>.</p>]]></description>
    <item>
      <title>Ep 1</title>
      <guid>1</guid>
      <pubDate>Tue, 01 Jan 2024 12:00:00 GMT</pubDate>
      <enclosure url="https://example.com/a.mp3" length="1" type="audio/mpeg" />
      <description><![CDATA[
        <p>Line 1</p><p>Line <a href="https://x">2</a></p>
        <ul><li>Item A</li><li>Item B</li></ul>
      ]]></description>
    </item>
  </channel>
</rss>`;

        const result = parseRss(xml);
        expect(result.description).toBe('Hello world.');
        expect(result.episodes[0].description).toContain('Line 1');
        expect(result.episodes[0].description).toContain('Line 2');
        expect(result.episodes[0].description).toContain('• Item A');
        expect(result.episodes[0].description).toContain('• Item B');
        expect(result.episodes[0].description).not.toMatch(/<\s*\/?\s*p\b/i);
        expect(result.episodes[0].description).not.toMatch(/<\s*\/?\s*a\b/i);
        expect(result.episodes[0].description).not.toMatch(/<\s*\/?\s*ul\b/i);
        expect(result.episodes[0].description).not.toMatch(/<\s*\/?\s*li\b/i);
    });
});

