/**
 * Draft Manager - Auto-save to localStorage for crash recovery
 */

import { eventBus, Events } from './event-bus.js';
import { state } from './state.js';

const DRAFT_KEY = 'soundsculpt:draft';
const DRAFT_TIMESTAMP_KEY = 'soundsculpt:draft:timestamp';
const SETTINGS_KEY = 'soundsculpt:settings';
const DEFAULT_AUTO_SAVE_INTERVAL = 30000; // 30 seconds

class DraftManager {
  constructor() {
    this.autoSaveTimer = null;
    this.isEnabled = true;
    this.autoSaveInterval = DEFAULT_AUTO_SAVE_INTERVAL;
    this.loadSettings();
  }

  /**
   * Load settings from localStorage
   */
  loadSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const settings = JSON.parse(saved);
        this.isEnabled = settings.autosaveEnabled ?? true;
        this.autoSaveInterval = settings.autosaveInterval ?? DEFAULT_AUTO_SAVE_INTERVAL;
      }
    } catch (e) {
      // Use defaults
    }
  }

  /**
   * Save settings to localStorage
   */
  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        autosaveEnabled: this.isEnabled,
        autosaveInterval: this.autoSaveInterval,
      }));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  /**
   * Get current settings
   */
  getSettings() {
    return {
      autosaveEnabled: this.isEnabled,
      autosaveInterval: this.autoSaveInterval,
    };
  }

  /**
   * Set autosave interval
   */
  setAutoSaveInterval(intervalMs) {
    this.autoSaveInterval = intervalMs;
    this.saveSettings();
    // Restart timer with new interval
    if (this.autoSaveTimer) {
      this.stopAutoSave();
      this.startAutoSave();
    }
  }

  /**
   * Set autosave enabled/disabled
   */
  setAutoSaveEnabled(enabled) {
    this.isEnabled = enabled;
    this.saveSettings();
    if (!enabled) {
      this.stopAutoSave();
    }
  }

  /**
   * Check if a draft exists
   */
  hasDraft() {
    try {
      return localStorage.getItem(DRAFT_KEY) !== null;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get draft data
   */
  getDraft() {
    try {
      const data = localStorage.getItem(DRAFT_KEY);
      if (!data) return null;

      const draft = JSON.parse(data);
      const timestamp = localStorage.getItem(DRAFT_TIMESTAMP_KEY);

      return {
        data: draft,
        timestamp: timestamp ? new Date(parseInt(timestamp, 10)) : null,
      };
    } catch (e) {
      console.error('Failed to read draft:', e);
      return null;
    }
  }

  /**
   * Save current state as draft
   */
  saveDraft() {
    if (!this.isEnabled) return;

    try {
      const projectData = state.getProjectData();
      localStorage.setItem(DRAFT_KEY, JSON.stringify(projectData));
      localStorage.setItem(DRAFT_TIMESTAMP_KEY, Date.now().toString());
    } catch (e) {
      console.error('Failed to save draft:', e);
      // localStorage might be full or unavailable
    }
  }

  /**
   * Clear draft
   */
  clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_TIMESTAMP_KEY);
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Recover from draft
   */
  recoverDraft() {
    const draft = this.getDraft();
    if (!draft || !draft.data) return false;

    try {
      state.loadProject(draft.data);
      this.clearDraft();
      eventBus.emit(Events.DRAFT_RECOVERED);
      eventBus.emit(Events.TOAST_SHOW, {
        message: 'Draft recovered',
        type: 'success',
      });
      return true;
    } catch (e) {
      console.error('Failed to recover draft:', e);
      return false;
    }
  }

  /**
   * Discard draft (user chose not to recover)
   */
  discardDraft() {
    this.clearDraft();
    eventBus.emit(Events.DRAFT_DISCARDED);
  }

  /**
   * Start auto-save timer
   */
  startAutoSave() {
    if (!this.isEnabled) return;

    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(() => {
      if (state.get('isDirty')) {
        this.saveDraft();
      }
    }, this.autoSaveInterval);

    // Also save on project changes
    eventBus.on(Events.PROJECT_DIRTY, () => {
      // Debounced save on changes
      this.scheduleSave();
    });
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Schedule a draft save (debounced)
   */
  scheduleSave() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }

    this._saveTimeout = setTimeout(() => {
      this.saveDraft();
    }, 2000); // Save after 2 seconds of inactivity
  }

  /**
   * Enable/disable draft saving
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  /**
   * Clear draft on successful save
   */
  onProjectSaved() {
    this.clearDraft();
  }

  /**
   * Check for draft and emit event if found
   */
  checkForDraft() {
    if (this.hasDraft()) {
      const draft = this.getDraft();
      eventBus.emit(Events.DRAFT_FOUND, draft);
      return true;
    }
    return false;
  }

  /**
   * Format draft timestamp for display
   */
  formatDraftTimestamp(draft) {
    if (!draft?.timestamp) return 'Unknown time';

    const now = new Date();
    const diffMs = now - draft.timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    return draft.timestamp.toLocaleString();
  }
}

// Singleton instance
export const draftManager = new DraftManager();

// Setup listeners
eventBus.on(Events.PROJECT_SAVE, () => {
  draftManager.onProjectSaved();
});
