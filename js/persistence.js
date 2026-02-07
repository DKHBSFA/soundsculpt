/**
 * Persistence - Save/Load project files
 */

import { eventBus, Events } from './event-bus.js';
import { state } from './state.js';
import { sessionPlayer } from './session/player.js';
import { stepsToStrudel, notesToStrudel } from './sync/view-sync.js';

const SCHEMA_VERSION = 4; // v4: Strudel integration, phased patterns, mixer settings
const APP_VERSION = '1.0.0';
const FILE_EXTENSION = '.soundsculpt';

/**
 * Generate project file data
 */
function createProjectFile() {
  const projectData = state.getProjectData();
  const sessionData = state.getSessionData();

  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    ...projectData,
    // Include session data if present
    session: sessionData || undefined,
    metadata: {
      author: '',
      description: '',
      tags: [],
      ...projectData.metadata,
    },
  };
}

/**
 * Download file to user's computer
 */
function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

/**
 * Format timestamp for filename
 */
function formatTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
}

/**
 * Save project to file
 */
export function saveProject() {
  try {
    const projectFile = createProjectFile();
    const json = JSON.stringify(projectFile, null, 2);

    const projectName = state.get('project.name') || 'Untitled';
    const filename = `${projectName}_${formatTimestamp()}${FILE_EXTENSION}`;

    downloadFile(json, filename);

    // Add to recent with project data for quick reload
    addToRecent(projectName, Date.now(), projectFile);

    state.markClean();
    eventBus.emit(Events.PROJECT_SAVE, { filename });
    eventBus.emit(Events.TOAST_SHOW, { message: 'Project saved', type: 'success' });

    return true;
  } catch (error) {
    console.error('Failed to save project:', error);
    eventBus.emit(Events.TOAST_SHOW, { message: 'Failed to save project', type: 'error' });
    return false;
  }
}

/**
 * Validate project file structure
 */
function validateProjectFile(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid file: not a valid JSON object');
  }

  if (!data.schemaVersion) {
    throw new Error('Invalid file: missing schemaVersion');
  }

  if (!data.project) {
    throw new Error('Invalid file: missing project data');
  }

  return true;
}

/**
 * Migrate older project file versions
 */
function migrateProjectFile(data) {
  let migrated = { ...data };

  // v1 -> v2: Add session support
  if (migrated.schemaVersion === 1) {
    migrated.schemaVersion = 2;
    // v1 files don't have session data, which is fine
    // The loader will handle missing session gracefully
  }

  // v2 -> v3: Add patternCode to voices that only have steps/notes
  if (migrated.schemaVersion === 2) {
    migrated.schemaVersion = 3;
    migrated = migrateVoicesToPatternCode(migrated);
  }

  // v3 -> v4: Strudel integration, phased patterns, mixer settings
  if (migrated.schemaVersion === 3) {
    migrated.schemaVersion = 4;
    migrated = migrateToV4(migrated);
  }

  return migrated;
}

/**
 * Migrate v3 project to v4 schema
 * v4 includes: phased patterns, mixer settings, form structure
 */
function migrateToV4(data) {
  const migrated = { ...data };

  // Ensure project has v4 fields
  if (migrated.project) {
    migrated.project = {
      ...migrated.project,
      style: migrated.project.style || 'electronic',
      key: migrated.project.key || 'C minor',
      energy: migrated.project.energy ?? 50,
    };
  }

  // Ensure transport has v4 fields
  if (!migrated.transport) {
    migrated.transport = {
      tempo: migrated.project?.tempo || data.transport?.tempo || 120,
      timeSignature: [4, 4],
    };
  } else {
    migrated.transport = {
      ...migrated.transport,
      timeSignature: migrated.transport.timeSignature || [4, 4],
    };
  }

  // Migrate voices to v4 format with phased patterns and mixer settings
  if (migrated.voices && Array.isArray(migrated.voices)) {
    migrated.voices = migrated.voices.map(voice => {
      // Create patterns object if voice has single patternCode
      let patterns = voice.patterns;
      if (!patterns && voice.patternCode) {
        // Convert single pattern to all phases
        patterns = {
          intro: voice.patternCode,
          build: voice.patternCode,
          climax: voice.patternCode,
          resolve: voice.patternCode,
        };
      } else if (!patterns) {
        patterns = {
          intro: 'silence',
          build: 'silence',
          climax: 'silence',
          resolve: 'silence',
        };
      }

      // Create mixer settings if not present
      const mixer = voice.mixer || {
        volume: voice.volume ?? 0.8,
        pan: voice.pan ?? 0,
        muted: voice.muted ?? false,
        solo: voice.solo ?? false,
        sends: voice.sends || { reverb: 0.3, delay: 0 },
      };

      // Determine voice role from name/type
      let role = voice.role;
      if (!role) {
        const name = (voice.name || '').toLowerCase();
        if (name.includes('lead') || name.includes('melody')) {
          role = 'lead';
        } else if (name.includes('bass')) {
          role = 'bass';
        } else if (name.includes('pad') || name.includes('strings')) {
          role = 'harmonic-bed';
        } else if (name.includes('drum') || name.includes('kick') || name.includes('snare') || name.includes('hihat')) {
          role = 'rhythmic';
        } else if (name.includes('arp')) {
          role = 'arpeggio';
        } else {
          role = 'harmonic-bed';
        }
      }

      return {
        id: voice.id,
        name: voice.name,
        type: voice.type || 'melodic',
        sourceType: voice.sourceType || (voice.type === 'drum' ? 'drum' : 'synth'),
        soundfont: voice.soundfont || null,
        role,
        patterns,
        mixer,
        // Keep legacy fields for backwards compat
        patternCode: voice.patternCode,
        color: voice.color,
        icon: voice.icon,
        content: voice.content,
        // Direct properties for app.js compatibility
        volume: mixer.volume,
        pan: mixer.pan,
        muted: mixer.muted,
        solo: mixer.solo,
        sends: mixer.sends,
      };
    });
  }

  // Add form structure if not present
  if (!migrated.form) {
    migrated.form = {
      phases: [
        { name: 'intro', bars: [0, 4] },
        { name: 'build', bars: [4, 12] },
        { name: 'climax', bars: [12, 20] },
        { name: 'resolve', bars: [20, 24] },
      ],
    };
  }

  // Add master effects if not present
  if (!migrated.masterEffects) {
    migrated.masterEffects = {
      reverb: 0.4,
      delay: 0,
      limiter: true,
    };
  }

  return migrated;
}

/**
 * Migrate voices to include patternCode
 * For projects saved before AI-first generation
 */
function migrateVoicesToPatternCode(data) {
  if (!data.voices || !Array.isArray(data.voices)) {
    return data;
  }

  const migratedVoices = data.voices.map(voice => {
    // Skip if already has patternCode
    if (voice.patternCode) {
      return voice;
    }

    let patternCode = '';

    // Generate patternCode from steps
    if (voice.content?.steps && Array.isArray(voice.content.steps)) {
      try {
        patternCode = stepsToStrudel(voice.content.steps, {
          name: voice.name,
          type: voice.type,
          sourceType: voice.sourceType,
          content: voice.content,
          volume: voice.volume,
        });
      } catch (e) {
        console.warn('Failed to migrate steps to patternCode:', e);
      }
    }

    // Generate patternCode from notes (if no steps or melodic voice)
    if (voice.content?.notes?.length > 0 && (!patternCode || voice.type !== 'drum')) {
      try {
        patternCode = notesToStrudel(voice.content.notes, {
          name: voice.name,
          content: voice.content,
          volume: voice.volume,
        });
      } catch (e) {
        console.warn('Failed to migrate notes to patternCode:', e);
      }
    }

    // Fallback: generate a placeholder pattern
    if (!patternCode) {
      if (voice.sourceType === 'drum' || voice.type === 'drum') {
        patternCode = `// Migrated from legacy project\ns("${voice.content?.sound || 'bd'}")\n  .struct('t ~ ~ ~ t ~ ~ ~')\n  .gain(${voice.volume || 0.8})`;
      } else {
        patternCode = `// Migrated from legacy project\nnote('c4')\n  .s('sine')\n  .gain(${voice.volume || 0.8})`;
      }
    }

    return {
      ...voice,
      patternCode,
    };
  });

  return {
    ...data,
    voices: migratedVoices,
  };
}

/**
 * Load project from file content
 */
export function loadProjectFromData(data) {
  try {
    validateProjectFile(data);
    const migratedData = migrateProjectFile(data);

    state.loadProject(migratedData);

    // Load session data if present
    if (migratedData.session) {
      state.loadSession(migratedData.session);
      sessionPlayer.loadSession(migratedData.session);
    } else {
      state.clearSession();
    }

    eventBus.emit(Events.TOAST_SHOW, {
      message: `Loaded: ${data.project?.name || 'Untitled'}`,
      type: 'success',
    });

    return true;
  } catch (error) {
    console.error('Failed to load project:', error);
    eventBus.emit(Events.TOAST_SHOW, {
      message: `Failed to load: ${error.message}`,
      type: 'error',
    });
    return false;
  }
}

/**
 * Load project from file
 */
export async function loadProjectFromFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    return loadProjectFromData(data);
  } catch (error) {
    console.error('Failed to parse file:', error);
    eventBus.emit(Events.TOAST_SHOW, {
      message: 'Failed to parse file. Is it a valid .soundsculpt file?',
      type: 'error',
    });
    return false;
  }
}

/**
 * Prompt user to select a file
 */
export function openFileDialog() {
  return new Promise((resolve) => {
    const input = document.getElementById('file-input');
    if (!input) {
      resolve(null);
      return;
    }

    const handleChange = async (event) => {
      input.removeEventListener('change', handleChange);
      const file = event.target.files?.[0];
      input.value = ''; // Reset for next use

      if (file) {
        const success = await loadProjectFromFile(file);
        resolve(success);
      } else {
        resolve(false);
      }
    };

    input.addEventListener('change', handleChange);
    input.click();
  });
}

/**
 * Setup drag & drop for file loading
 */
export function setupDragDrop() {
  let dragCounter = 0;

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    document.body.classList.add('drag-over');
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      document.body.classList.remove('drag-over');
    }
  });

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    document.body.classList.remove('drag-over');

    const file = e.dataTransfer?.files?.[0];
    if (file && (file.name.endsWith('.soundsculpt') || file.name.endsWith('.json'))) {
      await loadProjectFromFile(file);
    }
  });
}

/**
 * Setup beforeunload warning
 */
export function setupBeforeUnload() {
  window.addEventListener('beforeunload', (e) => {
    if (state.get('isDirty')) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Leave anyway?';
      return e.returnValue;
    }
  });
}

/**
 * Export project to WAV (placeholder for Fase 7)
 */
export function exportWAV() {
  eventBus.emit(Events.TOAST_SHOW, {
    message: 'WAV export coming soon',
    type: 'info',
  });
}

/**
 * Export project to MIDI (placeholder for Fase 7)
 */
export function exportMIDI() {
  eventBus.emit(Events.TOAST_SHOW, {
    message: 'MIDI export coming soon',
    type: 'info',
  });
}

// Track recent projects in localStorage
const RECENT_KEY = 'soundsculpt:recent';
const RECENT_DATA_KEY = 'soundsculpt:recent:data';
const MAX_RECENT = 3; // Reduced to 3 to save localStorage space

/**
 * Add project to recent list with full data
 * @param {string} name - Project name
 * @param {number} timestamp - Timestamp
 * @param {Object} projectData - Full project data (optional)
 */
export function addToRecent(name, timestamp = Date.now(), projectData = null) {
  try {
    // Update name/timestamp list
    const recent = getRecentProjects();
    const filtered = recent.filter((r) => r.name !== name);
    filtered.unshift({ name, timestamp });
    const limitedRecent = filtered.slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(limitedRecent));

    // Also store project data if provided
    if (projectData) {
      const recentData = getRecentProjectsData();
      // Remove old entry
      const filteredData = recentData.filter((r) => r.name !== name);
      // Create minimal data (strip samples to save space)
      const minimalData = createMinimalProjectData(projectData, name);
      filteredData.unshift(minimalData);
      // Keep only data for projects in the recent list
      const recentNames = new Set(limitedRecent.map(r => r.name));
      const cleanedData = filteredData.filter(d => recentNames.has(d.name));
      localStorage.setItem(RECENT_DATA_KEY, JSON.stringify(cleanedData));
    }
  } catch (e) {
    console.warn('Failed to save recent project:', e);
  }
}

/**
 * Create minimal project data (strip samples to save space)
 */
function createMinimalProjectData(projectData, name) {
  const minimal = {
    name,
    project: projectData.project,
    transport: projectData.transport,
    voices: projectData.voices?.map(v => ({
      ...v,
      sampleData: undefined, // Remove sample data
      content: v.content ? {
        ...v.content,
        sampleData: undefined,
      } : v.content,
    })),
  };
  return minimal;
}

/**
 * Get recent projects list (names and timestamps only)
 */
export function getRecentProjects() {
  try {
    const data = localStorage.getItem(RECENT_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Get recent projects data (full project data)
 */
export function getRecentProjectsData() {
  try {
    const data = localStorage.getItem(RECENT_DATA_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Load a recent project by name
 * @param {string} name - Project name
 * @returns {Object|null} Project data or null if not found
 */
export function loadRecentProject(name) {
  try {
    const recentData = getRecentProjectsData();
    const project = recentData.find(r => r.name === name);
    return project || null;
  } catch (e) {
    console.warn('Failed to load recent project:', e);
    return null;
  }
}

// ============================================
// AUTO-SAVE SYSTEM (periodic file downloads)
// ============================================

const AUTO_SAVE_SETTINGS_KEY = 'soundsculpt:autosave';

/**
 * Auto-save manager that triggers periodic downloads
 */
class AutoSaveManager {
  constructor() {
    this.enabled = false;
    this.intervalMinutes = 5;
    this.timer = null;
    this.lastSaveTime = null;

    this.loadSettings();
  }

  /**
   * Load settings from localStorage
   */
  loadSettings() {
    try {
      const data = localStorage.getItem(AUTO_SAVE_SETTINGS_KEY);
      if (data) {
        const settings = JSON.parse(data);
        this.enabled = settings.enabled ?? false;
        this.intervalMinutes = settings.interval ?? 5;
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
      localStorage.setItem(AUTO_SAVE_SETTINGS_KEY, JSON.stringify({
        enabled: this.enabled,
        interval: this.intervalMinutes,
      }));
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Enable or disable auto-save
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.saveSettings();

    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  /**
   * Set auto-save interval
   */
  setInterval(minutes) {
    this.intervalMinutes = Math.max(1, Math.min(60, minutes));
    this.saveSettings();

    // Restart timer with new interval
    if (this.enabled && this.timer) {
      this.stop();
      this.start();
    }
  }

  /**
   * Start auto-save timer
   */
  start() {
    if (!this.enabled) return;
    if (this.timer) this.stop();

    this.timer = setInterval(() => {
      this.checkAndSave();
    }, this.intervalMinutes * 60 * 1000);
  }

  /**
   * Stop auto-save timer
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Check if we should save and trigger download
   */
  checkAndSave() {
    if (!this.enabled) return;
    if (!state.get('isDirty')) return;

    this.save();
  }

  /**
   * Trigger auto-save download
   */
  save() {
    try {
      const projectFile = createProjectFile();
      const json = JSON.stringify(projectFile, null, 2);

      const projectName = state.get('project.name') || 'Untitled';
      const timestamp = formatTimestamp();
      const filename = `${projectName}_auto_${timestamp}${FILE_EXTENSION}`;

      downloadFile(json, filename);

      this.lastSaveTime = Date.now();
      eventBus.emit(Events.TOAST_SHOW, {
        message: 'Auto-saved',
        type: 'info',
      });
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }

  /**
   * Get current settings
   */
  getSettings() {
    return {
      enabled: this.enabled,
      interval: this.intervalMinutes,
      lastSaveTime: this.lastSaveTime,
    };
  }
}

// Singleton instance
export const autoSaveManager = new AutoSaveManager();

// ============================================
// URL SHARING (Base64 encoded project in hash)
// ============================================

/**
 * Compress and encode project data for URL sharing
 * Uses base64 encoding (pako gzip would be better but adds dependency)
 */
export function encodeProjectForUrl() {
  try {
    const projectFile = createProjectFile();

    // Remove samples from URL share (too large)
    const shareData = { ...projectFile };
    if (shareData.voices) {
      shareData.voices = shareData.voices.map(voice => ({
        ...voice,
        sampleData: undefined, // Remove sample data for URL sharing
      }));
    }

    const json = JSON.stringify(shareData);
    const base64 = btoa(encodeURIComponent(json));

    // URL-safe base64
    const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    return urlSafe;
  } catch (error) {
    console.error('Failed to encode project:', error);
    return null;
  }
}

/**
 * Decode project data from URL hash
 */
export function decodeProjectFromUrl(encoded) {
  try {
    // Restore base64 padding and characters
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const json = decodeURIComponent(atob(base64));
    const data = JSON.parse(json);
    return data;
  } catch (error) {
    console.error('Failed to decode project from URL:', error);
    return null;
  }
}

/**
 * Generate shareable URL for current project
 */
export function generateShareUrl() {
  const encoded = encodeProjectForUrl();
  if (!encoded) return null;

  const url = new URL(window.location.href);
  url.hash = `project=${encoded}`;
  return url.toString();
}

/**
 * Check if project contains sample data
 */
function projectHasSamples() {
  const voices = state.get('voices') || [];
  return voices.some(v =>
    v.sampleData ||
    v.content?.sampleData ||
    v.sourceType === 'sample'
  );
}

/**
 * Copy share URL to clipboard
 */
export async function copyShareUrl() {
  // Warn if project contains samples
  if (projectHasSamples()) {
    eventBus.emit(Events.TOAST_SHOW, {
      message: 'Note: Sample audio will not be included in the shared URL.',
      type: 'warning',
    });
  }

  const url = generateShareUrl();
  if (!url) {
    eventBus.emit(Events.TOAST_SHOW, {
      message: 'Failed to generate share URL',
      type: 'error',
    });
    return false;
  }

  // Check URL length (browsers typically have a ~2000 character limit for URLs)
  if (url.length > 10000) {
    eventBus.emit(Events.TOAST_SHOW, {
      message: 'Project too large for URL sharing. Use file export instead.',
      type: 'warning',
    });
    return false;
  }

  try {
    await navigator.clipboard.writeText(url);
    eventBus.emit(Events.TOAST_SHOW, {
      message: 'Share URL copied to clipboard',
      type: 'success',
    });
    return true;
  } catch (error) {
    // Fallback for browsers that don't support clipboard API
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      eventBus.emit(Events.TOAST_SHOW, {
        message: 'Share URL copied to clipboard',
        type: 'success',
      });
      return true;
    } catch (err) {
      eventBus.emit(Events.TOAST_SHOW, {
        message: 'Failed to copy URL. Please copy manually.',
        type: 'error',
      });
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

/**
 * Check URL for shared project and load if present
 */
export function checkUrlForProject() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#project=')) return false;

  const encoded = hash.slice('#project='.length);
  if (!encoded) return false;

  const data = decodeProjectFromUrl(encoded);
  if (!data) {
    eventBus.emit(Events.TOAST_SHOW, {
      message: 'Invalid share URL',
      type: 'error',
    });
    return false;
  }

  // Load the project
  const success = loadProjectFromData(data);

  if (success) {
    eventBus.emit(Events.TOAST_SHOW, {
      message: 'Project loaded from share URL',
      type: 'success',
    });
    // Clear the hash so it doesn't interfere with navigation
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  return success;
}
