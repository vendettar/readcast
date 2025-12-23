// scripts/modules/stateManager.js

class StateManager {
  constructor(initialState) {
    this.state = { ...initialState };
    this.listeners = new Set();
  }

  getState() {
    return { ...this.state };
  }

  updateState(partialState) {
    const oldState = this.state;
    const newState = { ...oldState, ...partialState };
    
    const changedKeys = Object.keys(partialState).filter(
      key => oldState[key] !== newState[key]
    );

    if (changedKeys.length > 0) {
      this.state = newState;
      this.notifyListeners(newState, oldState, changedKeys);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(newState, oldState, changedKeys) {
    this.listeners.forEach(listener => {
      try {
        listener(newState, oldState, changedKeys);
      } catch (error) {
        console.error('State listener error:', error);
      }
    });
  }
}

export default StateManager;
