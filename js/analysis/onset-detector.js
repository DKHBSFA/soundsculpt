/**
 * Onset Detector - Spectral flux onset detection for audio analysis
 * Phase 10: Audio Analysis
 *
 * Uses spectral flux algorithm to detect transient events (onsets) in audio.
 * Spectral flux measures the change in spectral energy between consecutive frames.
 */

/**
 * Onset detection configuration
 * @typedef {Object} OnsetConfig
 * @property {number} fftSize - FFT window size (default: 2048)
 * @property {number} hopSize - Hop size between frames (default: 512)
 * @property {number} threshold - Detection threshold 0-1 (default: 0.5)
 * @property {number} minIntervalMs - Minimum time between onsets in ms (default: 50)
 */

/**
 * Onset detection result
 * @typedef {Object} OnsetResult
 * @property {number[]} onsetTimes - Array of onset times in seconds
 * @property {number[]} onsetStrengths - Array of onset strengths (0-1)
 * @property {Float32Array} spectralFlux - Full spectral flux curve
 * @property {number} threshold - Threshold used for detection
 */

/**
 * Onset Detector class using spectral flux algorithm
 */
export class OnsetDetector {
  /**
   * @param {OnsetConfig} config
   */
  constructor(config = {}) {
    this.fftSize = config.fftSize || 2048;
    this.hopSize = config.hopSize || 512;
    this.threshold = config.threshold || 0.5;
    this.minIntervalMs = config.minIntervalMs || 50;
  }

  /**
   * Detect onsets in an audio buffer
   * @param {AudioBuffer} audioBuffer
   * @returns {OnsetResult}
   */
  detect(audioBuffer) {
    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Calculate spectral flux
    const spectralFlux = this.calculateSpectralFlux(data, sampleRate);

    // Normalize spectral flux
    const normalizedFlux = this.normalizeFlux(spectralFlux);

    // Adaptive threshold based on local statistics
    const adaptiveThreshold = this.calculateAdaptiveThreshold(normalizedFlux);

    // Pick peaks above threshold
    const peaks = this.pickPeaks(normalizedFlux, adaptiveThreshold, sampleRate);

    return {
      onsetTimes: peaks.times,
      onsetStrengths: peaks.strengths,
      spectralFlux: normalizedFlux,
      threshold: this.threshold
    };
  }

  /**
   * Calculate spectral flux from audio data
   * @param {Float32Array} data - Audio samples
   * @param {number} sampleRate
   * @returns {Float32Array}
   */
  calculateSpectralFlux(data, sampleRate) {
    const numFrames = Math.floor((data.length - this.fftSize) / this.hopSize) + 1;
    const spectralFlux = new Float32Array(numFrames);

    // Window function (Hann window)
    const window = this.createHannWindow(this.fftSize);

    // Previous frame's magnitude spectrum
    let prevMagnitudes = new Float32Array(this.fftSize / 2);

    for (let i = 0; i < numFrames; i++) {
      const start = i * this.hopSize;

      // Extract frame and apply window
      const frame = new Float32Array(this.fftSize);
      for (let j = 0; j < this.fftSize && start + j < data.length; j++) {
        frame[j] = data[start + j] * window[j];
      }

      // Compute FFT magnitude spectrum
      const magnitudes = this.computeMagnitudeSpectrum(frame);

      // Calculate spectral flux (sum of positive differences)
      let flux = 0;
      for (let j = 0; j < magnitudes.length; j++) {
        const diff = magnitudes[j] - prevMagnitudes[j];
        if (diff > 0) {
          flux += diff;
        }
      }

      spectralFlux[i] = flux;
      prevMagnitudes = magnitudes;
    }

    return spectralFlux;
  }

  /**
   * Create Hann window function
   * @param {number} size
   * @returns {Float32Array}
   */
  createHannWindow(size) {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
    }
    return window;
  }

  /**
   * Compute magnitude spectrum using real FFT
   * Simplified DFT implementation for onset detection
   * @param {Float32Array} frame - Windowed frame
   * @returns {Float32Array} - Magnitude spectrum (positive frequencies only)
   */
  computeMagnitudeSpectrum(frame) {
    const n = frame.length;
    const numBins = n / 2;
    const magnitudes = new Float32Array(numBins);

    // Simplified DFT - only computing magnitudes we need
    // For production, consider using Web Audio's OfflineAnalyserNode or FFT library
    for (let k = 0; k < numBins; k++) {
      let re = 0, im = 0;
      const w = -2 * Math.PI * k / n;

      for (let t = 0; t < n; t++) {
        const angle = w * t;
        re += frame[t] * Math.cos(angle);
        im += frame[t] * Math.sin(angle);
      }

      magnitudes[k] = Math.sqrt(re * re + im * im) / n;
    }

    return magnitudes;
  }

  /**
   * Normalize spectral flux to 0-1 range
   * @param {Float32Array} flux
   * @returns {Float32Array}
   */
  normalizeFlux(flux) {
    let max = 0;
    for (let i = 0; i < flux.length; i++) {
      if (flux[i] > max) max = flux[i];
    }

    if (max === 0) return flux;

    const normalized = new Float32Array(flux.length);
    for (let i = 0; i < flux.length; i++) {
      normalized[i] = flux[i] / max;
    }
    return normalized;
  }

  /**
   * Calculate adaptive threshold using local statistics
   * @param {Float32Array} flux - Normalized spectral flux
   * @returns {Float32Array} - Per-frame threshold values
   */
  calculateAdaptiveThreshold(flux) {
    const windowSize = 10; // Frames for local average
    const thresholds = new Float32Array(flux.length);

    for (let i = 0; i < flux.length; i++) {
      // Calculate local mean
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - windowSize); j < Math.min(flux.length, i + windowSize + 1); j++) {
        sum += flux[j];
        count++;
      }
      const localMean = sum / count;

      // Threshold is base threshold scaled by local mean
      thresholds[i] = Math.max(this.threshold, localMean + this.threshold * 0.5);
    }

    return thresholds;
  }

  /**
   * Pick peaks from spectral flux that exceed threshold
   * @param {Float32Array} flux - Normalized spectral flux
   * @param {Float32Array} thresholds - Adaptive thresholds
   * @param {number} sampleRate
   * @returns {{times: number[], strengths: number[]}}
   */
  pickPeaks(flux, thresholds, sampleRate) {
    const times = [];
    const strengths = [];
    const minIntervalFrames = Math.ceil((this.minIntervalMs / 1000) * sampleRate / this.hopSize);

    let lastPeakFrame = -minIntervalFrames;

    for (let i = 1; i < flux.length - 1; i++) {
      // Check if this is a local maximum
      if (flux[i] > flux[i - 1] && flux[i] >= flux[i + 1]) {
        // Check if above threshold
        if (flux[i] > thresholds[i]) {
          // Check minimum interval
          if (i - lastPeakFrame >= minIntervalFrames) {
            const timeSeconds = (i * this.hopSize) / sampleRate;
            times.push(timeSeconds);
            strengths.push(flux[i]);
            lastPeakFrame = i;
          } else if (flux[i] > strengths[strengths.length - 1]) {
            // Replace previous peak if this one is stronger
            const timeSeconds = (i * this.hopSize) / sampleRate;
            times[times.length - 1] = timeSeconds;
            strengths[strengths.length - 1] = flux[i];
            lastPeakFrame = i;
          }
        }
      }
    }

    return { times, strengths };
  }

  /**
   * Get frame time in seconds
   * @param {number} frameIndex
   * @param {number} sampleRate
   * @returns {number}
   */
  frameToTime(frameIndex, sampleRate) {
    return (frameIndex * this.hopSize) / sampleRate;
  }

  /**
   * Get frame index for a time
   * @param {number} time - Time in seconds
   * @param {number} sampleRate
   * @returns {number}
   */
  timeToFrame(time, sampleRate) {
    return Math.floor((time * sampleRate) / this.hopSize);
  }
}

/**
 * Factory function for creating onset detector
 * @param {OnsetConfig} config
 * @returns {OnsetDetector}
 */
export function createOnsetDetector(config = {}) {
  return new OnsetDetector(config);
}

// Default singleton instance
export const onsetDetector = new OnsetDetector();
