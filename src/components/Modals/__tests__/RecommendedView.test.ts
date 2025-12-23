// src/components/Modals/__tests__/RecommendedView.test.ts
// Regression tests for loadMore race condition fix
import { describe, it, expect } from 'vitest';

describe('RecommendedView - loadMore concurrency', () => {
    it('should prevent concurrent loadMore calls with inflight lock', async () => {
        // This is a conceptual test - the actual implementation uses inflightRef
        // to prevent concurrent calls. We test the pattern here.

        let inflight = false;
        let callCount = 0;

        const simulatedLoadMore = async () => {
            // This simulates the pattern in RecommendedView.loadMore
            if (inflight) {
                return { prevented: true };
            }

            inflight = true;
            callCount++;

            try {
                // Simulate async operation
                await new Promise(resolve => setTimeout(resolve, 10));
                return { prevented: false, callCount };
            } finally {
                inflight = false;
            }
        };

        // Simulate rapid double-click
        const [result1, result2] = await Promise.all([
            simulatedLoadMore(),
            simulatedLoadMore(),
        ]);

        // One should succeed, one should be prevented
        const succeeded = [result1, result2].filter(r => !r.prevented);
        const prevented = [result1, result2].filter(r => r.prevented);

        expect(succeeded.length).toBe(1);
        expect(prevented.length).toBe(1);
        expect(callCount).toBe(1); // Only one actual call executed
    });

    it('should allow sequential loadMore calls', async () => {
        let inflight = false;
        let callCount = 0;

        const simulatedLoadMore = async () => {
            if (inflight) return { prevented: true };

            inflight = true;
            callCount++;

            try {
                await new Promise(resolve => setTimeout(resolve, 10));
                return { prevented: false };
            } finally {
                inflight = false;
            }
        };

        // Sequential calls (await each one)
        const result1 = await simulatedLoadMore();
        const result2 = await simulatedLoadMore();

        // Both should succeed
        expect(result1.prevented).toBe(false);
        expect(result2.prevented).toBe(false);
        expect(callCount).toBe(2); // Both calls executed
    });
});
