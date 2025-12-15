export default class SelectionManager {
    constructor(tCallback) {
        this.t = tCallback;
        this.contextMenu = null;
        this.contextCopyText = '';
        this.isMouseDown = false;
        this.overlayContainer = null;
        this.rafId = null;
        this.setupContextMenu();
        this.createOverlayContainer();
    }

    createOverlayContainer() {
        this.overlayContainer = document.createElement('div');
        this.overlayContainer.className = 'readcast-selection-overlay';
        document.body.appendChild(this.overlayContainer);
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
        copyWordButton.addEventListener('click', () => this.copyContextText(false));

        const copyLineButton = document.createElement('button');
        copyLineButton.type = 'button';
        copyLineButton.className = 'context-menu-item copy-line';
        copyLineButton.dataset.i18n = 'contextCopyLine';
        copyLineButton.textContent = this.t('contextCopyLine');
        copyLineButton.addEventListener('click', () => this.copyContextText(true));

        const searchWebButton = document.createElement('button');
        searchWebButton.type = 'button';
        searchWebButton.className = 'context-menu-item search-web';
        searchWebButton.dataset.i18n = 'contextSearchWeb';
        searchWebButton.textContent = this.t('contextSearchWeb');
        searchWebButton.addEventListener('click', () => this.searchWeb());

        menu.appendChild(copyWordButton);
        menu.appendChild(copyLineButton);
        menu.appendChild(searchWebButton);
        document.body.appendChild(menu);
        this.contextMenu = menu;

        document.addEventListener('mousedown', (event) => {
            if (!this.contextMenu || this.contextMenu.hasAttribute('hidden')) return;
            if (event.target && this.contextMenu.contains(event.target)) return;
            this.hideContextMenu();
        });
        window.addEventListener('scroll', () => {
            this.hideContextMenu();
            this.clearDragOverlay();
        }, { passive: true });
        window.addEventListener('resize', () => {
            this.hideContextMenu();
            this.clearDragOverlay();
        });
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
        }
    }

    handleSelectionEvent(event, textEl) {
        if (event.type === 'mousedown') {
            this.isMouseDown = true;
            this.clearCustomHighlight();
            this.clearDragOverlay();
        } else if (event.type === 'mousemove') {
            if (this.isMouseDown) {
                // Throttle with RAF
                if (this.rafId) cancelAnimationFrame(this.rafId);
                document.body.classList.add('state-selecting'); // Re-added
                this.rafId = requestAnimationFrame(() => this.updateDragOverlay(textEl));
            }
        } else if (event.type === 'mouseup') {
            this.isMouseDown = false;
            if (this.rafId) cancelAnimationFrame(this.rafId);
            
            // Wait for native selection to finalize
            setTimeout(() => {
        this.clearDragOverlay();

        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            this.contextCopyText = selection.toString().trim();
            
            // Use the first line's rect for positioning
            const rects = range.getClientRects();
            const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
            
            // Persist the visual highlight
            this.convertSelectionToHighlight();
            
            // Show menu near the selection
            this.showContextMenu(rect);
        }
                document.body.classList.remove('state-selecting'); // Remove class only after transition is complete
            }, 0);
        } else if (event.type === 'dblclick') {
            this.handleDoubleClick(event, textEl);
        } else if (event.type === 'contextmenu') {
            this.handleContextMenu(event, textEl);
        }
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

        const rects = range.getClientRects();
        this.overlayContainer.innerHTML = '';
        
        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i];
            const div = document.createElement('div');
            div.className = 'readcast-overlay-rect';
            div.style.left = `${rect.left}px`;
            div.style.top = `${rect.top}px`;
            div.style.width = `${rect.width}px`;
            div.style.height = `${rect.height}px`;

            if (i === 0) div.classList.add('start');
            if (i === rects.length - 1) div.classList.add('end');

            this.overlayContainer.appendChild(div);
        }
    }

    clearDragOverlay() {
        if (this.overlayContainer) {
            this.overlayContainer.innerHTML = '';
        }
    }

    handleDoubleClick(event, textEl) {
        const target = event.target && event.target.nodeType === Node.TEXT_NODE ? event.target.parentElement : event.target;
        if (!textEl.contains(target)) return;

        this.selectWordAtPoint(textEl, event.clientX, event.clientY); // Precisely select the word

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            this.hideContextMenu();
            return;
        }
        const range = selection.getRangeAt(0);

        const textToCopy = this.getContextCopyText(textEl, event);
        if (!textToCopy) {
            this.hideContextMenu();
            return;
        }
        this.contextCopyText = textToCopy;
        
        // Use the first line's rect for positioning
        const rects = range.getClientRects();
        const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
        
        this.convertSelectionToHighlight();
        this.showContextMenu(rect);
    }

    handleContextMenu(event, textEl) {
        const target = event.target && event.target.nodeType === Node.TEXT_NODE ? event.target.parentElement : event.target;
        const isInText = target && textEl.contains(target);
        event.preventDefault();

        if (isInText) {
            const selection = window.getSelection ? window.getSelection() : null;
            const hasExistingSelection =
                selection &&
                !selection.isCollapsed &&
                selection.rangeCount > 0 &&
                textEl.contains(selection.getRangeAt(0).commonAncestorContainer);
            
            if (!hasExistingSelection) {
                this.selectWordAtPoint(textEl, event.clientX, event.clientY);
            }
            const textToCopy = this.getContextCopyText(textEl, event);
            if (!textToCopy) {
                this.hideContextMenu();
                return;
            }
            this.contextCopyText = textToCopy;
            this.convertSelectionToHighlight();
            
            const range = selection.getRangeAt(0);
            const rects = range.getClientRects();
            const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
            
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
        
        // Temporarily show (invisible) to calculate dimensions
        menu.style.visibility = 'hidden';
        menu.removeAttribute('hidden');

        menu.querySelectorAll('.context-menu-item').forEach((btn) => {
            if (mode === 'word') {
                btn.classList.toggle('hidden', btn.classList.contains('copy-line'));
            } else if (mode === 'line') {
                btn.classList.toggle('hidden', btn.classList.contains('copy-word'));
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

    hideContextMenu() {
        if (!this.contextMenu) return;
        this.contextMenu.setAttribute('hidden', 'true');
        this.contextCopyText = '';
        this.clearCustomHighlight();
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

    highlightRange(range) {
        if (!range) return;
        try {
            const span = document.createElement('span');
            span.className = 'readcast-highlight';
            range.surroundContents(span);
        } catch {
            // Ignore range errors (e.g. crossing block boundaries)
        }
    }

    clearCustomHighlight() {
        const highlights = document.querySelectorAll('.readcast-highlight');
        highlights.forEach((span) => {
            const parent = span.parentNode;
            if (!parent) return;
            while (span.firstChild) {
                parent.insertBefore(span.firstChild, span);
            }
            parent.removeChild(span);
            parent.normalize();
        });
    }

    convertSelectionToHighlight() {
        const selection = window.getSelection ? window.getSelection() : null;
        if (!selection || selection.rangeCount === 0) return;
        
        if (selection.isCollapsed) {
            this.clearCustomHighlight();
            return;
        }

        const range = selection.getRangeAt(0);
        this.clearCustomHighlight();
        this.highlightRange(range);
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

        const isWordChar = (char) => /[A-Za-z0-9'’]/.test(char);
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
