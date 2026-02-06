/**
 * Freesound Integration - Search and download samples from Freesound.org
 *
 * Users provide their own API key (free registration at freesound.org).
 * This module handles authentication, search, and preview downloads.
 */

import { eventBus, Events } from '../event-bus.js';

// LocalStorage key for API key
const API_KEY_STORAGE = 'soundsculpt-freesound-key';

/**
 * Freesound API client
 */
class FreesoundClient {
  constructor() {
    this.baseUrl = 'https://freesound.org/apiv2';
    this.apiKey = this._loadApiKey();
  }

  /**
   * Load API key from localStorage
   * @returns {string | null}
   */
  _loadApiKey() {
    return localStorage.getItem(API_KEY_STORAGE);
  }

  /**
   * Save API key to localStorage
   * @param {string} key
   */
  setApiKey(key) {
    this.apiKey = key;
    if (key) {
      localStorage.setItem(API_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
    }
  }

  /**
   * Get current API key
   * @returns {string | null}
   */
  getApiKey() {
    return this.apiKey;
  }

  /**
   * Check if API key is set
   * @returns {boolean}
   */
  hasApiKey() {
    return !!this.apiKey;
  }

  /**
   * Test if API key is valid
   * @returns {Promise<boolean>}
   */
  async testApiKey() {
    if (!this.apiKey) return false;

    try {
      const response = await fetch(
        `${this.baseUrl}/sounds/1/?token=${this.apiKey}&fields=id`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Search for sounds
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>}
   */
  async search(query, options = {}) {
    if (!this.apiKey) {
      throw new Error('Freesound API key not set');
    }

    const params = new URLSearchParams({
      query,
      token: this.apiKey,
      fields: 'id,name,duration,previews,tags,username,description,avg_rating,num_ratings,license,filesize,samplerate,bitdepth,channels,created',
      page_size: options.pageSize || 15,
      page: options.page || 1,
    });

    // Optional filters
    if (options.filter) {
      params.set('filter', options.filter);
    }

    // Duration filter
    if (options.minDuration || options.maxDuration) {
      const dur = [];
      if (options.minDuration) dur.push(`duration:[${options.minDuration} TO *]`);
      if (options.maxDuration) dur.push(`duration:[* TO ${options.maxDuration}]`);
      params.set('filter', dur.join(' '));
    }

    // Sort options
    if (options.sort) {
      params.set('sort', options.sort); // rating_desc, downloads_desc, created_desc, duration_asc, etc.
    }

    const response = await fetch(`${this.baseUrl}/search/text/?${params}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Freesound API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get sound details
   * @param {number} soundId
   * @returns {Promise<Object>}
   */
  async getSoundInfo(soundId) {
    if (!this.apiKey) {
      throw new Error('Freesound API key not set');
    }

    const response = await fetch(
      `${this.baseUrl}/sounds/${soundId}/?token=${this.apiKey}&fields=id,name,duration,previews,tags,username,description,avg_rating,num_ratings,license,filesize,samplerate,bitdepth,channels,created,download`
    );

    if (!response.ok) {
      throw new Error(`Failed to get sound info: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Download preview audio (HQ MP3)
   * This doesn't require authentication, just the preview URL
   * @param {Object} sound - Sound object with previews
   * @returns {Promise<ArrayBuffer>}
   */
  async downloadPreview(sound) {
    const previewUrl = sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-lq-mp3'];

    if (!previewUrl) {
      throw new Error('No preview available for this sound');
    }

    const response = await fetch(previewUrl);

    if (!response.ok) {
      throw new Error(`Failed to download preview: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Download original file (requires OAuth - not supported in pure client-side)
   * Users should download from Freesound.org directly
   * @param {number} soundId
   * @returns {string} Download URL
   */
  getDownloadUrl(soundId) {
    return `https://freesound.org/people/~/${soundId}/download/`;
  }

  /**
   * Get similar sounds
   * @param {number} soundId
   * @returns {Promise<Object>}
   */
  async getSimilar(soundId) {
    if (!this.apiKey) {
      throw new Error('Freesound API key not set');
    }

    const response = await fetch(
      `${this.baseUrl}/sounds/${soundId}/similar/?token=${this.apiKey}&fields=id,name,duration,previews,tags`
    );

    if (!response.ok) {
      throw new Error(`Failed to get similar sounds: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get user's sounds
   * @param {string} username
   * @returns {Promise<Object>}
   */
  async getUserSounds(username) {
    if (!this.apiKey) {
      throw new Error('Freesound API key not set');
    }

    const response = await fetch(
      `${this.baseUrl}/users/${username}/sounds/?token=${this.apiKey}&fields=id,name,duration,previews,tags`
    );

    if (!response.ok) {
      throw new Error(`Failed to get user sounds: ${response.status}`);
    }

    return response.json();
  }
}

// Singleton instance
export const freesound = new FreesoundClient();

/**
 * Format sound for display
 * @param {Object} sound
 * @returns {Object}
 */
export function formatSound(sound) {
  return {
    id: sound.id,
    name: sound.name,
    duration: sound.duration,
    username: sound.username,
    description: sound.description,
    tags: sound.tags || [],
    rating: sound.avg_rating,
    ratingCount: sound.num_ratings,
    license: sound.license,
    filesize: sound.filesize,
    sampleRate: sound.samplerate,
    bitDepth: sound.bitdepth,
    channels: sound.channels,
    created: sound.created,
    previews: sound.previews,
    previewUrl: sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-lq-mp3'],
    freesoundUrl: `https://freesound.org/s/${sound.id}/`,
  };
}

/**
 * Format duration for display
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `0:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format file size
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format license for display
 * @param {string} licenseUrl
 * @returns {string}
 */
export function formatLicense(licenseUrl) {
  if (!licenseUrl) return 'Unknown';
  if (licenseUrl.includes('zero')) return 'CC0';
  if (licenseUrl.includes('by/')) return 'CC BY';
  if (licenseUrl.includes('by-nc/')) return 'CC BY-NC';
  if (licenseUrl.includes('sampling+')) return 'Sampling+';
  return 'See license';
}
