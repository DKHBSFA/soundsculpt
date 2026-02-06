/**
 * Pitch Detector - YIN algorithm implementation for fundamental frequency detection
 * Phase 10: Audio Analysis
 *
 * YIN is a robust autocorrelation-based pitch detection algorithm.
 * Reference: "YIN, a fundamental frequency estimator for speech and music"
 * by Alain de Cheveigné and Hideki Kawahara, 2002
 */

/**
 * Pitch detection result
 * @typedef {Object} PitchResult
 * @property {number} frequency - Detected frequency in Hz
 * @property {string} note - Musical note name (e.g., "A4")
 * @property {number} midiNote - MIDI note number (0-127)
 * @property {number} cents - Cents deviation from nearest note
 * @property {number} confidence - Detection confidence 0-1
 */

/**
 * Pitch detection configuration
 * @typedef {Object} PitchConfig
 * @property {number} threshold - YIN threshold (default: 0.1, lower = stricter)
 * @property {number} minFreq - Minimum detectable frequency (default: 50 Hz)
 * @property {number} maxFreq - Maximum detectable frequency (default: 2000 Hz)
 * @property {number} analysisWindow - Window size in seconds (default: 0.1)
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Pitch Detector class using YIN algorithm
 */
export class PitchDetector {
  /**
   * @param {PitchConfig} config
   */
  constructor(config = {}) {
    this.threshold = config.threshold || 0.1;
    this.minFreq = config.minFreq || 50;
    this.maxFreq = config.maxFreq || 2000;
    this.analysisWindow = config.analysisWindow || 0.1; // 100ms
  }

  /**
   * Detect pitch from audio buffer
   * Analyzes multiple windows and returns the most confident result
   * @param {AudioBuffer} audioBuffer
   * @returns {PitchResult}
   */
  detectPitch(audioBuffer) {
    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Analyze first 2 seconds max
    const maxSamples = Math.min(data.length, sampleRate * 2);
    const windowSize = Math.floor(this.analysisWindow * sampleRate);

    // Collect pitch estimates from multiple windows
    const estimates = [];
    const numWindows = Math.floor(maxSamples / windowSize);

    for (let i = 0; i < numWindows; i++) {
      const start = i * windowSize;
      const frame = data.slice(start, start + windowSize);

      const result = this.detectPitchInFrame(frame, sampleRate);
      if (result.confidence > 0.5) {
        estimates.push(result);
      }
    }

    if (estimates.length === 0) {
      return {
        frequency: 0,
        note: 'N/A',
        midiNote: -1,
        cents: 0,
        confidence: 0
      };
    }

    // Return most confident or median pitch
    return this.aggregateEstimates(estimates);
  }

  /**
   * Detect pitch in a single frame using YIN algorithm
   * @param {Float32Array} frame - Audio samples
   * @param {number} sampleRate
   * @returns {PitchResult}
   */
  detectPitchInFrame(frame, sampleRate) {
    const minPeriod = Math.floor(sampleRate / this.maxFreq);
    const maxPeriod = Math.floor(sampleRate / this.minFreq);

    // Step 1: Calculate difference function d(tau)
    const diff = this.differenceFunction(frame, maxPeriod);

    // Step 2: Calculate cumulative mean normalized difference d'(tau)
    const cmndf = this.cumulativeMeanNormalizedDifference(diff);

    // Step 3: Find tau with dip below threshold
    const tau = this.absoluteThreshold(cmndf, minPeriod, maxPeriod);

    if (tau === -1) {
      return { frequency: 0, note: 'N/A', midiNote: -1, cents: 0, confidence: 0 };
    }

    // Step 4: Parabolic interpolation for sub-sample accuracy
    const refinedTau = this.parabolicInterpolation(cmndf, tau);

    // Calculate frequency
    const frequency = sampleRate / refinedTau;

    // Calculate confidence (inverse of CMNDF value at tau)
    const confidence = 1 - cmndf[tau];

    // Convert to musical note
    const noteInfo = this.frequencyToNote(frequency);

    return {
      frequency,
      note: noteInfo.note,
      midiNote: noteInfo.midiNote,
      cents: noteInfo.cents,
      confidence: Math.max(0, Math.min(1, confidence))
    };
  }

  /**
   * Calculate YIN difference function
   * d(tau) = sum of squared differences between sample and sample+tau
   * @param {Float32Array} frame
   * @param {number} maxPeriod
   * @returns {Float32Array}
   */
  differenceFunction(frame, maxPeriod) {
    const diff = new Float32Array(maxPeriod + 1);
    const n = frame.length;

    for (let tau = 0; tau <= maxPeriod; tau++) {
      let sum = 0;
      for (let i = 0; i < n - maxPeriod; i++) {
        const delta = frame[i] - frame[i + tau];
        sum += delta * delta;
      }
      diff[tau] = sum;
    }

    return diff;
  }

  /**
   * Calculate cumulative mean normalized difference function
   * d'(tau) = d(tau) / ((1/tau) * sum(d(j) for j=1..tau))
   * @param {Float32Array} diff
   * @returns {Float32Array}
   */
  cumulativeMeanNormalizedDifference(diff) {
    const cmndf = new Float32Array(diff.length);
    cmndf[0] = 1;

    let runningSum = 0;
    for (let tau = 1; tau < diff.length; tau++) {
      runningSum += diff[tau];
      cmndf[tau] = diff[tau] * tau / runningSum;
    }

    return cmndf;
  }

  /**
   * Find first tau that dips below threshold
   * @param {Float32Array} cmndf
   * @param {number} minPeriod
   * @param {number} maxPeriod
   * @returns {number} tau or -1 if not found
   */
  absoluteThreshold(cmndf, minPeriod, maxPeriod) {
    // Find first local minimum below threshold
    let tau = minPeriod;

    while (tau < maxPeriod) {
      if (cmndf[tau] < this.threshold) {
        // Find the local minimum
        while (tau + 1 < maxPeriod && cmndf[tau + 1] < cmndf[tau]) {
          tau++;
        }
        return tau;
      }
      tau++;
    }

    // No dip below threshold found - find global minimum
    let minVal = Infinity;
    let minTau = -1;

    for (let t = minPeriod; t < maxPeriod; t++) {
      if (cmndf[t] < minVal) {
        minVal = cmndf[t];
        minTau = t;
      }
    }

    // Only return if it's reasonably low
    if (minVal < 0.5) {
      return minTau;
    }

    return -1;
  }

  /**
   * Parabolic interpolation for sub-sample tau refinement
   * @param {Float32Array} cmndf
   * @param {number} tau
   * @returns {number}
   */
  parabolicInterpolation(cmndf, tau) {
    if (tau < 1 || tau >= cmndf.length - 1) {
      return tau;
    }

    const s0 = cmndf[tau - 1];
    const s1 = cmndf[tau];
    const s2 = cmndf[tau + 1];

    // Parabolic fit: find vertex
    const adjustment = (s2 - s0) / (2 * (2 * s1 - s0 - s2));

    if (Math.abs(adjustment) < 1) {
      return tau + adjustment;
    }

    return tau;
  }

  /**
   * Convert frequency to musical note information
   * @param {number} frequency
   * @returns {{note: string, midiNote: number, cents: number}}
   */
  frequencyToNote(frequency) {
    if (frequency <= 0) {
      return { note: 'N/A', midiNote: -1, cents: 0 };
    }

    // MIDI note formula: n = 12 * log2(f / 440) + 69
    const midiFloat = 12 * Math.log2(frequency / 440) + 69;
    const midiNote = Math.round(midiFloat);
    const cents = Math.round((midiFloat - midiNote) * 100);

    // Note name and octave
    const noteIndex = ((midiNote % 12) + 12) % 12;
    const octave = Math.floor(midiNote / 12) - 1;
    const noteName = NOTE_NAMES[noteIndex];

    return {
      note: `${noteName}${octave}`,
      midiNote,
      cents
    };
  }

  /**
   * Convert note name to frequency
   * @param {string} noteName - e.g., "A4", "C#3"
   * @returns {number} frequency in Hz
   */
  noteToFrequency(noteName) {
    const match = noteName.match(/^([A-G]#?)(-?\d+)$/);
    if (!match) return 0;

    const note = match[1];
    const octave = parseInt(match[2], 10);

    const noteIndex = NOTE_NAMES.indexOf(note);
    if (noteIndex === -1) return 0;

    const midiNote = (octave + 1) * 12 + noteIndex;
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  /**
   * Aggregate multiple pitch estimates
   * @param {PitchResult[]} estimates
   * @returns {PitchResult}
   */
  aggregateEstimates(estimates) {
    if (estimates.length === 0) {
      return { frequency: 0, note: 'N/A', midiNote: -1, cents: 0, confidence: 0 };
    }

    // Sort by confidence
    estimates.sort((a, b) => b.confidence - a.confidence);

    // Return highest confidence estimate
    // Could also use median or weighted average for more robustness
    return estimates[0];
  }

  /**
   * Detect pitch in real-time from audio samples
   * For use with live audio input
   * @param {Float32Array} samples
   * @param {number} sampleRate
   * @returns {PitchResult}
   */
  detectRealtime(samples, sampleRate) {
    return this.detectPitchInFrame(samples, sampleRate);
  }
}

/**
 * Factory function for creating pitch detector
 * @param {PitchConfig} config
 * @returns {PitchDetector}
 */
export function createPitchDetector(config = {}) {
  return new PitchDetector(config);
}

// Default singleton instance
export const pitchDetector = new PitchDetector();
