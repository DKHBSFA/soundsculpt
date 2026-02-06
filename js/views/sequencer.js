/**
 * Sequencer View - Step sequencer grid for drum machine style editing
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { history, ToggleStepCommand } from '../history.js';

const DEFAULT_STEPS = 16;
const STEPS_OPTIONS = [16, 32, 64];

/**
 * Sequencer View class
 */
export class SequencerView {
  constructor(container) {
    this.container = container;
    this.steps = DEFAULT_STEPS;
    this.currentStep = -1;
    this.isPlaying = false;
    this.viewName = 'sequencer';
    this.renderPending = false;

    this.init();
  }

  /**
   * Check if this view is currently visible
   */
  isVisible() {
    return state.get('currentView') === this.viewName;
  }

  /**
   * Schedule a render if visible, debounced
   */
  scheduleRender() {
    if (!this.isVisible() || this.renderPending) return;
    this.renderPending = true;
    requestAnimationFrame(() => {
      this.renderPending = false;
      if (this.isVisible()) {
        this.render();
      }
    });
  }

  /**
   * Initialize the sequencer view
   */
  init() {
    this.render();
    this.setupEventListeners();
    this.setupEventBusListeners();
  }

  /**
   * Render the sequencer
   */
  render() {
    const voices = state.get('voices') || [];

    this.container.innerHTML = `
      <div class="sequencer">
        <div class="sequencer-toolbar">
          <span class="sequencer-label">SEQUENCER</span>
          <div class="sequencer-steps-selector">
            <span>Steps:</span>
            ${STEPS_OPTIONS.map(s => `
              <button class="step-btn ${s === this.steps ? 'active' : ''}" data-steps="${s}">${s}</button>
            `).join('')}
          </div>
        </div>

        <div class="sequencer-grid-container">
          <!-- Step numbers header -->
          <div class="sequencer-header">
            <div class="sequencer-voice-label"></div>
            <div class="sequencer-steps-header">
              ${this.renderStepNumbers()}
            </div>
          </div>

          <!-- Voice rows -->
          <div class="sequencer-rows">
            ${voices.length > 0 ? voices.map(voice => this.renderVoiceRow(voice)).join('') : this.renderEmptyState()}
          </div>

          <!-- Playhead -->
          <div class="sequencer-playhead" id="sequencer-playhead" style="left: 0; display: none;"></div>
        </div>
      </div>
    `;

    // Cache DOM references
    this.playheadEl = this.container.querySelector('#sequencer-playhead');
    this.gridContainer = this.container.querySelector('.sequencer-grid-container');

    // Setup click handlers for step buttons
    this.setupGridClickHandlers();
    this.setupToolbarHandlers();
  }

  /**
   * Render step numbers header
   */
  renderStepNumbers() {
    let html = '';
    for (let i = 0; i < this.steps; i++) {
      const isBeat = i % 4 === 0;
      const beat = Math.floor(i / 4) + 1;
      html += `
        <div class="step-number ${isBeat ? 'beat' : ''}" data-step="${i}">
          ${isBeat ? beat : ''}
        </div>
      `;
    }
    return html;
  }

  /**
   * Render a voice row
   */
  renderVoiceRow(voice) {
    const steps = voice.content?.steps || new Array(this.steps).fill(false);
    const isSelected = voice.id === state.get('selectedVoiceId');
    const isMuted = voice.muted;
    const isSoloed = voice.solo;

    // Check if any voice has solo enabled
    const anySolo = (state.get('voices') || []).some(v => v.solo);
    const isAudible = !isMuted && (!anySolo || isSoloed);

    return `
      <div class="sequencer-row ${isSelected ? 'selected' : ''} ${!isAudible ? 'muted' : ''}"
           data-voice-id="${voice.id}"
           style="--voice-color: ${voice.color}">
        <div class="sequencer-voice-label">
          <span class="voice-icon">${voice.icon}</span>
          <span class="voice-name">${voice.name}</span>
        </div>
        <div class="sequencer-steps">
          ${steps.slice(0, this.steps).map((active, i) => `
            <button class="step-cell ${active ? 'active' : ''} ${i === this.currentStep && this.isPlaying ? 'current' : ''}"
                    data-voice-id="${voice.id}"
                    data-step="${i}"
                    aria-label="${voice.name} step ${i + 1} ${active ? 'on' : 'off'}">
              <span class="step-cell-inner"></span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render empty state when no voices exist
   */
  renderEmptyState() {
    return `
      <div class="sequencer-empty">
        <p>No voices yet. Click <strong>+</strong> to add a voice.</p>
      </div>
    `;
  }

  /**
   * Setup click handlers for the grid
   */
  setupGridClickHandlers() {
    this.container.addEventListener('click', (e) => {
      const cell = e.target.closest('.step-cell');
      if (cell) {
        const voiceId = cell.dataset.voiceId;
        const stepIndex = parseInt(cell.dataset.step, 10);
        this.toggleStep(voiceId, stepIndex);
      }

      const row = e.target.closest('.sequencer-row');
      if (row && !e.target.closest('.step-cell')) {
        const voiceId = row.dataset.voiceId;
        state.selectVoice(voiceId);
      }
    });
  }

  /**
   * Setup toolbar handlers
   */
  setupToolbarHandlers() {
    this.container.querySelectorAll('.step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.steps = parseInt(btn.dataset.steps, 10);
        this.render();
      });
    });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Nothing additional needed - click handlers set up in render
  }

  /**
   * Setup event bus listeners
   */
  setupEventBusListeners() {
    // Voice changes - only render if visible
    eventBus.on(Events.VOICE_ADD, () => this.scheduleRender());
    eventBus.on(Events.VOICE_REMOVE, () => this.scheduleRender());
    eventBus.on(Events.VOICE_UPDATE, () => this.scheduleRender());
    eventBus.on(Events.VOICE_MUTE, () => this.scheduleRender());
    eventBus.on(Events.VOICE_SOLO, () => this.scheduleRender());
    eventBus.on(Events.VOICE_SELECT, () => this.scheduleRender());

    // Note changes - only render if visible
    eventBus.on(Events.NOTE_UPDATE, () => this.scheduleRender());

    // Transport changes
    eventBus.on(Events.TRANSPORT_PLAY, () => {
      this.isPlaying = true;
      if (this.playheadEl) {
        this.playheadEl.style.display = 'block';
      }
    });

    eventBus.on(Events.TRANSPORT_STOP, () => {
      this.isPlaying = false;
      this.currentStep = -1;
      if (this.playheadEl) {
        this.playheadEl.style.display = 'none';
      }
      this.clearCurrentStepHighlight();
    });

    eventBus.on(Events.TRANSPORT_PAUSE, () => {
      this.isPlaying = false;
    });

    // Playhead update - only update if visible
    eventBus.on(Events.PLAYHEAD_UPDATE, (beat) => {
      if (this.isVisible()) {
        this.updatePlayhead(beat);
      }
    });

    // Project load - always render (major state change)
    eventBus.on(Events.PROJECT_LOAD, () => this.render());
    eventBus.on(Events.PROJECT_NEW, () => this.render());

    // View change - render when becoming visible
    eventBus.on(Events.VIEW_CHANGE, (viewName) => {
      if (viewName === this.viewName) {
        this.render();
        this.scrollToSelectedVoice();
      }
    });
  }

  /**
   * Scroll to make selected voice visible
   */
  scrollToSelectedVoice() {
    const selectedId = state.get('selectedVoiceId');
    if (!selectedId) return;

    const selectedRow = this.container.querySelector(`.sequencer-row[data-voice-id="${selectedId}"]`);
    if (selectedRow) {
      selectedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /**
   * Toggle a step on/off
   */
  toggleStep(voiceId, stepIndex) {
    const command = new ToggleStepCommand(state, voiceId, stepIndex);
    history.execute(command);

    // Update just the cell that changed
    const cell = this.container.querySelector(
      `.step-cell[data-voice-id="${voiceId}"][data-step="${stepIndex}"]`
    );
    if (cell) {
      const voice = state.getVoice(voiceId);
      const isActive = voice?.content?.steps?.[stepIndex];
      cell.classList.toggle('active', isActive);
      cell.setAttribute('aria-label',
        `${voice?.name || 'Voice'} step ${stepIndex + 1} ${isActive ? 'on' : 'off'}`
      );
    }
  }

  /**
   * Update playhead position
   */
  updatePlayhead(beat) {
    const stepIndex = Math.floor(beat) % this.steps;

    if (stepIndex !== this.currentStep) {
      this.currentStep = stepIndex;
      this.highlightCurrentStep();
      this.updatePlayheadPosition();
    }
  }

  /**
   * Highlight the current step cells
   */
  highlightCurrentStep() {
    // Remove previous highlight
    this.container.querySelectorAll('.step-cell.current').forEach(cell => {
      cell.classList.remove('current');
    });

    // Add highlight to current step
    if (this.currentStep >= 0 && this.isPlaying) {
      this.container.querySelectorAll(`.step-cell[data-step="${this.currentStep}"]`).forEach(cell => {
        cell.classList.add('current');
      });
    }
  }

  /**
   * Clear current step highlight
   */
  clearCurrentStepHighlight() {
    this.container.querySelectorAll('.step-cell.current').forEach(cell => {
      cell.classList.remove('current');
    });
  }

  /**
   * Update playhead visual position
   */
  updatePlayheadPosition() {
    if (!this.playheadEl || !this.gridContainer) return;

    const stepsContainer = this.container.querySelector('.sequencer-steps');
    if (!stepsContainer) return;

    const labelWidth = this.container.querySelector('.sequencer-voice-label')?.offsetWidth || 0;
    const cellWidth = stepsContainer.offsetWidth / this.steps;
    const position = labelWidth + (this.currentStep * cellWidth) + (cellWidth / 2);

    this.playheadEl.style.left = `${position}px`;
  }

  /**
   * Get steps for a voice at a given beat position
   */
  getActiveStepsAtBeat(beat) {
    const stepIndex = Math.floor(beat) % this.steps;
    const voices = state.get('voices') || [];
    const activeVoices = [];

    // Check if any voice has solo enabled
    const anySolo = voices.some(v => v.solo);

    voices.forEach(voice => {
      // Skip muted voices or non-solo voices when solo is active
      if (voice.muted) return;
      if (anySolo && !voice.solo) return;

      const steps = voice.content?.steps || [];
      if (steps[stepIndex]) {
        activeVoices.push({
          voiceId: voice.id,
          voice,
          stepIndex,
        });
      }
    });

    return activeVoices;
  }
}

/**
 * Create and initialize sequencer view
 */
export function createSequencerView(container) {
  return new SequencerView(container);
}
