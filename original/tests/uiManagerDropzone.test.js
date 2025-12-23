/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import uiManager from '../scripts/modules/uiManager.js';

describe('UIManager.updateDropZoneAvailability', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="dropZoneFloating"></div>
        `;
        uiManager.elements.dropZoneFloating = document.getElementById('dropZoneFloating');
    });

    it('hides floating dropzone for remote audio (audioLoaded + no currentMediaId)', () => {
        uiManager.updateDropZoneAvailability({ audioLoaded: true, currentMediaId: null });
        expect(uiManager.elements.dropZoneFloating.hasAttribute('hidden')).toBe(true);
    });

    it('shows floating dropzone for local audio (audioLoaded + currentMediaId)', () => {
        uiManager.updateDropZoneAvailability({ audioLoaded: true, currentMediaId: 's1' });
        expect(uiManager.elements.dropZoneFloating.hasAttribute('hidden')).toBe(false);
    });
});

