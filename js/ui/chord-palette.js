/**
 * Chord Palette - UI for chord selection, arpeggiator, and voice leading
 * Fase 8: Musical Features
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import {
  getDiatonicChords,
  getDiatonicSeventhChords,
  getChordMidi,
  CHORD_NAMES,
  SCALE_NAMES,
  suggestNextChords,
  generateArpSequence,
  ARP_PATTERNS,
} from '../music-theory.js';

/**
 * Chord Palette Manager
 */
class ChordPaletteManager {
  constructor() {
    this.modal = null;
    this.isOpen = false;
    this.currentChord = null;
    this.lastPlayedChord = null;

    // Arpeggiator state
    this.arpEnabled = false;
    this.arpTimer = null;
    this.arpIndex = 0;
    this.arpSequence = [];

    // Audio context for preview
    this.audioContext = null;
    this.activeOscillators = [];
  }

  /**
   * Initialize the chord palette
   */
  init() {
    this.modal = document.getElementById('chord-palette-modal');
    if (!this.modal) return;

    this.setupEventListeners();
    this.setupEventBusListeners();
    this.render();
  }

  /**
   * Setup DOM event listeners
   */
  setupEventListeners() {
    // Close button
    const closeBtn = document.getElementById('btn-close-chord-palette');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // Arpeggiator toggle
    const arpToggle = document.getElementById('arp-enabled');
    if (arpToggle) {
      arpToggle.addEventListener('change', (e) => {
        this.setArpEnabled(e.target.checked);
      });
    }

    // Arpeggiator controls
    ['arp-pattern', 'arp-octaves', 'arp-rate'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => this.updateArpSettings());
      }
    });

    // Chord palette button
    const paletteBtn = document.getElementById('btn-chord-palette');
    if (paletteBtn) {
      paletteBtn.addEventListener('click', () => this.toggle());
    }

    // Keyboard shortcut to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  /**
   * Setup event bus listeners
   */
  setupEventBusListeners() {
    // Update when scale changes
    eventBus.on(Events.SCALE_CHANGE, () => {
      if (this.isOpen) {
        this.render();
      }
    });

    // Update suggestions when chord is played
    eventBus.on(Events.CHORD_INSERT, (data) => {
      this.lastPlayedChord = data;
      this.updateSuggestions();
    });
  }

  /**
   * Open the chord palette
   */
  open() {
    if (!this.modal) return;

    this.isOpen = true;
    this.modal.classList.remove('hidden');
    this.render();

    // Initialize audio context on user interaction
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    eventBus.emit(Events.MODAL_OPEN, 'chord-palette');
  }

  /**
   * Close the chord palette
   */
  close() {
    if (!this.modal) return;

    this.isOpen = false;
    this.modal.classList.add('hidden');
    this.stopAllNotes();
    this.stopArpeggiator();

    eventBus.emit(Events.MODAL_CLOSE, 'chord-palette');
  }

  /**
   * Toggle the chord palette
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Render the chord palette content
   */
  render() {
    const scale = state.getScale();
    const { root, type } = scale;

    // Update scale display
    const scaleDisplay = document.getElementById('chord-palette-scale-display');
    if (scaleDisplay) {
      const scaleName = SCALE_NAMES[type] || type;
      scaleDisplay.textContent = `${root} ${scaleName}`;
    }

    // Render diatonic triads
    const triadsContainer = document.getElementById('diatonic-triads');
    if (triadsContainer) {
      const triads = getDiatonicChords(root, type);
      triadsContainer.innerHTML = triads.map(chord => this.renderChordButton(chord)).join('');
      this.attachChordListeners(triadsContainer);
    }

    // Render diatonic seventh chords
    const seventhsContainer = document.getElementById('diatonic-sevenths');
    if (seventhsContainer) {
      const sevenths = getDiatonicSeventhChords(root, type);
      seventhsContainer.innerHTML = sevenths.map(chord => this.renderChordButton(chord)).join('');
      this.attachChordListeners(seventhsContainer);
    }

    // Render common chords
    const commonContainer = document.getElementById('common-chords');
    if (commonContainer) {
      const commonTypes = ['sus2', 'sus4', 'add9', '5'];
      const common = commonTypes.map(chordType => ({
        root,
        type: chordType,
        symbol: root + (CHORD_NAMES[chordType]?.symbol || chordType),
        degree: null,
      }));
      commonContainer.innerHTML = common.map(chord => this.renderChordButton(chord, false)).join('');
      this.attachChordListeners(commonContainer);
    }

    // Update arpeggiator controls state
    this.updateArpControlsUI();

    // Update suggestions
    this.updateSuggestions();
  }

  /**
   * Render a chord button
   */
  renderChordButton(chord, showRoman = true) {
    const romanNumeral = chord.romanNumeral || '';
    return `
      <button class="chord-btn"
              data-root="${chord.root}"
              data-type="${chord.type}"
              data-symbol="${chord.symbol}">
        <span class="chord-symbol">${chord.symbol}</span>
        ${showRoman && romanNumeral ? `<span class="chord-roman">${romanNumeral}</span>` : ''}
      </button>
    `;
  }

  /**
   * Attach event listeners to chord buttons
   */
  attachChordListeners(container) {
    container.querySelectorAll('.chord-btn').forEach(btn => {
      // Preview on mouse down
      btn.addEventListener('mousedown', (e) => {
        const root = btn.dataset.root;
        const type = btn.dataset.type;
        this.previewChord(root, type);
        btn.classList.add('playing');
      });

      // Stop on mouse up
      btn.addEventListener('mouseup', () => {
        this.stopPreview();
        btn.classList.remove('playing');
      });

      btn.addEventListener('mouseleave', () => {
        this.stopPreview();
        btn.classList.remove('playing');
      });

      // Insert on click
      btn.addEventListener('click', (e) => {
        if (!e.shiftKey) {
          const root = btn.dataset.root;
          const type = btn.dataset.type;
          const symbol = btn.dataset.symbol;
          this.insertChord(root, type, symbol);
        }
      });
    });
  }

  /**
   * Preview a chord (play audio)
   */
  previewChord(root, type) {
    if (!this.audioContext) return;

    this.stopAllNotes();

    // Get MIDI notes for chord
    const octave = 4; // Middle octave
    const midiNotes = getChordMidi(`${root}${octave}`, type);

    if (this.arpEnabled) {
      // Play arpeggiated
      this.playArpeggio(midiNotes);
    } else {
      // Play all notes simultaneously
      midiNotes.forEach(note => {
        this.playNote(note);
      });
    }

    this.currentChord = { root, type, midiNotes };
  }

  /**
   * Stop chord preview
   */
  stopPreview() {
    if (!this.arpEnabled) {
      this.stopAllNotes();
    }
    // Let arpeggiator continue if enabled
  }

  /**
   * Play a single note
   */
  playNote(midiNote, duration = 0.5) {
    if (!this.audioContext) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'triangle';
    osc.frequency.value = 440 * Math.pow(2, (midiNote - 69) / 12);

    gain.gain.setValueAtTime(0.15, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.start();
    osc.stop(this.audioContext.currentTime + duration);

    this.activeOscillators.push({ osc, gain });

    // Cleanup
    osc.onended = () => {
      const idx = this.activeOscillators.findIndex(o => o.osc === osc);
      if (idx !== -1) {
        this.activeOscillators.splice(idx, 1);
      }
    };

    return osc;
  }

  /**
   * Stop all playing notes
   */
  stopAllNotes() {
    this.activeOscillators.forEach(({ osc, gain }) => {
      try {
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        osc.stop(this.audioContext.currentTime + 0.1);
      } catch (e) {
        // Oscillator may have already stopped
      }
    });
    this.activeOscillators = [];
  }

  /**
   * Play arpeggiated chord
   */
  playArpeggio(midiNotes) {
    this.stopArpeggiator();

    const arp = state.getArpeggiator();
    this.arpSequence = generateArpSequence(midiNotes, arp.pattern, arp.octaves);
    this.arpIndex = 0;

    // Calculate interval from rate
    const tempo = state.get('transport.tempo') || 120;
    const rateMap = {
      '1/4': 1,
      '1/8': 0.5,
      '1/16': 0.25,
      '1/32': 0.125,
    };
    const beatDuration = 60000 / tempo; // ms per beat
    const interval = beatDuration * (rateMap[arp.rate] || 0.5);
    const noteDuration = (interval / 1000) * (arp.gate || 0.8);

    // Play first note immediately
    this.playArpNote(noteDuration);

    // Schedule subsequent notes
    this.arpTimer = setInterval(() => {
      this.playArpNote(noteDuration);
    }, interval);
  }

  /**
   * Play single arp note
   */
  playArpNote(duration) {
    if (this.arpSequence.length === 0) return;

    const note = this.arpSequence[this.arpIndex];
    this.playNote(note, duration);

    this.arpIndex = (this.arpIndex + 1) % this.arpSequence.length;
  }

  /**
   * Stop arpeggiator
   */
  stopArpeggiator() {
    if (this.arpTimer) {
      clearInterval(this.arpTimer);
      this.arpTimer = null;
    }
    this.arpIndex = 0;
    this.arpSequence = [];
  }

  /**
   * Set arpeggiator enabled
   */
  setArpEnabled(enabled) {
    this.arpEnabled = enabled;
    state.setArpeggiatorEnabled(enabled);
    this.updateArpControlsUI();

    if (!enabled) {
      this.stopArpeggiator();
    }
  }

  /**
   * Update arpeggiator settings from UI
   */
  updateArpSettings() {
    const pattern = document.getElementById('arp-pattern')?.value || 'up';
    const octaves = parseInt(document.getElementById('arp-octaves')?.value || '1', 10);
    const rate = document.getElementById('arp-rate')?.value || '1/8';

    state.setArpeggiator({ pattern, octaves, rate });
  }

  /**
   * Update arpeggiator controls UI
   */
  updateArpControlsUI() {
    const controls = document.getElementById('arp-controls');
    if (controls) {
      controls.classList.toggle('enabled', this.arpEnabled);
    }

    const toggle = document.getElementById('arp-enabled');
    if (toggle) {
      toggle.checked = this.arpEnabled;
    }
  }

  /**
   * Insert chord into selected voice
   */
  insertChord(root, type, symbol) {
    const selectedVoiceId = state.get('selectedVoiceId');
    if (!selectedVoiceId) {
      eventBus.emit(Events.TOAST_SHOW, {
        message: 'Select a voice first',
        type: 'warning',
      });
      return;
    }

    // Get insertion settings
    const position = document.getElementById('chord-insert-position')?.value || 'playhead';
    const duration = parseFloat(document.getElementById('chord-duration')?.value || '4');

    // Calculate start beat
    let startBeat = 0;
    const transport = state.get('transport');

    switch (position) {
      case 'playhead':
        startBeat = transport.currentBeat;
        break;
      case 'end':
        // Find end of last note
        const notes = state.getNotes(selectedVoiceId);
        if (notes.length > 0) {
          startBeat = Math.max(...notes.map(n => n.startBeat + n.durationBeats));
        }
        break;
      case 'next-beat':
        startBeat = Math.ceil(transport.currentBeat);
        break;
    }

    // Get MIDI notes
    const octave = 4;
    const midiNotes = getChordMidi(`${root}${octave}`, type);

    // Add each note to the voice
    midiNotes.forEach(pitch => {
      state.addNote(selectedVoiceId, {
        pitch,
        startBeat,
        durationBeats: duration,
        velocity: 100,
      });
    });

    // Emit event
    eventBus.emit(Events.CHORD_INSERT, { root, type, symbol, startBeat, duration });

    // Update last played chord for suggestions
    this.lastPlayedChord = { root, type };
    this.updateSuggestions();

    eventBus.emit(Events.TOAST_SHOW, {
      message: `Inserted ${symbol}`,
      type: 'success',
    });
  }

  /**
   * Update voice leading suggestions
   */
  updateSuggestions() {
    const container = document.getElementById('chord-suggestions');
    if (!container) return;

    if (!this.lastPlayedChord) {
      container.innerHTML = '<span class="suggestion-hint">Play a chord to see suggestions</span>';
      return;
    }

    const scale = state.getScale();
    const suggestions = suggestNextChords(
      this.lastPlayedChord.root,
      this.lastPlayedChord.type,
      scale.root,
      scale.type
    );

    // Show top 4 suggestions
    const topSuggestions = suggestions.slice(0, 4);

    container.innerHTML = topSuggestions.map(chord => `
      <button class="suggestion-chord ${chord.isCommon ? 'common' : ''}"
              data-root="${chord.root}"
              data-type="${chord.type}"
              data-symbol="${chord.symbol}"
              title="${chord.isCommon ? 'Common progression' : 'Diatonic chord'}">
        ${chord.symbol}
      </button>
    `).join('');

    // Attach listeners
    container.querySelectorAll('.suggestion-chord').forEach(btn => {
      btn.addEventListener('click', () => {
        const root = btn.dataset.root;
        const type = btn.dataset.type;
        const symbol = btn.dataset.symbol;
        this.insertChord(root, type, symbol);
      });

      btn.addEventListener('mousedown', () => {
        const root = btn.dataset.root;
        const type = btn.dataset.type;
        this.previewChord(root, type);
      });

      btn.addEventListener('mouseup', () => {
        this.stopPreview();
      });

      btn.addEventListener('mouseleave', () => {
        this.stopPreview();
      });
    });
  }
}

// Singleton instance
export const chordPalette = new ChordPaletteManager();
