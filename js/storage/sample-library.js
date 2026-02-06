/**
 * Sample Library - IndexedDB storage for audio samples
 *
 * Provides persistent local storage for user's sample collection.
 * Samples are organized in folders with metadata (BPM, pitch, tags).
 */

import { eventBus, Events } from '../event-bus.js';
import { audioContext } from '../audio/context-manager.js';

// Database configuration
const DB_NAME = 'soundsculpt-library';
const DB_VERSION = 1;
const STORE_SAMPLES = 'samples';
const STORE_FOLDERS = 'folders';

/**
 * Sample metadata interface
 * @typedef {Object} SampleMetadata
 * @property {string} id - Unique identifier
 * @property {string} filename - Original filename
 * @property {string} folder - Folder path
 * @property {number} duration - Duration in seconds
 * @property {number} sampleRate - Sample rate in Hz
 * @property {number} channels - Number of channels
 * @property {number} [bpm] - Detected or user-set BPM
 * @property {string} [key] - Musical key (e.g., "Am")
 * @property {string} [pitch] - Root pitch (e.g., "C3")
 * @property {string[]} tags - User tags
 * @property {boolean} favorite - Marked as favorite
 * @property {string} addedAt - ISO timestamp
 * @property {string} [lastUsedAt] - ISO timestamp of last use
 * @property {ArrayBuffer} audioData - Raw audio data
 */

/**
 * Sample Library class - manages IndexedDB storage
 */
class SampleLibrary {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this._initPromise = null;
  }

  /**
   * Initialize the database
   * @returns {Promise<void>}
   */
  async init() {
    if (this.isInitialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._openDatabase();
    await this._initPromise;
    this.isInitialized = true;
  }

  /**
   * Open or create the IndexedDB database
   * @returns {Promise<void>}
   */
  async _openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open sample library database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create samples store
        if (!db.objectStoreNames.contains(STORE_SAMPLES)) {
          const samplesStore = db.createObjectStore(STORE_SAMPLES, { keyPath: 'id' });
          samplesStore.createIndex('folder', 'folder', { unique: false });
          samplesStore.createIndex('filename', 'filename', { unique: false });
          samplesStore.createIndex('tags', 'tags', { multiEntry: true });
          samplesStore.createIndex('bpm', 'bpm', { unique: false });
          samplesStore.createIndex('favorite', 'favorite', { unique: false });
          samplesStore.createIndex('addedAt', 'addedAt', { unique: false });
        }

        // Create folders store
        if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
          const foldersStore = db.createObjectStore(STORE_FOLDERS, { keyPath: 'path' });
          foldersStore.createIndex('parent', 'parent', { unique: false });
        }
      };
    });
  }

  /**
   * Ensure database is ready
   */
  async _ensureReady() {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  /**
   * Add a sample to the library
   * @param {File} file - Audio file
   * @param {Object} options - Additional metadata
   * @returns {Promise<SampleMetadata>}
   */
  async addSample(file, options = {}) {
    await this._ensureReady();

    // Read file as ArrayBuffer
    const buffer = await file.arrayBuffer();

    // Decode to get audio properties
    let audioBuffer;
    try {
      const ctx = audioContext.getContext() || new (window.AudioContext || window.webkitAudioContext)();
      audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
    } catch (e) {
      throw new Error(`Failed to decode audio file: ${e.message}`);
    }

    const metadata = {
      id: this._generateId(),
      filename: file.name,
      folder: options.folder || 'Uncategorized',
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      bpm: options.bpm || null,
      key: options.key || null,
      pitch: options.pitch || null,
      tags: options.tags || [],
      favorite: false,
      addedAt: new Date().toISOString(),
      lastUsedAt: null,
      audioData: buffer,
    };

    // Store in IndexedDB
    await this._putSample(metadata);

    // Ensure folder exists
    await this._ensureFolder(metadata.folder);

    return { ...metadata, audioData: undefined }; // Don't return the raw data
  }

  /**
   * Store sample in IndexedDB
   * @param {SampleMetadata} sample
   */
  async _putSample(sample) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_SAMPLES], 'readwrite');
      const store = transaction.objectStore(STORE_SAMPLES);
      const request = store.put(sample);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a sample by ID (with audio data)
   * @param {string} id
   * @returns {Promise<SampleMetadata | null>}
   */
  async getSample(id) {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_SAMPLES], 'readonly');
      const store = transaction.objectStore(STORE_SAMPLES);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get sample metadata only (without audio data)
   * @param {string} id
   * @returns {Promise<Object | null>}
   */
  async getSampleMetadata(id) {
    const sample = await this.getSample(id);
    if (!sample) return null;
    const { audioData, ...metadata } = sample;
    return metadata;
  }

  /**
   * Update sample metadata
   * @param {string} id
   * @param {Object} updates
   */
  async updateSample(id, updates) {
    await this._ensureReady();

    const sample = await this.getSample(id);
    if (!sample) throw new Error(`Sample not found: ${id}`);

    const updated = { ...sample, ...updates };
    await this._putSample(updated);

    return { ...updated, audioData: undefined };
  }

  /**
   * Delete a sample
   * @param {string} id
   */
  async deleteSample(id) {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_SAMPLES], 'readwrite');
      const store = transaction.objectStore(STORE_SAMPLES);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all samples in a folder
   * @param {string} folder
   * @returns {Promise<Object[]>}
   */
  async getSamplesInFolder(folder) {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_SAMPLES], 'readonly');
      const store = transaction.objectStore(STORE_SAMPLES);
      const index = store.index('folder');
      const request = index.getAll(folder);

      request.onsuccess = () => {
        // Return without audio data
        const samples = request.result.map(({ audioData, ...meta }) => meta);
        resolve(samples);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all samples
   * @returns {Promise<Object[]>}
   */
  async getAllSamples() {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_SAMPLES], 'readonly');
      const store = transaction.objectStore(STORE_SAMPLES);
      const request = store.getAll();

      request.onsuccess = () => {
        // Return without audio data
        const samples = request.result.map(({ audioData, ...meta }) => meta);
        resolve(samples);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Search samples
   * @param {Object} query
   * @returns {Promise<Object[]>}
   */
  async search(query = {}) {
    const all = await this.getAllSamples();

    return all.filter(sample => {
      // Text search (filename and tags)
      if (query.text) {
        const text = query.text.toLowerCase();
        const matchFilename = sample.filename.toLowerCase().includes(text);
        const matchTags = sample.tags.some(t => t.toLowerCase().includes(text));
        if (!matchFilename && !matchTags) return false;
      }

      // Folder filter
      if (query.folder && sample.folder !== query.folder) {
        return false;
      }

      // BPM range
      if (query.bpmMin && (!sample.bpm || sample.bpm < query.bpmMin)) {
        return false;
      }
      if (query.bpmMax && (!sample.bpm || sample.bpm > query.bpmMax)) {
        return false;
      }

      // Favorites only
      if (query.favoritesOnly && !sample.favorite) {
        return false;
      }

      // Tag filter
      if (query.tags && query.tags.length > 0) {
        const hasAllTags = query.tags.every(tag =>
          sample.tags.some(t => t.toLowerCase() === tag.toLowerCase())
        );
        if (!hasAllTags) return false;
      }

      return true;
    });
  }

  /**
   * Get unique tags across all samples
   * @returns {Promise<string[]>}
   */
  async getAllTags() {
    const samples = await this.getAllSamples();
    const tags = new Set();
    samples.forEach(s => s.tags.forEach(t => tags.add(t)));
    return [...tags].sort();
  }

  /**
   * Toggle favorite status
   * @param {string} id
   * @returns {Promise<boolean>} New favorite status
   */
  async toggleFavorite(id) {
    const sample = await this.getSample(id);
    if (!sample) throw new Error(`Sample not found: ${id}`);

    sample.favorite = !sample.favorite;
    await this._putSample(sample);
    return sample.favorite;
  }

  /**
   * Mark sample as used (update lastUsedAt)
   * @param {string} id
   */
  async markAsUsed(id) {
    await this.updateSample(id, { lastUsedAt: new Date().toISOString() });
  }

  // === Folder Management ===

  /**
   * Ensure folder exists
   * @param {string} path
   */
  async _ensureFolder(path) {
    const parts = path.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      await this._createFolderIfNotExists(currentPath);
    }
  }

  /**
   * Create folder if it doesn't exist
   * @param {string} path
   */
  async _createFolderIfNotExists(path) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_FOLDERS], 'readwrite');
      const store = transaction.objectStore(STORE_FOLDERS);

      const getRequest = store.get(path);
      getRequest.onsuccess = () => {
        if (getRequest.result) {
          resolve(); // Already exists
          return;
        }

        // Create new folder
        const parts = path.split('/');
        const parent = parts.length > 1 ? parts.slice(0, -1).join('/') : null;

        const folder = {
          path,
          name: parts[parts.length - 1],
          parent,
          createdAt: new Date().toISOString(),
        };

        const putRequest = store.put(folder);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Get all folders
   * @returns {Promise<Object[]>}
   */
  async getFolders() {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_FOLDERS], 'readonly');
      const store = transaction.objectStore(STORE_FOLDERS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Create a new folder
   * @param {string} path
   * @param {string} name
   */
  async createFolder(path, name) {
    await this._ensureReady();

    const fullPath = path ? `${path}/${name}` : name;
    await this._createFolderIfNotExists(fullPath);

    return {
      path: fullPath,
      name,
      parent: path || null,
    };
  }

  /**
   * Delete a folder and optionally its contents
   * @param {string} path
   * @param {boolean} deleteContents
   */
  async deleteFolder(path, deleteContents = false) {
    await this._ensureReady();

    if (deleteContents) {
      const samples = await this.getSamplesInFolder(path);
      for (const sample of samples) {
        await this.deleteSample(sample.id);
      }
    } else {
      // Move samples to Uncategorized
      const samples = await this.getSamplesInFolder(path);
      for (const sample of samples) {
        await this.updateSample(sample.id, { folder: 'Uncategorized' });
      }
    }

    // Delete the folder
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_FOLDERS], 'readwrite');
      const store = transaction.objectStore(STORE_FOLDERS);
      const request = store.delete(path);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // === Utility Methods ===

  /**
   * Get library statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const samples = await this.getAllSamples();

    let totalDuration = 0;
    samples.forEach(s => totalDuration += s.duration);

    return {
      totalSamples: samples.length,
      totalDuration,
      favoriteCount: samples.filter(s => s.favorite).length,
      tagCount: (await this.getAllTags()).length,
    };
  }

  /**
   * Export library metadata (without audio)
   * @returns {Promise<Object>}
   */
  async exportMetadata() {
    const samples = await this.getAllSamples();
    const folders = await this.getFolders();

    return {
      exportedAt: new Date().toISOString(),
      samples,
      folders,
    };
  }

  /**
   * Clear all data (use with caution!)
   */
  async clearAll() {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_SAMPLES, STORE_FOLDERS], 'readwrite');

      transaction.objectStore(STORE_SAMPLES).clear();
      transaction.objectStore(STORE_FOLDERS).clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Generate unique ID
   * @returns {string}
   */
  _generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Check if IndexedDB is supported
   * @returns {boolean}
   */
  static isSupported() {
    return typeof indexedDB !== 'undefined';
  }
}

// Singleton instance
export const sampleLibrary = new SampleLibrary();

// Export library events
export const LibraryEvents = {
  SAMPLE_ADDED: 'library:sample:added',
  SAMPLE_DELETED: 'library:sample:deleted',
  SAMPLE_UPDATED: 'library:sample:updated',
  FOLDER_CREATED: 'library:folder:created',
  FOLDER_DELETED: 'library:folder:deleted',
};
