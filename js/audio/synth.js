/**
 * Built-in Synth - Simple synthesizer for sequencer playback
 */

import { audioContext } from './context-manager.js';
import { mixer } from './mixer.js';

// Drum sounds configuration
const DRUM_SOUNDS = {
  kick: {
    type: 'sine',
    freq: 150,
    freqDecay: 0.1,
    freqEnd: 40,
    attack: 0.001,
    decay: 0.3,
    gain: 0.9,
    noise: false,
  },
  snare: {
    type: 'triangle',
    freq: 200,
    freqDecay: 0.05,
    freqEnd: 100,
    attack: 0.001,
    decay: 0.15,
    gain: 0.6,
    noise: true,
    noiseDecay: 0.2,
    noiseGain: 0.5,
  },
  hihat: {
    type: 'square',
    freq: 8000,
    attack: 0.001,
    decay: 0.08,
    gain: 0.2,
    noise: true,
    noiseDecay: 0.1,
    noiseGain: 0.6,
    filter: { type: 'highpass', freq: 7000 },
  },
  clap: {
    type: 'triangle',
    freq: 300,
    attack: 0.001,
    decay: 0.15,
    gain: 0.5,
    noise: true,
    noiseDecay: 0.12,
    noiseGain: 0.7,
    filter: { type: 'bandpass', freq: 2000, Q: 1 },
  },
  tom: {
    type: 'sine',
    freq: 200,
    freqDecay: 0.15,
    freqEnd: 100,
    attack: 0.001,
    decay: 0.25,
    gain: 0.7,
    noise: false,
  },
  rim: {
    type: 'square',
    freq: 800,
    attack: 0.001,
    decay: 0.05,
    gain: 0.4,
    noise: true,
    noiseDecay: 0.02,
    noiseGain: 0.3,
    filter: { type: 'highpass', freq: 2000 },
  },
};

// Default drum kit mapping by voice name
const VOICE_DRUM_MAP = {
  kick: 'kick',
  bass: 'kick',
  snare: 'snare',
  clap: 'clap',
  hihat: 'hihat',
  'hi-hat': 'hihat',
  hat: 'hihat',
  tom: 'tom',
  rim: 'rim',
};

/**
 * Get drum type from voice name
 */
function getDrumType(voiceName) {
  const name = voiceName.toLowerCase();
  for (const [key, value] of Object.entries(VOICE_DRUM_MAP)) {
    if (name.includes(key)) {
      return value;
    }
  }
  return 'kick'; // Default
}

/**
 * Create noise buffer
 */
let noiseBuffer = null;
function getNoiseBuffer(ctx) {
  if (!noiseBuffer) {
    const bufferSize = ctx.sampleRate * 0.5;
    noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }
  return noiseBuffer;
}

/**
 * Play a drum sound
 */
export function playDrum(voiceId, voiceName, time, velocity = 1) {
  const ctx = audioContext.context;
  const destination = mixer.getVoiceInput(voiceId);
  if (!destination) return;

  const drumType = getDrumType(voiceName);
  const config = DRUM_SOUNDS[drumType] || DRUM_SOUNDS.kick;

  const now = time ?? ctx.currentTime;
  const gain = config.gain * velocity;

  // Create oscillator
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();

  osc.type = config.type;
  osc.frequency.setValueAtTime(config.freq, now);

  if (config.freqDecay && config.freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(
      config.freqEnd,
      now + config.freqDecay
    );
  }

  oscGain.gain.setValueAtTime(0, now);
  oscGain.gain.linearRampToValueAtTime(gain, now + config.attack);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + config.attack + config.decay);

  osc.connect(oscGain);

  // Apply filter if configured
  let finalNode = oscGain;
  if (config.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = config.filter.type;
    filter.frequency.value = config.filter.freq;
    if (config.filter.Q) filter.Q.value = config.filter.Q;
    oscGain.connect(filter);
    finalNode = filter;
  }

  finalNode.connect(destination);

  osc.start(now);
  osc.stop(now + config.attack + config.decay + 0.1);

  // Add noise if configured
  if (config.noise) {
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const noiseGain = ctx.createGain();

    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(config.noiseGain * velocity, now + config.attack);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + config.attack + config.noiseDecay);

    noise.connect(noiseGain);

    // Apply filter to noise if configured
    if (config.filter) {
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = config.filter.type;
      noiseFilter.frequency.value = config.filter.freq;
      if (config.filter.Q) noiseFilter.Q.value = config.filter.Q;
      noiseGain.connect(noiseFilter);
      noiseFilter.connect(destination);
    } else {
      noiseGain.connect(destination);
    }

    noise.start(now);
    noise.stop(now + config.attack + config.noiseDecay + 0.1);
  }
}

/**
 * Play a note (simple synth)
 */
export function playNote(voiceId, midiNote, time, duration = 0.1, velocity = 1) {
  const ctx = audioContext.context;
  const destination = mixer.getVoiceInput(voiceId);
  if (!destination) return;

  const now = time ?? ctx.currentTime;
  const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

  // Oscillator
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, now);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, now);
  filter.frequency.exponentialRampToValueAtTime(500, now + duration * 0.8);

  const attack = 0.005;
  const decay = 0.1;
  const sustain = 0.6;
  const release = 0.1;

  oscGain.gain.setValueAtTime(0, now);
  oscGain.gain.linearRampToValueAtTime(velocity * 0.5, now + attack);
  oscGain.gain.linearRampToValueAtTime(velocity * 0.5 * sustain, now + attack + decay);
  oscGain.gain.setValueAtTime(velocity * 0.5 * sustain, now + duration - release);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(filter);
  filter.connect(oscGain);
  oscGain.connect(destination);

  osc.start(now);
  osc.stop(now + duration + 0.1);
}

/**
 * Synth engine class for managing playback
 */
class SynthEngine {
  constructor() {
    this.scheduledNotes = new Map(); // step -> scheduled nodes
  }

  /**
   * Trigger voices at a step
   */
  triggerStep(voices, step, time) {
    voices.forEach(({ voiceId, voice }) => {
      const melodicNotes = voice.content?.melodicNotes;

      if (melodicNotes && melodicNotes.length > 0) {
        // Melodic voice: cycle through notes
        const noteIndex = step % melodicNotes.length;
        const midiNote = melodicNotes[noteIndex];
        playNote(voiceId, midiNote, time, 0.2, voice.volume || 1);
      } else {
        // Percussion voice
        playDrum(voiceId, voice.name, time, voice.volume || 1);
      }
    });
  }

  /**
   * Stop all sounds
   */
  stopAll() {
    // Web Audio nodes clean themselves up after stopping
    this.scheduledNotes.clear();
  }
}

// Singleton instance
export const synthEngine = new SynthEngine();
