/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import FileManager from '../scripts/modules/fileManager.js';
import { DB } from '../scripts/modules/db.js';

describe('FileManager.handleFiles upload mode', () => {
    beforeEach(async () => {
        localStorage.clear();
        await DB.open();
    });

    it('does not call onAudioLoad when loadToUi is false', async () => {
        const onAudioLoad = vi.fn();
        const fileManager = new FileManager({ onAudioLoad });
        vi.spyOn(fileManager, 'validateAudioFile').mockResolvedValue('mp3');
        vi.spyOn(fileManager, 'checkCapacity').mockResolvedValue(true);
        vi.spyOn(fileManager, 'checkMp3Header').mockResolvedValue(true);
        vi.spyOn(fileManager, 'extractCoverArt').mockResolvedValue(null);
        const mp3 = new File([new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0])], 'a.mp3', {
            type: 'audio/mpeg'
        });

        const result = await fileManager.handleFiles([mp3], { loadToUi: false });
        expect(result.createdSession).toBeTruthy();
        expect(onAudioLoad).not.toHaveBeenCalled();
    });
});
