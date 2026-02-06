/**
 * Audio Analyzer - Real-time FFT analysis, spectrogram, and spectrum visualization
 * Phase 10: Audio Analysis
 *
 * Provides frequency analysis, spectral centroid calculation, and visualization
 * data for spectrum analyzer and spectrogram displays.
 */

import { audioContext } from './context-manager.js';

/**
 * Analyzer configuration
 * @typedef {Object} AnalyzerConfig
 * @property {number} fftSize - FFT window size (default: 2048)
 * @property {number} smoothingTimeConstant - Smoothing 0-1 (default: 0.8)
 * @property {number} minDecibels - Minimum dB value (default: -100)
 * @property {number} maxDecibels - Maximum dB value (default: -30)
 */

/**
 * Audio Analyzer class for real-time frequency analysis
 */
export class AudioAnalyzer {
  /**
   * @param {AudioNode} sourceNode - Audio node to analyze
   * @param {AnalyzerConfig} config
   */
  constructor(sourceNode = null, config = {}) {
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = config.fftSize || 2048;
    this.analyser.smoothingTimeConstant = config.smoothingTimeConstant ?? 0.8;
    this.analyser.minDecibels = config.minDecibels ?? -100;
    this.analyser.maxDecibels = config.maxDecibels ?? -30;

    // Data buffers
    this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);
    this.timeData = new Float32Array(this.analyser.fftSize);
    this.byteFrequencyData = new Uint8Array(this.analyser.frequencyBinCount);

    // Spectrogram history
    this.spectrogramHistory = [];
    this.spectrogramMaxFrames = 100;

    // Connect source if provided
    if (sourceNode) {
      this.connect(sourceNode);
    }
  }

  /**
   * Connect to an audio source
   * @param {AudioNode} sourceNode
   */
  connect(sourceNode) {
    sourceNode.connect(this.analyser);
  }

  /**
   * Disconnect from current source
   */
  disconnect() {
    this.analyser.disconnect();
  }

  /**
   * Get current frequency data in decibels
   * @returns {Float32Array}
   */
  getFrequencyData() {
    this.analyser.getFloatFrequencyData(this.frequencyData);
    return this.frequencyData;
  }

  /**
   * Get current frequency data as bytes (0-255)
   * @returns {Uint8Array}
   */
  getByteFrequencyData() {
    this.analyser.getByteFrequencyData(this.byteFrequencyData);
    return this.byteFrequencyData;
  }

  /**
   * Get current time domain data (waveform)
   * @returns {Float32Array}
   */
  getTimeDomainData() {
    this.analyser.getFloatTimeDomainData(this.timeData);
    return this.timeData;
  }

  /**
   * Get frequency for a given bin index
   * @param {number} binIndex
   * @returns {number} frequency in Hz
   */
  binToFrequency(binIndex) {
    return binIndex * audioContext.sampleRate / this.analyser.fftSize;
  }

  /**
   * Get bin index for a given frequency
   * @param {number} frequency
   * @returns {number}
   */
  frequencyToBin(frequency) {
    return Math.round(frequency * this.analyser.fftSize / audioContext.sampleRate);
  }

  /**
   * Calculate spectral centroid (brightness measure)
   * @returns {number} centroid frequency in Hz
   */
  getSpectralCentroid() {
    const freqs = this.getFrequencyData();
    let weightedSum = 0;
    let sum = 0;

    for (let i = 0; i < freqs.length; i++) {
      // Convert dB to linear magnitude
      const magnitude = Math.pow(10, freqs[i] / 20);
      const frequency = this.binToFrequency(i);
      weightedSum += magnitude * frequency;
      sum += magnitude;
    }

    return sum > 0 ? weightedSum / sum : 0;
  }

  /**
   * Get RMS (root mean square) level
   * @returns {number} RMS value 0-1
   */
  getRMS() {
    const timeData = this.getTimeDomainData();
    let sum = 0;

    for (let i = 0; i < timeData.length; i++) {
      sum += timeData[i] * timeData[i];
    }

    return Math.sqrt(sum / timeData.length);
  }

  /**
   * Get peak level
   * @returns {number} Peak value 0-1
   */
  getPeak() {
    const timeData = this.getTimeDomainData();
    let peak = 0;

    for (let i = 0; i < timeData.length; i++) {
      const abs = Math.abs(timeData[i]);
      if (abs > peak) peak = abs;
    }

    return peak;
  }

  /**
   * Get dB level
   * @returns {number} level in dB
   */
  getDecibelLevel() {
    const rms = this.getRMS();
    if (rms === 0) return -Infinity;
    return 20 * Math.log10(rms);
  }

  /**
   * Add current frame to spectrogram history
   */
  captureSpectrogramFrame() {
    const data = this.getByteFrequencyData();
    this.spectrogramHistory.push(new Uint8Array(data));

    // Limit history size
    if (this.spectrogramHistory.length > this.spectrogramMaxFrames) {
      this.spectrogramHistory.shift();
    }
  }

  /**
   * Get spectrogram data for visualization
   * @returns {Uint8Array[]}
   */
  getSpectrogramData() {
    return this.spectrogramHistory;
  }

  /**
   * Clear spectrogram history
   */
  clearSpectrogramHistory() {
    this.spectrogramHistory = [];
  }

  /**
   * Get frequency band energy levels
   * Useful for visualizations and beat detection
   * @returns {{sub: number, bass: number, lowMid: number, mid: number, highMid: number, high: number}}
   */
  getBandLevels() {
    const freqs = this.getFrequencyData();
    const binCount = freqs.length;

    // Define frequency bands
    const bands = {
      sub: { min: 20, max: 60 },
      bass: { min: 60, max: 250 },
      lowMid: { min: 250, max: 500 },
      mid: { min: 500, max: 2000 },
      highMid: { min: 2000, max: 4000 },
      high: { min: 4000, max: 20000 }
    };

    const result = {};

    for (const [name, range] of Object.entries(bands)) {
      const minBin = this.frequencyToBin(range.min);
      const maxBin = Math.min(this.frequencyToBin(range.max), binCount - 1);

      let sum = 0;
      let count = 0;

      for (let i = minBin; i <= maxBin; i++) {
        // Convert dB to linear and sum
        sum += Math.pow(10, freqs[i] / 20);
        count++;
      }

      result[name] = count > 0 ? sum / count : 0;
    }

    return result;
  }

  /**
   * Configure analyzer settings
   * @param {AnalyzerConfig} config
   */
  configure(config) {
    if (config.fftSize) {
      this.analyser.fftSize = config.fftSize;
      this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);
      this.timeData = new Float32Array(this.analyser.fftSize);
      this.byteFrequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    }
    if (config.smoothingTimeConstant !== undefined) {
      this.analyser.smoothingTimeConstant = config.smoothingTimeConstant;
    }
    if (config.minDecibels !== undefined) {
      this.analyser.minDecibels = config.minDecibels;
    }
    if (config.maxDecibels !== undefined) {
      this.analyser.maxDecibels = config.maxDecibels;
    }
  }

  /**
   * Get the underlying AnalyserNode
   * @returns {AnalyserNode}
   */
  getNode() {
    return this.analyser;
  }
}

/**
 * Spectrum Analyzer Renderer - Renders frequency spectrum visualization
 */
export class SpectrumRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {AudioAnalyzer} analyzer
   */
  constructor(canvas, analyzer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyzer = analyzer;
    this.animationId = null;

    // Render options
    this.options = {
      barWidth: 2,
      barGap: 1,
      barColor: '#4a9eff',
      barGradient: true,
      backgroundColor: '#1a1a2e',
      logarithmic: true, // Use logarithmic frequency scale
      showPeakHold: true,
      peakHoldTime: 1000, // ms
      peakDecay: 0.01
    };

    // Peak hold data
    this.peaks = [];
    this.peakTimes = [];
  }

  /**
   * Start rendering
   */
  start() {
    const render = () => {
      this.render();
      this.animationId = requestAnimationFrame(render);
    };
    render();
  }

  /**
   * Stop rendering
   */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Render a single frame
   */
  render() {
    const { canvas, ctx, options } = this;
    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    const data = this.analyzer.getByteFrequencyData();
    const binCount = data.length;

    // Calculate number of bars
    const barWidth = options.barWidth;
    const barGap = options.barGap;
    const totalBarWidth = barWidth + barGap;
    const numBars = Math.floor(width / totalBarWidth);

    // Create gradient if enabled
    let gradient = null;
    if (options.barGradient) {
      gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, '#00ff88');
      gradient.addColorStop(0.5, '#4a9eff');
      gradient.addColorStop(1, '#ff4a4a');
    }

    // Initialize peak data if needed
    if (this.peaks.length !== numBars) {
      this.peaks = new Array(numBars).fill(0);
      this.peakTimes = new Array(numBars).fill(0);
    }

    const now = Date.now();

    for (let i = 0; i < numBars; i++) {
      // Map bar index to frequency bin (logarithmic or linear)
      let binIndex;
      if (options.logarithmic) {
        // Logarithmic scale for more musical representation
        const logMin = Math.log(1);
        const logMax = Math.log(binCount);
        const logScale = logMin + (i / numBars) * (logMax - logMin);
        binIndex = Math.floor(Math.exp(logScale));
      } else {
        binIndex = Math.floor(i * binCount / numBars);
      }

      binIndex = Math.min(binIndex, binCount - 1);
      const value = data[binIndex];
      const barHeight = (value / 255) * height;

      const x = i * totalBarWidth;

      // Draw bar
      ctx.fillStyle = gradient || options.barColor;
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);

      // Peak hold
      if (options.showPeakHold) {
        if (barHeight > this.peaks[i]) {
          this.peaks[i] = barHeight;
          this.peakTimes[i] = now;
        } else if (now - this.peakTimes[i] > options.peakHoldTime) {
          this.peaks[i] = Math.max(0, this.peaks[i] - options.peakDecay * height);
        }

        // Draw peak line
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, height - this.peaks[i] - 2, barWidth, 2);
      }
    }
  }

  /**
   * Configure renderer options
   * @param {Object} options
   */
  configure(options) {
    Object.assign(this.options, options);
  }
}

/**
 * Spectrogram Renderer - Renders frequency vs time heatmap
 */
export class SpectrogramRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {AudioAnalyzer} analyzer
   */
  constructor(canvas, analyzer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyzer = analyzer;
    this.animationId = null;

    // Render options
    this.options = {
      colorScheme: 'heat', // 'heat', 'grayscale', 'rainbow'
      scrollSpeed: 2, // pixels per frame
      logarithmic: true
    };

    // Image data for scrolling
    this.imageData = null;
  }

  /**
   * Start rendering
   */
  start() {
    const { canvas } = this;

    // Initialize image data
    this.imageData = this.ctx.getImageData(0, 0, canvas.width, canvas.height);

    const render = () => {
      this.render();
      this.animationId = requestAnimationFrame(render);
    };
    render();
  }

  /**
   * Stop rendering
   */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Render a single frame
   */
  render() {
    const { canvas, ctx, options } = this;
    const width = canvas.width;
    const height = canvas.height;

    // Get frequency data
    const data = this.analyzer.getByteFrequencyData();
    const binCount = data.length;

    // Scroll existing image left
    const scrollPixels = options.scrollSpeed;
    const imageData = ctx.getImageData(scrollPixels, 0, width - scrollPixels, height);
    ctx.putImageData(imageData, 0, 0);

    // Draw new column on the right
    for (let y = 0; y < height; y++) {
      // Map y position to frequency bin (inverted, low frequencies at bottom)
      const normalizedY = 1 - (y / height);
      let binIndex;

      if (options.logarithmic) {
        const logMin = Math.log(1);
        const logMax = Math.log(binCount);
        const logScale = logMin + normalizedY * (logMax - logMin);
        binIndex = Math.floor(Math.exp(logScale));
      } else {
        binIndex = Math.floor(normalizedY * binCount);
      }

      binIndex = Math.min(binIndex, binCount - 1);
      const value = data[binIndex];

      // Convert value to color
      const color = this.valueToColor(value);

      ctx.fillStyle = color;
      ctx.fillRect(width - scrollPixels, y, scrollPixels, 1);
    }
  }

  /**
   * Convert frequency magnitude to color
   * @param {number} value - 0-255
   * @returns {string} CSS color
   */
  valueToColor(value) {
    const normalized = value / 255;

    switch (this.options.colorScheme) {
      case 'grayscale':
        const gray = Math.floor(normalized * 255);
        return `rgb(${gray},${gray},${gray})`;

      case 'rainbow':
        // HSL rainbow
        const hue = (1 - normalized) * 270; // Blue to red
        return `hsl(${hue}, 100%, ${normalized * 50}%)`;

      case 'heat':
      default:
        // Heat map: black -> blue -> cyan -> green -> yellow -> red -> white
        if (normalized < 0.1) {
          return `rgb(0,0,${Math.floor(normalized * 10 * 128)})`;
        } else if (normalized < 0.3) {
          const t = (normalized - 0.1) / 0.2;
          return `rgb(0,${Math.floor(t * 255)},${128 + Math.floor(t * 127)})`;
        } else if (normalized < 0.5) {
          const t = (normalized - 0.3) / 0.2;
          return `rgb(0,255,${255 - Math.floor(t * 255)})`;
        } else if (normalized < 0.7) {
          const t = (normalized - 0.5) / 0.2;
          return `rgb(${Math.floor(t * 255)},255,0)`;
        } else if (normalized < 0.9) {
          const t = (normalized - 0.7) / 0.2;
          return `rgb(255,${255 - Math.floor(t * 255)},0)`;
        } else {
          const t = (normalized - 0.9) / 0.1;
          return `rgb(255,${Math.floor(t * 255)},${Math.floor(t * 255)})`;
        }
    }
  }

  /**
   * Configure renderer options
   * @param {Object} options
   */
  configure(options) {
    Object.assign(this.options, options);
  }

  /**
   * Clear the spectrogram
   */
  clear() {
    const { canvas, ctx } = this;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

/**
 * Oscilloscope Renderer - Renders time domain waveform
 */
export class OscilloscopeRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {AudioAnalyzer} analyzer
   */
  constructor(canvas, analyzer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyzer = analyzer;
    this.animationId = null;

    this.options = {
      lineColor: '#00ff88',
      lineWidth: 2,
      backgroundColor: '#1a1a2e',
      gridColor: '#333355'
    };
  }

  /**
   * Start rendering
   */
  start() {
    const render = () => {
      this.render();
      this.animationId = requestAnimationFrame(render);
    };
    render();
  }

  /**
   * Stop rendering
   */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Render a single frame
   */
  render() {
    const { canvas, ctx, options } = this;
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    // Clear
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = options.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Get time domain data
    const data = this.analyzer.getTimeDomainData();
    const step = width / data.length;

    // Draw waveform
    ctx.strokeStyle = options.lineColor;
    ctx.lineWidth = options.lineWidth;
    ctx.beginPath();

    for (let i = 0; i < data.length; i++) {
      const x = i * step;
      const y = centerY + data[i] * centerY * 0.9;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  /**
   * Configure renderer options
   * @param {Object} options
   */
  configure(options) {
    Object.assign(this.options, options);
  }
}

/**
 * Create analyzer connected to master output
 * @returns {AudioAnalyzer}
 */
export function createMasterAnalyzer() {
  const analyzer = new AudioAnalyzer();
  // Note: Caller should connect their audio graph to analyzer.getNode()
  return analyzer;
}

/**
 * Analyze static audio buffer (non-realtime)
 * @param {AudioBuffer} audioBuffer
 * @returns {Object} Analysis results
 */
export function analyzeBuffer(audioBuffer) {
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // RMS
  let sumSquares = 0;
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    sumSquares += data[i] * data[i];
    const abs = Math.abs(data[i]);
    if (abs > peak) peak = abs;
  }
  const rms = Math.sqrt(sumSquares / data.length);

  // DC offset
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  const dcOffset = sum / data.length;

  // Zero crossings (rough frequency estimate)
  let zeroCrossings = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) {
      zeroCrossings++;
    }
  }
  const zeroCrossingRate = zeroCrossings / audioBuffer.duration;

  return {
    duration: audioBuffer.duration,
    sampleRate,
    channels: audioBuffer.numberOfChannels,
    rms,
    rmsDb: 20 * Math.log10(rms),
    peak,
    peakDb: 20 * Math.log10(peak),
    dcOffset,
    zeroCrossingRate,
    estimatedFrequency: zeroCrossingRate / 2
  };
}
