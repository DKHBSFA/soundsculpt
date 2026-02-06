/**
 * Template Manager - Save and load user templates
 *
 * Templates are stored in localStorage and contain full project state.
 * Users can create templates from their current project and reuse them.
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';

// localStorage key
const STORAGE_KEY = 'soundsculpt-templates';
const MAX_TEMPLATES = 50;

/**
 * Template interface
 * @typedef {Object} UserTemplate
 * @property {string} id - Unique identifier
 * @property {string} name - Template name
 * @property {string} [description] - Optional description
 * @property {string} category - Category (beat, melody, full, other)
 * @property {Object} project - Full project state (without audio samples)
 * @property {string} createdAt - ISO timestamp
 * @property {string} [thumbnail] - Base64 waveform thumbnail
 */

/**
 * Template categories
 */
export const TEMPLATE_CATEGORIES = {
  beat: { name: 'Beat', icon: '🥁' },
  melody: { name: 'Melody', icon: '🎹' },
  full: { name: 'Full Track', icon: '🎵' },
  other: { name: 'Other', icon: '📦' },
};

/**
 * Template Manager class
 */
class TemplateManager {
  constructor() {
    this.templates = this._loadTemplates();
  }

  /**
   * Load templates from localStorage
   * @returns {UserTemplate[]}
   */
  _loadTemplates() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Failed to load templates:', e);
      return [];
    }
  }

  /**
   * Save templates to localStorage
   */
  _saveTemplates() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.templates));
    } catch (e) {
      console.error('Failed to save templates:', e);

      // Check if it's a quota error
      if (e.name === 'QuotaExceededError') {
        // Try to remove oldest templates
        while (this.templates.length > 10) {
          this.templates.shift();
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.templates));
            break;
          } catch {
            // Keep trying
          }
        }
      }
    }
  }

  /**
   * Get all templates
   * @returns {UserTemplate[]}
   */
  getAll() {
    return [...this.templates];
  }

  /**
   * Get templates by category
   * @param {string} category
   * @returns {UserTemplate[]}
   */
  getByCategory(category) {
    return this.templates.filter(t => t.category === category);
  }

  /**
   * Get a single template by ID
   * @param {string} id
   * @returns {UserTemplate | null}
   */
  get(id) {
    return this.templates.find(t => t.id === id) || null;
  }

  /**
   * Save current project as a template
   * @param {string} name
   * @param {Object} options
   * @returns {UserTemplate}
   */
  saveFromCurrent(name, options = {}) {
    // Get current project state
    const projectData = state.getProjectData();

    // Strip audio sample data (too large for localStorage)
    const cleanedVoices = (projectData.voices || []).map(voice => ({
      ...voice,
      sampleData: null, // Remove Base64 audio
    }));

    const template = {
      id: this._generateId(),
      name,
      description: options.description || '',
      category: options.category || 'other',
      project: {
        ...projectData,
        voices: cleanedVoices,
        project: {
          ...projectData.project,
          name: name, // Use template name
        },
      },
      createdAt: new Date().toISOString(),
      thumbnail: options.thumbnail || null,
    };

    // Add to list
    this.templates.unshift(template);

    // Enforce max limit
    if (this.templates.length > MAX_TEMPLATES) {
      this.templates = this.templates.slice(0, MAX_TEMPLATES);
    }

    this._saveTemplates();

    eventBus.emit('template:saved', template);

    return template;
  }

  /**
   * Load a template into the current project
   * @param {string} id
   * @returns {boolean}
   */
  load(id) {
    const template = this.get(id);
    if (!template) return false;

    // Load the project data
    state.loadProject({
      ...template.project,
      project: {
        ...template.project.project,
        id: this._generateId(), // New ID for the project
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      },
    });

    eventBus.emit('template:loaded', template);

    return true;
  }

  /**
   * Update a template
   * @param {string} id
   * @param {Object} updates
   * @returns {UserTemplate | null}
   */
  update(id, updates) {
    const index = this.templates.findIndex(t => t.id === id);
    if (index === -1) return null;

    this.templates[index] = {
      ...this.templates[index],
      ...updates,
    };

    this._saveTemplates();

    return this.templates[index];
  }

  /**
   * Delete a template
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const index = this.templates.findIndex(t => t.id === id);
    if (index === -1) return false;

    this.templates.splice(index, 1);
    this._saveTemplates();

    eventBus.emit('template:deleted', { id });

    return true;
  }

  /**
   * Export a template as JSON
   * @param {string} id
   * @returns {string | null}
   */
  export(id) {
    const template = this.get(id);
    if (!template) return null;

    return JSON.stringify(template, null, 2);
  }

  /**
   * Import a template from JSON
   * @param {string} json
   * @returns {UserTemplate | null}
   */
  import(json) {
    try {
      const template = JSON.parse(json);

      // Validate basic structure
      if (!template.name || !template.project) {
        throw new Error('Invalid template format');
      }

      // Assign new ID and timestamp
      template.id = this._generateId();
      template.createdAt = new Date().toISOString();

      this.templates.unshift(template);
      this._saveTemplates();

      eventBus.emit('template:imported', template);

      return template;
    } catch (e) {
      console.error('Failed to import template:', e);
      return null;
    }
  }

  /**
   * Duplicate a template
   * @param {string} id
   * @returns {UserTemplate | null}
   */
  duplicate(id) {
    const original = this.get(id);
    if (!original) return null;

    const copy = {
      ...original,
      id: this._generateId(),
      name: `${original.name} (Copy)`,
      createdAt: new Date().toISOString(),
    };

    this.templates.unshift(copy);
    this._saveTemplates();

    return copy;
  }

  /**
   * Get storage usage info
   * @returns {Object}
   */
  getStorageInfo() {
    const used = new Blob([JSON.stringify(this.templates)]).size;
    return {
      templateCount: this.templates.length,
      maxTemplates: MAX_TEMPLATES,
      bytesUsed: used,
      bytesUsedFormatted: this._formatBytes(used),
    };
  }

  /**
   * Clear all templates
   */
  clearAll() {
    this.templates = [];
    this._saveTemplates();
    eventBus.emit('template:cleared');
  }

  /**
   * Generate unique ID
   * @returns {string}
   */
  _generateId() {
    return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Format bytes for display
   * @param {number} bytes
   * @returns {string}
   */
  _formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// Singleton instance
export const templateManager = new TemplateManager();
