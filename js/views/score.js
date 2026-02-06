/**
 * Score View - Traditional music notation using VexFlow
 * Fase 3: Score View (Partitura)
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { history, AddNoteCommand, DeleteNoteCommand } from '../history.js';

// Constants
const STAFF_HEIGHT = 120;
const MEASURE_WIDTH = 200;
const LEFT_MARGIN = 60;
const TOP_MARGIN = 40;
const CLEF_WIDTH = 40;

// Note duration mappings (beats to VexFlow duration)
const DURATION_MAP = [
  { maxBeats: 0.125, duration: '32', dots: 0 },
  { maxBeats: 0.1875, duration: '32', dots: 1 },
  { maxBeats: 0.25, duration: '16', dots: 0 },
  { maxBeats: 0.375, duration: '16', dots: 1 },
  { maxBeats: 0.5, duration: '8', dots: 0 },
  { maxBeats: 0.75, duration: '8', dots: 1 },
  { maxBeats: 1, duration: 'q', dots: 0 },
  { maxBeats: 1.5, duration: 'q', dots: 1 },
  { maxBeats: 2, duration: 'h', dots: 0 },
  { maxBeats: 3, duration: 'h', dots: 1 },
  { maxBeats: 4, duration: 'w', dots: 0 },
];

// MIDI note to VexFlow key conversion
const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];

/**
 * Convert MIDI note number to VexFlow key string
 * @param {number} midiNote - MIDI note number (60 = C4)
 * @returns {string} VexFlow key string like "c/4" or "f#/5"
 */
function midiToVexKey(midiNote) {
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;
  const noteName = NOTE_NAMES[noteIndex];
  return `${noteName}/${octave}`;
}

/**
 * Convert VexFlow key to MIDI note number
 * @param {string} vexKey - VexFlow key like "c/4"
 * @returns {number} MIDI note number
 */
function vexKeyToMidi(vexKey) {
  const [noteName, octaveStr] = vexKey.split('/');
  const octave = parseInt(octaveStr, 10);
  const noteIndex = NOTE_NAMES.indexOf(noteName.toLowerCase());
  return (octave + 1) * 12 + noteIndex;
}

/**
 * Convert beat duration to VexFlow duration string
 * @param {number} beats - Duration in beats
 * @returns {{ duration: string, dots: number }}
 */
function beatsToDuration(beats) {
  for (const mapping of DURATION_MAP) {
    if (beats <= mapping.maxBeats) {
      return { duration: mapping.duration, dots: mapping.dots };
    }
  }
  return { duration: 'w', dots: 0 };
}

/**
 * Get note name for display
 */
function midiToNoteName(midiNote) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const note = noteNames[midiNote % 12];
  return `${note}${octave}`;
}

/**
 * Score View class
 */
export class ScoreView {
  constructor(container) {
    this.container = container;
    this.totalBeats = 16;
    this.beatsPerMeasure = 4;
    this.zoom = 1;
    this.currentBeat = 0;
    this.isPlaying = false;

    // VexFlow instances
    this.vf = null;
    this.renderer = null;
    this.context = null;

    // Selection state
    this.selectedNoteId = null;
    this.selectedVoiceId = null;

    // Track rendered notes for click detection
    this.renderedNotes = [];

    this.init();
  }

  /**
   * Initialize the score view
   */
  init() {
    this.render();
    this.setupEventListeners();
    this.setupEventBusListeners();
  }

  /**
   * Render the score view
   */
  render() {
    const voices = state.get('voices') || [];
    const numMeasures = Math.ceil(this.totalBeats / this.beatsPerMeasure);
    const scoreWidth = LEFT_MARGIN + numMeasures * MEASURE_WIDTH * this.zoom + 40;
    const scoreHeight = TOP_MARGIN + voices.length * STAFF_HEIGHT + 60;

    this.container.innerHTML = `
      <div class="score-view">
        <div class="score-toolbar">
          <span class="score-label">SCORE</span>
          <div class="score-controls">
            <label class="beats-control">
              <span>Bars:</span>
              <input type="number" id="score-bars-input" class="input-number"
                     value="${numMeasures}" min="1" max="32" step="1">
            </label>
            <div class="zoom-controls">
              <button class="btn-icon-sm" id="score-zoom-out" title="Zoom Out">-</button>
              <span class="zoom-value">${Math.round(this.zoom * 100)}%</span>
              <button class="btn-icon-sm" id="score-zoom-in" title="Zoom In">+</button>
            </div>
            <button class="btn-sm" id="score-export-xml" title="Export MusicXML">Export</button>
          </div>
        </div>

        <div class="score-content" id="score-content">
          ${voices.length === 0
            ? this.renderEmptyState()
            : `<div class="score-scroll-container" id="score-scroll-container">
                <div id="score-svg-container" style="width: ${scoreWidth}px; min-height: ${scoreHeight}px; position: relative;">
                  <div id="score-playhead" class="score-playhead" style="display: none;"></div>
                </div>
              </div>`
          }
        </div>

        <div class="score-legend">
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

    // Render VexFlow notation if we have voices
    if (voices.length > 0) {
      this.renderNotation(voices);
    }

    // Cache DOM references
    this.svgContainer = this.container.querySelector('#score-svg-container');
    this.scrollContainer = this.container.querySelector('#score-scroll-container');
    this.playheadEl = this.container.querySelector('#score-playhead');
  }

  /**
   * Render empty state when no voices exist
   */
  renderEmptyState() {
    return `
      <div class="score-empty">
        <p>No voices to display</p>
        <p class="text-muted">Add a voice and some notes to see the score</p>
      </div>
    `;
  }

  /**
   * Render music notation using VexFlow
   */
  renderNotation(voices) {
    // Check if Vex is available
    if (typeof Vex === 'undefined') {
      console.warn('VexFlow not loaded. Score view requires VexFlow library.');
      this.renderFallbackNotation(voices);
      return;
    }

    const svgContainer = this.container.querySelector('#score-svg-container');
    if (!svgContainer) return;

    const { Factory, StaveNote, Formatter, Beam, Dot, Accidental } = Vex.Flow;

    try {
      // Calculate dimensions
      const numMeasures = Math.ceil(this.totalBeats / this.beatsPerMeasure);
      const width = LEFT_MARGIN + numMeasures * MEASURE_WIDTH * this.zoom + 40;
      const height = TOP_MARGIN + voices.length * STAFF_HEIGHT + 40;

      // Create VexFlow factory
      this.vf = new Factory({
        renderer: { elementId: 'score-svg-container', width, height },
      });

      this.context = this.vf.getContext();
      this.context.setFont('Arial', 10);

      this.renderedNotes = [];

      // Render each voice on its own staff
      voices.forEach((voice, voiceIndex) => {
        this.renderVoiceStaff(voice, voiceIndex, numMeasures);
      });

      this.vf.draw();
    } catch (error) {
      console.error('VexFlow rendering error:', error);
      this.renderFallbackNotation(voices);
    }
  }

  /**
   * Render a single voice's staff with notes
   */
  renderVoiceStaff(voice, voiceIndex, numMeasures) {
    const { Stave, StaveNote, Voice: VexVoice, Formatter, Beam } = Vex.Flow;

    const y = TOP_MARGIN + voiceIndex * STAFF_HEIGHT;
    const notes = voice.content?.notes || [];

    // Choose clef based on average pitch
    const avgPitch = notes.length > 0
      ? notes.reduce((sum, n) => sum + n.pitch, 0) / notes.length
      : 60;
    const clef = avgPitch < 55 ? 'bass' : 'treble';

    // Render measures
    for (let m = 0; m < numMeasures; m++) {
      const x = LEFT_MARGIN + m * MEASURE_WIDTH * this.zoom;
      const measureWidth = MEASURE_WIDTH * this.zoom;
      const measureStartBeat = m * this.beatsPerMeasure;
      const measureEndBeat = measureStartBeat + this.beatsPerMeasure;

      // Create stave
      const stave = new Stave(x, y, measureWidth);

      if (m === 0) {
        stave.addClef(clef);
        stave.addTimeSignature(`${this.beatsPerMeasure}/4`);
        // Add voice name
        this.context.save();
        this.context.setFont('Arial', 12, 'bold');
        this.context.fillText(voice.name, x - 50, y + 45);
        this.context.restore();
      }

      stave.setContext(this.context).draw();

      // Get notes in this measure
      const measureNotes = notes.filter(note =>
        note.startBeat >= measureStartBeat && note.startBeat < measureEndBeat
      );

      if (measureNotes.length > 0) {
        const vexNotes = this.createVexNotes(measureNotes, voice, clef, measureStartBeat);

        if (vexNotes.length > 0) {
          try {
            const vexVoice = new VexVoice({
              num_beats: this.beatsPerMeasure,
              beat_value: 4,
            }).setStrict(false);

            vexVoice.addTickables(vexNotes);

            new Formatter()
              .joinVoices([vexVoice])
              .format([vexVoice], measureWidth - (m === 0 ? CLEF_WIDTH + 30 : 20));

            vexVoice.draw(this.context, stave);

            // Store rendered notes for click detection
            vexNotes.forEach((vexNote, i) => {
              if (measureNotes[i]) {
                this.renderedNotes.push({
                  vexNote,
                  note: measureNotes[i],
                  voiceId: voice.id,
                  stave,
                });
              }
            });
          } catch (err) {
            console.warn('Error rendering measure:', err);
          }
        }
      } else {
        // Render rest for empty measure
        try {
          const rest = new StaveNote({
            clef,
            keys: [clef === 'bass' ? 'd/3' : 'b/4'],
            duration: 'wr',
          });

          const vexVoice = new VexVoice({
            num_beats: this.beatsPerMeasure,
            beat_value: 4,
          }).setStrict(false);

          vexVoice.addTickables([rest]);

          new Formatter()
            .joinVoices([vexVoice])
            .format([vexVoice], measureWidth - (m === 0 ? CLEF_WIDTH + 30 : 20));

          vexVoice.draw(this.context, stave);
        } catch (err) {
          // Silent fail for rest rendering
        }
      }
    }
  }

  /**
   * Create VexFlow StaveNote objects from notes
   */
  createVexNotes(notes, voice, clef, measureStartBeat) {
    const { StaveNote, Accidental, Dot } = Vex.Flow;
    const vexNotes = [];

    // Sort notes by start time
    const sortedNotes = [...notes].sort((a, b) => a.startBeat - b.startBeat);

    for (const note of sortedNotes) {
      const key = midiToVexKey(note.pitch);
      const { duration, dots } = beatsToDuration(note.durationBeats);

      // Determine if note needs accidental
      const noteName = NOTE_NAMES[note.pitch % 12];
      const hasSharp = noteName.includes('#');

      try {
        const staveNote = new StaveNote({
          clef,
          keys: [key],
          duration,
        });

        // Add dots
        for (let d = 0; d < dots; d++) {
          Dot.buildAndAttach([staveNote], { all: true });
        }

        // Add accidental
        if (hasSharp) {
          staveNote.addModifier(new Accidental('#'), 0);
        }

        // Color the note based on voice
        staveNote.setStyle({
          fillStyle: voice.color,
          strokeStyle: voice.color,
        });

        vexNotes.push(staveNote);
      } catch (err) {
        console.warn('Error creating note:', err);
      }
    }

    return vexNotes;
  }

  /**
   * Fallback notation when VexFlow is not available
   */
  renderFallbackNotation(voices) {
    const svgContainer = this.container.querySelector('#score-svg-container');
    if (!svgContainer) return;

    const numMeasures = Math.ceil(this.totalBeats / this.beatsPerMeasure);

    let html = '<div class="score-fallback">';

    voices.forEach((voice, index) => {
      const notes = voice.content?.notes || [];
      const y = TOP_MARGIN + index * STAFF_HEIGHT;

      html += `
        <div class="fallback-staff" style="top: ${y}px; position: absolute; width: 100%;">
          <div class="fallback-voice-name" style="color: ${voice.color}">${voice.name}</div>
          <div class="fallback-staff-lines">
            ${[0,1,2,3,4].map(i => `<div class="staff-line" style="top: ${20 + i * 10}px;"></div>`).join('')}
          </div>
          <div class="fallback-notes">
            ${notes.map(note => {
              const x = LEFT_MARGIN + (note.startBeat / this.beatsPerMeasure) * MEASURE_WIDTH * this.zoom;
              const pitch = note.pitch % 12;
              const noteY = 60 - pitch * 3;
              return `<div class="fallback-note"
                           style="left: ${x}px; top: ${noteY}px; width: ${note.durationBeats * 20}px;
                                  background: ${voice.color};"
                           data-voice-id="${voice.id}"
                           data-note-id="${note.id}"
                           title="${midiToNoteName(note.pitch)}"></div>`;
            }).join('')}
          </div>
        </div>
      `;
    });

    html += `
      <p class="fallback-notice">
        Add VexFlow library for full notation rendering.<br>
        <code>&lt;script src="https://cdn.jsdelivr.net/npm/vexflow@4.2.3/build/cjs/vexflow.js"&gt;&lt;/script&gt;</code>
      </p>
    </div>`;

    svgContainer.innerHTML = html;
  }

  /**
   * Setup DOM event listeners
   */
  setupEventListeners() {
    // Toolbar controls
    this.container.addEventListener('change', (e) => {
      if (e.target.id === 'score-bars-input') {
        const bars = parseInt(e.target.value, 10);
        this.totalBeats = bars * this.beatsPerMeasure;
        this.render();
      }
    });

    this.container.addEventListener('click', (e) => {
      // Zoom controls
      if (e.target.id === 'score-zoom-in') {
        this.zoom = Math.min(this.zoom * 1.25, 3);
        this.render();
      } else if (e.target.id === 'score-zoom-out') {
        this.zoom = Math.max(this.zoom / 1.25, 0.5);
        this.render();
      }

      // Export button
      if (e.target.id === 'score-export-xml') {
        this.exportMusicXML();
      }

      // Voice selection from legend
      const legendVoice = e.target.closest('.legend-voice');
      if (legendVoice) {
        const voiceId = legendVoice.dataset.voiceId;
        state.selectVoice(voiceId);
      }

      // Note selection (fallback mode)
      const fallbackNote = e.target.closest('.fallback-note');
      if (fallbackNote) {
        this.selectedNoteId = fallbackNote.dataset.noteId;
        this.selectedVoiceId = fallbackNote.dataset.voiceId;
        this.render();
      }
    });

    // Click on SVG to add notes (when VexFlow is loaded)
    this.container.addEventListener('dblclick', (e) => {
      const svgContainer = e.target.closest('#score-svg-container');
      if (!svgContainer) return;

      // Check for fallback note deletion
      const fallbackNote = e.target.closest('.fallback-note');
      if (fallbackNote) {
        const voiceId = fallbackNote.dataset.voiceId;
        const noteId = fallbackNote.dataset.noteId;
        const command = new DeleteNoteCommand(state, voiceId, noteId);
        history.execute(command);
        return;
      }

      // Try to add note at click position
      const rect = svgContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.handleScoreClick(x, y);
    });

    // Keyboard shortcuts
    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedNoteId && this.selectedVoiceId) {
          const command = new DeleteNoteCommand(state, this.selectedVoiceId, this.selectedNoteId);
          history.execute(command);
          this.selectedNoteId = null;
          this.selectedVoiceId = null;
        }
      }
    });
  }

  /**
   * Handle click on score to add note
   */
  handleScoreClick(x, y) {
    const selectedVoiceId = state.get('selectedVoiceId');
    if (!selectedVoiceId) {
      eventBus.emit(Events.TOAST_SHOW, {
        message: 'Select a voice first to add notes',
        type: 'warning'
      });
      return;
    }

    const voices = state.get('voices') || [];
    const voiceIndex = voices.findIndex(v => v.id === selectedVoiceId);
    if (voiceIndex === -1) return;

    // Calculate beat from x position
    const beatOffset = (x - LEFT_MARGIN) / (MEASURE_WIDTH * this.zoom);
    if (beatOffset < 0 || beatOffset > this.totalBeats / this.beatsPerMeasure * this.beatsPerMeasure) return;

    const startBeat = Math.max(0, Math.round(beatOffset * 4) / 4); // Quantize to 1/4 beat

    // Calculate pitch from y position
    const staffTop = TOP_MARGIN + voiceIndex * STAFF_HEIGHT;
    const relativeY = y - staffTop - 20;

    // Map y position to MIDI pitch (rough approximation)
    // Staff lines typically span about 2 octaves
    const pitchOffset = Math.round(-relativeY / 5);
    const pitch = 60 + pitchOffset; // Middle C = 60

    // Clamp pitch to reasonable range
    const clampedPitch = Math.max(36, Math.min(84, pitch));

    // Add the note
    const command = new AddNoteCommand(state, selectedVoiceId, {
      pitch: clampedPitch,
      startBeat,
      durationBeats: 1,
      velocity: 100,
    });
    history.execute(command);
  }

  /**
   * Setup event bus listeners
   */
  setupEventBusListeners() {
    eventBus.on(Events.VOICE_ADD, () => this.render());
    eventBus.on(Events.VOICE_REMOVE, () => this.render());
    eventBus.on(Events.VOICE_UPDATE, () => this.render());
    eventBus.on(Events.VOICE_SELECT, () => this.render());

    eventBus.on(Events.NOTE_ADD, () => this.render());
    eventBus.on(Events.NOTE_REMOVE, () => this.render());
    eventBus.on(Events.NOTE_UPDATE, () => this.render());

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
        this.playheadEl.style.left = `${LEFT_MARGIN}px`;
      }
    });

    eventBus.on(Events.TRANSPORT_PAUSE, () => {
      this.isPlaying = false;
    });

    eventBus.on(Events.PLAYHEAD_UPDATE, (beat) => {
      this.updatePlayhead(beat);
    });

    eventBus.on(Events.PROJECT_LOAD, () => this.render());
    eventBus.on(Events.PROJECT_NEW, () => this.render());
  }

  /**
   * Update playhead position
   */
  updatePlayhead(beat) {
    this.currentBeat = beat % this.totalBeats;

    if (this.playheadEl && this.isPlaying) {
      const x = LEFT_MARGIN + (this.currentBeat / this.beatsPerMeasure) * MEASURE_WIDTH * this.zoom;
      this.playheadEl.style.left = `${x}px`;
      this.playheadEl.style.display = 'block';

      // Auto-scroll to keep playhead visible
      if (this.scrollContainer) {
        const containerWidth = this.scrollContainer.clientWidth;
        const scrollLeft = this.scrollContainer.scrollLeft;

        if (x > scrollLeft + containerWidth - 100) {
          this.scrollContainer.scrollLeft = x - 100;
        } else if (x < scrollLeft + 100) {
          this.scrollContainer.scrollLeft = Math.max(0, x - 100);
        }
      }
    }
  }

  /**
   * Export to MusicXML format
   */
  exportMusicXML() {
    const voices = state.get('voices') || [];
    const projectName = state.get('project.name') || 'Untitled';
    const tempo = state.get('transport.tempo') || 120;

    if (voices.length === 0) {
      eventBus.emit(Events.TOAST_SHOW, {
        message: 'No voices to export',
        type: 'warning'
      });
      return;
    }

    // Build MusicXML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${this.escapeXml(projectName)}</work-title>
  </work>
  <identification>
    <creator type="composer">SoundSculpt</creator>
    <encoding>
      <software>SoundSculpt</software>
      <encoding-date>${new Date().toISOString().split('T')[0]}</encoding-date>
    </encoding>
  </identification>
  <part-list>
${voices.map((voice, i) => `    <score-part id="P${i + 1}">
      <part-name>${this.escapeXml(voice.name)}</part-name>
    </score-part>`).join('\n')}
  </part-list>
${voices.map((voice, i) => this.voiceToMusicXML(voice, i + 1, tempo)).join('\n')}
</score-partwise>`;

    // Download the file
    const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}.musicxml`;
    a.click();
    URL.revokeObjectURL(url);

    eventBus.emit(Events.TOAST_SHOW, {
      message: 'MusicXML exported successfully',
      type: 'success'
    });
  }

  /**
   * Convert a voice to MusicXML part
   */
  voiceToMusicXML(voice, partNum, tempo) {
    const notes = voice.content?.notes || [];
    const numMeasures = Math.ceil(this.totalBeats / this.beatsPerMeasure);

    // Determine clef
    const avgPitch = notes.length > 0
      ? notes.reduce((sum, n) => sum + n.pitch, 0) / notes.length
      : 60;
    const clef = avgPitch < 55 ? 'F' : 'G';
    const clefLine = clef === 'F' ? 4 : 2;

    let xml = `  <part id="P${partNum}">\n`;

    for (let m = 0; m < numMeasures; m++) {
      const measureStartBeat = m * this.beatsPerMeasure;
      const measureEndBeat = measureStartBeat + this.beatsPerMeasure;

      const measureNotes = notes.filter(note =>
        note.startBeat >= measureStartBeat && note.startBeat < measureEndBeat
      ).sort((a, b) => a.startBeat - b.startBeat);

      xml += `    <measure number="${m + 1}">\n`;

      // First measure has attributes
      if (m === 0) {
        xml += `      <attributes>
        <divisions>4</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>${this.beatsPerMeasure}</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>${clef}</sign>
          <line>${clefLine}</line>
        </clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>${tempo}</per-minute>
          </metronome>
        </direction-type>
      </direction>\n`;
      }

      if (measureNotes.length === 0) {
        // Whole rest
        xml += `      <note>
        <rest measure="yes"/>
        <duration>16</duration>
        <type>whole</type>
      </note>\n`;
      } else {
        for (const note of measureNotes) {
          xml += this.noteToMusicXML(note, measureStartBeat);
        }
      }

      xml += `    </measure>\n`;
    }

    xml += `  </part>`;
    return xml;
  }

  /**
   * Convert a note to MusicXML
   */
  noteToMusicXML(note, measureStartBeat) {
    const pitch = note.pitch;
    const octave = Math.floor(pitch / 12) - 1;
    const noteIndex = pitch % 12;
    const stepNames = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
    const step = stepNames[noteIndex];
    const alter = [1, 3, 6, 8, 10].includes(noteIndex) ? 1 : 0;

    const duration = Math.round(note.durationBeats * 4);
    const { duration: durationName } = beatsToDuration(note.durationBeats);

    const typeMap = {
      '32': '32nd',
      '16': '16th',
      '8': 'eighth',
      'q': 'quarter',
      'h': 'half',
      'w': 'whole',
    };

    return `      <note>
        <pitch>
          <step>${step}</step>${alter ? `
          <alter>${alter}</alter>` : ''}
          <octave>${octave}</octave>
        </pitch>
        <duration>${duration}</duration>
        <type>${typeMap[durationName] || 'quarter'}</type>
      </note>\n`;
  }

  /**
   * Escape XML special characters
   */
  escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * Create and initialize score view
 */
export function createScoreView(container) {
  return new ScoreView(container);
}
