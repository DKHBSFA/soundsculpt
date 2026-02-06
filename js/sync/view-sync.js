/**
 * View Sync Module
 * Handles bidirectional synchronization between different view representations:
 * - Sequencer (steps[])
 * - Piano Roll / Score (notes[])
 * - Code Editor (patternCode)
 */

import { state } from '../state.js';
import { eventBus, Events } from '../event-bus.js';
import {
  midiToNote,
  noteToMidi,
  parseStrudelToNotes,
  parseStrudelToSteps,
  extractSound,
  extractEffects,
  extractTimeModifier,
  hasVoicing,
  parsePatternToVoiceData,
  isSilent
} from './strudel-parser.js';

// === Conversion Utilities ===

/**
 * Convert MIDI note number to Strudel note name
 * @param {number} midi - MIDI note number (0-127)
 * @returns {string} Note name (e.g., 'c4', 'f#3')
 */
export function midiToStrudelNote(midi) {
  return midiToNote(midi);
}

/**
 * Convert Strudel note name to MIDI number
 * @param {string} noteName - Note name (e.g., 'c4', 'f#3')
 * @returns {number} MIDI note number
 */
export function strudelNoteToMidi(noteName) {
  return noteToMidi(noteName) || 60;
}

/**
 * Convert boolean steps array to Strudel struct string
 * @param {boolean[]} steps - Step pattern
 * @returns {string} Struct pattern (e.g., 't ~ t ~ t ~ t ~')
 */
export function stepsToStruct(steps) {
  return steps.map(s => s ? 't' : '~').join(' ');
}

/**
 * Convert Strudel struct string to boolean steps array
 * @param {string} struct - Struct pattern
 * @param {number} totalSteps - Total number of steps (default 16)
 * @returns {boolean[]} Steps array
 */
export function structToSteps(struct, totalSteps = 16) {
  const tokens = struct.trim().split(/\s+/);
  const steps = new Array(totalSteps).fill(false);

  tokens.forEach((token, i) => {
    if (i < totalSteps && (token === 't' || token === '1' || token === 'x')) {
      steps[i] = true;
    }
  });

  return steps;
}

/**
 * Convert steps to Strudel pattern code for a drum voice
 * @param {boolean[]} steps - Step pattern
 * @param {string} sound - Drum sound name
 * @param {number} velocity - Velocity (0-1)
 * @returns {string} Strudel pattern code
 */
export function stepsToStrudel(steps, voice) {
  const struct = stepsToStruct(steps);
  const sound = voice.content?.sound || voice.name?.toLowerCase() || 'bd';
  const velocity = voice.volume || 0.8;

  if (voice.type === 'drum' || voice.sourceType === 'synth') {
    return `s('${sound}')\n  .struct('${struct}')\n  .gain(${velocity.toFixed(2)})`;
  }

  // For melodic voices, we need notes
  const notes = voice.content?.notes || [];
  if (notes.length === 0) {
    return `// No notes defined\ns('${sound}').struct('${struct}')`;
  }

  const noteNames = notes.map(n => midiToStrudelNote(n.pitch)).join(' ');
  return `note('<${noteNames}>')\n  .s('${sound}')\n  .struct('${struct}')\n  .gain(${velocity.toFixed(2)})`;
}

/**
 * Convert Strudel pattern code to steps
 * Uses the strudel-parser module for full pattern support
 * @param {string} patternCode - Strudel pattern code
 * @param {number} totalSteps - Total number of steps (default 16)
 * @returns {boolean[]} Steps array
 */
export function strudelToSteps(patternCode, totalSteps = 16) {
  if (!patternCode || isSilent(patternCode)) {
    return new Array(totalSteps).fill(false);
  }
  return parseStrudelToSteps(patternCode, totalSteps);
}

/**
 * Convert notes array to Strudel pattern code
 * @param {Array} notes - Array of note objects {pitch, startBeat, duration, velocity}
 * @param {object} voice - Voice object
 * @returns {string} Strudel pattern code
 */
export function notesToStrudel(notes, voice) {
  if (!notes || notes.length === 0) {
    return `// Empty pattern\nnote('~')`;
  }

  const sound = voice?.content?.sound || 'piano';
  const velocity = voice?.volume || 0.8;

  // Sort notes by start time
  const sortedNotes = [...notes].sort((a, b) => a.startBeat - b.startBeat);

  // Convert to note names
  const noteNames = sortedNotes.map(n => midiToStrudelNote(n.pitch));

  // Calculate rhythm struct from note positions
  const totalSteps = 16;
  const stepsPerBeat = totalSteps / 4; // Assuming 4 beats
  const struct = new Array(totalSteps).fill('~');

  sortedNotes.forEach(note => {
    const stepIndex = Math.floor(note.startBeat * stepsPerBeat);
    if (stepIndex >= 0 && stepIndex < totalSteps) {
      struct[stepIndex] = 't';
    }
  });

  const structStr = struct.join(' ');
  const noteStr = noteNames.join(' ');

  return `note('<${noteStr}>')\n  .s('${sound}')\n  .struct('${structStr}')\n  .gain(${velocity.toFixed(2)})`;
}

/**
 * Convert Strudel pattern code to notes array
 * Uses the strudel-parser module for full pattern support
 * @param {string} patternCode - Strudel pattern code
 * @param {number} totalSteps - Total number of steps (default 16)
 * @param {Object} options - { voicingPreset, voicingType }
 * @returns {Array} Array of note objects
 */
export function strudelToNotes(patternCode, totalSteps = 16, options = {}) {
  if (!patternCode || isSilent(patternCode)) {
    return [];
  }
  return parseStrudelToNotes(patternCode, totalSteps, options);
}

/**
 * Convert notes to steps (for sequencer)
 * @param {Array} notes - Array of note objects
 * @param {number} totalSteps - Total steps (default 16)
 * @returns {boolean[]} Steps array
 */
export function notesToSteps(notes, totalSteps = 16) {
  const steps = new Array(totalSteps).fill(false);
  const stepsPerBeat = totalSteps / 4;

  notes.forEach(note => {
    const stepIndex = Math.floor(note.startBeat * stepsPerBeat);
    if (stepIndex >= 0 && stepIndex < totalSteps) {
      steps[stepIndex] = true;
    }
  });

  return steps;
}

/**
 * Convert steps to notes (basic pitch assignment)
 * @param {boolean[]} steps - Steps array
 * @param {object} voice - Voice object for context
 * @returns {Array} Notes array
 */
export function stepsToNotes(steps, voice) {
  const notes = [];
  const stepsPerBeat = steps.length / 4;
  const basePitch = voice?.content?.basePitch || 60; // Middle C

  steps.forEach((triggered, index) => {
    if (triggered) {
      notes.push({
        id: `note-${Date.now()}-${index}`,
        pitch: basePitch,
        startBeat: index / stepsPerBeat,
        duration: 0.25,
        velocity: 0.8,
      });
    }
  });

  return notes;
}

// === ViewSync Class ===

class ViewSync {
  constructor() {
    this.syncing = false; // Prevent recursive sync
    this.voicingPresets = {}; // Cache for voicing presets
  }

  /**
   * Set voicing preset for a key
   * @param {string} key - Key identifier (e.g., 'A minor')
   * @param {Object} preset - Voicing preset data
   */
  setVoicingPreset(key, preset) {
    this.voicingPresets[key] = preset;
  }

  /**
   * Get voicing preset for current project key
   * @param {Object} voice - Voice object
   * @returns {Object|null} Voicing preset or null
   */
  getVoicingPreset(voice) {
    const projectKey = state.get('key') || {};
    const keyStr = `${projectKey.root || 'C'} ${projectKey.scale || 'minor'}`;
    return this.voicingPresets[keyStr] || null;
  }

  /**
   * Synchronize all representations when one changes
   * @param {string} voiceId - Voice ID
   * @param {string} source - Source of change ('steps' | 'notes' | 'patternCode')
   * @param {any} value - New value
   */
  syncFromSource(voiceId, source, value) {
    if (this.syncing) return; // Prevent recursion

    const voice = state.getVoice(voiceId);
    if (!voice) return;

    this.syncing = true;

    try {
      const updates = { ...voice };
      const totalSteps = voice.content?.steps?.length || 16;
      const voicingPreset = this.getVoicingPreset(voice);

      switch (source) {
        case 'steps':
          updates.content = { ...voice.content, steps: value };
          updates.patternCode = stepsToStrudel(value, voice);
          // For drum voices, don't sync to notes
          if (voice.type !== 'drum') {
            updates.content.notes = stepsToNotes(value, voice);
          }
          break;

        case 'notes':
          updates.content = { ...voice.content, notes: value };
          updates.content.steps = notesToSteps(value, totalSteps);
          updates.patternCode = notesToStrudel(value, voice);
          break;

        case 'patternCode':
          // Check for silent pattern
          if (isSilent(value)) {
            updates.patternCode = value;
            updates.content = {
              ...voice.content,
              steps: new Array(totalSteps).fill(false),
              notes: []
            };
          } else {
            updates.patternCode = value;

            // Extract additional data from pattern
            const parsedData = parsePatternToVoiceData(value, totalSteps, {
              voicingPreset,
              voicingType: voice.voicingType || 'root'
            });

            updates.content = {
              ...voice.content,
              steps: parsedData.steps,
              sound: parsedData.sound || voice.content?.sound
            };

            // Update effects if present
            if (Object.keys(parsedData.effects).length > 0) {
              updates.effects = { ...voice.effects, ...parsedData.effects };
            }

            // For melodic voices, also update notes
            if (voice.type !== 'drum') {
              updates.content.notes = parsedData.notes;
            }
          }
          break;
      }

      // Update state
      state.updateVoice(voiceId, updates);

      // Emit sync event for views to update
      eventBus.emit(Events.VOICE_CONTENT_SYNC, { voiceId, source });
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Sync steps change
   */
  syncSteps(voiceId, steps) {
    this.syncFromSource(voiceId, 'steps', steps);
  }

  /**
   * Sync notes change
   */
  syncNotes(voiceId, notes) {
    this.syncFromSource(voiceId, 'notes', notes);
  }

  /**
   * Sync pattern code change
   */
  syncPatternCode(voiceId, patternCode) {
    this.syncFromSource(voiceId, 'patternCode', patternCode);
  }
}

export const viewSync = new ViewSync();
