import { escapeHtml } from './domUtils.js';
import LocalFilesStore from './localFilesStore.js';

export default class LocalFileView {
  constructor({ t, onPlayLocalSession, onRequestUpload, getLocalSessions }) {
    this.t = typeof t === 'function' ? t : (key) => key;
    this.tg = (key) => this.t(key) || key;
    this.onPlayLocalSession = onPlayLocalSession;
    this.onRequestUpload = onRequestUpload;
    this.store = new LocalFilesStore({ getLocalSessions });
    this.container = null;
    this.visible = false;
    this.loadedOnce = false;
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

  setVisible(visible) {
    this.visible = Boolean(visible);
    if (!this.visible) return;

    if (!this.loadedOnce && !this.store.loading) {
      void this.load();
      this.render();
      return;
    }

    this.render();
  }

  render() {
    if (!this.container || !this.visible) return;
    if (this.store.loading) {
      this.container.innerHTML = `<div class="localfiles-empty">${escapeHtml(
        this.t('localFilesLoading') || 'Loading…'
      )}</div>`;
      return;
    }

    const sessions = this.store.getPlayableSessions();
    const uploadButton = `
            <div class="localfiles-actions">
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
        return `
          <button type="button" class="localfiles-card" data-session="${encodeURIComponent(
            session.id
          )}">
            <div class="localfiles-meta">
              <div class="localfiles-name">${title}</div>
              <div class="localfiles-author">${meta}</div>
            </div>
          </button>
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

    const buttons = Array.from(
      this.container.querySelectorAll('.localfiles-card')
    );
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const sessionId = decodeURIComponent(btn.dataset.session || '');
        if (!sessionId) return;
        if (this.onPlayLocalSession) {
          this.onPlayLocalSession(sessionId);
        }
      });
    });
  }
}
