/**
 * Keyboard Manager - Handles keyboard shortcuts and musical typing
 */

import { eventBus, Events } from './event-bus.js';
import { quantizeToScale } from './music-theory.js';

class KeyboardManager {
  constructor() {
    this.shortcuts = new Map();
    this.enabled = true;
  }

  /**
   * Register a keyboard shortcut
   * @param {Object} options - Shortcut options
   * @param {string} options.key - Key name (e.g., 'z', 'Space', 'Enter')
   * @param {boolean} [options.ctrl] - Requires Ctrl/Cmd
   * @param {boolean} [options.shift] - Requires Shift
   * @param {boolean} [options.alt] - Requires Alt
   * @param {Function} options.action - Action to execute
   * @param {string} [options.description] - Description for help
   */
  register({ key, ctrl = false, shift = false, alt = false, action, description = '' }) {
    const id = this.makeId(key, { ctrl, shift, alt });
    this.shortcuts.set(id, { key, ctrl, shift, alt, action, description });
  }

  /**
   * Unregister a shortcut
   */
  unregister(key, modifiers = {}) {
    const id = this.makeId(key, modifiers);
    this.shortcuts.delete(id);
  }

  /**
   * Create shortcut ID from key and modifiers
   */
  makeId(key, { ctrl = false, shift = false, alt = false } = {}) {
    const parts = [];
    if (ctrl) parts.push('Ctrl');
    if (shift) parts.push('Shift');
    if (alt) parts.push('Alt');
    parts.push(key.toLowerCase());
    return parts.join('+');
  }

  /**
   * Handle keydown event
   */
  handleKeyDown(event) {
    if (!this.enabled) return;

    // Skip if in text input
    const target = event.target;
    if (
      target.matches('input, textarea, [contenteditable="true"]') &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      return;
    }

    const key = event.key === ' ' ? 'space' : event.key.toLowerCase();
    const id = this.makeId(key, {
      ctrl: event.ctrlKey || event.metaKey,
      shift: event.shiftKey,
      alt: event.altKey,
    });

    const shortcut = this.shortcuts.get(id);
    if (shortcut) {
      event.preventDefault();
      event.stopPropagation();
      shortcut.action(event);
    }
  }

  /**
   * Initialize keyboard listener
   */
  init() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  /**
   * Enable/disable keyboard handling
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Get all registered shortcuts (for help display)
   */
  getShortcuts() {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Format shortcut for display
   */
  formatShortcut(shortcut) {
    const parts = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.alt) parts.push('Alt');

    let keyDisplay = shortcut.key;
    if (keyDisplay === 'space') keyDisplay = 'Space';
    if (keyDisplay === 'enter') keyDisplay = 'Enter';
    parts.push(keyDisplay.charAt(0).toUpperCase() + keyDisplay.slice(1));

    return parts.join('+');
  }
}

// Singleton instance
export const keyboard = new KeyboardManager();

/**
 * Register default shortcuts
 */
export function registerDefaultShortcuts(handlers) {
  const {
    play,
    stop,
    toggleRecord,
    undo,
    redo,
    save,
    load,
    newProject,
    switchView,
    toggleLoop,
    addVoice,
    // Session mode (Fase 11b)
    toggleSessionRecord,
    toggleSessionPunch,
    playSession,
    clearSession,
  } = handlers;

  // Transport
  keyboard.register({
    key: 'space',
    action: play,
    description: 'Play/Pause',
  });

  keyboard.register({
    key: 'enter',
    action: stop,
    description: 'Stop',
  });

  keyboard.register({
    key: 'r',
    action: toggleRecord,
    description: 'Toggle Record',
  });

  keyboard.register({
    key: 'l',
    action: toggleLoop,
    description: 'Toggle Loop',
  });

  // History
  keyboard.register({
    key: 'z',
    ctrl: true,
    action: undo,
    description: 'Undo',
  });

  keyboard.register({
    key: 'y',
    ctrl: true,
    action: redo,
    description: 'Redo',
  });

  keyboard.register({
    key: 'z',
    ctrl: true,
    shift: true,
    action: redo,
    description: 'Redo',
  });

  // File
  keyboard.register({
    key: 's',
    ctrl: true,
    action: save,
    description: 'Save Project',
  });

  keyboard.register({
    key: 'o',
    ctrl: true,
    action: load,
    description: 'Load Project',
  });

  keyboard.register({
    key: 'n',
    ctrl: true,
    action: newProject,
    description: 'New Project',
  });

  // Views
  ['1', '2', '3', '4', '5'].forEach((key, index) => {
    const views = ['sequencer', 'piano-roll', 'score', 'patch', 'code'];
    keyboard.register({
      key,
      action: () => switchView(views[index]),
      description: `Switch to ${views[index]} view`,
    });
  });

  // Voices
  keyboard.register({
    key: 'a',
    ctrl: true,
    shift: true,
    action: addVoice,
    description: 'Add Voice',
  });

  // Session mode (Fase 11b)
  if (toggleSessionRecord) {
    keyboard.register({
      key: 'r',
      shift: true,
      action: toggleSessionRecord,
      description: 'Toggle Session Recording',
    });
  }

  if (toggleSessionPunch) {
    keyboard.register({
      key: 'p',
      shift: true,
      action: toggleSessionPunch,
      description: 'Toggle Punch-In Mode',
    });
  }

  if (playSession) {
    keyboard.register({
      key: 'space',
      shift: true,
      action: playSession,
      description: 'Play Session',
    });
  }

  if (clearSession) {
    keyboard.register({
      key: 'backspace',
      shift: true,
      action: clearSession,
      description: 'Clear Session',
    });
  }
}

// ============================================
// MUSICAL TYPING
// ============================================

/**
 * Musical Typing - Computer keyboard as MIDI input
 *
 * Layout (QWERTY):
 *   2 3   5 6 7   9 0     (black keys - upper octave)
 *  Q W E R T Y U I O P    (white keys - upper octave)
 *   S D   G H J           (black keys - lower octave)
 *  Z X C V B N M          (white keys - lower octave)
 */
class MusicalTyping {
  constructor() {
    this.enabled = false;
    this.octave = 4;
    this.velocity = 100;
    this.activeNotes = new Map(); // key -> midiNote
    this.onNoteOn = null;
    this.onNoteOff = null;

    // Scale quantization (Fase 8)
    this.quantize = false;
    this.scaleRoot = 'C';
    this.scaleType = 'major';

    // Key to semitone mapping (relative to octave)
    // Lower row (octave - 1)
    this.lowerKeys = {
      'z': 0,  // C
      's': 1,  // C#
      'x': 2,  // D
      'd': 3,  // D#
      'c': 4,  // E
      'v': 5,  // F
      'g': 6,  // F#
      'b': 7,  // G
      'h': 8,  // G#
      'n': 9,  // A
      'j': 10, // A#
      'm': 11, // B
    };

    // Upper row (current octave)
    this.upperKeys = {
      'q': 0,  // C
      '2': 1,  // C#
      'w': 2,  // D
      '3': 3,  // D#
      'e': 4,  // E
      'r': 5,  // F
      '5': 6,  // F#
      't': 7,  // G
      '6': 8,  // G#
      'y': 9,  // A
      '7': 10, // A#
      'u': 11, // B
      'i': 12, // C (next octave)
      '9': 13, // C#
      'o': 14, // D
      '0': 15, // D#
      'p': 16, // E
    };
  }

  /**
   * Enable musical typing
   */
  enable() {
    if (this.enabled) return;
    this.enabled = true;

    this._keyDownHandler = (e) => this.handleKeyDown(e);
    this._keyUpHandler = (e) => this.handleKeyUp(e);

    document.addEventListener('keydown', this._keyDownHandler);
    document.addEventListener('keyup', this._keyUpHandler);
  }

  /**
   * Disable musical typing
   */
  disable() {
    if (!this.enabled) return;
    this.enabled = false;

    document.removeEventListener('keydown', this._keyDownHandler);
    document.removeEventListener('keyup', this._keyUpHandler);

    // Release all held notes
    this.releaseAll();
  }

  /**
   * Set octave (1-8)
   */
  setOctave(octave) {
    this.octave = Math.max(1, Math.min(8, octave));
  }

  /**
   * Shift octave up or down
   */
  shiftOctave(direction) {
    this.setOctave(this.octave + direction);
    eventBus.emit(Events.TOAST_SHOW, {
      message: `Octave: ${this.octave}`,
      type: 'info',
    });
  }

  /**
   * Set velocity (0-127)
   */
  setVelocity(velocity) {
    this.velocity = Math.max(0, Math.min(127, velocity));
  }

  /**
   * Set scale for quantization (Fase 8)
   */
  setScale(root, type) {
    this.scaleRoot = root;
    this.scaleType = type;
  }

  /**
   * Enable/disable scale quantization (Fase 8)
   */
  setQuantize(enabled) {
    this.quantize = enabled;
    eventBus.emit(Events.TOAST_SHOW, {
      message: enabled ? `Quantize: ${this.scaleRoot} ${this.scaleType}` : 'Quantize: Off',
      type: 'info',
    });
  }

  /**
   * Handle keydown
   */
  handleKeyDown(event) {
    // Skip if in text input
    if (event.target.matches('input, textarea, [contenteditable="true"]')) {
      return;
    }

    // Skip if modifier keys pressed (let shortcuts handle these)
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    // Octave shift keys
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      this.shiftOctave(-1);
      return;
    }
    if (event.key === '=' || event.key === '+') {
      event.preventDefault();
      this.shiftOctave(1);
      return;
    }

    const key = event.key.toLowerCase();

    // Prevent key repeat
    if (this.activeNotes.has(key)) {
      return;
    }

    let midiNote = this.keyToMidiNote(key);
    if (midiNote !== null) {
      // Apply scale quantization if enabled (Fase 8)
      if (this.quantize) {
        midiNote = quantizeToScale(midiNote, this.scaleRoot, this.scaleType);
      }

      event.preventDefault();
      this.activeNotes.set(key, midiNote);
      this.noteOn(midiNote, this.velocity);
    }
  }

  /**
   * Handle keyup
   */
  handleKeyUp(event) {
    const key = event.key.toLowerCase();
    const midiNote = this.activeNotes.get(key);

    if (midiNote !== undefined) {
      this.activeNotes.delete(key);
      this.noteOff(midiNote);
    }
  }

  /**
   * Convert keyboard key to MIDI note number
   */
  keyToMidiNote(key) {
    // Check lower row (octave - 1)
    if (key in this.lowerKeys) {
      return (this.octave) * 12 + this.lowerKeys[key];
    }

    // Check upper row (current octave)
    if (key in this.upperKeys) {
      return (this.octave + 1) * 12 + this.upperKeys[key];
    }

    return null;
  }

  /**
   * Trigger note on
   */
  noteOn(midiNote, velocity) {
    if (this.onNoteOn) {
      this.onNoteOn(midiNote, velocity);
    }
    eventBus.emit('musical-typing:note-on', { midiNote, velocity });
  }

  /**
   * Trigger note off
   */
  noteOff(midiNote) {
    if (this.onNoteOff) {
      this.onNoteOff(midiNote);
    }
    eventBus.emit('musical-typing:note-off', { midiNote });
  }

  /**
   * Release all held notes
   */
  releaseAll() {
    for (const [key, midiNote] of this.activeNotes) {
      this.noteOff(midiNote);
    }
    this.activeNotes.clear();
  }

  /**
   * Get current state
   */
  getState() {
    return {
      enabled: this.enabled,
      octave: this.octave,
      velocity: this.velocity,
      activeNotes: Array.from(this.activeNotes.values()),
      quantize: this.quantize,
      scaleRoot: this.scaleRoot,
      scaleType: this.scaleType,
    };
  }

  /**
   * Convert MIDI note to note name
   */
  static midiToNoteName(midiNote) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiNote / 12) - 1;
    const note = noteNames[midiNote % 12];
    return `${note}${octave}`;
  }
}

// Singleton instance
export const musicalTyping = new MusicalTyping();
