/**
 * Audio Analysis Module - Main entry point
 * Phase 10: Audio Analysis
 *
 * Provides a unified API for all audio analysis features:
 * - Pitch detection (YIN algorithm)
 * - BPM/tempo detection (onset-based)
 * - Onset detection (spectral flux)
 * - Sample slicing (automatic and manual)
 */

import { PitchDetector, pitchDetector } from './pitch-detector.js';
import { BPMDetector, bpmDetector } from './bpm-detector.js';
import { OnsetDetector, onsetDetector } from './onset-detector.js';
import { SampleSlicer, sampleSlicer } from './sample-slicer.js';

export {
  // Pitch detection
  PitchDetector,
  pitchDetector,

  // BPM detection
  BPMDetector,
  bpmDetector,

  // Onset detection
  OnsetDetector,
  onsetDetector,

  // Sample slicing
  SampleSlicer,
  sampleSlicer,
};

/**
 * Analyze a sample and return all detected properties
 * @param {AudioBuffer} audioBuffer
 * @returns {Promise<Object>} Analysis results
 */
export async function analyzeSample(audioBuffer) {
  const results = {
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    channels: audioBuffer.numberOfChannels,
  };

  // Detect pitch
  try {
    const pitchResult = pitchDetector.detectPitch(audioBuffer);
    results.pitch = pitchResult;
  } catch (e) {
    console.warn('Pitch detection failed:', e);
    results.pitch = null;
  }

  // Detect BPM
  try {
    const bpmResult = bpmDetector.detect(audioBuffer);
    results.bpm = bpmResult;
  } catch (e) {
    console.warn('BPM detection failed:', e);
    results.bpm = null;
  }

  // Detect onsets
  try {
    const onsetResult = onsetDetector.detect(audioBuffer);
    results.onsets = onsetResult;
  } catch (e) {
    console.warn('Onset detection failed:', e);
    results.onsets = null;
  }

  return results;
}

/**
 * Quick BPM detection (optimized for speed)
 * @param {AudioBuffer} audioBuffer
 * @returns {number} Detected BPM or 0 if not detected
 */
export function quickBPMDetect(audioBuffer) {
  try {
    const result = bpmDetector.detect(audioBuffer);
    return result.confidence > 0.5 ? result.bpm : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Quick pitch detection
 * @param {AudioBuffer} audioBuffer
 * @returns {string} Note name or 'N/A'
 */
export function quickPitchDetect(audioBuffer) {
  try {
    const result = pitchDetector.detectPitch(audioBuffer);
    return result.confidence > 0.5 ? result.note : 'N/A';
  } catch (e) {
    return 'N/A';
  }
}

/**
 * Auto-slice a sample
 * @param {AudioBuffer} audioBuffer
 * @param {Object} options - Slicing options
 * @returns {Object} Slice result with slices array
 */
export function autoSliceSample(audioBuffer, options = {}) {
  return sampleSlicer.autoSlice(audioBuffer, options);
}

/**
 * Slice sample by beats
 * @param {AudioBuffer} audioBuffer
 * @param {number} bpm
 * @param {number} beatsPerSlice
 * @returns {Object} Slice result
 */
export function sliceByBeats(audioBuffer, bpm, beatsPerSlice = 1) {
  return sampleSlicer.sliceByBeats(audioBuffer, bpm, beatsPerSlice);
}

/**
 * Slice sample into equal divisions
 * @param {AudioBuffer} audioBuffer
 * @param {number} numSlices
 * @returns {Object} Slice result
 */
export function sliceByDivisions(audioBuffer, numSlices) {
  return sampleSlicer.sliceByDivisions(audioBuffer, numSlices);
}
