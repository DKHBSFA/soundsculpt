/**
 * Sample Manager - Audio file handling, Base64 embedding, waveform preview
 * Phase 5: Code Editor + Samples
 * Phase 10: Audio Analysis integration
 */

import { eventBus, Events } from '../event-bus.js';
import { audioContext } from './context-manager.js';

// Lazy import for analysis module (avoid circular dependencies)
let analysisModule = null;
async function getAnalysisModule() {
  if (!analysisModule) {
    try {
      analysisModule = await import('../analysis/index.js');
    } catch (e) {
      console.warn('Analysis module not available:', e);
      analysisModule = null;
    }
  }
  return analysisModule;
}

/**
 * Sample data structure
 * @typedef {Object} SampleData
 * @property {string} id - Unique identifier
 * @property {string} filename - Original filename
 * @property {string} mimeType - MIME type (audio/wav, audio/mp3, etc.)
 * @property {string} data - Base64 encoded audio data
 * @property {number} duration - Duration in seconds
 * @property {number} sampleRate - Sample rate in Hz
 * @property {number} channels - Number of channels
 * @property {number} [detectedBPM] - Detected tempo (Phase 10)
 * @property {string} [detectedPitch] - Detected root note (Phase 10)
 * @property {string} [detectedKey] - Detected musical key (Phase 10)
 * @property {Object} [analysis] - Full analysis results (Phase 10)
 */

/**
 * Sample Manager singleton
 */
class SampleManager {
  constructor() {
    this.samples = new Map(); // sampleId -> { buffer: AudioBuffer, data: SampleData }
    this.waveformCache = new Map(); // sampleId -> waveform data
  }

  /**
   * Generate unique sample ID
   */
  generateId() {
    return `sample-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Load audio file from user input
   * @param {File} file - Audio file
   * @returns {Promise<SampleData>}
   */
  async loadFromFile(file) {
    // Validate file type
    const validTypes = ['audio/wav', 'audio/wave', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/flac'];
    if (!validTypes.some(t => file.type.startsWith(t.split('/')[0]))) {
      throw new Error(`Unsupported audio format: ${file.type}`);
    }

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Decode audio
    const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

    // Convert to Base64
    const base64 = await this.arrayBufferToBase64(arrayBuffer);

    // Create sample data
    const sampleData = {
      id: this.generateId(),
      filename: file.name,
      mimeType: file.type || 'audio/wav',
      data: base64,
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
    };

    // Store in cache
    this.samples.set(sampleData.id, {
      buffer,
      data: sampleData,
    });

    // Generate waveform data
    this.waveformCache.set(sampleData.id, this.generateWaveformData(buffer));

    eventBus.emit('sample:loaded', sampleData);

    return sampleData;
  }

  /**
   * Load sample from Base64 data (project restore)
   * @param {SampleData} sampleData
   * @returns {Promise<AudioBuffer>}
   */
  async loadFromBase64(sampleData) {
    if (this.samples.has(sampleData.id)) {
      return this.samples.get(sampleData.id).buffer;
    }

    // Decode Base64 to ArrayBuffer
    const arrayBuffer = this.base64ToArrayBuffer(sampleData.data);

    // Decode audio
    const buffer = await audioContext.decodeAudioData(arrayBuffer);

    // Store in cache
    this.samples.set(sampleData.id, {
      buffer,
      data: sampleData,
    });

    // Generate waveform data
    this.waveformCache.set(sampleData.id, this.generateWaveformData(buffer));

    return buffer;
  }

  /**
   * Get sample audio buffer
   * @param {string} sampleId
   * @returns {AudioBuffer|null}
   */
  getBuffer(sampleId) {
    return this.samples.get(sampleId)?.buffer || null;
  }

  /**
   * Get sample data for serialization
   * @param {string} sampleId
   * @returns {SampleData|null}
   */
  getSampleData(sampleId) {
    return this.samples.get(sampleId)?.data || null;
  }

  /**
   * Get waveform data for visualization
   * @param {string} sampleId
   * @param {number} points - Number of data points
   * @returns {Float32Array|null}
   */
  getWaveformData(sampleId, points = 200) {
    const cached = this.waveformCache.get(sampleId);
    if (cached && cached.length === points) {
      return cached;
    }

    const sample = this.samples.get(sampleId);
    if (!sample) return null;

    const waveform = this.generateWaveformData(sample.buffer, points);
    this.waveformCache.set(sampleId, waveform);
    return waveform;
  }

  /**
   * Generate waveform visualization data
   * @param {AudioBuffer} buffer
   * @param {number} points
   * @returns {Float32Array}
   */
  generateWaveformData(buffer, points = 200) {
    const data = buffer.getChannelData(0);
    const blockSize = Math.floor(data.length / points);
    const waveform = new Float32Array(points);

    for (let i = 0; i < points; i++) {
      let max = 0;
      const start = i * blockSize;
      const end = Math.min(start + blockSize, data.length);

      for (let j = start; j < end; j++) {
        const abs = Math.abs(data[j]);
        if (abs > max) max = abs;
      }

      waveform[i] = max;
    }

    return waveform;
  }

  /**
   * Remove sample from cache
   * @param {string} sampleId
   */
  removeSample(sampleId) {
    this.samples.delete(sampleId);
    this.waveformCache.delete(sampleId);
    eventBus.emit('sample:removed', sampleId);
  }

  /**
   * Analyze a sample (Phase 10: Audio Analysis)
   * Detects BPM, pitch, and onsets
   * @param {string} sampleId
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeSample(sampleId) {
    const sample = this.samples.get(sampleId);
    if (!sample) {
      throw new Error(`Sample not found: ${sampleId}`);
    }

    const analysis = await getAnalysisModule();
    if (!analysis) {
      console.warn('Analysis module not available');
      return null;
    }

    try {
      const results = await analysis.analyzeSample(sample.buffer);

      // Store analysis results
      sample.data.analysis = results;

      // Extract key properties for quick access
      if (results.bpm && results.bpm.confidence > 0.5) {
        sample.data.detectedBPM = results.bpm.bpm;
      }
      if (results.pitch && results.pitch.confidence > 0.5) {
        sample.data.detectedPitch = results.pitch.note;
      }

      eventBus.emit('sample:analyzed', { sampleId, results });

      return results;
    } catch (error) {
      console.error('Sample analysis failed:', error);
      throw error;
    }
  }

  /**
   * Auto-slice a sample (Phase 10: Audio Analysis)
   * @param {string} sampleId
   * @param {Object} options - Slicing options
   * @returns {Promise<Object>} Slice results
   */
  async autoSliceSample(sampleId, options = {}) {
    const sample = this.samples.get(sampleId);
    if (!sample) {
      throw new Error(`Sample not found: ${sampleId}`);
    }

    const analysis = await getAnalysisModule();
    if (!analysis) {
      console.warn('Analysis module not available');
      return null;
    }

    try {
      // Use detected BPM if available and snap-to-grid is enabled
      if (options.snapToGrid && !options.detectedBPM && sample.data.detectedBPM) {
        options.detectedBPM = sample.data.detectedBPM;
      }

      const result = analysis.autoSliceSample(sample.buffer, options);

      // Store slices in sample data
      sample.data.slices = result.slices;

      eventBus.emit('sample:sliced', { sampleId, result });

      return result;
    } catch (error) {
      console.error('Sample slicing failed:', error);
      throw error;
    }
  }

  /**
   * Get detected BPM for a sample
   * @param {string} sampleId
   * @returns {number|null}
   */
  getDetectedBPM(sampleId) {
    const sample = this.samples.get(sampleId);
    return sample?.data?.detectedBPM || null;
  }

  /**
   * Get detected pitch for a sample
   * @param {string} sampleId
   * @returns {string|null}
   */
  getDetectedPitch(sampleId) {
    const sample = this.samples.get(sampleId);
    return sample?.data?.detectedPitch || null;
  }

  /**
   * Get sample slices
   * @param {string} sampleId
   * @returns {Object[]|null}
   */
  getSampleSlices(sampleId) {
    const sample = this.samples.get(sampleId);
    return sample?.data?.slices || null;
  }

  /**
   * Clear all samples
   */
  clear() {
    this.samples.clear();
    this.waveformCache.clear();
  }

  /**
   * Get all sample IDs
   * @returns {string[]}
   */
  getAllSampleIds() {
    return Array.from(this.samples.keys());
  }

  /**
   * Get all samples for project serialization
   * @returns {SampleData[]}
   */
  getAllSamplesForSave() {
    return Array.from(this.samples.values()).map(s => s.data);
  }

  /**
   * Restore samples from project data
   * @param {SampleData[]} samples
   */
  async restoreFromProject(samples) {
    for (const sampleData of samples) {
      try {
        await this.loadFromBase64(sampleData);
      } catch (error) {
        console.error(`Failed to restore sample ${sampleData.filename}:`, error);
      }
    }
  }

  // === Utility Functions ===

  /**
   * Convert ArrayBuffer to Base64
   * @param {ArrayBuffer} buffer
   * @returns {string}
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 to ArrayBuffer
   * @param {string} base64
   * @returns {ArrayBuffer}
   */
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Format duration for display
   * @param {number} seconds
   * @returns {string}
   */
  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  /**
   * Get file size estimate from Base64
   * @param {string} base64
   * @returns {string}
   */
  formatFileSize(base64) {
    const bytes = Math.ceil((base64.length * 3) / 4);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// Singleton instance
export const sampleManager = new SampleManager();

/**
 * Sample Player - Plays samples with precise timing
 */
export class SamplePlayer {
  constructor(sampleId) {
    this.sampleId = sampleId;
    this.source = null;
    this.gainNode = null;
    this.isPlaying = false;
    this.startTime = 0;
    this.offset = 0;
  }

  /**
   * Play the sample
   * @param {number} time - When to start (audioContext.currentTime)
   * @param {number} offset - Start offset in seconds
   * @param {number} duration - Duration to play (optional)
   * @param {AudioNode} destination - Where to connect output
   */
  play(time = audioContext.currentTime, offset = 0, duration = null, destination = null) {
    const buffer = sampleManager.getBuffer(this.sampleId);
    if (!buffer) {
      console.error('Sample not found:', this.sampleId);
      return;
    }

    // Stop any existing playback
    this.stop();

    // Create nodes
    this.source = audioContext.createBufferSource();
    this.source.buffer = buffer;

    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 1;

    // Connect
    this.source.connect(this.gainNode);
    this.gainNode.connect(destination || audioContext.destination);

    // Handle end
    this.source.onended = () => {
      this.isPlaying = false;
      this.source = null;
    };

    // Start
    this.startTime = time;
    this.offset = offset;

    if (duration) {
      this.source.start(time, offset, duration);
    } else {
      this.source.start(time, offset);
    }

    this.isPlaying = true;
  }

  /**
   * Stop playback
   */
  stop() {
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Already stopped
      }
      this.source.disconnect();
      this.source = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    this.isPlaying = false;
  }

  /**
   * Set volume
   * @param {number} volume - 0 to 1
   */
  setVolume(volume) {
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    }
  }

  /**
   * Get current playback position
   * @returns {number} Position in seconds
   */
  getCurrentTime() {
    if (!this.isPlaying) return 0;
    return audioContext.currentTime - this.startTime + this.offset;
  }
}

/**
 * Create file input for sample upload
 * @param {function} onLoad - Callback with SampleData
 * @returns {HTMLInputElement}
 */
export function createSampleUploader(onLoad) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.style.display = 'none';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const sampleData = await sampleManager.loadFromFile(file);
      onLoad(sampleData);
    } catch (error) {
      console.error('Failed to load sample:', error);
      eventBus.emit(Events.TOAST_SHOW, {
        message: `Failed to load: ${error.message}`,
        type: 'error',
      });
    }

    // Reset for next use
    input.value = '';
  });

  document.body.appendChild(input);
  return input;
}

/**
 * Render waveform to canvas
 * @param {HTMLCanvasElement} canvas
 * @param {Float32Array} waveformData
 * @param {Object} options
 */
export function renderWaveform(canvas, waveformData, options = {}) {
  const {
    color = '#4a9eff',
    backgroundColor = 'transparent',
    lineWidth = 1,
    playheadPosition = null, // 0-1
    playheadColor = '#ff4a4a',
  } = options;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const centerY = height / 2;

  // Clear
  ctx.clearRect(0, 0, width, height);

  if (backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  if (!waveformData || waveformData.length === 0) return;

  // Draw waveform
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();

  const step = width / waveformData.length;

  for (let i = 0; i < waveformData.length; i++) {
    const x = i * step;
    const amplitude = waveformData[i] * centerY * 0.9;

    // Draw both positive and negative
    ctx.moveTo(x, centerY - amplitude);
    ctx.lineTo(x, centerY + amplitude);
  }

  ctx.stroke();

  // Draw playhead
  if (playheadPosition !== null && playheadPosition >= 0 && playheadPosition <= 1) {
    ctx.strokeStyle = playheadColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const x = playheadPosition * width;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
}
