const DEFAULT_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const DEFAULT_MODAL_BLOCKED_KEY_CODES = new Set([
  'Space',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);
export const DEFAULT_MODAL_BLOCKED_KEYS = new Set([' ', 'Spacebar']);

function isTextInputTarget(target) {
  const tag = target && target.tagName ? target.tagName.toUpperCase() : '';
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    Boolean(target && target.isContentEditable)
  );
}

function isSelectTarget(target) {
  const tag = target && target.tagName ? target.tagName.toUpperCase() : '';
  return tag === 'SELECT';
}

function isButtonLikeTarget(target) {
  const tag = target && target.tagName ? target.tagName.toUpperCase() : '';
  return tag === 'BUTTON' || tag === 'A';
}

function getFocusableElements(container) {
  if (!container) return [];
  const focusables = Array.from(
    container.querySelectorAll(DEFAULT_FOCUSABLE_SELECTOR)
  );
  return focusables.filter((el) => el && typeof el.focus === 'function');
}

function focusFirstElement(container) {
  const focusables = getFocusableElements(container);
  const first = focusables[0] || container;
  if (!first || !first.focus) return;
  try {
    first.focus({ preventScroll: true });
  } catch {
    first.focus();
  }
}

function isCtrlZoomKey(event) {
  const key = event.key;
  const code = event.code;
  return (
    key === '=' ||
    key === '+' ||
    key === '-' ||
    key === '0' ||
    code === 'NumpadAdd' ||
    code === 'NumpadSubtract' ||
    code === 'Numpad0'
  );
}

export function createModalInputLock({
  isOpen,
  getContainer,
  onRequestClose,
  onActivate,
  onDeactivate,
  trapTab = true,
  blockCtrlZoomKeys = true,
  blockedKeyCodes,
  blockedKeys,
  preventGestureStart = false,
} = {}) {
  const isOpenFn = typeof isOpen === 'function' ? isOpen : () => false;
  const getContainerFn =
    typeof getContainer === 'function' ? getContainer : () => null;
  const requestCloseFn =
    typeof onRequestClose === 'function' ? onRequestClose : null;
  const onActivateFn = typeof onActivate === 'function' ? onActivate : null;
  const onDeactivateFn =
    typeof onDeactivate === 'function' ? onDeactivate : null;

  const blockedCodesSet =
    blockedKeyCodes instanceof Set ? blockedKeyCodes : null;
  const blockedKeysSet = blockedKeys instanceof Set ? blockedKeys : null;

  let active = false;
  let previousFocus = null;

  let keydownHandler = null;
  let focusInHandler = null;
  let wheelHandler = null;
  let touchMoveHandler = null;
  let gestureHandler = null;

  const containsTarget = (target) => {
    const container = getContainerFn();
    if (!container) return false;
    return Boolean(target && container.contains(target));
  };

  const activate = () => {
    if (active) return;
    if (!isOpenFn()) return;
    const container = getContainerFn();
    if (!container) return;

    active = true;
    previousFocus = document.activeElement;
    if (onActivateFn) onActivateFn();

    keydownHandler = (event) => {
      if (!isOpenFn()) return;

      const target = event.target;
      const code = event.code;
      const key = event.key;

      if (key === 'Escape' || code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (requestCloseFn) requestCloseFn();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && blockCtrlZoomKeys) {
        if (isCtrlZoomKey(event)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }

      if (trapTab && code === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();

        const currentContainer = getContainerFn();
        const focusables = getFocusableElements(currentContainer);
        if (focusables.length === 0) return;

        const current = document.activeElement;
        const currentIndex = focusables.indexOf(current);
        const delta = event.shiftKey ? -1 : 1;
        const nextIndex =
          currentIndex === -1
            ? 0
            : (currentIndex + delta + focusables.length) % focusables.length;
        const next = focusables[nextIndex];
        if (!next) return;
        try {
          next.focus({ preventScroll: true });
        } catch {
          next.focus();
        }
        return;
      }

      if (isTextInputTarget(target)) return;

      const matchesBlockedCode = Boolean(blockedCodesSet && blockedCodesSet.has(code));
      const matchesBlockedKey = Boolean(blockedKeysSet && blockedKeysSet.has(key));
      if (!matchesBlockedCode && !matchesBlockedKey) return;

      event.stopImmediatePropagation();
      if (isButtonLikeTarget(target) || isSelectTarget(target)) return;
      event.preventDefault();
    };

    focusInHandler = (event) => {
      if (!isOpenFn()) return;
      const target = event.target;
      if (containsTarget(target)) return;
      focusFirstElement(getContainerFn());
    };

    wheelHandler = (event) => {
      if (!isOpenFn()) return;
      const target = event.target;
      if ((event.ctrlKey || event.metaKey) && event.cancelable) {
        event.preventDefault();
      }
      if (containsTarget(target)) {
        event.stopPropagation();
        return;
      }
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };

    touchMoveHandler = (event) => {
      if (!isOpenFn()) return;
      const target = event.target;
      if (containsTarget(target)) {
        event.stopPropagation();
        return;
      }
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };

    if (preventGestureStart) {
      gestureHandler = (event) => {
        if (!isOpenFn()) return;
        if (event.cancelable) event.preventDefault();
      };
    }

    document.addEventListener('keydown', keydownHandler, true);
    document.addEventListener('focusin', focusInHandler, true);
    document.addEventListener('wheel', wheelHandler, {
      capture: true,
      passive: false,
    });
    document.addEventListener('touchmove', touchMoveHandler, {
      capture: true,
      passive: false,
    });
    if (gestureHandler) {
      document.addEventListener('gesturestart', gestureHandler, {
        capture: true,
        passive: false,
      });
    }

    focusFirstElement(container);
  };

  const deactivate = () => {
    if (!active) return;
    active = false;

    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler, true);
      keydownHandler = null;
    }
    if (focusInHandler) {
      document.removeEventListener('focusin', focusInHandler, true);
      focusInHandler = null;
    }
    if (wheelHandler) {
      document.removeEventListener('wheel', wheelHandler, { capture: true });
      wheelHandler = null;
    }
    if (touchMoveHandler) {
      document.removeEventListener('touchmove', touchMoveHandler, {
        capture: true,
      });
      touchMoveHandler = null;
    }
    if (gestureHandler) {
      document.removeEventListener('gesturestart', gestureHandler, {
        capture: true,
      });
      gestureHandler = null;
    }

    if (onDeactivateFn) onDeactivateFn();

    const previous = previousFocus;
    previousFocus = null;
    if (!previous || !previous.focus) return;
    try {
      previous.focus({ preventScroll: true });
    } catch {
      previous.focus();
    }
  };

  const isActive = () => active;

  return { activate, deactivate, isActive };
}
