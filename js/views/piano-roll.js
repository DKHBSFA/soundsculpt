/**
 * Piano Roll View - MIDI-style note editing grid
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { history, AddNoteCommand, DeleteNoteCommand, MoveNoteCommand, ResizeNoteCommand } from '../history.js';

// Constants
const PIANO_KEY_WIDTH = 48;
const NOTE_HEIGHT = 16;
const BEAT_WIDTH = 48;
const MIN_NOTE_DURATION = 0.25;

// Piano range (MIDI notes 36-84 = C2 to C6, 4 octaves)
const MIN_NOTE = 36;
const MAX_NOTE = 84;
const TOTAL_KEYS = MAX_NOTE - MIN_NOTE + 1;

// Snap options
const SNAP_OPTIONS = [
  { label: '1/1', value: 4 },
  { label: '1/2', value: 2 },
  { label: '1/4', value: 1 },
  { label: '1/8', value: 0.5 },
  { label: '1/16', value: 0.25 },
  { label: '1/32', value: 0.125 },
  { label: 'Off', value: 0 },
];

/**
 * Check if a MIDI note is a black key
 */
function isBlackKey(midiNote) {
  const noteInOctave = midiNote % 12;
  return [1, 3, 6, 8, 10].includes(noteInOctave);
}

/**
 * Get note name from MIDI number
 */
function midiToNoteName(midiNote) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const note = noteNames[midiNote % 12];
  return `${note}${octave}`;
}

/**
 * Piano Roll View class
 */
export class PianoRollView {
  constructor(container) {
    this.container = container;
    this.totalBeats = 16;
    this.snapValue = 0.25; // 1/16 note default
    this.zoom = 1;
    this.currentBeat = 0;
    this.isPlaying = false;
    this.viewName = 'piano-roll';
    this.renderPending = false;

    // Interaction state
    this.isDragging = false;
    this.dragMode = null; // 'create', 'move', 'resize-start', 'resize-end'
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragNote = null;
    this.dragVoiceId = null;
    this.previewNote = null;

    // Selection
    this.selectedNoteId = null;
    this.selectedVoiceId = null;

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
   * Initialize the piano roll view
   */
  init() {
    this.render();
    this.setupEventListeners();
    this.setupEventBusListeners();
  }

  /**
   * Render the piano roll
   */
  render() {
    const voices = state.get('voices') || [];
    const gridWidth = this.totalBeats * BEAT_WIDTH * this.zoom;
    const gridHeight = TOTAL_KEYS * NOTE_HEIGHT;

    this.container.innerHTML = `
      <div class="piano-roll">
        <div class="piano-roll-toolbar">
          <span class="piano-roll-label">PIANO ROLL</span>
          <div class="piano-roll-controls">
            <label class="snap-control">
              <span>Snap:</span>
              <select id="snap-select" class="select-small">
                ${SNAP_OPTIONS.map(opt => `
                  <option value="${opt.value}" ${opt.value === this.snapValue ? 'selected' : ''}>
                    ${opt.label}
                  </option>
                `).join('')}
              </select>
            </label>
            <label class="beats-control">
              <span>Beats:</span>
              <input type="number" id="beats-input" class="input-number"
                     value="${this.totalBeats}" min="4" max="64" step="4">
            </label>
            <div class="zoom-controls">
              <button class="btn-icon-sm" id="zoom-out" title="Zoom Out">-</button>
              <span class="zoom-value">${Math.round(this.zoom * 100)}%</span>
              <button class="btn-icon-sm" id="zoom-in" title="Zoom In">+</button>
            </div>
          </div>
        </div>

        <div class="piano-roll-content">
          <!-- Piano Keys -->
          <div class="piano-keys" style="height: ${gridHeight}px">
            ${this.renderPianoKeys()}
          </div>

          <!-- Grid Container -->
          <div class="piano-roll-grid-container" id="piano-roll-grid-container">
            <!-- Beat markers -->
            <div class="piano-roll-beat-markers" style="width: ${gridWidth}px">
              ${this.renderBeatMarkers()}
            </div>

            <!-- Note Grid -->
            <div class="piano-roll-grid" id="piano-roll-grid"
                 style="width: ${gridWidth}px; height: ${gridHeight}px">
              <!-- Grid lines -->
              ${this.renderGridLines()}

              <!-- Notes for all voices -->
              <div class="piano-roll-notes" id="piano-roll-notes">
                ${voices.map(voice => this.renderVoiceNotes(voice)).join('')}
              </div>

              <!-- Preview note (shown during drag) -->
              <div class="note-preview hidden" id="note-preview"></div>

              <!-- Playhead -->
              <div class="piano-roll-playhead" id="piano-roll-playhead"
                   style="left: 0; display: none;"></div>
            </div>
          </div>
        </div>

        <!-- Voice legend -->
        <div class="piano-roll-legend">
          ${voices.map(voice => `
            <div class="legend-voice ${voice.id === state.get('selectedVoiceId') ? 'selected' : ''}"
                 data-voice-id="${voice.id}"
                 style="--voice-color: ${voice.color}">
              <span class="legend-color"></span>
              <span class="legend-name">${voice.name}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Cache DOM references
    this.gridEl = this.container.querySelector('#piano-roll-grid');
    this.gridContainer = this.container.querySelector('#piano-roll-grid-container');
    this.notesEl = this.container.querySelector('#piano-roll-notes');
    this.playheadEl = this.container.querySelector('#piano-roll-playhead');
    this.previewEl = this.container.querySelector('#note-preview');
  }

  /**
   * Render piano keys
   */
  renderPianoKeys() {
    let html = '';
    for (let note = MAX_NOTE; note >= MIN_NOTE; note--) {
      const isBlack = isBlackKey(note);
      const noteName = midiToNoteName(note);
      const showLabel = note % 12 === 0; // Show C notes
      html += `
        <div class="piano-key ${isBlack ? 'black' : 'white'}" data-note="${note}">
          ${showLabel ? `<span class="key-label">${noteName}</span>` : ''}
        </div>
      `;
    }
    return html;
  }

  /**
   * Render beat markers
   */
  renderBeatMarkers() {
    let html = '';
    for (let beat = 0; beat <= this.totalBeats; beat++) {
      const isMeasure = beat % 4 === 0;
      const x = beat * BEAT_WIDTH * this.zoom;
      html += `
        <div class="beat-marker ${isMeasure ? 'measure' : ''}" style="left: ${x}px">
          ${isMeasure ? `<span class="beat-number">${Math.floor(beat / 4) + 1}</span>` : ''}
        </div>
      `;
    }
    return html;
  }

  /**
   * Render grid lines
   */
  renderGridLines() {
    const gridWidth = this.totalBeats * BEAT_WIDTH * this.zoom;
    let html = '';

    // Horizontal lines (pitch)
    for (let i = 0; i <= TOTAL_KEYS; i++) {
      const y = i * NOTE_HEIGHT;
      const note = MAX_NOTE - i;
      const isC = note % 12 === 0;
      html += `<div class="grid-line-h ${isC ? 'octave' : ''}" style="top: ${y}px; width: ${gridWidth}px"></div>`;
    }

    // Vertical lines (beat)
    for (let beat = 0; beat <= this.totalBeats * 4; beat++) {
      const x = (beat / 4) * BEAT_WIDTH * this.zoom;
      const isBeat = beat % 4 === 0;
      const isMeasure = beat % 16 === 0;
      html += `<div class="grid-line-v ${isMeasure ? 'measure' : isBeat ? 'beat' : ''}" style="left: ${x}px"></div>`;
    }

    return html;
  }

  /**
   * Render notes for a voice
   */
  renderVoiceNotes(voice) {
    const notes = voice.content?.notes || [];
    return notes.map(note => this.renderNote(voice, note)).join('');
  }

  /**
   * Render a single note
   */
  renderNote(voice, note) {
    const x = note.startBeat * BEAT_WIDTH * this.zoom;
    const y = (MAX_NOTE - note.pitch) * NOTE_HEIGHT;
    const width = Math.max(note.durationBeats * BEAT_WIDTH * this.zoom, 4);
    const isSelected = note.id === this.selectedNoteId;

    return `
      <div class="piano-roll-note ${isSelected ? 'selected' : ''}"
           data-voice-id="${voice.id}"
           data-note-id="${note.id}"
           style="left: ${x}px; top: ${y}px; width: ${width}px; height: ${NOTE_HEIGHT}px;
                  --voice-color: ${voice.color}">
        <div class="note-resize-handle left"></div>
        <div class="note-body"></div>
        <div class="note-resize-handle right"></div>
      </div>
    `;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Grid mouse events
    this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.container.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.container.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.container.addEventListener('mouseleave', this.handleMouseUp.bind(this));

    // Keyboard events
    this.container.addEventListener('keydown', this.handleKeyDown.bind(this));

    // Toolbar events
    this.container.addEventListener('change', (e) => {
      if (e.target.id === 'snap-select') {
        this.snapValue = parseFloat(e.target.value);
      } else if (e.target.id === 'beats-input') {
        this.totalBeats = parseInt(e.target.value, 10);
        this.render();
      }
    });

    this.container.addEventListener('click', (e) => {
      if (e.target.id === 'zoom-in') {
        this.zoom = Math.min(this.zoom * 1.25, 4);
        this.render();
      } else if (e.target.id === 'zoom-out') {
        this.zoom = Math.max(this.zoom / 1.25, 0.25);
        this.render();
      }

      // Voice selection from legend
      const legendVoice = e.target.closest('.legend-voice');
      if (legendVoice) {
        const voiceId = legendVoice.dataset.voiceId;
        state.selectVoice(voiceId);
      }
    });

    // Double-click to delete note
    this.container.addEventListener('dblclick', this.handleDoubleClick.bind(this));
  }

  /**
   * Setup event bus listeners
   */
  setupEventBusListeners() {
    // Voice changes - only render if visible
    eventBus.on(Events.VOICE_ADD, () => this.scheduleRender());
    eventBus.on(Events.VOICE_REMOVE, () => this.scheduleRender());
    eventBus.on(Events.VOICE_UPDATE, () => this.scheduleRender());
    eventBus.on(Events.VOICE_SELECT, () => this.scheduleRender());
    eventBus.on(Events.VOICE_MUTE, () => this.scheduleRender());
    eventBus.on(Events.VOICE_SOLO, () => this.scheduleRender());

    // Note changes - only render if visible
    eventBus.on(Events.NOTE_ADD, () => this.scheduleRender());
    eventBus.on(Events.NOTE_REMOVE, () => this.scheduleRender());
    eventBus.on(Events.NOTE_UPDATE, () => this.scheduleRender());

    eventBus.on(Events.TRANSPORT_PLAY, () => {
      this.isPlaying = true;
      if (this.playheadEl) {
        this.playheadEl.style.display = 'block';
      }
    });

    eventBus.on(Events.TRANSPORT_STOP, () => {
      this.isPlaying = false;
      this.currentBeat = 0;
      if (this.playheadEl) {
        this.playheadEl.style.display = 'none';
        this.playheadEl.style.left = '0';
      }
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
      }
    });
  }

  /**
   * Handle mouse down
   */
  handleMouseDown(e) {
    const grid = e.target.closest('#piano-roll-grid');
    if (!grid) return;

    const noteEl = e.target.closest('.piano-roll-note');
    const rect = grid.getBoundingClientRect();
    const x = e.clientX - rect.left + this.gridContainer.scrollLeft;
    const y = e.clientY - rect.top + this.gridContainer.scrollTop;

    if (noteEl) {
      // Clicked on an existing note
      const voiceId = noteEl.dataset.voiceId;
      const noteId = noteEl.dataset.noteId;
      const note = state.getNote(voiceId, noteId);
      if (!note) return;

      this.selectedNoteId = noteId;
      this.selectedVoiceId = voiceId;

      // Check if clicking on resize handle
      const handle = e.target.closest('.note-resize-handle');
      if (handle) {
        this.isDragging = true;
        this.dragMode = handle.classList.contains('left') ? 'resize-start' : 'resize-end';
        this.dragNote = { ...note };
        this.dragVoiceId = voiceId;
      } else {
        // Move mode
        this.isDragging = true;
        this.dragMode = 'move';
        this.dragNote = { ...note };
        this.dragVoiceId = voiceId;
        this.dragStartX = x;
        this.dragStartY = y;
      }

      this.render();
    } else {
      // Clicked on empty space - create new note
      const selectedVoiceId = state.get('selectedVoiceId');
      if (!selectedVoiceId) {
        eventBus.emit(Events.TOAST_SHOW, {
          message: 'Select a voice first to add notes',
          type: 'warning'
        });
        return;
      }

      const beat = this.xToBeat(x);
      const pitch = this.yToPitch(y);

      this.isDragging = true;
      this.dragMode = 'create';
      this.dragStartX = x;
      this.dragVoiceId = selectedVoiceId;
      this.previewNote = {
        startBeat: this.snapBeat(beat),
        pitch: pitch,
        durationBeats: this.snapValue || 0.25,
      };

      this.showPreviewNote();
      this.selectedNoteId = null;
      this.render();
    }
  }

  /**
   * Handle mouse move
   */
  handleMouseMove(e) {
    if (!this.isDragging) return;

    const grid = this.gridEl;
    if (!grid) return;

    const rect = grid.getBoundingClientRect();
    const x = e.clientX - rect.left + this.gridContainer.scrollLeft;
    const y = e.clientY - rect.top + this.gridContainer.scrollTop;

    if (this.dragMode === 'create') {
      // Update preview note
      const startBeat = this.previewNote.startBeat;
      const currentBeat = this.xToBeat(x);
      const duration = Math.max(currentBeat - startBeat, MIN_NOTE_DURATION);
      this.previewNote.durationBeats = this.snapValue ? this.snapBeat(duration) : duration;
      this.previewNote.pitch = this.yToPitch(y);
      this.showPreviewNote();
    } else if (this.dragMode === 'move' && this.dragNote) {
      // Move note
      const dx = x - this.dragStartX;
      const dy = y - this.dragStartY;
      const deltaBeat = dx / (BEAT_WIDTH * this.zoom);
      const deltaPitch = -Math.round(dy / NOTE_HEIGHT);

      const newStartBeat = this.snapBeat(this.dragNote.startBeat + deltaBeat);
      const newPitch = Math.max(MIN_NOTE, Math.min(MAX_NOTE, this.dragNote.pitch + deltaPitch));

      // Update note directly for visual feedback
      const noteEl = this.container.querySelector(`[data-note-id="${this.dragNote.id}"]`);
      if (noteEl) {
        noteEl.style.left = `${newStartBeat * BEAT_WIDTH * this.zoom}px`;
        noteEl.style.top = `${(MAX_NOTE - newPitch) * NOTE_HEIGHT}px`;
      }
    } else if (this.dragMode === 'resize-end' && this.dragNote) {
      // Resize from right
      const currentBeat = this.xToBeat(x);
      const newDuration = Math.max(currentBeat - this.dragNote.startBeat, MIN_NOTE_DURATION);
      const snappedDuration = this.snapValue ? this.snapBeat(newDuration) : newDuration;

      const noteEl = this.container.querySelector(`[data-note-id="${this.dragNote.id}"]`);
      if (noteEl) {
        noteEl.style.width = `${Math.max(snappedDuration * BEAT_WIDTH * this.zoom, 4)}px`;
      }
    } else if (this.dragMode === 'resize-start' && this.dragNote) {
      // Resize from left (more complex - changes start and duration)
      const currentBeat = this.snapBeat(this.xToBeat(x));
      const originalEnd = this.dragNote.startBeat + this.dragNote.durationBeats;
      const newDuration = Math.max(originalEnd - currentBeat, MIN_NOTE_DURATION);

      const noteEl = this.container.querySelector(`[data-note-id="${this.dragNote.id}"]`);
      if (noteEl) {
        noteEl.style.left = `${currentBeat * BEAT_WIDTH * this.zoom}px`;
        noteEl.style.width = `${Math.max(newDuration * BEAT_WIDTH * this.zoom, 4)}px`;
      }
    }
  }

  /**
   * Handle mouse up
   */
  handleMouseUp(e) {
    if (!this.isDragging) return;

    const grid = this.gridEl;
    if (!grid) return;

    const rect = grid.getBoundingClientRect();
    const x = e.clientX - rect.left + this.gridContainer.scrollLeft;
    const y = e.clientY - rect.top + this.gridContainer.scrollTop;

    if (this.dragMode === 'create' && this.previewNote) {
      // Create the note
      const command = new AddNoteCommand(state, this.dragVoiceId, {
        pitch: this.previewNote.pitch,
        startBeat: this.previewNote.startBeat,
        durationBeats: Math.max(this.previewNote.durationBeats, MIN_NOTE_DURATION),
        velocity: 100,
      });
      history.execute(command);
      this.hidePreviewNote();
    } else if (this.dragMode === 'move' && this.dragNote) {
      // Finalize move
      const dx = x - this.dragStartX;
      const dy = y - this.dragStartY;
      const deltaBeat = dx / (BEAT_WIDTH * this.zoom);
      const deltaPitch = -Math.round(dy / NOTE_HEIGHT);

      const newStartBeat = this.snapBeat(this.dragNote.startBeat + deltaBeat);
      const newPitch = Math.max(MIN_NOTE, Math.min(MAX_NOTE, this.dragNote.pitch + deltaPitch));

      if (newStartBeat !== this.dragNote.startBeat || newPitch !== this.dragNote.pitch) {
        const command = new MoveNoteCommand(
          state, this.dragVoiceId, this.dragNote.id, newStartBeat, newPitch
        );
        history.execute(command);
      }
    } else if (this.dragMode === 'resize-end' && this.dragNote) {
      // Finalize resize
      const currentBeat = this.xToBeat(x);
      const newDuration = Math.max(currentBeat - this.dragNote.startBeat, MIN_NOTE_DURATION);
      const snappedDuration = this.snapValue ? this.snapBeat(newDuration) : newDuration;

      if (snappedDuration !== this.dragNote.durationBeats) {
        const command = new ResizeNoteCommand(
          state, this.dragVoiceId, this.dragNote.id, snappedDuration
        );
        history.execute(command);
      }
    } else if (this.dragMode === 'resize-start' && this.dragNote) {
      // Finalize resize from start
      const currentBeat = this.snapBeat(this.xToBeat(x));
      const originalEnd = this.dragNote.startBeat + this.dragNote.durationBeats;
      const newDuration = Math.max(originalEnd - currentBeat, MIN_NOTE_DURATION);
      const newStartBeat = originalEnd - newDuration;

      if (newStartBeat !== this.dragNote.startBeat || newDuration !== this.dragNote.durationBeats) {
        // Need to update both start and duration
        state.updateNote(this.dragVoiceId, this.dragNote.id, {
          startBeat: newStartBeat,
          durationBeats: newDuration,
        });
      }
    }

    this.isDragging = false;
    this.dragMode = null;
    this.dragNote = null;
    this.previewNote = null;
    this.render();
  }

  /**
   * Handle double click to delete
   */
  handleDoubleClick(e) {
    const noteEl = e.target.closest('.piano-roll-note');
    if (noteEl) {
      const voiceId = noteEl.dataset.voiceId;
      const noteId = noteEl.dataset.noteId;
      const command = new DeleteNoteCommand(state, voiceId, noteId);
      history.execute(command);
    }
  }

  /**
   * Handle keyboard events
   */
  handleKeyDown(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectedNoteId && this.selectedVoiceId) {
        const command = new DeleteNoteCommand(state, this.selectedVoiceId, this.selectedNoteId);
        history.execute(command);
        this.selectedNoteId = null;
        this.selectedVoiceId = null;
      }
    }
  }

  /**
   * Convert X coordinate to beat
   */
  xToBeat(x) {
    return x / (BEAT_WIDTH * this.zoom);
  }

  /**
   * Convert Y coordinate to pitch
   */
  yToPitch(y) {
    const pitchFromTop = Math.floor(y / NOTE_HEIGHT);
    return Math.max(MIN_NOTE, Math.min(MAX_NOTE, MAX_NOTE - pitchFromTop));
  }

  /**
   * Snap beat to grid
   */
  snapBeat(beat) {
    if (this.snapValue === 0) return beat;
    return Math.round(beat / this.snapValue) * this.snapValue;
  }

  /**
   * Show preview note
   */
  showPreviewNote() {
    if (!this.previewEl || !this.previewNote) return;

    const x = this.previewNote.startBeat * BEAT_WIDTH * this.zoom;
    const y = (MAX_NOTE - this.previewNote.pitch) * NOTE_HEIGHT;
    const width = Math.max(this.previewNote.durationBeats * BEAT_WIDTH * this.zoom, 4);

    const voice = state.getVoice(this.dragVoiceId);
    const color = voice?.color || 'var(--color-primary)';

    this.previewEl.style.left = `${x}px`;
    this.previewEl.style.top = `${y}px`;
    this.previewEl.style.width = `${width}px`;
    this.previewEl.style.height = `${NOTE_HEIGHT}px`;
    this.previewEl.style.setProperty('--voice-color', color);
    this.previewEl.classList.remove('hidden');
  }

  /**
   * Hide preview note
   */
  hidePreviewNote() {
    if (this.previewEl) {
      this.previewEl.classList.add('hidden');
    }
  }

  /**
   * Update playhead position
   */
  updatePlayhead(beat) {
    this.currentBeat = beat % this.totalBeats;
    if (this.playheadEl && this.isPlaying) {
      const x = this.currentBeat * BEAT_WIDTH * this.zoom;
      this.playheadEl.style.left = `${x}px`;
      this.playheadEl.style.display = 'block';

      // Auto-scroll to keep playhead visible
      if (this.gridContainer) {
        const containerWidth = this.gridContainer.clientWidth;
        const scrollLeft = this.gridContainer.scrollLeft;
        const playheadX = x;

        if (playheadX > scrollLeft + containerWidth - 100) {
          this.gridContainer.scrollLeft = playheadX - 100;
        } else if (playheadX < scrollLeft + 100) {
          this.gridContainer.scrollLeft = Math.max(0, playheadX - 100);
        }
      }

      // Highlight notes that are currently playing
      this.highlightPlayingNotes(beat);
    }
  }

  /**
   * Highlight notes that are currently playing at the given beat
   */
  highlightPlayingNotes(beat) {
    if (!this.notesEl) return;

    const noteEls = this.notesEl.querySelectorAll('.piano-roll-note');
    const voices = state.get('voices') || [];

    noteEls.forEach(noteEl => {
      const voiceId = noteEl.dataset.voiceId;
      const noteId = noteEl.dataset.noteId;
      const note = state.getNote(voiceId, noteId);

      if (note) {
        const isPlaying = beat >= note.startBeat && beat < note.startBeat + note.durationBeats;
        noteEl.classList.toggle('playing', isPlaying);
      }
    });
  }
}

/**
 * Create and initialize piano roll view
 */
export function createPianoRollView(container) {
  return new PianoRollView(container);
}
