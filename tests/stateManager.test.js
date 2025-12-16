import { describe, it, expect, vi } from 'vitest';
import StateManager from '../scripts/modules/stateManager.js';

describe('StateManager', () => {
    it('should initialize with default state', () => {
        const initialState = { count: 0 };
        const manager = new StateManager(initialState);
        expect(manager.getState()).toEqual(initialState);
    });

    it('should update state and notify listeners', () => {
        const manager = new StateManager({ count: 0, user: 'test' });
        const listener = vi.fn();
        
        manager.subscribe(listener);
        manager.updateState({ count: 1 });

        expect(manager.getState().count).toBe(1);
        expect(listener).toHaveBeenCalledTimes(1);
        
        // Check arguments passed to listener: newState, oldState, changedKeys
        const [newState, oldState, changedKeys] = listener.mock.calls[0];
        expect(newState).toEqual({ count: 1, user: 'test' });
        expect(oldState).toEqual({ count: 0, user: 'test' });
        expect(changedKeys).toEqual(['count']);
    });

    it('should not notify if state did not change', () => {
        const manager = new StateManager({ count: 1 });
        const listener = vi.fn();
        
        manager.subscribe(listener);
        manager.updateState({ count: 1 }); // No change

        expect(listener).not.toHaveBeenCalled();
    });

    it('should allow unsubscribing', () => {
        const manager = new StateManager({ count: 0 });
        const listener = vi.fn();
        
        const unsubscribe = manager.subscribe(listener);
        unsubscribe();
        
        manager.updateState({ count: 5 });
        expect(listener).not.toHaveBeenCalled();
    });

    it('should handle partial updates keeping other keys', () => {
        const manager = new StateManager({ a: 1, b: 2 });
        manager.updateState({ b: 3 });
        
        expect(manager.getState()).toEqual({ a: 1, b: 3 });
    });
});
