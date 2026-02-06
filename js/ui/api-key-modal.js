/**
 * API Key Modal - OpenRouter API key management for SoundSculpt
 */

import { openRouterClient } from '../ai/openrouter-client.js';
import { eventBus } from '../event-bus.js';

class ApiKeyModal {
  constructor() {
    this.modalEl = null;
    this.isOpen = false;
    this.onSuccess = null;
  }

  /**
   * Initialize the modal
   */
  init() {
    this.createModal();
    this.setupEventListeners();
  }

  /**
   * Create the modal DOM
   */
  createModal() {
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal api-key-modal hidden';
    this.modalEl.id = 'api-key-modal';
    this.modalEl.setAttribute('role', 'dialog');
    this.modalEl.setAttribute('aria-modal', 'true');
    this.modalEl.setAttribute('aria-labelledby', 'api-key-modal-title');

    const isUsingDefault = openRouterClient.isUsingDefaultKey();

    this.modalEl.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content modal-small glass-panel">
        <div class="modal-header">
          <h2 id="api-key-modal-title">OpenRouter API Key</h2>
          <button class="modal-close btn-icon" aria-label="Close">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <p class="api-key-info">
            Get your free API key at
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/keys</a>
          </p>

          <div class="api-key-status ${isUsingDefault ? 'status-demo' : 'status-custom'}">
            <span class="status-icon">${isUsingDefault ? '🎮' : '🔑'}</span>
            <span class="status-text">
              ${isUsingDefault ? 'Using demo mode (limited)' : 'Using your own key'}
            </span>
          </div>

          <div class="api-key-input-group">
            <label for="api-key-input" class="sr-only">API Key</label>
            <input
              type="password"
              id="api-key-input"
              class="api-key-input"
              placeholder="sk-or-v1-..."
              autocomplete="off"
              spellcheck="false"
            >
            <button class="btn-icon toggle-visibility" aria-label="Toggle visibility" title="Show/hide key">
              <span class="icon-show">👁</span>
              <span class="icon-hide hidden">🙈</span>
            </button>
          </div>

          <p class="api-key-note">
            Your key is stored locally and never sent to our servers.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="api-key-save">Save Key</button>
          ${!isUsingDefault ? '<button class="btn btn-danger" id="api-key-clear">Remove Key</button>' : ''}
          <button class="btn btn-ghost" id="api-key-demo">Use Demo Mode</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Close button
    this.modalEl.querySelector('.modal-close').addEventListener('click', () => this.hide());

    // Backdrop click
    this.modalEl.querySelector('.modal-backdrop').addEventListener('click', () => this.hide());

    // Save button
    this.modalEl.querySelector('#api-key-save').addEventListener('click', () => this.saveKey());

    // Clear button (if exists)
    const clearBtn = this.modalEl.querySelector('#api-key-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearKey());
    }

    // Demo button
    this.modalEl.querySelector('#api-key-demo').addEventListener('click', () => this.useDemo());

    // Toggle visibility
    this.modalEl.querySelector('.toggle-visibility').addEventListener('click', () => this.toggleVisibility());

    // Enter key to save
    this.modalEl.querySelector('#api-key-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.saveKey();
      }
    });

    // Escape to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.hide();
      }
    });
  }

  /**
   * Toggle password visibility
   */
  toggleVisibility() {
    const input = this.modalEl.querySelector('#api-key-input');
    const showIcon = this.modalEl.querySelector('.icon-show');
    const hideIcon = this.modalEl.querySelector('.icon-hide');

    if (input.type === 'password') {
      input.type = 'text';
      showIcon.classList.add('hidden');
      hideIcon.classList.remove('hidden');
    } else {
      input.type = 'password';
      showIcon.classList.remove('hidden');
      hideIcon.classList.add('hidden');
    }
  }

  /**
   * Save the API key
   */
  saveKey() {
    const input = this.modalEl.querySelector('#api-key-input');
    const key = input.value.trim();

    if (!key) {
      this.showError('Please enter an API key');
      return;
    }

    if (!key.startsWith('sk-or-')) {
      this.showError('Invalid key format. Should start with sk-or-');
      return;
    }

    const success = openRouterClient.setUserApiKey(key);
    if (success) {
      this.showSuccess('API key saved');
      this.updateStatus();
      setTimeout(() => {
        this.hide();
        if (this.onSuccess) this.onSuccess();
      }, 1000);
    } else {
      this.showError('Failed to save key');
    }
  }

  /**
   * Clear user's API key
   */
  clearKey() {
    openRouterClient.clearUserApiKey();
    this.showSuccess('Key removed. Using demo mode.');
    this.updateStatus();
    this.modalEl.querySelector('#api-key-input').value = '';
  }

  /**
   * Use demo mode
   */
  useDemo() {
    openRouterClient.clearUserApiKey();
    this.hide();
    if (this.onSuccess) this.onSuccess();
  }

  /**
   * Update status display
   */
  updateStatus() {
    const isUsingDefault = openRouterClient.isUsingDefaultKey();
    const statusEl = this.modalEl.querySelector('.api-key-status');
    const footerEl = this.modalEl.querySelector('.modal-footer');

    statusEl.className = `api-key-status ${isUsingDefault ? 'status-demo' : 'status-custom'}`;
    statusEl.innerHTML = `
      <span class="status-icon">${isUsingDefault ? '🎮' : '🔑'}</span>
      <span class="status-text">
        ${isUsingDefault ? 'Using demo mode (limited)' : 'Using your own key'}
      </span>
    `;

    // Update footer buttons
    const clearBtn = footerEl.querySelector('#api-key-clear');
    if (!isUsingDefault && !clearBtn) {
      const saveBtn = footerEl.querySelector('#api-key-save');
      const newClearBtn = document.createElement('button');
      newClearBtn.className = 'btn btn-danger';
      newClearBtn.id = 'api-key-clear';
      newClearBtn.textContent = 'Remove Key';
      newClearBtn.addEventListener('click', () => this.clearKey());
      saveBtn.after(newClearBtn);
    } else if (isUsingDefault && clearBtn) {
      clearBtn.remove();
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    this.showMessage(message, 'error');
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    this.showMessage(message, 'success');
  }

  /**
   * Show message
   */
  showMessage(message, type) {
    // Remove existing message
    const existing = this.modalEl.querySelector('.api-key-message');
    if (existing) existing.remove();

    const msgEl = document.createElement('div');
    msgEl.className = `api-key-message message-${type}`;
    msgEl.textContent = message;

    const inputGroup = this.modalEl.querySelector('.api-key-input-group');
    inputGroup.after(msgEl);

    // Auto-remove after 3s
    setTimeout(() => msgEl.remove(), 3000);
  }

  /**
   * Show the modal
   * @param {Function} onSuccess - Callback when key is set
   */
  show(onSuccess = null) {
    this.onSuccess = onSuccess;
    this.modalEl.classList.remove('hidden');
    this.isOpen = true;
    this.modalEl.querySelector('#api-key-input').focus();
    document.body.style.overflow = 'hidden';
  }

  /**
   * Hide the modal
   */
  hide() {
    this.modalEl.classList.add('hidden');
    this.isOpen = false;
    this.modalEl.querySelector('#api-key-input').value = '';
    document.body.style.overflow = '';
  }
}

// Export singleton
export const apiKeyModal = new ApiKeyModal();
