/**
 * BPM Detector - Tempo detection from audio using onset-based analysis
 * Phase 10: Audio Analysis
 *
 * Uses onset detection and inter-onset interval analysis with histogram
 * clustering to find the dominant tempo.
 */

import { OnsetDetector } from './onset-detector.js';

/**
 * BPM detection result
 * @typedef {Object} BPMResult
 * @property {number} bpm - Detected tempo in beats per minute
 * @property {number} confidence - Detection confidence 0-1
 * @property {number[]} onsetTimes - Detected onset times in seconds
 * @property {number[]} candidates - Top BPM candidates with confidences
 */

/**
 * BPM detection configuration
 * @typedef {Object} BPMConfig
 * @property {number} minBPM - Minimum BPM to detect (default: 60)
 * @property {number} maxBPM - Maximum BPM to detect (default: 200)
 * @property {number} onsetThreshold - Onset detection threshold (default: 0.3)
 * @property {number} histogramResolution - BPM histogram bin size (default: 1)
 */

/**
 * BPM Detector class
 */
export class BPMDetector {
  /**
   * @param {BPMConfig} config
   */
  constructor(config = {}) {
    this.minBPM = config.minBPM || 60;
    this.maxBPM = config.maxBPM || 200;
    this.onsetThreshold = config.onsetThreshold || 0.3;
    this.histogramResolution = config.histogramResolution || 1;

    this.onsetDetector = new OnsetDetector({
      threshold: this.onsetThreshold,
      minIntervalMs: 60000 / this.maxBPM / 2 // Allow fast subdivisions
    });
  }

  /**
   * Detect BPM from audio buffer
   * @param {AudioBuffer} audioBuffer
   * @returns {BPMResult}
   */
  detect(audioBuffer) {
    // Step 1: Detect onsets
    const onsetResult = this.onsetDetector.detect(audioBuffer);
    const onsets = onsetResult.onsetTimes;

    if (onsets.length < 4) {
      return {
        bpm: 0,
        confidence: 0,
        onsetTimes: onsets,
        candidates: []
      };
    }

    // Step 2: Calculate inter-onset intervals (IOIs)
    const intervals = this.calculateIntervals(onsets);

    // Step 3: Build BPM histogram
    const histogram = this.buildBPMHistogram(intervals);

    // Step 4: Find peaks in histogram
    const candidates = this.findHistogramPeaks(histogram);

    // Step 5: Select best candidate with octave error correction
    const bestBPM = this.selectBestBPM(candidates);

    // Step 6: Calculate confidence
    const confidence = this.calculateConfidence(intervals, bestBPM);

    return {
      bpm: Math.round(bestBPM),
      confidence,
      onsetTimes: onsets,
      candidates: candidates.slice(0, 5)
    };
  }

  /**
   * Calculate inter-onset intervals
   * @param {number[]} onsets - Onset times in seconds
   * @returns {number[]} - Intervals in seconds
   */
  calculateIntervals(onsets) {
    const intervals = [];

    for (let i = 1; i < onsets.length; i++) {
      const interval = onsets[i] - onsets[i - 1];
      // Filter out very short or very long intervals
      const bpm = 60 / interval;
      if (bpm >= this.minBPM / 4 && bpm <= this.maxBPM * 4) {
        intervals.push(interval);
      }
    }

    // Also consider intervals between non-adjacent onsets (skip patterns)
    for (let skip = 2; skip <= 4; skip++) {
      for (let i = skip; i < onsets.length; i++) {
        const interval = (onsets[i] - onsets[i - skip]) / skip;
        const bpm = 60 / interval;
        if (bpm >= this.minBPM && bpm <= this.maxBPM) {
          intervals.push(interval);
        }
      }
    }

    return intervals;
  }

  /**
   * Build histogram of BPM values from intervals
   * @param {number[]} intervals - IOIs in seconds
   * @returns {Map<number, number>} - BPM -> weight
   */
  buildBPMHistogram(intervals) {
    const histogram = new Map();

    for (const interval of intervals) {
      const bpm = 60 / interval;

      // Only count BPMs in our target range and related octaves
      const bpmVariants = [bpm, bpm * 2, bpm / 2, bpm * 4, bpm / 4];

      for (const variant of bpmVariants) {
        if (variant >= this.minBPM && variant <= this.maxBPM) {
          // Quantize to histogram resolution
          const binKey = Math.round(variant / this.histogramResolution) * this.histogramResolution;

          // Weight by proximity to common tempos and preference for whole numbers
          let weight = 1;
          if (Math.abs(binKey - Math.round(binKey)) < 0.01) weight *= 1.1;

          // Common tempo bonus
          const commonTempos = [60, 80, 90, 100, 110, 120, 128, 130, 140, 150, 160, 170, 180];
          if (commonTempos.some(t => Math.abs(binKey - t) < 2)) {
            weight *= 1.2;
          }

          histogram.set(binKey, (histogram.get(binKey) || 0) + weight);
        }
      }
    }

    return histogram;
  }

  /**
   * Find peaks in BPM histogram
   * @param {Map<number, number>} histogram
   * @returns {{bpm: number, weight: number}[]}
   */
  findHistogramPeaks(histogram) {
    const entries = Array.from(histogram.entries())
      .map(([bpm, weight]) => ({ bpm, weight }))
      .sort((a, b) => b.weight - a.weight);

    if (entries.length === 0) return [];

    // Cluster nearby BPMs and take the peak of each cluster
    const peaks = [];
    const clusterWidth = 4; // BPM tolerance for clustering

    for (const entry of entries) {
      const nearbyPeak = peaks.find(p => Math.abs(p.bpm - entry.bpm) < clusterWidth);
      if (!nearbyPeak) {
        peaks.push(entry);
      }
    }

    return peaks;
  }

  /**
   * Select best BPM from candidates, handling octave errors
   * @param {{bpm: number, weight: number}[]} candidates
   * @returns {number}
   */
  selectBestBPM(candidates) {
    if (candidates.length === 0) return 0;

    const topCandidate = candidates[0];

    // Check if a half-time or double-time version is also strong
    for (const candidate of candidates.slice(1)) {
      const ratio = candidate.bpm / topCandidate.bpm;

      // If double-time is almost as strong, prefer it (more common for music)
      if (Math.abs(ratio - 2) < 0.05 && candidate.weight > topCandidate.weight * 0.7) {
        // Check if double-time is in more "standard" range
        if (candidate.bpm >= 100 && candidate.bpm <= 160) {
          return candidate.bpm;
        }
      }

      // If half-time is much stronger (rare), use it
      if (Math.abs(ratio - 0.5) < 0.05 && candidate.weight > topCandidate.weight * 1.3) {
        return candidate.bpm;
      }
    }

    // Prefer BPM in common range
    if (topCandidate.bpm < 70 && topCandidate.bpm * 2 <= this.maxBPM) {
      return topCandidate.bpm * 2;
    }
    if (topCandidate.bpm > 170 && topCandidate.bpm / 2 >= this.minBPM) {
      return topCandidate.bpm / 2;
    }

    return topCandidate.bpm;
  }

  /**
   * Calculate confidence based on how well intervals match the detected BPM
   * @param {number[]} intervals - IOIs in seconds
   * @param {number} bpm - Detected BPM
   * @returns {number} 0-1
   */
  calculateConfidence(intervals, bpm) {
    if (bpm === 0 || intervals.length === 0) return 0;

    const beatInterval = 60 / bpm;
    let matchingIntervals = 0;

    for (const interval of intervals) {
      // Check if interval matches beat, half beat, or double beat
      const ratios = [1, 0.5, 2, 0.25, 4];
      for (const ratio of ratios) {
        const expected = beatInterval * ratio;
        const error = Math.abs(interval - expected) / expected;
        if (error < 0.1) {
          matchingIntervals++;
          break;
        }
      }
    }

    return matchingIntervals / intervals.length;
  }

  /**
   * Quick BPM estimate using autocorrelation
   * Alternative method, useful for verification
   * @param {AudioBuffer} audioBuffer
   * @returns {number} - Estimated BPM
   */
  detectViaAutocorrelation(audioBuffer) {
    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Downsample for efficiency
    const downsampleFactor = 8;
    const downsampled = new Float32Array(Math.floor(data.length / downsampleFactor));
    for (let i = 0; i < downsampled.length; i++) {
      downsampled[i] = Math.abs(data[i * downsampleFactor]);
    }

    const effectiveSampleRate = sampleRate / downsampleFactor;

    // Lag range for target BPM range
    const minLag = Math.floor(effectiveSampleRate * 60 / this.maxBPM);
    const maxLag = Math.floor(effectiveSampleRate * 60 / this.minBPM);

    // Compute autocorrelation
    const autocorr = new Float32Array(maxLag - minLag + 1);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      const n = downsampled.length - lag;
      for (let i = 0; i < n; i++) {
        sum += downsampled[i] * downsampled[i + lag];
      }
      autocorr[lag - minLag] = sum / n;
    }

    // Find peak
    let maxVal = 0;
    let maxLagIndex = 0;
    for (let i = 0; i < autocorr.length; i++) {
      if (autocorr[i] > maxVal) {
        maxVal = autocorr[i];
        maxLagIndex = i;
      }
    }

    const bestLag = maxLagIndex + minLag;
    return Math.round(effectiveSampleRate * 60 / bestLag);
  }

  /**
   * Detect BPM using multiple methods and consensus
   * @param {AudioBuffer} audioBuffer
   * @returns {BPMResult}
   */
  detectMultiMethod(audioBuffer) {
    const onsetResult = this.detect(audioBuffer);
    const autocorrBPM = this.detectViaAutocorrelation(audioBuffer);

    // If methods agree (within 5 BPM), high confidence
    if (Math.abs(onsetResult.bpm - autocorrBPM) < 5) {
      return {
        ...onsetResult,
        confidence: Math.min(1, onsetResult.confidence + 0.2)
      };
    }

    // If one is double the other, use the one in more common range
    if (Math.abs(onsetResult.bpm - autocorrBPM * 2) < 5 ||
        Math.abs(onsetResult.bpm * 2 - autocorrBPM) < 5) {
      const candidates = [onsetResult.bpm, autocorrBPM];
      const bestBPM = candidates.reduce((best, bpm) => {
        const score = (bpm >= 80 && bpm <= 160) ? 2 : 1;
        const bestScore = (best >= 80 && best <= 160) ? 2 : 1;
        return score > bestScore ? bpm : best;
      });
      return {
        ...onsetResult,
        bpm: Math.round(bestBPM),
        confidence: onsetResult.confidence * 0.9
      };
    }

    // Methods disagree - return onset-based with reduced confidence
    return {
      ...onsetResult,
      confidence: onsetResult.confidence * 0.7
    };
  }
}

/**
 * Factory function for creating BPM detector
 * @param {BPMConfig} config
 * @returns {BPMDetector}
 */
export function createBPMDetector(config = {}) {
  return new BPMDetector(config);
}

// Default singleton instance
export const bpmDetector = new BPMDetector();
