/**
 * Sample Slicer - Automatic slicing of audio loops using onset detection
 * Phase 10: Audio Analysis
 *
 * Slices audio samples at transient points for drum sampling, loop chopping,
 * and triggering individual hits from a single audio file.
 */

import { OnsetDetector } from './onset-detector.js';
import { BPMDetector } from './bpm-detector.js';

/**
 * Sample slice data structure
 * @typedef {Object} SampleSlice
 * @property {string} id - Unique slice identifier
 * @property {number} start - Start time in seconds
 * @property {number} end - End time in seconds
 * @property {number} midiNote - Mapped MIDI note (for triggering)
 * @property {string} name - Slice name (e.g., "Kick 1", "Hit 3")
 * @property {number} strength - Onset strength 0-1
 */

/**
 * Slice configuration
 * @typedef {Object} SliceConfig
 * @property {number} sensitivity - Detection sensitivity 0-1 (default: 0.5)
 * @property {number} minSliceLength - Minimum slice length in seconds (default: 0.05)
 * @property {boolean} snapToGrid - Quantize slices to tempo grid (default: false)
 * @property {number} gridSize - Beat fraction for snapping (default: 1/16)
 * @property {number} detectedBPM - Pre-detected BPM (optional, auto-detect if not provided)
 * @property {number} baseMidiNote - Starting MIDI note for mapping (default: 36, C2)
 */

/**
 * Slicing result
 * @typedef {Object} SliceResult
 * @property {SampleSlice[]} slices - Array of detected slices
 * @property {number} detectedBPM - Detected tempo (if auto-detected)
 * @property {number[]} onsetTimes - Raw onset times
 */

/**
 * Sample Slicer class
 */
export class SampleSlicer {
  /**
   * @param {SliceConfig} config
   */
  constructor(config = {}) {
    this.sensitivity = config.sensitivity || 0.5;
    this.minSliceLength = config.minSliceLength || 0.05;
    this.snapToGrid = config.snapToGrid || false;
    this.gridSize = config.gridSize || 1/16;
    this.detectedBPM = config.detectedBPM || null;
    this.baseMidiNote = config.baseMidiNote || 36; // C2

    this.onsetDetector = new OnsetDetector({
      threshold: 1 - this.sensitivity, // Invert: high sensitivity = low threshold
      minIntervalMs: this.minSliceLength * 1000
    });

    this.bpmDetector = new BPMDetector();
  }

  /**
   * Auto-slice audio buffer at onset points
   * @param {AudioBuffer} audioBuffer
   * @param {SliceConfig} options - Override config for this operation
   * @returns {SliceResult}
   */
  autoSlice(audioBuffer, options = {}) {
    const config = {
      sensitivity: options.sensitivity ?? this.sensitivity,
      minSliceLength: options.minSliceLength ?? this.minSliceLength,
      snapToGrid: options.snapToGrid ?? this.snapToGrid,
      gridSize: options.gridSize ?? this.gridSize,
      detectedBPM: options.detectedBPM ?? this.detectedBPM,
      baseMidiNote: options.baseMidiNote ?? this.baseMidiNote
    };

    // Detect onsets
    const onsetDetector = new OnsetDetector({
      threshold: 1 - config.sensitivity,
      minIntervalMs: config.minSliceLength * 1000
    });

    const onsetResult = onsetDetector.detect(audioBuffer);
    const onsets = onsetResult.onsetTimes;

    if (onsets.length === 0) {
      // No onsets detected - return single slice of entire sample
      return {
        slices: [{
          id: this.generateSliceId(),
          start: 0,
          end: audioBuffer.duration,
          midiNote: config.baseMidiNote,
          name: 'Full Sample',
          strength: 1
        }],
        detectedBPM: 0,
        onsetTimes: []
      };
    }

    // Detect BPM if needed for grid snapping
    let bpm = config.detectedBPM;
    if (config.snapToGrid && !bpm) {
      const bpmResult = this.bpmDetector.detect(audioBuffer);
      bpm = bpmResult.bpm;
    }

    // Create slices from onsets
    let slices = this.createSlicesFromOnsets(
      onsets,
      onsetResult.onsetStrengths,
      audioBuffer.duration,
      config.baseMidiNote
    );

    // Filter by minimum length
    slices = slices.filter(s => (s.end - s.start) >= config.minSliceLength);

    // Snap to grid if enabled
    if (config.snapToGrid && bpm > 0) {
      slices = this.quantizeSlicesToGrid(slices, bpm, config.gridSize);
    }

    // Auto-name slices
    slices = this.autoNameSlices(slices);

    return {
      slices,
      detectedBPM: bpm || 0,
      onsetTimes: onsets
    };
  }

  /**
   * Create slices from onset times
   * @param {number[]} onsets
   * @param {number[]} strengths
   * @param {number} duration
   * @param {number} baseMidiNote
   * @returns {SampleSlice[]}
   */
  createSlicesFromOnsets(onsets, strengths, duration, baseMidiNote) {
    const slices = [];

    // Add leading silence as first slice if onset doesn't start at 0
    if (onsets[0] > 0.01) {
      slices.push({
        id: this.generateSliceId(),
        start: 0,
        end: onsets[0],
        midiNote: baseMidiNote + slices.length,
        name: '',
        strength: 0
      });
    }

    // Create slices between onsets
    for (let i = 0; i < onsets.length; i++) {
      const start = onsets[i];
      const end = (i < onsets.length - 1) ? onsets[i + 1] : duration;
      const strength = strengths[i] || 0;

      slices.push({
        id: this.generateSliceId(),
        start,
        end,
        midiNote: baseMidiNote + slices.length,
        name: '',
        strength
      });
    }

    return slices;
  }

  /**
   * Quantize slices to tempo grid
   * @param {SampleSlice[]} slices
   * @param {number} bpm
   * @param {number} gridSize - Beat fraction (e.g., 1/16)
   * @returns {SampleSlice[]}
   */
  quantizeSlicesToGrid(slices, bpm, gridSize) {
    const beatDuration = 60 / bpm;
    const gridDuration = beatDuration * gridSize;

    return slices.map(slice => {
      const quantizedStart = Math.round(slice.start / gridDuration) * gridDuration;
      const quantizedEnd = Math.round(slice.end / gridDuration) * gridDuration;

      return {
        ...slice,
        start: Math.max(0, quantizedStart),
        end: Math.max(quantizedStart + gridDuration, quantizedEnd)
      };
    });
  }

  /**
   * Auto-name slices based on position and strength
   * @param {SampleSlice[]} slices
   * @returns {SampleSlice[]}
   */
  autoNameSlices(slices) {
    return slices.map((slice, index) => {
      // Simple naming: "Hit 1", "Hit 2", etc.
      const name = slice.name || `Hit ${index + 1}`;

      return {
        ...slice,
        name
      };
    });
  }

  /**
   * Slice by beats (divide into equal beat-length slices)
   * @param {AudioBuffer} audioBuffer
   * @param {number} bpm
   * @param {number} beatsPerSlice - Number of beats per slice (default: 1)
   * @param {number} baseMidiNote
   * @returns {SliceResult}
   */
  sliceByBeats(audioBuffer, bpm, beatsPerSlice = 1, baseMidiNote = 36) {
    const beatDuration = 60 / bpm;
    const sliceDuration = beatDuration * beatsPerSlice;
    const numSlices = Math.floor(audioBuffer.duration / sliceDuration);

    const slices = [];
    for (let i = 0; i < numSlices; i++) {
      slices.push({
        id: this.generateSliceId(),
        start: i * sliceDuration,
        end: (i + 1) * sliceDuration,
        midiNote: baseMidiNote + i,
        name: `Beat ${i + 1}`,
        strength: 1
      });
    }

    // Handle remainder
    const remainder = audioBuffer.duration - (numSlices * sliceDuration);
    if (remainder > 0.01) {
      slices.push({
        id: this.generateSliceId(),
        start: numSlices * sliceDuration,
        end: audioBuffer.duration,
        midiNote: baseMidiNote + numSlices,
        name: `Tail`,
        strength: 0.5
      });
    }

    return {
      slices,
      detectedBPM: bpm,
      onsetTimes: slices.map(s => s.start)
    };
  }

  /**
   * Slice by divisions (divide into N equal parts)
   * @param {AudioBuffer} audioBuffer
   * @param {number} numSlices
   * @param {number} baseMidiNote
   * @returns {SliceResult}
   */
  sliceByDivisions(audioBuffer, numSlices, baseMidiNote = 36) {
    const sliceDuration = audioBuffer.duration / numSlices;

    const slices = [];
    for (let i = 0; i < numSlices; i++) {
      slices.push({
        id: this.generateSliceId(),
        start: i * sliceDuration,
        end: (i + 1) * sliceDuration,
        midiNote: baseMidiNote + i,
        name: `Slice ${i + 1}`,
        strength: 1
      });
    }

    return {
      slices,
      detectedBPM: 0,
      onsetTimes: slices.map(s => s.start)
    };
  }

  /**
   * Manual slice - add a slice at specific time
   * @param {SampleSlice[]} existingSlices
   * @param {number} splitTime - Time to split at
   * @param {number} duration - Total sample duration
   * @param {number} baseMidiNote
   * @returns {SampleSlice[]}
   */
  addSliceAt(existingSlices, splitTime, duration, baseMidiNote = 36) {
    // Find which slice contains the split point
    const sliceIndex = existingSlices.findIndex(s =>
      splitTime > s.start && splitTime < s.end
    );

    if (sliceIndex === -1) {
      return existingSlices;
    }

    const slice = existingSlices[sliceIndex];

    // Create two new slices
    const leftSlice = {
      ...slice,
      id: this.generateSliceId(),
      end: splitTime
    };

    const rightSlice = {
      id: this.generateSliceId(),
      start: splitTime,
      end: slice.end,
      midiNote: slice.midiNote + 1,
      name: '',
      strength: slice.strength
    };

    // Replace original with two new slices
    const newSlices = [...existingSlices];
    newSlices.splice(sliceIndex, 1, leftSlice, rightSlice);

    // Re-assign MIDI notes and names
    return this.autoNameSlices(
      newSlices.map((s, i) => ({
        ...s,
        midiNote: baseMidiNote + i
      }))
    );
  }

  /**
   * Remove a slice (merge with previous or next)
   * @param {SampleSlice[]} existingSlices
   * @param {string} sliceId
   * @returns {SampleSlice[]}
   */
  removeSlice(existingSlices, sliceId) {
    const index = existingSlices.findIndex(s => s.id === sliceId);
    if (index === -1 || existingSlices.length <= 1) {
      return existingSlices;
    }

    const newSlices = [...existingSlices];
    const removed = newSlices.splice(index, 1)[0];

    // Extend adjacent slice to fill the gap
    if (index > 0) {
      newSlices[index - 1] = {
        ...newSlices[index - 1],
        end: removed.end
      };
    } else if (newSlices.length > 0) {
      newSlices[0] = {
        ...newSlices[0],
        start: removed.start
      };
    }

    // Re-assign MIDI notes
    return newSlices.map((s, i) => ({
      ...s,
      midiNote: this.baseMidiNote + i
    }));
  }

  /**
   * Generate unique slice ID
   * @returns {string}
   */
  generateSliceId() {
    return `slice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Export slices as individual audio buffers
   * @param {AudioBuffer} sourceBuffer
   * @param {SampleSlice[]} slices
   * @param {AudioContext} audioContext
   * @returns {Map<string, AudioBuffer>}
   */
  exportSlicesAsBuffers(sourceBuffer, slices, audioContext) {
    const buffers = new Map();
    const sampleRate = sourceBuffer.sampleRate;
    const channels = sourceBuffer.numberOfChannels;

    for (const slice of slices) {
      const startSample = Math.floor(slice.start * sampleRate);
      const endSample = Math.floor(slice.end * sampleRate);
      const length = endSample - startSample;

      if (length <= 0) continue;

      const buffer = audioContext.createBuffer(channels, length, sampleRate);

      for (let ch = 0; ch < channels; ch++) {
        const source = sourceBuffer.getChannelData(ch);
        const dest = buffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          dest[i] = source[startSample + i];
        }
      }

      buffers.set(slice.id, buffer);
    }

    return buffers;
  }
}

/**
 * Factory function for creating sample slicer
 * @param {SliceConfig} config
 * @returns {SampleSlicer}
 */
export function createSampleSlicer(config = {}) {
  return new SampleSlicer(config);
}

// Default singleton instance
export const sampleSlicer = new SampleSlicer();
