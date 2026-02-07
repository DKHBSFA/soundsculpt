/**
 * Tone.js Preview - Real-time input preview for MIDI and Musical Typing
 *
 * Wrapper for Tone.js that shares AudioContext with Strudel.
 * Used for low-latency input preview (MIDI keyboard, computer keyboard).
 * Strudel handles pattern playback; this handles immediate note triggering.
 */

// Shared AudioContext reference
let sharedContext = null;

// Will be initialized after Tone.js loads
let Tone = null;
let synth = null;
let initialized = false;

/**
 * Synth presets for different voice types
 */
const PRESETS = {
  default: {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.5, release: 0.2 },
  },
  bass: {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.1 },
  },
  lead: {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.02, decay: 0.15, sustain: 0.7, release: 0.15 },
  },
  pad: {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.3, decay: 0.4, sustain: 0.8, release: 0.5 },
  },
  pluck: {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.3, sustain: 0.1, release: 0.2 },
  },
  piano: {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.5, sustain: 0.3, release: 0.3 },
  },
  strings: {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.15, decay: 0.3, sustain: 0.85, release: 0.4 },
  },
  brass: {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.08, decay: 0.2, sustain: 0.7, release: 0.15 },
  },
};

/**
 * Tone Preview module for real-time input
 */
export const tonePreview = {
  /**
   * Initialize with shared AudioContext
   * @param {AudioContext} audioContext - The shared AudioContext
   * @returns {Promise<boolean>} Success status
   */
  async init(audioContext) {
    if (initialized && synth) {
      return true;
    }

    try {
      // Import Tone.js dynamically
      Tone = await import('tone');

      // Set shared context before any Tone.js operations
      if (audioContext) {
        sharedContext = audioContext;
        Tone.setContext(audioContext);
        console.log('Tone.js using shared AudioContext');
      }

      // Create PolySynth for polyphonic playback
      synth = new Tone.PolySynth(Tone.Synth, PRESETS.default).toDestination();
      synth.volume.value = -6; // Slight volume reduction to prevent clipping

      initialized = true;
      console.log('Tone.js preview initialized');
      return true;
    } catch (err) {
      console.error('Failed to initialize Tone.js preview:', err);
      return false;
    }
  },

  /**
   * Check if initialized
   * @returns {boolean}
   */
  isReady() {
    return initialized && synth !== null;
  },

  /**
   * Trigger note on
   * @param {number} midiNote - MIDI note number (0-127)
   * @param {number} velocity - Velocity (0-1)
   * @param {string} preset - Optional preset name
   */
  noteOn(midiNote, velocity = 0.8, preset = 'default') {
    if (!this.isReady()) {
      console.warn('Tone preview not ready');
      return;
    }

    try {
      const freq = Tone.Frequency(midiNote, 'midi').toFrequency();
      synth.triggerAttack(freq, Tone.now(), velocity);
    } catch (err) {
      console.error('Tone noteOn error:', err);
    }
  },

  /**
   * Trigger note off
   * @param {number} midiNote - MIDI note number (0-127)
   */
  noteOff(midiNote) {
    if (!this.isReady()) return;

    try {
      const freq = Tone.Frequency(midiNote, 'midi').toFrequency();
      synth.triggerRelease(freq);
    } catch (err) {
      console.error('Tone noteOff error:', err);
    }
  },

  /**
   * Play a note with specific duration
   * @param {number} midiNote - MIDI note number
   * @param {number} duration - Duration in seconds
   * @param {number} velocity - Velocity (0-1)
   */
  playNote(midiNote, duration = 0.3, velocity = 0.8) {
    if (!this.isReady()) return;

    try {
      const freq = Tone.Frequency(midiNote, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, duration, Tone.now(), velocity);
    } catch (err) {
      console.error('Tone playNote error:', err);
    }
  },

  /**
   * Set synth preset
   * @param {string} presetName - Preset name (bass, lead, pad, etc.)
   */
  setPreset(presetName) {
    if (!this.isReady()) return;

    const preset = PRESETS[presetName] || PRESETS.default;

    try {
      // PolySynth requires setting options on all voices
      synth.set({
        oscillator: preset.oscillator,
        envelope: preset.envelope,
      });
    } catch (err) {
      console.error('Tone setPreset error:', err);
    }
  },

  /**
   * Set volume
   * @param {number} db - Volume in decibels (-60 to 0)
   */
  setVolume(db) {
    if (!this.isReady()) return;
    synth.volume.value = Math.max(-60, Math.min(0, db));
  },

  /**
   * Release all notes
   */
  releaseAll() {
    if (!this.isReady()) return;
    synth.releaseAll();
  },

  /**
   * Dispose and cleanup
   */
  dispose() {
    if (synth) {
      synth.dispose();
      synth = null;
    }
    initialized = false;
    Tone = null;
  },

  /**
   * Get current state
   * @returns {Object}
   */
  getState() {
    return {
      initialized,
      hasSharedContext: sharedContext !== null,
      volume: synth?.volume?.value ?? -6,
    };
  },
};

export default tonePreview;
