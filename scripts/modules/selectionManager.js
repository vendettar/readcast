const FREE_DICT_API_BASE_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const LOOKUP_WORD_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[’'-][A-Za-z0-9]+)*$/;
const SUBTITLE_WORD_PATTERN = /[A-Za-z][A-Za-z0-9]*(?:[’'-][A-Za-z0-9]+)*/g;
const DICT_CACHE_STORAGE_KEY = 'readcastDictCache';
const DICT_CACHE_VERSION = 1;
const DICT_CACHE_MAX_ENTRIES = 500;
const SINGLE_CLICK_LOOKUP_DELAY_MS = 240;

export default class SelectionManager {
    constructor(tCallback) {
        this.t = tCallback;
        this.contextMenu = null;
        this.contextCopyText = '';
        this.contextAnchorRect = null;
        this.isMouseDown = false;
        this.overlayContainer = null;
        this.rafId = null;
        this.wordHoverOverlayContainer = null;
        this.wordHoverRectPool = [];
        this.wordHoverRafId = null;
        this.wordHoverPending = null;
        this.wordHoverLastKey = '';
        this.wordHoverLocked = false;
        this.wordHoverLockPointer = null;
        this.wordHoverMeasureCtx = null;
        this.wordHoverVerticalShiftCache = new Map();
        this.lookupBackdrop = null;
        this.lookupPopover = null;
        this.lookupAbortController = null;
        this.lookupAnchorRect = null;
        this.lookupTitleEl = null;
        this.lookupBodyEl = null;
        this.lookupModalActive = false;
        this.lookupScrollLock = null;
        this.lookupPreviousFocus = null;
        this.lookupKeydownHandler = null;
        this.lookupFocusInHandler = null;
        this.lookupWheelHandler = null;
        this.lookupTouchMoveHandler = null;
        this.clickLookupTimer = null;
        this.pendingClickLookup = null;
        this.suppressedClickLookup = null;
        this.dictCache = new Map();
        this.loadDictCache();
        this.setupContextMenu();
        this.createOverlayContainer();
        this.createWordHoverOverlayContainer();
        this.setupLookupPopover();
    }

    createOverlayContainer() {
        this.overlayContainer = document.createElement('div');
        this.overlayContainer.className = 'readcast-selection-overlay';
        document.body.appendChild(this.overlayContainer);
    }

    createWordHoverOverlayContainer() {
        this.wordHoverOverlayContainer = document.createElement('div');
        this.wordHoverOverlayContainer.className = 'readcast-word-hover-overlay';
        this.wordHoverOverlayContainer.setAttribute('hidden', 'true');
        document.body.appendChild(this.wordHoverOverlayContainer);
    }

    cancelWordHoverUpdate() {
        if (this.wordHoverRafId) {
            cancelAnimationFrame(this.wordHoverRafId);
            this.wordHoverRafId = null;
        }
        this.wordHoverPending = null;
    }

    hideWordHoverOverlay() {
        this.wordHoverLocked = false;
        this.wordHoverLastKey = '';
        if (!this.wordHoverOverlayContainer) return;
        this.wordHoverOverlayContainer.setAttribute('hidden', 'true');
    }

    renderWordHoverRects(rects, { pressed = false } = {}) {
        const container = this.wordHoverOverlayContainer;
        if (!container) return;

        if (!rects || rects.length === 0) {
            this.hideWordHoverOverlay();
            return;
        }

        container.removeAttribute('hidden');
        for (let i = 0; i < rects.length; i += 1) {
            const rect = rects[i];
            let rectEl = this.wordHoverRectPool[i];
            if (!rectEl) {
                rectEl = document.createElement('div');
                rectEl.className = 'readcast-word-hover-rect';
                this.wordHoverRectPool[i] = rectEl;
                container.appendChild(rectEl);
            } else if (!rectEl.parentNode) {
                container.appendChild(rectEl);
            }

            rectEl.classList.toggle('is-pressed', pressed);
            rectEl.style.left = `${rect.left}px`;
            rectEl.style.top = `${rect.top}px`;
            rectEl.style.width = `${rect.width}px`;
            rectEl.style.height = `${rect.height}px`;
            rectEl.style.display = '';
        }

        for (let i = rects.length; i < this.wordHoverRectPool.length; i += 1) {
            const rectEl = this.wordHoverRectPool[i];
            if (rectEl) rectEl.style.display = 'none';
        }
    }

    mergeClientRectsByLine(rectList) {
        const rects = Array.from(rectList || [])
            .filter((rect) => rect && rect.width > 0 && rect.height > 0 && Number.isFinite(rect.left) && Number.isFinite(rect.top))
            .map((rect) => ({
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                centerY: rect.top + rect.height / 2
            }))
            .sort((a, b) => a.centerY - b.centerY || a.left - b.left);

        const merged = [];
        const lineEpsilon = 1;
        const overlapEpsilon = 1;
        for (let i = 0; i < rects.length; i += 1) {
            const rect = rects[i];
            const last = merged[merged.length - 1];
            if (last && Math.abs(rect.centerY - last.centerY) <= lineEpsilon && rect.left <= last.right + overlapEpsilon) {
                last.right = Math.max(last.right, rect.right);
                last.left = Math.min(last.left, rect.left);
                last.top = Math.min(last.top, rect.top);
                last.bottom = Math.max(last.bottom, rect.bottom);
                last.width = last.right - last.left;
                last.height = last.bottom - last.top;
                last.centerY = last.top + last.height / 2;
            } else {
                merged.push({ ...rect });
            }
        }
        return merged;
    }

    markSuppressedClickLookup(event) {
        if (!event) return;
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        this.suppressedClickLookup = { at: now, x: event.clientX, y: event.clientY };
    }

    consumeSuppressedClickLookup(event) {
        const marker = this.suppressedClickLookup;
        if (!marker || !event) return false;
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        if (now - marker.at > 1500) {
            this.suppressedClickLookup = null;
            return false;
        }
        const dx = Math.abs((event.clientX ?? 0) - (marker.x ?? 0));
        const dy = Math.abs((event.clientY ?? 0) - (marker.y ?? 0));
        if (dx <= 2 && dy <= 2) {
            this.suppressedClickLookup = null;
            return true;
        }
        return false;
    }

    clearNativeSelection() {
        const selection = window.getSelection ? window.getSelection() : null;
        if (!selection || selection.isCollapsed) return;
        try {
            selection.removeAllRanges();
        } catch {
            // ignore
        }
    }

    lockWordHoverFromRange(wordRange, textEl, { pressed = true } = {}) {
        if (!wordRange || !textEl) return false;
        const word = wordRange.toString().trim();
        if (!this.isLookupEligibleWord(word)) return false;

        const fontSourceEl =
            wordRange.startContainer && wordRange.startContainer.parentElement ? wordRange.startContainer.parentElement : textEl;
        const paddingX = 2;
        const paddingY = 2;
        const shiftY = this.getWordHoverVerticalShift(fontSourceEl);

        const rects = Array.from(wordRange.getClientRects());
        const hitRects = rects.length > 0 ? rects : [wordRange.getBoundingClientRect()];
        const hoverRects = hitRects
            .filter((rect) => rect && rect.width > 0 && rect.height > 0 && Number.isFinite(rect.left) && Number.isFinite(rect.top))
            .map((rect) => ({
                left: rect.left - paddingX,
                top: rect.top - paddingY + shiftY,
                width: rect.width + paddingX * 2,
                height: rect.height + paddingY * 2
            }));

        if (hoverRects.length === 0) return false;

        this.wordHoverLocked = true;
        this.wordHoverLastKey = `${word.toLowerCase()}@locked`;
        this.renderWordHoverRects(hoverRects, { pressed });
        return true;
    }

    getWordHoverMeasureContext() {
        if (this.wordHoverMeasureCtx) return this.wordHoverMeasureCtx;
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext && canvas.getContext('2d');
            if (!ctx) return null;
            this.wordHoverMeasureCtx = ctx;
            return ctx;
        } catch {
            return null;
        }
    }

    getWordHoverFontKey(fontSourceEl) {
        if (!fontSourceEl || !window.getComputedStyle) return '';
        const style = window.getComputedStyle(fontSourceEl);
        const fontStyle = style.fontStyle || 'normal';
        const fontWeight = style.fontWeight || 'normal';
        const fontSize = style.fontSize || '16px';
        const fontFamily = style.fontFamily || 'sans-serif';
        return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
    }

    getWordHoverVerticalShift(fontSourceEl) {
        const fontKey = this.getWordHoverFontKey(fontSourceEl);
        if (!fontKey) return 0;
        const cached = this.wordHoverVerticalShiftCache.get(fontKey);
        if (typeof cached === 'number') return cached;

        const ctx = this.getWordHoverMeasureContext();
        if (!ctx || typeof ctx.measureText !== 'function') {
            this.wordHoverVerticalShiftCache.set(fontKey, 0);
            return 0;
        }

        const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

        try {
            ctx.font = fontKey;

            const referenceMetrics = ctx.measureText('ifhpyg');
            const referenceAscent = referenceMetrics.actualBoundingBoxAscent;
            const referenceDescent = referenceMetrics.actualBoundingBoxDescent;

            let fontAscent = referenceMetrics.fontBoundingBoxAscent;
            let fontDescent = referenceMetrics.fontBoundingBoxDescent;
            if (!Number.isFinite(fontAscent) || !Number.isFinite(fontDescent)) {
                const approxFontMetrics = ctx.measureText('Hgjpqy');
                fontAscent = approxFontMetrics.actualBoundingBoxAscent;
                fontDescent = approxFontMetrics.actualBoundingBoxDescent;
            }

            if (
                !Number.isFinite(fontAscent) ||
                !Number.isFinite(fontDescent) ||
                !Number.isFinite(referenceAscent) ||
                !Number.isFinite(referenceDescent)
            ) {
                this.wordHoverVerticalShiftCache.set(fontKey, 0);
                return 0;
            }

            const shift = clamp((fontAscent - fontDescent + (referenceDescent - referenceAscent)) / 2, -3, 3);
            if (this.wordHoverVerticalShiftCache.size > 50) this.wordHoverVerticalShiftCache.clear();
            this.wordHoverVerticalShiftCache.set(fontKey, shift);
            return shift;
        } catch {
            this.wordHoverVerticalShiftCache.set(fontKey, 0);
            return 0;
        }
    }

    scheduleWordHoverUpdate(event, textEl) {
        if (!event || !textEl) return;
        if (this.isMouseDown) return;
        if (this.wordHoverLocked) return;
        if (this.lookupPopover && !this.lookupPopover.hasAttribute('hidden')) {
            return;
        }
        if (this.contextMenu && !this.contextMenu.hasAttribute('hidden')) {
            this.hideWordHoverOverlay();
            return;
        }

        const rawTarget = event.target || null;
        const target = rawTarget && rawTarget.nodeType === Node.TEXT_NODE ? rawTarget.parentElement : rawTarget;
        if (target && !textEl.contains(target)) {
            this.hideWordHoverOverlay();
            return;
        }

        this.wordHoverPending = { textEl, clientX: event.clientX, clientY: event.clientY };
        if (this.wordHoverRafId) return;

        this.wordHoverRafId = requestAnimationFrame(() => {
            this.wordHoverRafId = null;
            const pending = this.wordHoverPending;
            this.wordHoverPending = null;
            if (!pending) return;
            this.updateWordHoverOverlay(pending.textEl, pending.clientX, pending.clientY);
        });
    }

    updateWordHoverOverlay(textEl, clientX, clientY) {
        if (!textEl || this.isMouseDown) {
            this.hideWordHoverOverlay();
            return;
        }
        if (this.wordHoverLocked) return;
        if (this.lookupPopover && !this.lookupPopover.hasAttribute('hidden')) {
            return;
        }
        if (this.contextMenu && !this.contextMenu.hasAttribute('hidden')) {
            this.hideWordHoverOverlay();
            return;
        }

        const selection = window.getSelection ? window.getSelection() : null;
        if (selection && !selection.isCollapsed) {
            this.hideWordHoverOverlay();
            return;
        }

        const wordRange = this.findWordRangeAtPoint(textEl, clientX, clientY);
        if (!wordRange) {
            this.hideWordHoverOverlay();
            return;
        }

        const word = wordRange.toString().trim();
        if (!this.isLookupEligibleWord(word)) {
            this.hideWordHoverOverlay();
            return;
        }

        const fontSourceEl =
            wordRange.startContainer && wordRange.startContainer.parentElement ? wordRange.startContainer.parentElement : textEl;
        const paddingX = 2;
        const paddingY = 2;
        const shiftY = this.getWordHoverVerticalShift(fontSourceEl);

        const rects = Array.from(wordRange.getClientRects());
        if (rects.length === 0) rects.push(wordRange.getBoundingClientRect());

        const expanded = rects
            .filter((rect) => rect && rect.width > 0 && rect.height > 0 && Number.isFinite(rect.left) && Number.isFinite(rect.top))
            .map((rect) => ({
                left: rect.left - paddingX,
                top: rect.top - paddingY + shiftY,
                width: rect.width + paddingX * 2,
                height: rect.height + paddingY * 2
            }));

        if (expanded.length === 0) {
            this.hideWordHoverOverlay();
            return;
        }

        const hit = expanded.some(
            (rect) =>
                rect &&
                Number.isFinite(rect.left) &&
                clientX >= rect.left &&
                clientX <= rect.left + rect.width &&
                clientY >= rect.top &&
                clientY <= rect.top + rect.height
        );
        if (!hit) {
            this.hideWordHoverOverlay();
            return;
        }

        const rectKey = expanded
            .map((rect) => `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`)
            .join('|');
        const stateKey = `${word.toLowerCase()}@${rectKey}`;
        if (stateKey === this.wordHoverLastKey) return;
        this.wordHoverLastKey = stateKey;

        this.renderWordHoverRects(expanded, { pressed: false });
    }

    setupContextMenu() {
        const menu = document.createElement('div');
        menu.className = 'context-menu panel-surface';
        menu.setAttribute('hidden', 'true');

        const copyWordButton = document.createElement('button');
        copyWordButton.type = 'button';
        copyWordButton.className = 'context-menu-item copy-word';
        copyWordButton.dataset.i18n = 'contextCopy';
        copyWordButton.textContent = this.t('contextCopy');
        copyWordButton.addEventListener('click', () => this.copyContextText());

        const copyLineButton = document.createElement('button');
        copyLineButton.type = 'button';
        copyLineButton.className = 'context-menu-item copy-line';
        copyLineButton.dataset.i18n = 'contextCopyLine';
        copyLineButton.textContent = this.t('contextCopyLine');
        copyLineButton.addEventListener('click', () => this.copyContextText());

        const searchWebButton = document.createElement('button');
        searchWebButton.type = 'button';
        searchWebButton.className = 'context-menu-item search-web';
        searchWebButton.dataset.i18n = 'contextSearchWeb';
        searchWebButton.textContent = this.t('contextSearchWeb');
        searchWebButton.addEventListener('click', () => this.searchWeb());

        const lookupButton = document.createElement('button');
        lookupButton.type = 'button';
        lookupButton.className = 'context-menu-item lookup-word';
        lookupButton.dataset.i18n = 'contextLookup';
        lookupButton.textContent = this.t('contextLookup');
        lookupButton.addEventListener('click', () => this.lookupDictionary());

        menu.appendChild(copyWordButton);
        menu.appendChild(copyLineButton);
        menu.appendChild(searchWebButton);
        menu.appendChild(lookupButton);
        document.body.appendChild(menu);
        this.contextMenu = menu;

        document.addEventListener(
            'mousedown',
            (event) => {
                if (!this.contextMenu || this.contextMenu.hasAttribute('hidden')) return;
                if (event.target && this.contextMenu.contains(event.target)) return;
                this.hideContextMenu();
                this.markSuppressedClickLookup(event);
                if (event.cancelable) event.preventDefault();
                event.stopPropagation();
            },
            true
        );
        window.addEventListener('scroll', () => {
            this.hideContextMenu();
            this.hideWordHoverOverlay();
            this.clearDragOverlay();
        }, { passive: true });
        window.addEventListener('resize', () => {
            this.hideContextMenu();
            this.hideLookupPopover();
            this.hideWordHoverOverlay();
            this.clearDragOverlay();
        });
    }

    setupLookupPopover() {
        const backdrop = document.createElement('div');
        backdrop.className = 'lookup-backdrop';
        backdrop.setAttribute('hidden', 'true');
        document.body.appendChild(backdrop);
        this.lookupBackdrop = backdrop;

        const popover = document.createElement('div');
        popover.className = 'lookup-popover panel-surface';
        popover.setAttribute('hidden', 'true');
        popover.dataset.placement = 'right';
        popover.tabIndex = -1;
        popover.innerHTML = `
            <div class="lookup-header">
                <div class="lookup-title"></div>
            </div>
            <div class="lookup-body"></div>
        `;
        document.body.appendChild(popover);
        this.lookupPopover = popover;
        this.lookupTitleEl = popover.querySelector('.lookup-title');
        this.lookupBodyEl = popover.querySelector('.lookup-body');
        if (this.lookupBodyEl) this.lookupBodyEl.tabIndex = 0;

        document.addEventListener(
            'mousedown',
            (event) => {
                if (!this.lookupPopover || this.lookupPopover.hasAttribute('hidden')) return;
                if (event.target && this.lookupPopover.contains(event.target)) return;

                this.hideLookupPopover();

                this.markSuppressedClickLookup(event);
                if (event.cancelable) event.preventDefault();
                event.stopPropagation();
            },
            true
        );
    }

    isLookupModalOpen() {
        return Boolean(this.lookupModalActive && this.lookupPopover && !this.lookupPopover.hasAttribute('hidden'));
    }

    updateTranslations(t) {
        this.t = t;
        if (this.contextMenu) {
            const btnWord = this.contextMenu.querySelector('[data-i18n="contextCopy"]');
            if (btnWord) btnWord.textContent = this.t('contextCopy');
            const btnLine = this.contextMenu.querySelector('[data-i18n="contextCopyLine"]');
            if (btnLine) btnLine.textContent = this.t('contextCopyLine');
            const btnSearch = this.contextMenu.querySelector('[data-i18n="contextSearchWeb"]');
            if (btnSearch) btnSearch.textContent = this.t('contextSearchWeb');
            const btnLookup = this.contextMenu.querySelector('[data-i18n="contextLookup"]');
            if (btnLookup) btnLookup.textContent = this.t('contextLookup');
        }
    }

    handleSelectionEvent(event, textEl) {
        if (event.type === 'mousedown') {
            this.isMouseDown = true;
            this.cancelPendingClickLookup();
            this.cancelWordHoverUpdate();
            this.wordHoverLockPointer = null;
            if (event.button === 0 && textEl && !this.isLookupModalOpen()) {
                const selection = window.getSelection ? window.getSelection() : null;
                if (!selection || selection.isCollapsed) {
                    const wordRange = this.findWordRangeAtPoint(textEl, event.clientX, event.clientY);
                    if (wordRange && this.lockWordHoverFromRange(wordRange, textEl, { pressed: true })) {
                        this.wordHoverLockPointer = { x: event.clientX, y: event.clientY };
                    } else {
                        this.hideWordHoverOverlay();
                    }
                } else {
                    this.hideWordHoverOverlay();
                }
            } else {
                this.hideWordHoverOverlay();
            }
            this.clearDragOverlay();
        } else if (event.type === 'mousemove') {
            if (this.isMouseDown) {
                if (this.wordHoverLocked && this.wordHoverLockPointer) {
                    const dx = event.clientX - this.wordHoverLockPointer.x;
                    const dy = event.clientY - this.wordHoverLockPointer.y;
                    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                        this.wordHoverLockPointer = null;
                        this.hideWordHoverOverlay();
                    }
                }
                // Throttle with RAF
                if (this.rafId) cancelAnimationFrame(this.rafId);
                document.body.classList.add('state-selecting'); // Re-added
                this.rafId = requestAnimationFrame(() => this.updateDragOverlay(textEl));
            } else {
                this.scheduleWordHoverUpdate(event, textEl);
            }
        } else if (event.type === 'mouseleave') {
            this.cancelWordHoverUpdate();
            if (!this.wordHoverLocked) this.hideWordHoverOverlay();
        } else if (event.type === 'mouseup') {
            this.isMouseDown = false;
            if (this.rafId) cancelAnimationFrame(this.rafId);
            this.wordHoverLockPointer = null;
            
            // Wait for native selection to finalize
            setTimeout(() => {
                let selectionHandled = false;
                const clickCount = typeof event.detail === 'number' ? event.detail : 1;
                if (clickCount > 1) {
                    const dblSelection = window.getSelection ? window.getSelection() : null;
                    if (dblSelection && !dblSelection.isCollapsed) {
                        dblSelection.removeAllRanges();
                    }
                }
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const selectionInText = textEl && textEl.contains(range.commonAncestorContainer);
                    const selectedText = selection.toString().trim();
                    if (selectionInText && selectedText) {
                        this.contextCopyText = selectedText;
                        
                        // Use the first line's merged rect for positioning
                        const mergedRects = this.mergeClientRectsByLine(range.getClientRects());
                        const rect = mergedRects.length > 0 ? mergedRects[0] : range.getBoundingClientRect();
                        
                        // Persist the visual highlight
                        this.convertSelectionToHighlight(textEl);
                        
                        // Show menu near the selection
                        this.showContextMenu(rect);
                        selectionHandled = true;
                    }
                }

                if (!selectionHandled && event.button === 0) {
                    this.scheduleSingleClickLookup(event, textEl);
                }
                
                document.body.classList.remove('state-selecting'); // Remove class only after transition is complete
            }, 0);
        } else if (event.type === 'contextmenu') {
            this.cancelPendingClickLookup();
            this.handleContextMenu(event, textEl);
        }
    }

    cancelPendingClickLookup() {
        if (this.clickLookupTimer) {
            clearTimeout(this.clickLookupTimer);
            this.clickLookupTimer = null;
        }
        this.pendingClickLookup = null;
    }

    scheduleSingleClickLookup(event, textEl) {
        if (!event || !textEl) return;
        if (this.consumeSuppressedClickLookup(event)) {
            this.wordHoverLocked = false;
            this.updateWordHoverOverlay(textEl, event.clientX, event.clientY);
            return;
        }
        if (this.contextMenu && !this.contextMenu.hasAttribute('hidden')) return;
        if (this.lookupPopover && !this.lookupPopover.hasAttribute('hidden')) return;

        const selection = window.getSelection ? window.getSelection() : null;
        if (selection && !selection.isCollapsed) return;

        const wordRange = this.findWordRangeAtPoint(textEl, event.clientX, event.clientY);
        if (!wordRange) return;
        const word = wordRange.toString().trim();
        if (!this.isLookupEligibleWord(word)) return;

        const fontSourceEl =
            wordRange.startContainer && wordRange.startContainer.parentElement ? wordRange.startContainer.parentElement : textEl;
        const paddingX = 2;
        const paddingY = 2;
        const shiftY = this.getWordHoverVerticalShift(fontSourceEl);

        const rects = Array.from(wordRange.getClientRects());
        const hitRects = rects.length > 0 ? rects : [wordRange.getBoundingClientRect()];
        const hitRect =
            hitRects.find(
                (rectObj) =>
                    rectObj &&
                    Number.isFinite(rectObj.left) &&
                    event.clientX >= rectObj.left - paddingX &&
                    event.clientX <= rectObj.right + paddingX &&
                    event.clientY >= rectObj.top - paddingY + shiftY &&
                    event.clientY <= rectObj.bottom + paddingY + shiftY
            ) || null;
        if (!hitRect) return;

        const anchorRect = {
            left: hitRect.left,
            right: hitRect.right,
            top: hitRect.top + shiftY,
            bottom: hitRect.bottom + shiftY,
            width: hitRect.width,
            height: hitRect.height
        };

        const hoverRects = hitRects
            .filter((rect) => rect && rect.width > 0 && rect.height > 0 && Number.isFinite(rect.left) && Number.isFinite(rect.top))
            .map((rect) => ({
                left: rect.left - paddingX,
                top: rect.top - paddingY + shiftY,
                width: rect.width + paddingX * 2,
                height: rect.height + paddingY * 2
            }));

        this.cancelPendingClickLookup();
        this.pendingClickLookup = { word, rect: anchorRect, hoverRects };

        this.clickLookupTimer = setTimeout(() => {
            this.clickLookupTimer = null;
            const pending = this.pendingClickLookup;
            this.pendingClickLookup = null;
            if (!pending) return;

            const currentSelection = window.getSelection ? window.getSelection() : null;
            if (currentSelection && !currentSelection.isCollapsed) return;

            if (pending.hoverRects && pending.hoverRects.length > 0) {
                this.wordHoverLocked = true;
                this.wordHoverLastKey = `${pending.word.toLowerCase()}@locked`;
                this.renderWordHoverRects(pending.hoverRects, { pressed: true });
            }
            this.showLookupPopover(pending.word, pending.rect);
            void this.fetchDictionaryDefinition(pending.word, pending.rect);
        }, SINGLE_CLICK_LOOKUP_DELAY_MS);
    }

    updateDragOverlay(textEl) {
        const selection = window.getSelection ? window.getSelection() : null;
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            this.clearDragOverlay();
            return;
        }

        const range = selection.getRangeAt(0);
        if (!textEl.contains(range.commonAncestorContainer)) {
             this.clearDragOverlay();
             return;
        }

        const mergedRects = this.mergeClientRectsByLine(range.getClientRects());
        const startNode = range.startContainer || null;
        const fontSourceEl =
            startNode && startNode.nodeType === Node.ELEMENT_NODE
                ? startNode
                : startNode && startNode.nodeType === Node.TEXT_NODE && startNode.parentElement
                  ? startNode.parentElement
                  : textEl;
        const shiftY = this.getWordHoverVerticalShift(fontSourceEl);
        const paddingY = 2;
        this.overlayContainer.innerHTML = '';
        
        for (let i = 0; i < mergedRects.length; i++) {
            const rect = mergedRects[i];
            const div = document.createElement('div');
            div.className = 'readcast-overlay-rect';
            div.style.left = `${rect.left}px`;
            div.style.top = `${rect.top - paddingY + shiftY}px`;
            div.style.width = `${rect.width}px`;
            div.style.height = `${rect.height + paddingY * 2}px`;

            if (i === 0) div.classList.add('start');
            if (i === mergedRects.length - 1) div.classList.add('end');

            this.overlayContainer.appendChild(div);
        }
    }

    clearDragOverlay() {
        if (this.overlayContainer) {
            this.overlayContainer.innerHTML = '';
        }
    }

    handleContextMenu(event, textEl) {
        const target = event.target && event.target.nodeType === Node.TEXT_NODE ? event.target.parentElement : event.target;
        const isInText = target && textEl.contains(target);
        event.preventDefault();

        if (isInText) {
            let selection = window.getSelection ? window.getSelection() : null;
            const hasExistingSelection =
                selection &&
                !selection.isCollapsed &&
                selection.rangeCount > 0 &&
                textEl.contains(selection.getRangeAt(0).commonAncestorContainer);
            
            if (!hasExistingSelection) {
                this.selectWordAtPoint(textEl, event.clientX, event.clientY);
                selection = window.getSelection ? window.getSelection() : null;
            }
            const textToCopy = this.getContextCopyText(textEl, event);
            if (!textToCopy) {
                this.hideContextMenu();
                return;
            }
            this.contextCopyText = textToCopy;
            this.convertSelectionToHighlight(textEl);
            
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                this.hideContextMenu();
                return;
            }

            const range = selection.getRangeAt(0);
            const mergedRects = this.mergeClientRectsByLine(range.getClientRects());
            const rect = mergedRects.length > 0 ? mergedRects[0] : range.getBoundingClientRect();
            
            this.showContextMenu(rect, { mode: 'word' });
        } else {
            const fullText = textEl.textContent ? textEl.textContent.trim() : '';
            if (!fullText) return;
            this.contextCopyText = fullText;
            
            const rects = textEl.getClientRects();
            const rect = rects.length > 0 ? rects[0] : textEl.getBoundingClientRect();
            
            this.showContextMenu(rect, { mode: 'line' });
        }
    }

    showContextMenu(rect, { mode = 'word' } = {}) {
        if (!this.contextMenu) return;
        const menu = this.contextMenu;
        this.hideWordHoverOverlay();
        this.hideLookupPopover({ clearOverlay: mode === 'line' });
        this.contextAnchorRect = rect;
        
        // Temporarily show (invisible) to calculate dimensions
        menu.style.visibility = 'hidden';
        menu.removeAttribute('hidden');

        const lookupEligible = mode === 'word' && this.isLookupEligibleWord(this.contextCopyText);
        menu.querySelectorAll('.context-menu-item').forEach((btn) => {
            const isCopyWord = btn.classList.contains('copy-word');
            const isCopyLine = btn.classList.contains('copy-line');
            const isLookup = btn.classList.contains('lookup-word');

            if (mode === 'word') {
                btn.classList.toggle('hidden', isCopyLine || (isLookup && !lookupEligible));
                return;
            }
            if (mode === 'line') {
                btn.classList.toggle('hidden', isCopyWord || isLookup);
            }
        });

        // Calculate position based on actual dimensions
        const width = menu.offsetWidth;
        const height = menu.offsetHeight;
        
        let left = rect.left + (rect.width / 2) - (width / 2);
        
        // Prevent overflowing screen edges
        if (left < 6) left = 6;
        if (left + width > window.innerWidth - 6) left = window.innerWidth - width - 6;

        menu.style.top = `${rect.top - height - 6}px`;
        menu.style.left = `${left}px`;
        
        // Make visible
        menu.style.visibility = '';
    }

    hideContextMenu({ clearOverlay = true } = {}) {
        if (!this.contextMenu) return;
        this.contextMenu.setAttribute('hidden', 'true');
        this.contextCopyText = '';
        this.contextAnchorRect = null;
        this.clearNativeSelection();
        if (clearOverlay) this.clearDragOverlay();
    }

    hideLookupPopover({ clearOverlay = true } = {}) {
        if (this.lookupAbortController) {
            this.lookupAbortController.abort();
            this.lookupAbortController = null;
        }
        this.deactivateLookupModal();
        if (!this.lookupPopover) return;
        this.lookupPopover.setAttribute('hidden', 'true');
        this.lookupAnchorRect = null;
        this.wordHoverLocked = false;
        this.clearNativeSelection();
        if (clearOverlay) this.clearDragOverlay();
    }

    loadDictCache() {
        this.dictCache.clear();
        if (typeof localStorage === 'undefined') return;
        try {
            const raw = localStorage.getItem(DICT_CACHE_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.v !== DICT_CACHE_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
                return;
            }
            Object.entries(parsed.entries).forEach(([word, entry]) => {
                if (!word || !entry || typeof entry !== 'object') return;
                const at = typeof entry.at === 'number' ? entry.at : 0;
                const value = entry.value && typeof entry.value === 'object' ? entry.value : null;
                if (!value) return;
                this.dictCache.set(word, { at, value });
            });
        } catch (error) {
            console.warn('Failed to load dict cache', error);
        }
    }

    getCachedDictionary(word) {
        const key = (word || '').trim().toLowerCase();
        if (!key) return null;
        const entry = this.dictCache.get(key);
        if (!entry || !entry.value) return null;
        return entry.value;
    }

    setCachedDictionary(word, value) {
        const key = (word || '').trim().toLowerCase();
        if (!key || !value || typeof value !== 'object') return;
        this.dictCache.set(key, { at: Date.now(), value });
        this.trimDictCache();
        this.persistDictCache();
        this.markCachedWordInTranscript(key);
    }

    trimDictCache() {
        if (this.dictCache.size <= DICT_CACHE_MAX_ENTRIES) return;
        const ordered = Array.from(this.dictCache.entries())
            .sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0))
            .map(([word]) => word);
        const excess = this.dictCache.size - DICT_CACHE_MAX_ENTRIES;
        for (let i = 0; i < excess && i < ordered.length; i += 1) {
            this.dictCache.delete(ordered[i]);
        }
    }

    isQuotaExceeded(error) {
        if (!error) return false;
        const name = error.name || '';
        const message = String(error.message || '');
        return (
            name === 'QuotaExceededError' ||
            name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            message.includes('QuotaExceededError') ||
            message.includes('quota') ||
            message.includes('QUOTA')
        );
    }

    persistDictCache() {
        if (typeof localStorage === 'undefined') return;
        if (this.dictCache.size === 0) {
            try {
                localStorage.removeItem(DICT_CACHE_STORAGE_KEY);
            } catch (error) {
                console.warn('Failed to clear dict cache', error);
            }
            return;
        }

        const makePayload = () => ({
            v: DICT_CACHE_VERSION,
            entries: Object.fromEntries(this.dictCache.entries())
        });

        let attempts = 0;
        while (attempts < 6) {
            try {
                localStorage.setItem(DICT_CACHE_STORAGE_KEY, JSON.stringify(makePayload()));
                return;
            } catch (error) {
                if (!this.isQuotaExceeded(error)) {
                    console.warn('Failed to persist dict cache', error);
                    return;
                }

                const removeCount = Math.max(10, Math.ceil(this.dictCache.size * 0.2));
                const ordered = Array.from(this.dictCache.entries())
                    .sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0))
                    .map(([word]) => word);
                for (let i = 0; i < removeCount && i < ordered.length; i += 1) {
                    this.dictCache.delete(ordered[i]);
                }
                attempts += 1;
            }
        }

        try {
            localStorage.removeItem(DICT_CACHE_STORAGE_KEY);
        } catch (error) {
            console.warn('Failed to clear dict cache', error);
        }
    }

    isLookupEligibleWord(text) {
        const value = (text || '').trim();
        if (!value) return false;
        if (value.length > 64) return false;
        return LOOKUP_WORD_PATTERN.test(value);
    }

    renderSubtitleText(textEl, rawText) {
        if (!textEl) return;
        const text = typeof rawText === 'string' ? rawText : String(rawText || '');

        if (!text) {
            textEl.textContent = '';
            return;
        }
        if (this.dictCache.size === 0) {
            textEl.textContent = text;
            return;
        }

        const fragment = document.createDocumentFragment();
        SUBTITLE_WORD_PATTERN.lastIndex = 0;
        let cursor = 0;
        let match;
        let hasKnown = false;

        while ((match = SUBTITLE_WORD_PATTERN.exec(text)) !== null) {
            const start = match.index;
            const word = match[0];
            const wordKey = word.toLowerCase();

            if (!this.dictCache.has(wordKey)) continue;
            hasKnown = true;

            if (start > cursor) {
                fragment.appendChild(document.createTextNode(text.slice(cursor, start)));
            }
            const span = document.createElement('span');
            span.className = 'subtitle-word lookup-known';
            span.dataset.word = wordKey;
            span.textContent = word;
            fragment.appendChild(span);

            cursor = start + word.length;
        }

        if (!hasKnown) {
            textEl.textContent = text;
            return;
        }

        if (cursor < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(cursor)));
        }

        textEl.innerHTML = '';
        textEl.appendChild(fragment);
    }

    markCachedWordInTranscript(wordKey) {
        const key = (wordKey || '').trim().toLowerCase();
        if (!key) return;

        document.querySelectorAll(`.subtitle-word[data-word="${key}"]`).forEach((node) => {
            node.classList.add('lookup-known');
        });

        const containsToken = (value) => {
            if (!value) return false;
            if (!value.toLowerCase().includes(key)) return false;
            SUBTITLE_WORD_PATTERN.lastIndex = 0;
            let match;
            while ((match = SUBTITLE_WORD_PATTERN.exec(value)) !== null) {
                if (match[0].toLowerCase() === key) return true;
            }
            return false;
        };

        document.querySelectorAll('.subtitle-text').forEach((textEl) => {
            if (!textEl || textEl.querySelector(`.subtitle-word[data-word="${key}"]`)) return;
            const rawText = textEl.textContent || '';
            if (!containsToken(rawText)) return;
            this.renderSubtitleText(textEl, rawText);
        });
    }

    lookupDictionary() {
        const word = (this.contextCopyText || '').trim();
        const anchorRect = this.contextAnchorRect;
        if (!this.isLookupEligibleWord(word) || !anchorRect) {
            this.hideContextMenu();
            return;
        }

        this.hideContextMenu({ clearOverlay: false });
        this.showLookupPopover(word, anchorRect);
        void this.fetchDictionaryDefinition(word, anchorRect);
    }

    showLookupPopover(word, anchorRect) {
        if (!this.lookupPopover || !this.lookupTitleEl || !this.lookupBodyEl) return;
        this.lookupAnchorRect = anchorRect;

        this.lookupTitleEl.textContent = word;
        this.lookupBodyEl.textContent = 'Loading…';

        const popover = this.lookupPopover;
        popover.style.visibility = 'hidden';
        popover.removeAttribute('hidden');
        this.positionLookupPopover(anchorRect);
        popover.style.visibility = '';
        this.activateLookupModal();
    }

    lockPageScroll() {
        if (this.lookupScrollLock) return;
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const body = document.body;
        if (!body) return;

        const previousStyles = {
            position: body.style.position,
            top: body.style.top,
            left: body.style.left,
            right: body.style.right,
            width: body.style.width,
            paddingRight: body.style.paddingRight
        };

        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        if (scrollbarWidth > 0) {
            body.style.paddingRight = `${scrollbarWidth}px`;
        }

        body.style.position = 'fixed';
        body.style.top = `-${scrollY}px`;
        body.style.left = `-${scrollX}px`;
        body.style.right = '0';
        body.style.width = '100%';
        body.classList.add('lookup-modal-open');
        this.lookupScrollLock = { scrollX, scrollY, previousStyles };
    }

    unlockPageScroll() {
        if (!this.lookupScrollLock) return;
        const { scrollX, scrollY, previousStyles } = this.lookupScrollLock;
        this.lookupScrollLock = null;
        const body = document.body;
        if (!body) return;
        body.style.position = previousStyles.position;
        body.style.top = previousStyles.top;
        body.style.left = previousStyles.left;
        body.style.right = previousStyles.right;
        body.style.width = previousStyles.width;
        body.style.paddingRight = previousStyles.paddingRight;
        body.classList.remove('lookup-modal-open');
        window.scrollTo(scrollX, scrollY);
    }

    focusLookupPopover() {
        if (!this.lookupPopover || this.lookupPopover.hasAttribute('hidden')) return;
        const target = this.lookupBodyEl || this.lookupPopover;
        if (!target || !target.focus) return;
        try {
            target.focus({ preventScroll: true });
        } catch {
            target.focus();
        }
    }

    activateLookupModal() {
        if (this.lookupModalActive) return;
        if (!this.lookupPopover || this.lookupPopover.hasAttribute('hidden')) return;

        this.lookupModalActive = true;
        this.lookupPreviousFocus = document.activeElement;

        if (this.lookupBackdrop) {
            this.lookupBackdrop.removeAttribute('hidden');
        }

        this.lockPageScroll();
        this.focusLookupPopover();

        this.lookupKeydownHandler = (event) => {
            if (!this.lookupPopover || this.lookupPopover.hasAttribute('hidden')) return;
            const key = event.key;
            const code = event.code;
            const blockCodes = new Set([
                'Space',
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'PageUp',
                'PageDown',
                'Home',
                'End'
            ]);

            if (code === 'Tab') {
                event.preventDefault();
                event.stopPropagation();
                this.focusLookupPopover();
                return;
            }

            if (blockCodes.has(code) || key === ' ' || key === 'Spacebar') {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        this.lookupFocusInHandler = (event) => {
            if (!this.lookupPopover || this.lookupPopover.hasAttribute('hidden')) return;
            const target = event.target;
            if (target && this.lookupPopover.contains(target)) return;
            this.focusLookupPopover();
        };

        this.lookupWheelHandler = (event) => {
            if (!this.lookupPopover || this.lookupPopover.hasAttribute('hidden')) return;
            const target = event.target;
            if (target && this.lookupPopover.contains(target)) return;
            if (!event.cancelable) return;
            event.preventDefault();
        };

        this.lookupTouchMoveHandler = (event) => {
            if (!this.lookupPopover || this.lookupPopover.hasAttribute('hidden')) return;
            const target = event.target;
            if (target && this.lookupPopover.contains(target)) return;
            if (!event.cancelable) return;
            event.preventDefault();
        };

        document.addEventListener('keydown', this.lookupKeydownHandler, true);
        document.addEventListener('focusin', this.lookupFocusInHandler, true);
        document.addEventListener('wheel', this.lookupWheelHandler, { capture: true, passive: false });
        document.addEventListener('touchmove', this.lookupTouchMoveHandler, { capture: true, passive: false });
    }

    deactivateLookupModal() {
        if (!this.lookupModalActive) return;
        this.lookupModalActive = false;

        if (this.lookupBackdrop) {
            this.lookupBackdrop.setAttribute('hidden', 'true');
        }

        if (this.lookupKeydownHandler) {
            document.removeEventListener('keydown', this.lookupKeydownHandler, true);
            this.lookupKeydownHandler = null;
        }
        if (this.lookupFocusInHandler) {
            document.removeEventListener('focusin', this.lookupFocusInHandler, true);
            this.lookupFocusInHandler = null;
        }
        if (this.lookupWheelHandler) {
            document.removeEventListener('wheel', this.lookupWheelHandler, { capture: true });
            this.lookupWheelHandler = null;
        }
        if (this.lookupTouchMoveHandler) {
            document.removeEventListener('touchmove', this.lookupTouchMoveHandler, { capture: true });
            this.lookupTouchMoveHandler = null;
        }

        this.unlockPageScroll();

        const previous = this.lookupPreviousFocus;
        this.lookupPreviousFocus = null;
        if (!previous || !previous.focus) return;
        try {
            previous.focus({ preventScroll: true });
        } catch {
            previous.focus();
        }
    }

    positionLookupPopover(anchorRect) {
        if (!this.lookupPopover) return;
        const popover = this.lookupPopover;

        const width = popover.offsetWidth;
        const height = popover.offsetHeight;
        const margin = 10;
        const gap = 10;

        let placement = 'right';
        let left = anchorRect.right + gap;
        if (left + width > window.innerWidth - margin) {
            const leftCandidate = anchorRect.left - width - gap;
            if (leftCandidate >= margin) {
                placement = 'left';
                left = leftCandidate;
            } else {
                left = Math.max(margin, window.innerWidth - width - margin);
            }
        }

        let top = anchorRect.top + anchorRect.height / 2 - height / 2;
        if (top < margin) top = margin;
        if (top + height > window.innerHeight - margin) top = window.innerHeight - height - margin;

        const anchorCenterY = anchorRect.top + anchorRect.height / 2;
        const minArrow = 16;
        const maxArrow = Math.max(minArrow, height - 16);
        const arrowTop = Math.min(Math.max(anchorCenterY - top, minArrow), maxArrow);

        popover.dataset.placement = placement;
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
        popover.style.setProperty('--lookup-arrow-top', `${arrowTop}px`);
    }

    async fetchDictionaryDefinition(word, anchorRect) {
        if (!this.lookupBodyEl) return;
        if (this.lookupAbortController) this.lookupAbortController.abort();
        this.lookupAbortController = new AbortController();

        try {
            const cached = this.getCachedDictionary(word);
            if (cached) {
                this.renderDictionaryResult(word, cached);
                this.positionLookupPopover(anchorRect);
                return;
            }

            const url = `${FREE_DICT_API_BASE_URL}${encodeURIComponent(word.toLowerCase())}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: this.lookupAbortController.signal
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                this.renderDictionaryError(word, data);
                this.positionLookupPopover(anchorRect);
                return;
            }

            const parsed = this.parseDictionaryApiResponse(data);
            this.setCachedDictionary(word, parsed);
            this.renderDictionaryResult(word, parsed);
            this.positionLookupPopover(anchorRect);
        } catch (error) {
            if (error && error.name === 'AbortError') return;
            this.renderDictionaryError(word);
            this.positionLookupPopover(anchorRect);
        }
    }

    parseDictionaryApiResponse(data) {
        const normalizeText = (value) => (value || '').replace(/\s+/g, ' ').trim();
        const entries = Array.isArray(data) ? data : [];
        const entry = entries[0] || {};

        const phoneticFromEntry = normalizeText(entry.phonetic);
        const phonetics = Array.isArray(entry.phonetics) ? entry.phonetics : [];
        const phoneticFromList = normalizeText(phonetics.find((p) => p && p.text)?.text);
        const phonetic = phoneticFromEntry || phoneticFromList;

        const meanings = Array.isArray(entry.meanings) ? entry.meanings : [];
        const parsedMeanings = [];
        const maxDefinitions = 6;
        let remaining = maxDefinitions;

        meanings.forEach((meaning) => {
            if (remaining <= 0) return;
            const partOfSpeech = normalizeText(meaning && meaning.partOfSpeech ? meaning.partOfSpeech : '');
            const defs = meaning && Array.isArray(meaning.definitions) ? meaning.definitions : [];

            const parsedDefinitions = [];
            defs.forEach((defObj) => {
                if (remaining <= 0) return;
                const definition = normalizeText(defObj && defObj.definition ? defObj.definition : '');
                if (!definition) return;
                const example = normalizeText(defObj && defObj.example ? defObj.example : '');
                parsedDefinitions.push({ definition, example });
                remaining -= 1;
            });

            if (parsedDefinitions.length > 0) {
                parsedMeanings.push({ partOfSpeech, definitions: parsedDefinitions });
            }
        });

        return { phonetic, meanings: parsedMeanings };
    }

    renderDictionaryResult(word, { phonetic, meanings } = {}) {
        if (!this.lookupBodyEl) return;
        const body = this.lookupBodyEl;
        body.innerHTML = '';

        const normalizedPhonetic = typeof phonetic === 'string' ? phonetic.trim() : '';
        if (normalizedPhonetic) {
            const phoneticEl = document.createElement('div');
            phoneticEl.className = 'lookup-phonetic';
            phoneticEl.textContent = normalizedPhonetic;
            body.appendChild(phoneticEl);
        }

        const normalizedMeanings = Array.isArray(meanings) ? meanings : [];
        if (normalizedMeanings.length === 0) {
            const fallbackEl = document.createElement('p');
            fallbackEl.className = 'lookup-fallback';
            fallbackEl.textContent = 'No results.';
            body.appendChild(fallbackEl);
            return;
        }

        normalizedMeanings.slice(0, 3).forEach((meaning) => {
            const partOfSpeech = meaning && meaning.partOfSpeech ? String(meaning.partOfSpeech).trim() : '';
            const defs = meaning && Array.isArray(meaning.definitions) ? meaning.definitions : [];
            if (defs.length === 0) return;

            if (partOfSpeech) {
                const posEl = document.createElement('div');
                posEl.className = 'lookup-pos';
                posEl.textContent = partOfSpeech;
                body.appendChild(posEl);
            }

            const list = document.createElement('ol');
            list.className = 'lookup-definitions';

            defs.slice(0, 3).forEach((defObj) => {
                const item = document.createElement('li');
                const defText = defObj && defObj.definition ? String(defObj.definition).trim() : '';
                const exampleText = defObj && defObj.example ? String(defObj.example).trim() : '';

                const defEl = document.createElement('div');
                defEl.textContent = defText;
                item.appendChild(defEl);

                if (exampleText) {
                    const exampleEl = document.createElement('div');
                    exampleEl.className = 'lookup-example';
                    exampleEl.textContent = exampleText;
                    item.appendChild(exampleEl);
                }
                list.appendChild(item);
            });

            body.appendChild(list);
        });
    }

    renderDictionaryError(word, errorData) {
        if (!this.lookupBodyEl) return;
        const body = this.lookupBodyEl;
        body.innerHTML = '';

        const meta = errorData && typeof errorData === 'object' ? errorData : null;
        const title = meta && meta.title ? String(meta.title).trim() : '';
        const message = meta && meta.message ? String(meta.message).trim() : '';
        const detail = document.createElement('p');
        detail.className = 'lookup-fallback';
        detail.textContent = title ? `${title}${message ? ` — ${message}` : ''}` : (message || 'Lookup failed.');
        body.appendChild(detail);
    }

    async copyContextText() {
        const text = this.contextCopyText || '';
        if (!text) {
            this.hideContextMenu();
            return;
        }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
            }
        } catch (error) {
            console.warn('Failed to copy', error);
        }
        this.hideContextMenu();
    }

    searchWeb() {
        const text = this.contextCopyText || '';
        if (!text) {
            this.hideContextMenu();
            return;
        }
        const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
        this.hideContextMenu();
    }

    convertSelectionToHighlight(textEl) {
        const selection = window.getSelection ? window.getSelection() : null;
        if (!selection || selection.rangeCount === 0) return;
        
        if (selection.isCollapsed) {
            this.clearDragOverlay();
            return;
        }

        if (textEl) {
            this.updateDragOverlay(textEl);
        }
    }

    getContextCopyText(textEl, event) {
        const selection = window.getSelection ? window.getSelection() : null;
        const isSelectionInText =
            selection &&
            !selection.isCollapsed &&
            selection.rangeCount > 0 &&
            textEl.contains(selection.getRangeAt(0).commonAncestorContainer);

        if (isSelectionInText) {
            return selection.toString().trim();
        }

        const word = this.getWordAtPoint(textEl, event.clientX, event.clientY);
        if (word) return word;

        return textEl.textContent ? textEl.textContent.trim() : '';
    }

    getWordAtPoint(textEl, clientX, clientY) {
        const wordRange = this.findWordRangeAtPoint(textEl, clientX, clientY);
        return wordRange ? wordRange.toString().trim() : '';
    }

    selectWordAtPoint(textEl, clientX, clientY) {
        const wordRange = this.findWordRangeAtPoint(textEl, clientX, clientY);
        if (!wordRange) return;

        const selection = window.getSelection ? window.getSelection() : null;
        if (!selection) return;
        selection.removeAllRanges();
        selection.addRange(wordRange);
    }

    // Shared helper for detecting word boundaries
    findWordRangeAtPoint(textEl, clientX, clientY) {
        const resolveRange = () => {
            if (document.caretRangeFromPoint) {
                return document.caretRangeFromPoint(clientX, clientY);
            }
            if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(clientX, clientY);
                if (!pos) return null;
                const range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.setEnd(pos.offsetNode, pos.offset);
                return range;
            }
            return null;
        };

        const range = resolveRange();
        if (!range) return null;
        const node = range.startContainer;
        if (!node || !textEl.contains(node) || node.nodeType !== Node.TEXT_NODE) return null;

        const text = node.textContent || '';
        let offset = range.startOffset;
        if (offset > text.length) offset = text.length;

        const isWordChar = (char) => /[A-Za-z0-9'’-]/.test(char);
        let start = offset;
        let end = offset;

        while (start > 0 && isWordChar(text[start - 1])) start -= 1;
        while (end < text.length && isWordChar(text[end])) end += 1;
        if (start === end) return null;

        const wordRange = document.createRange();
        wordRange.setStart(node, start);
        wordRange.setEnd(node, end);
        return wordRange;
    }
}
