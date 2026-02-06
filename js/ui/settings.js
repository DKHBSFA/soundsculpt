/**
 * Settings Modal - Configuration UI for SoundSculpt
 */

import { eventBus, Events } from '../event-bus.js';
import { draftManager } from '../draft-manager.js';

const SETTINGS_KEY = 'soundsculpt:settings';

// Autosave interval options
const AUTOSAVE_INTERVALS = [
  { label: '10 seconds', value: 10000 },
  { label: '30 seconds', value: 30000 },
  { label: '1 minute', value: 60000 },
  { label: '5 minutes', value: 300000 },
];

class SettingsModal {
  constructor() {
    this.modalEl = null;
    this.isOpen = false;
  }

  /**
   * Initialize the settings modal
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
    this.modalEl.className = 'modal settings-modal hidden';
    this.modalEl.id = 'settings-modal';

    const settings = this.getSettings();

    this.modalEl.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2>Settings</h2>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <section class="settings-section">
            <h3>Autosave</h3>
            <div class="setting-row">
              <label class="setting-label">
                <span>Enable autosave</span>
                <input type="checkbox" id="setting-autosave-enabled" ${settings.autosaveEnabled ? 'checked' : ''}>
              </label>
            </div>
            <div class="setting-row">
              <label class="setting-label">
                <span>Autosave interval</span>
                <select id="setting-autosave-interval">
                  ${AUTOSAVE_INTERVALS.map(opt => `
                    <option value="${opt.value}" ${settings.autosaveInterval === opt.value ? 'selected' : ''}>
                      ${opt.label}
                    </option>
                  `).join('')}
                </select>
              </label>
            </div>
          </section>

          <section class="settings-section">
            <h3>Appearance</h3>
            <div class="setting-row">
              <label class="setting-label">
                <span>Theme</span>
                <select id="setting-theme">
                  <option value="system" ${settings.theme === 'system' ? 'selected' : ''}>System</option>
                  <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Light</option>
                  <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
                </select>
              </label>
            </div>
          </section>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="settings-save">Save</button>
          <button class="btn btn-secondary" id="settings-cancel">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modalEl);
  }

  /**
   * Get current settings
   */
  getSettings() {
    const draftSettings = draftManager.getSettings();
    const savedTheme = localStorage.getItem('soundsculpt-theme') || 'system';

    return {
      autosaveEnabled: draftSettings.autosaveEnabled,
      autosaveInterval: draftSettings.autosaveInterval,
      theme: savedTheme,
    };
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Close button
    this.modalEl.querySelector('.modal-close').addEventListener('click', () => this.hide());

    // Backdrop click
    this.modalEl.querySelector('.modal-backdrop').addEventListener('click', () => this.hide());

    // Cancel button
    this.modalEl.querySelector('#settings-cancel').addEventListener('click', () => this.hide());

    // Save button
    this.modalEl.querySelector('#settings-save').addEventListener('click', () => this.save());

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.hide();
      }
    });
  }

  /**
   * Show the modal
   */
  show() {
    // Update form values to current settings
    const settings = this.getSettings();

    this.modalEl.querySelector('#setting-autosave-enabled').checked = settings.autosaveEnabled;
    this.modalEl.querySelector('#setting-autosave-interval').value = settings.autosaveInterval;
    this.modalEl.querySelector('#setting-theme').value = settings.theme;

    this.modalEl.classList.remove('hidden');
    this.isOpen = true;
  }

  /**
   * Hide the modal
   */
  hide() {
    this.modalEl.classList.add('hidden');
    this.isOpen = false;
  }

  /**
   * Save settings
   */
  save() {
    const autosaveEnabled = this.modalEl.querySelector('#setting-autosave-enabled').checked;
    const autosaveInterval = parseInt(this.modalEl.querySelector('#setting-autosave-interval').value, 10);
    const theme = this.modalEl.querySelector('#setting-theme').value;

    // Apply autosave settings
    draftManager.setAutoSaveEnabled(autosaveEnabled);
    draftManager.setAutoSaveInterval(autosaveInterval);

    // Apply theme
    this.applyTheme(theme);
    localStorage.setItem('soundsculpt-theme', theme);

    // Show confirmation
    eventBus.emit(Events.TOAST_SHOW, { message: 'Settings saved', type: 'success' });

    this.hide();
  }

  /**
   * Apply theme to document
   */
  applyTheme(theme) {
    if (theme === 'system') {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', systemPrefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }
}

// Singleton instance
export const settingsModal = new SettingsModal();
