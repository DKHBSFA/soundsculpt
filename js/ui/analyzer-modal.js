/**
 * Analyzer Modal - UI for spectrum analyzer and spectrogram visualization
 * Phase 10: Audio Analysis
 */

import { eventBus, Events } from '../event-bus.js';
import { audioContext } from '../audio/context-manager.js';
import {
  AudioAnalyzer,
  SpectrumRenderer,
  SpectrogramRenderer,
  OscilloscopeRenderer,
} from '../audio/analyzer.js';

/**
 * Analyzer Modal Manager
 */
class AnalyzerModalManager {
  constructor() {
    this.modal = null;
    this.isOpen = false;
    this.analyzer = null;
    this.currentView = 'spectrum'; // 'spectrum', 'spectrogram', 'oscilloscope'
    this.renderer = null;
    this.canvas = null;
    this.sourceNode = null;
    this.isConnected = false;
  }

  /**
   * Initialize the analyzer modal
   */
  init() {
    this.createModalElement();
    this.setupEventListeners();
    this.setupEventBusListeners();
  }

  /**
   * Create the modal DOM element
   */
  createModalElement() {
    // Check if already exists
    if (document.getElementById('analyzer-modal')) {
      this.modal = document.getElementById('analyzer-modal');
      return;
    }

    this.modal = document.createElement('div');
    this.modal.id = 'analyzer-modal';
    this.modal.className = 'modal hidden';
    this.modal.innerHTML = `
      <div class="modal-content analyzer-modal-content">
        <div class="modal-header">
          <h2>Audio Analyzer</h2>
          <button id="btn-close-analyzer" class="btn-icon" title="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="analyzer-controls">
            <div class="view-tabs">
              <button class="view-tab active" data-view="spectrum">Spectrum</button>
              <button class="view-tab" data-view="spectrogram">Spectrogram</button>
              <button class="view-tab" data-view="oscilloscope">Oscilloscope</button>
            </div>
            <div class="analyzer-settings">
              <label>
                <span>FFT Size:</span>
                <select id="analyzer-fft-size">
                  <option value="256">256</option>
                  <option value="512">512</option>
                  <option value="1024">1024</option>
                  <option value="2048" selected>2048</option>
                  <option value="4096">4096</option>
                  <option value="8192">8192</option>
                </select>
              </label>
              <label>
                <span>Smoothing:</span>
                <input type="range" id="analyzer-smoothing" min="0" max="1" step="0.05" value="0.8">
              </label>
              <label class="spectrogram-only" style="display:none">
                <span>Color:</span>
                <select id="analyzer-color-scheme">
                  <option value="heat" selected>Heat</option>
                  <option value="rainbow">Rainbow</option>
                  <option value="grayscale">Grayscale</option>
                </select>
              </label>
            </div>
          </div>
          <div class="analyzer-display">
            <canvas id="analyzer-canvas" width="800" height="300"></canvas>
          </div>
          <div class="analyzer-info">
            <span id="analyzer-centroid">Spectral Centroid: -- Hz</span>
            <span id="analyzer-level">Level: -- dB</span>
            <span id="analyzer-peak">Peak: -- dB</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);
    this.canvas = document.getElementById('analyzer-canvas');
  }

  /**
   * Setup DOM event listeners
   */
  setupEventListeners() {
    // Close button
    const closeBtn = document.getElementById('btn-close-analyzer');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // Keyboard shortcut to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // View tabs
    this.modal.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchView(e.target.dataset.view);
      });
    });

    // FFT size
    const fftSelect = document.getElementById('analyzer-fft-size');
    if (fftSelect) {
      fftSelect.addEventListener('change', (e) => {
        if (this.analyzer) {
          this.analyzer.configure({ fftSize: parseInt(e.target.value) });
        }
      });
    }

    // Smoothing
    const smoothingInput = document.getElementById('analyzer-smoothing');
    if (smoothingInput) {
      smoothingInput.addEventListener('input', (e) => {
        if (this.analyzer) {
          this.analyzer.configure({ smoothingTimeConstant: parseFloat(e.target.value) });
        }
      });
    }

    // Color scheme
    const colorSelect = document.getElementById('analyzer-color-scheme');
    if (colorSelect) {
      colorSelect.addEventListener('change', (e) => {
        if (this.renderer && this.renderer.configure) {
          this.renderer.configure({ colorScheme: e.target.value });
        }
      });
    }
  }

  /**
   * Setup event bus listeners
   */
  setupEventBusListeners() {
    // Open analyzer from menu/button
    eventBus.on('analyzer:open', () => this.open());

    // Connect to audio source
    eventBus.on('analyzer:connect', (sourceNode) => {
      this.connect(sourceNode);
    });
  }

  /**
   * Connect to an audio source
   * @param {AudioNode} sourceNode
   */
  connect(sourceNode) {
    if (!this.analyzer) {
      this.analyzer = new AudioAnalyzer();
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect(this.analyzer.getNode());
      } catch (e) {
        // May not be connected
      }
    }

    this.sourceNode = sourceNode;
    sourceNode.connect(this.analyzer.getNode());
    this.isConnected = true;

    // Also connect analyzer to destination so we can hear audio
    // (analyzer is a passthrough)
    this.analyzer.getNode().connect(audioContext.destination);
  }

  /**
   * Open the analyzer modal
   */
  open() {
    if (!this.modal) return;

    this.isOpen = true;
    this.modal.classList.remove('hidden');

    // Initialize analyzer if not already
    if (!this.analyzer) {
      this.analyzer = new AudioAnalyzer();
    }

    // Start rendering
    this.startRenderer();
    this.startInfoUpdate();

    eventBus.emit(Events.MODAL_OPEN, 'analyzer');
  }

  /**
   * Close the analyzer modal
   */
  close() {
    if (!this.modal) return;

    this.isOpen = false;
    this.modal.classList.add('hidden');

    // Stop rendering
    this.stopRenderer();
    this.stopInfoUpdate();

    eventBus.emit(Events.MODAL_CLOSE, 'analyzer');
  }

  /**
   * Toggle the analyzer modal
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Switch between views
   * @param {string} view - 'spectrum', 'spectrogram', or 'oscilloscope'
   */
  switchView(view) {
    this.currentView = view;

    // Update tab styling
    this.modal.querySelectorAll('.view-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === view);
    });

    // Show/hide spectrogram-only controls
    const spectrogramControls = this.modal.querySelectorAll('.spectrogram-only');
    spectrogramControls.forEach(el => {
      el.style.display = view === 'spectrogram' ? '' : 'none';
    });

    // Restart renderer with new view
    if (this.isOpen) {
      this.stopRenderer();
      this.startRenderer();
    }
  }

  /**
   * Start the appropriate renderer
   */
  startRenderer() {
    if (this.renderer) {
      this.renderer.stop();
    }

    switch (this.currentView) {
      case 'spectrum':
        this.renderer = new SpectrumRenderer(this.canvas, this.analyzer);
        break;
      case 'spectrogram':
        this.renderer = new SpectrogramRenderer(this.canvas, this.analyzer);
        break;
      case 'oscilloscope':
        this.renderer = new OscilloscopeRenderer(this.canvas, this.analyzer);
        break;
    }

    this.renderer.start();
  }

  /**
   * Stop the current renderer
   */
  stopRenderer() {
    if (this.renderer) {
      this.renderer.stop();
      this.renderer = null;
    }
  }

  /**
   * Start info display updates
   */
  startInfoUpdate() {
    this.infoUpdateId = setInterval(() => {
      this.updateInfo();
    }, 100);
  }

  /**
   * Stop info display updates
   */
  stopInfoUpdate() {
    if (this.infoUpdateId) {
      clearInterval(this.infoUpdateId);
      this.infoUpdateId = null;
    }
  }

  /**
   * Update info displays
   */
  updateInfo() {
    if (!this.analyzer) return;

    const centroid = this.analyzer.getSpectralCentroid();
    const rms = this.analyzer.getRMS();
    const peak = this.analyzer.getPeak();

    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;

    const centroidEl = document.getElementById('analyzer-centroid');
    const levelEl = document.getElementById('analyzer-level');
    const peakEl = document.getElementById('analyzer-peak');

    if (centroidEl) {
      centroidEl.textContent = `Spectral Centroid: ${Math.round(centroid)} Hz`;
    }
    if (levelEl) {
      levelEl.textContent = `RMS: ${isFinite(rmsDb) ? rmsDb.toFixed(1) : '--'} dB`;
    }
    if (peakEl) {
      peakEl.textContent = `Peak: ${isFinite(peakDb) ? peakDb.toFixed(1) : '--'} dB`;
    }
  }

  /**
   * Get the analyzer instance
   * @returns {AudioAnalyzer}
   */
  getAnalyzer() {
    return this.analyzer;
  }
}

// Create singleton instance
export const analyzerModal = new AnalyzerModalManager();

// Export for manual initialization
export function initAnalyzerModal() {
  analyzerModal.init();
}
