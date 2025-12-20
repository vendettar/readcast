import { escapeHtml } from './domUtils.js';
import LocalFilesStore from './localFilesStore.js';

export default class LocalFileView {
  constructor({ t, onPlayLocalSession, onRequestUpload, getLocalSessions, onDeleteSession }) {
    this.t = typeof t === 'function' ? t : (key) => key;
    this.tg = (key) => this.t(key) || key;
    this.onPlayLocalSession = onPlayLocalSession;
    this.onRequestUpload = onRequestUpload;
    this.onDeleteSession = onDeleteSession;
    this.store = new LocalFilesStore({ getLocalSessions });
    this.container = null;
    this.visible = false;
    this.loadedOnce = false;
    this.coverUrls = [];
  }

  async load() {
    await this.store.load();
    this.loadedOnce = true;
    if (this.visible) this.render();
  }

  notifyCreated(session) {
    this.store.notifyCreated(session);
    if (this.visible) this.render();
  }

  mount(container) {
    this.container = container;
  }

  revokeCoverUrls() {
      this.coverUrls.forEach(url => URL.revokeObjectURL(url));
      this.coverUrls = [];
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    if (!this.visible) {
        // Optional: revoke when hidden to save memory, but reloading might be needed if shown again without re-render.
        // For simplicity, we keep them until next render or destroy.
        return; 
    }

    if (!this.loadedOnce && !this.store.loading) {
      void this.load();
      this.render();
      return;
    }

    this.render();
  }

  formatSize(bytes) {
      if (!bytes) return '0 MB';
      const mb = bytes / (1024 * 1024);
      return `${mb.toFixed(1)} MB`;
  }

  render() {
    if (!this.container || !this.visible) return;
    
    // Cleanup old URLs
    this.revokeCoverUrls();

    if (this.store.loading) {
      this.container.innerHTML = `<div class="localfiles-empty">${escapeHtml(
        this.t('localFilesLoading') || 'Loading…'
      )}</div>`;
      return;
    }

    const sessions = this.store.getPlayableSessions();
    const totalBytes = sessions.reduce((acc, s) => acc + (s.audioSize || 0) + (s.subtitleSize || 0), 0);
    const totalSizeStr = this.formatSize(totalBytes);
    const countStr = `${sessions.length} ${sessions.length === 1 ? 'item' : 'items'}`;

    const uploadButton = `
            <div class="localfiles-actions">
                <div class="localfiles-stats">
                    ${escapeHtml(countStr)} • ${escapeHtml(totalSizeStr)}
                </div>
                <button type="button" class="localfiles-upload-btn">${escapeHtml(
                  this.tg('localFilesUpload')
                )}</button>
            </div>
        `;

    if (sessions.length === 0) {
      this.container.innerHTML = `${uploadButton}<div class="localfiles-empty">${escapeHtml(
        this.tg('localFilesNoFiles')
      )}</div>`;
      const btn = this.container.querySelector('.localfiles-upload-btn');
      if (btn)
        btn.addEventListener(
          'click',
          () => this.onRequestUpload && this.onRequestUpload()
        );
      return;
    }

    const cards = sessions
      .map((session) => {
        const rawTitle = session.title || session.audioName || session.id;
        const rawMeta =
          session.audioName && session.audioName !== rawTitle
            ? session.audioName
            : '';
        const title = escapeHtml(rawTitle);
        const meta = escapeHtml(rawMeta);
        const sizeStr = this.formatSize((session.audioSize || 0) + (session.subtitleSize || 0));
        
        let coverHtml = `<div class="localfiles-art placeholder"></div>`;
        if (session.cover) {
            const url = URL.createObjectURL(session.cover);
            this.coverUrls.push(url);
            coverHtml = `<img class="localfiles-art" src="${escapeHtml(url)}" alt="" />`;
        }
        
        return `
          <div class="localfiles-card-wrapper">
            <button type="button" class="localfiles-card" data-session="${encodeURIComponent(
                session.id
            )}">
                ${coverHtml}
                <div class="localfiles-meta">
                <div class="localfiles-name">${title}</div>
                <div class="localfiles-author">${meta} <span class="localfiles-size-badge">${sizeStr}</span></div>
                </div>
            </button>
            <button type="button" class="localfiles-delete-btn" aria-label="Delete" data-session="${encodeURIComponent(session.id)}">
                <span class="mask-icon icon-close" aria-hidden="true"></span>
            </button>
          </div>
        `;
      })
      .join('');

    this.container.innerHTML = `${uploadButton}<div class="localfiles-grid">${cards}</div>`;

    const uploadEl = this.container.querySelector('.localfiles-upload-btn');
    if (uploadEl)
      uploadEl.addEventListener(
        'click',
        () => this.onRequestUpload && this.onRequestUpload()
      );

    const playButtons = Array.from(
      this.container.querySelectorAll('.localfiles-card')
    );
    playButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const sessionId = decodeURIComponent(btn.dataset.session || '');
        if (!sessionId) return;
        if (this.onPlayLocalSession) {
          this.onPlayLocalSession(sessionId);
        }
      });
    });

    const deleteButtons = Array.from(
        this.container.querySelectorAll('.localfiles-delete-btn')
    );
    deleteButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sessionId = decodeURIComponent(btn.dataset.session || '');
            if (!sessionId) return;
            if (confirm('Delete this session and its files?')) {
                if (this.onDeleteSession) {
                    this.onDeleteSession(sessionId).then(() => {
                        this.load(); // Reload list after delete
                    });
                }
            }
        });
    });
  }
}
