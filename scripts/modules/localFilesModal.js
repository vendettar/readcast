import { escapeHtml } from './domUtils.js';
import LocalFileView from './localFileView.js';
import { lockBodyScroll, unlockBodyScroll } from './bodyScrollLock.js';
import {
  createModalInputLock,
  DEFAULT_MODAL_BLOCKED_KEY_CODES,
  DEFAULT_MODAL_BLOCKED_KEYS,
} from './modalInputLock.js';

export default class LocalFilesModal {
  constructor({ t, onPlayLocalSession, getLocalSessions, onRequestUpload } = {}) {
    this.t = typeof t === 'function' ? t : (key) => key;
    this.onPlayLocalSession =
      typeof onPlayLocalSession === 'function' ? onPlayLocalSession : null;
    this.getLocalSessions =
      typeof getLocalSessions === 'function' ? getLocalSessions : async () => [];
    this.onRequestUpload =
      typeof onRequestUpload === 'function' ? onRequestUpload : null;

    this.view = new LocalFileView({
      t: this.t,
      onPlayLocalSession: (id) => this.onPlayLocalSession && this.onPlayLocalSession(id),
      onRequestUpload: () => this.onRequestUpload && this.onRequestUpload(),
      getLocalSessions: () => this.getLocalSessions(),
    });

    this.backdrop = null;
    this.modal = null;
    this.contentEl = null;
    this.titleEl = null;

    this.modalScrollLock = null;
    this.modalInputLock = createModalInputLock({
      isOpen: () => this.isOpen(),
      getContainer: () => this.modal,
      onRequestClose: () => this.close(),
      onActivate: () => this.lockPageScroll(),
      onDeactivate: () => this.unlockPageScroll(),
      trapTab: true,
      blockCtrlZoomKeys: true,
      blockedKeyCodes: DEFAULT_MODAL_BLOCKED_KEY_CODES,
      blockedKeys: DEFAULT_MODAL_BLOCKED_KEYS,
      preventGestureStart: true,
    });
  }

  isOpen() {
    return Boolean(this.modal && !this.modal.hasAttribute('hidden'));
  }

  init() {
    if (this.modal) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'localfiles-backdrop';
    backdrop.setAttribute('hidden', 'true');
    backdrop.addEventListener('click', (event) => {
      if (event && event.cancelable) event.preventDefault();
      if (event) event.stopPropagation();
    });
    document.body.appendChild(backdrop);
    this.backdrop = backdrop;

    const modal = document.createElement('div');
    modal.className = 'localfiles-modal panel-surface';
    modal.setAttribute('hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    modal.innerHTML = `
      <div class="localfiles-nav-row">
        <div class="localfiles-title">${escapeHtml(
          this.t('navLocalFiles') || 'Local Files'
        )}</div>
        <button type="button" class="localfiles-close" aria-label="Close">
          <span class="mask-icon localfiles-nav-icon icon-close" aria-hidden="true"></span>
        </button>
      </div>
      <div class="localfiles-content"></div>
    `;
    backdrop.appendChild(modal);
    this.modal = modal;
    this.contentEl = modal.querySelector('.localfiles-content');
    this.titleEl = modal.querySelector('.localfiles-title');

    this.view.mount(this.contentEl);

    const closeBtn = modal.querySelector('.localfiles-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
  }

  lockPageScroll() {
    if (this.modalScrollLock) return;
    this.modalScrollLock = lockBodyScroll({
      bodyClass: 'localfiles-modal-open',
    });
  }

  unlockPageScroll() {
    if (!this.modalScrollLock) return;
    const lock = this.modalScrollLock;
    this.modalScrollLock = null;
    unlockBodyScroll(lock);
  }

  activateModalLock() {
    this.modalInputLock.activate();
  }

  deactivateModalLock() {
    this.modalInputLock.deactivate();
  }

  open() {
    this.init();
    if (this.backdrop) this.backdrop.removeAttribute('hidden');
    if (this.modal) this.modal.removeAttribute('hidden');
    this.activateModalLock();
    this.view.setVisible(true);
  }

  close() {
    this.deactivateModalLock();
    this.view.setVisible(false);
    if (this.backdrop) this.backdrop.setAttribute('hidden', 'true');
    if (this.modal) this.modal.setAttribute('hidden', 'true');
  }

  notifyLocalSessionCreated(session) {
    this.view.notifyCreated(session);
  }
}
