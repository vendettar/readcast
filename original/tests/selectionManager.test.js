/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import SelectionManager from '../scripts/modules/selectionManager.js';

describe('SelectionManager isLookupEligibleWord (stopwords)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
    });

    it('blocks common English stopwords', () => {
        const manager = new SelectionManager(() => '');
        expect(manager.isLookupEligibleWord('the')).toBe(false);
        expect(manager.isLookupEligibleWord('and')).toBe(false);
        expect(manager.isLookupEligibleWord('I')).toBe(false);
    });

    it('allows non-stopword words that match the lookup pattern', () => {
        const manager = new SelectionManager(() => '');
        expect(manager.isLookupEligibleWord('apartment')).toBe(true);
        expect(manager.isLookupEligibleWord("don't")).toBe(true);
    });
});

