/**
 * Built-in Synth - Simple synthesizer for sequencer playback
 */

import { audioContext } from './context-manager.js';
import { mixer } from './mixer.js';

// Drum kits - TR-808, TR-909, TR-606, Jazz
const DRUM_KITS = {
  // Roland TR-808 - Classic analog drum machine
  '808': {
    kick: { type: 'sine', freq: 150, freqDecay: 0.15, freqEnd: 35, attack: 0.001, decay: 0.4, gain: 0.95, noise: false },
    snare: { type: 'triangle', freq: 180, freqDecay: 0.05, freqEnd: 90, attack: 0.001, decay: 0.18, gain: 0.65, noise: true, noiseDecay: 0.25, noiseGain: 0.55, filter: { type: 'bandpass', freq: 3000, Q: 1 } },
    hihat: { type: 'square', freq: 8500, attack: 0.001, decay: 0.06, gain: 0.25, noise: true, noiseDecay: 0.08, noiseGain: 0.7, filter: { type: 'highpass', freq: 7500 } },
    openhat: { type: 'square', freq: 8500, attack: 0.001, decay: 0.35, gain: 0.25, noise: true, noiseDecay: 0.4, noiseGain: 0.65, filter: { type: 'highpass', freq: 7000 } },
    clap: { type: 'triangle', freq: 280, attack: 0.001, decay: 0.12, gain: 0.55, noise: true, noiseDecay: 0.15, noiseGain: 0.75, filter: { type: 'bandpass', freq: 1800, Q: 1.5 } },
    tom: { type: 'sine', freq: 180, freqDecay: 0.18, freqEnd: 80, attack: 0.001, decay: 0.28, gain: 0.75, noise: false },
    cowbell: { type: 'square', freq: 800, attack: 0.001, decay: 0.15, gain: 0.4, noise: false, filter: { type: 'bandpass', freq: 800, Q: 5 } },
    conga: { type: 'sine', freq: 300, freqDecay: 0.1, freqEnd: 150, attack: 0.001, decay: 0.2, gain: 0.6, noise: false },
  },
  // Roland TR-909 - Punchy, modern sound
  '909': {
    kick: { type: 'sine', freq: 180, freqDecay: 0.12, freqEnd: 45, attack: 0.001, decay: 0.35, gain: 1.0, noise: false },
    snare: { type: 'triangle', freq: 220, freqDecay: 0.04, freqEnd: 110, attack: 0.001, decay: 0.15, gain: 0.7, noise: true, noiseDecay: 0.2, noiseGain: 0.6, filter: { type: 'bandpass', freq: 3500, Q: 0.8 } },
    hihat: { type: 'square', freq: 9000, attack: 0.001, decay: 0.05, gain: 0.28, noise: true, noiseDecay: 0.06, noiseGain: 0.75, filter: { type: 'highpass', freq: 8000 } },
    openhat: { type: 'square', freq: 9000, attack: 0.001, decay: 0.4, gain: 0.28, noise: true, noiseDecay: 0.45, noiseGain: 0.7, filter: { type: 'highpass', freq: 7500 } },
    clap: { type: 'triangle', freq: 350, attack: 0.001, decay: 0.1, gain: 0.6, noise: true, noiseDecay: 0.12, noiseGain: 0.8, filter: { type: 'bandpass', freq: 2200, Q: 1.2 } },
    tom: { type: 'sine', freq: 200, freqDecay: 0.15, freqEnd: 90, attack: 0.001, decay: 0.25, gain: 0.75, noise: false },
    ride: { type: 'triangle', freq: 6000, attack: 0.001, decay: 0.6, gain: 0.3, noise: true, noiseDecay: 0.5, noiseGain: 0.4, filter: { type: 'highpass', freq: 5000 } },
    crash: { type: 'triangle', freq: 5000, attack: 0.001, decay: 1.2, gain: 0.35, noise: true, noiseDecay: 1.0, noiseGain: 0.6, filter: { type: 'highpass', freq: 4000 } },
  },
  // Roland TR-606 - Lighter, thinner sound
  '606': {
    kick: { type: 'sine', freq: 130, freqDecay: 0.08, freqEnd: 50, attack: 0.001, decay: 0.25, gain: 0.8, noise: false },
    snare: { type: 'triangle', freq: 250, freqDecay: 0.03, freqEnd: 150, attack: 0.001, decay: 0.12, gain: 0.55, noise: true, noiseDecay: 0.15, noiseGain: 0.5, filter: { type: 'bandpass', freq: 3500, Q: 1.2 } },
    hihat: { type: 'square', freq: 9500, attack: 0.001, decay: 0.04, gain: 0.22, noise: true, noiseDecay: 0.05, noiseGain: 0.65, filter: { type: 'highpass', freq: 8500 } },
    openhat: { type: 'square', freq: 9500, attack: 0.001, decay: 0.25, gain: 0.22, noise: true, noiseDecay: 0.3, noiseGain: 0.6, filter: { type: 'highpass', freq: 8000 } },
    tom: { type: 'sine', freq: 160, freqDecay: 0.1, freqEnd: 80, attack: 0.001, decay: 0.2, gain: 0.65, noise: false },
    cymbal: { type: 'triangle', freq: 7000, attack: 0.001, decay: 0.8, gain: 0.25, noise: true, noiseDecay: 0.7, noiseGain: 0.5, filter: { type: 'highpass', freq: 5500 } },
  },
  // Jazz kit - Brush and acoustic sounds
  jazz: {
    kick: { type: 'sine', freq: 90, freqDecay: 0.08, freqEnd: 45, attack: 0.01, decay: 0.35, gain: 0.7, noise: false },
    snare: { type: 'triangle', freq: 180, freqDecay: 0.02, freqEnd: 140, attack: 0.005, decay: 0.25, gain: 0.5, noise: true, noiseDecay: 0.3, noiseGain: 0.35, filter: { type: 'bandpass', freq: 2000, Q: 0.6 } },
    brush: { type: 'triangle', freq: 4000, attack: 0.02, decay: 0.15, gain: 0.25, noise: true, noiseDecay: 0.2, noiseGain: 0.4, filter: { type: 'highpass', freq: 3000 } },
    ride: { type: 'triangle', freq: 4500, attack: 0.001, decay: 0.8, gain: 0.35, noise: true, noiseDecay: 0.6, noiseGain: 0.3, filter: { type: 'highpass', freq: 4000 } },
    hihat: { type: 'triangle', freq: 7000, attack: 0.001, decay: 0.1, gain: 0.2, noise: true, noiseDecay: 0.12, noiseGain: 0.5, filter: { type: 'highpass', freq: 6000 } },
    tom: { type: 'sine', freq: 140, freqDecay: 0.15, freqEnd: 70, attack: 0.005, decay: 0.3, gain: 0.6, noise: false },
    crash: { type: 'triangle', freq: 4000, attack: 0.001, decay: 1.5, gain: 0.3, noise: true, noiseDecay: 1.2, noiseGain: 0.5, filter: { type: 'highpass', freq: 3500 } },
  },
};

// Fallback to 808 as default
const DRUM_SOUNDS = DRUM_KITS['808'];

// Default drum kit mapping by voice name
const VOICE_DRUM_MAP = {
  kick: 'kick',
  bd: 'kick',
  snare: 'snare',
  sd: 'snare',
  clap: 'clap',
  cp: 'clap',
  hihat: 'hihat',
  hh: 'hihat',
  'hi-hat': 'hihat',
  hat: 'hihat',
  openhat: 'openhat',
  oh: 'openhat',
  tom: 'tom',
  rim: 'snare',
  ride: 'ride',
  brush: 'brush',
  crash: 'crash',
  cowbell: 'cowbell',
  conga: 'conga',
  cymbal: 'cymbal',
};

// Synth presets for different instrument types
const SYNTH_PRESETS = {
  bass: {
    oscillators: [{ type: 'sawtooth', detune: 0 }, { type: 'square', detune: -7 }],
    filter: { type: 'lowpass', freq: 400, env: 0.3, Q: 2 },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.1 },
    gain: 0.6,
  },
  lead: {
    oscillators: [{ type: 'sawtooth', detune: 5 }, { type: 'sawtooth', detune: -5 }],
    filter: { type: 'lowpass', freq: 3000, env: 0.5, Q: 1 },
    envelope: { attack: 0.02, decay: 0.15, sustain: 0.7, release: 0.15 },
    gain: 0.5,
  },
  pad: {
    oscillators: [{ type: 'sine', detune: 0 }, { type: 'triangle', detune: 3 }],
    filter: { type: 'lowpass', freq: 2000, env: 0.2, Q: 0.5 },
    envelope: { attack: 0.3, decay: 0.4, sustain: 0.8, release: 0.5 },
    gain: 0.4,
  },
  arp: {
    oscillators: [{ type: 'square', detune: 0 }],
    filter: { type: 'lowpass', freq: 2500, env: 0.6, Q: 3 },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.4, release: 0.1 },
    gain: 0.45,
  },
  pluck: {
    oscillators: [{ type: 'triangle', detune: 0 }],
    filter: { type: 'lowpass', freq: 4000, env: 0.8, Q: 2 },
    envelope: { attack: 0.001, decay: 0.3, sustain: 0.1, release: 0.2 },
    gain: 0.5,
  },
  strings: {
    oscillators: [{ type: 'sawtooth', detune: 3 }, { type: 'sawtooth', detune: -3 }, { type: 'sawtooth', detune: 7 }],
    filter: { type: 'lowpass', freq: 3500, env: 0.2, Q: 0.5 },
    envelope: { attack: 0.15, decay: 0.3, sustain: 0.85, release: 0.4 },
    gain: 0.35,
  },
  brass: {
    oscillators: [{ type: 'sawtooth', detune: 0 }, { type: 'square', detune: -12 }],
    filter: { type: 'lowpass', freq: 2000, env: 0.7, Q: 1.5 },
    envelope: { attack: 0.08, decay: 0.2, sustain: 0.7, release: 0.15 },
    gain: 0.5,
  },
  piano: {
    oscillators: [{ type: 'triangle', detune: 0 }, { type: 'sine', detune: 0.5 }],
    filter: { type: 'lowpass', freq: 5000, env: 0.3, Q: 1 },
    envelope: { attack: 0.005, decay: 0.5, sustain: 0.3, release: 0.3 },
    gain: 0.5,
  },
  // Pure oscillators
  sine: {
    oscillators: [{ type: 'sine', detune: 0 }],
    filter: { type: 'lowpass', freq: 8000, env: 0.1, Q: 0.5 },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.15 },
    gain: 0.6,
  },
  sawtooth: {
    oscillators: [{ type: 'sawtooth', detune: 0 }],
    filter: { type: 'lowpass', freq: 4000, env: 0.3, Q: 1 },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.15 },
    gain: 0.5,
  },
  square: {
    oscillators: [{ type: 'square', detune: 0 }],
    filter: { type: 'lowpass', freq: 3000, env: 0.3, Q: 1 },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.15 },
    gain: 0.45,
  },
  triangle: {
    oscillators: [{ type: 'triangle', detune: 0 }],
    filter: { type: 'lowpass', freq: 6000, env: 0.2, Q: 0.5 },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.75, release: 0.15 },
    gain: 0.55,
  },
  // Noise types (will be handled specially in playNote)
  white: {
    oscillators: [{ type: 'noise', noiseType: 'white' }],
    filter: { type: 'lowpass', freq: 8000, env: 0.2, Q: 0.5 },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.2 },
    gain: 0.4,
    isNoise: true,
  },
  pink: {
    oscillators: [{ type: 'noise', noiseType: 'pink' }],
    filter: { type: 'lowpass', freq: 6000, env: 0.2, Q: 0.5 },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.2 },
    gain: 0.4,
    isNoise: true,
  },
  default: {
    oscillators: [{ type: 'sawtooth', detune: 0 }],
    filter: { type: 'lowpass', freq: 2000, env: 0.4, Q: 1 },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.6, release: 0.1 },
    gain: 0.5,
  },
};

// Voice name to synth preset mapping
const VOICE_SYNTH_MAP = {
  bass: 'bass',
  '808': 'bass',
  sub: 'bass',
  lead: 'lead',
  synth: 'lead',
  pad: 'pad',
  string: 'strings',
  brass: 'brass',
  arp: 'arp',
  pluck: 'pluck',
  piano: 'piano',
  keys: 'piano',
};

/**
 * Get synth preset from voice
 * @param {string} voiceName - Voice name for fallback
 * @param {string} presetName - Explicit preset name (from voice.synthPreset)
 */
function getSynthPreset(voiceName, presetName) {
  // If explicit preset name provided, use it directly
  if (presetName && SYNTH_PRESETS[presetName]) {
    return SYNTH_PRESETS[presetName];
  }
  // Fall back to name-based matching
  const name = voiceName.toLowerCase();
  for (const [key, value] of Object.entries(VOICE_SYNTH_MAP)) {
    if (name.includes(key)) {
      return SYNTH_PRESETS[value];
    }
  }
  return SYNTH_PRESETS.default;
}

/**
 * Get drum sound config
 * @param {string} voiceName - Voice name for drum type detection
 * @param {string} kitName - Drum kit name (808, 909, 606, jazz)
 */
function getDrumSound(voiceName, kitName) {
  const kit = DRUM_KITS[kitName] || DRUM_KITS['808'];
  const drumType = getDrumType(voiceName);
  return kit[drumType] || kit.kick;
}

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
const noiseBuffers = {};
function getNoiseBuffer(ctx, type = 'white') {
  if (!noiseBuffers[type]) {
    const bufferSize = ctx.sampleRate * 2;
    noiseBuffers[type] = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffers[type].getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    } else if (type === 'pink') {
      // Pink noise using Paul Kellet's algorithm
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else if (type === 'brown') {
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }
    }
  }
  return noiseBuffers[type];
}

/**
 * Play noise (white, pink, brown)
 */
function playNoise(ctx, destination, time, duration, velocity, preset) {
  const { envelope, filter: filterConfig, gain: presetGain, oscillators } = preset;
  const noiseType = oscillators[0]?.noiseType || 'white';

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx, noiseType);
  noise.loop = true;

  // Create gain for envelope
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, time);

  const peakGain = velocity * presetGain;
  const sustainLevel = peakGain * envelope.sustain;
  const attackEnd = time + envelope.attack;
  const decayEnd = attackEnd + envelope.decay;
  const releaseStart = Math.max(time + duration - envelope.release, decayEnd + 0.01);
  const releaseEnd = releaseStart + envelope.release;

  gainNode.gain.linearRampToValueAtTime(peakGain, attackEnd);
  gainNode.gain.linearRampToValueAtTime(sustainLevel, decayEnd);
  gainNode.gain.setValueAtTime(sustainLevel, releaseStart);
  gainNode.gain.exponentialRampToValueAtTime(0.001, releaseEnd);

  // Create filter
  const filter = ctx.createBiquadFilter();
  filter.type = filterConfig.type;
  filter.frequency.value = filterConfig.freq;
  filter.Q.value = filterConfig.Q || 0.5;

  noise.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(destination);

  noise.start(time);
  noise.stop(releaseEnd + 0.1);
}

/**
 * Play a drum sound
 * @param {string} voiceId - Voice ID for routing
 * @param {string} voiceName - Voice name for drum type detection
 * @param {number} time - Scheduled time
 * @param {number} velocity - Velocity 0-1
 * @param {string} drumKit - Drum kit name (808, 909, 606, jazz)
 */
export function playDrum(voiceId, voiceName, time, velocity = 1, drumKit = '808') {
  const ctx = audioContext.context;
  const destination = mixer.getVoiceInput(voiceId);
  if (!destination) return;

  const config = getDrumSound(voiceName, drumKit);

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
 * Play a note with configurable synth
 * @param {string} voiceId - Voice ID for routing
 * @param {number} midiNote - MIDI note number
 * @param {number} time - Scheduled time
 * @param {number} duration - Note duration in seconds
 * @param {number} velocity - Note velocity 0-1
 * @param {string} voiceName - Voice name for preset selection
 * @param {string} synthPreset - Explicit synth preset name
 */
export function playNote(voiceId, midiNote, time, duration = 0.1, velocity = 1, voiceName = '', synthPreset = '') {
  const ctx = audioContext.context;
  const destination = mixer.getVoiceInput(voiceId);
  if (!destination) return;

  const now = time ?? ctx.currentTime;
  const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
  const preset = getSynthPreset(voiceName, synthPreset);
  const { envelope, filter: filterConfig, gain: presetGain, oscillators, isNoise } = preset;

  // Handle noise presets specially
  if (isNoise) {
    playNoise(ctx, destination, now, duration, velocity, preset);
    return;
  }

  // Create master gain for this note
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, now);

  // ADSR envelope
  const peakGain = velocity * presetGain;
  const sustainLevel = peakGain * envelope.sustain;
  const attackEnd = now + envelope.attack;
  const decayEnd = attackEnd + envelope.decay;
  const releaseStart = Math.max(now + duration - envelope.release, decayEnd + 0.01);
  const releaseEnd = releaseStart + envelope.release;

  masterGain.gain.linearRampToValueAtTime(peakGain, attackEnd);
  masterGain.gain.linearRampToValueAtTime(sustainLevel, decayEnd);
  masterGain.gain.setValueAtTime(sustainLevel, releaseStart);
  masterGain.gain.exponentialRampToValueAtTime(0.001, releaseEnd);

  // Create filter
  const filter = ctx.createBiquadFilter();
  filter.type = filterConfig.type;
  filter.Q.value = filterConfig.Q || 1;

  // Filter envelope: start high, decay to base frequency
  const filterPeak = filterConfig.freq * (1 + filterConfig.env);
  const filterBase = filterConfig.freq * (1 - filterConfig.env * 0.5);
  filter.frequency.setValueAtTime(filterPeak, now);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(filterBase, 100),
    now + envelope.attack + envelope.decay
  );

  // Create oscillators with detuning
  oscillators.forEach((oscConfig, index) => {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = oscConfig.type;
    osc.frequency.setValueAtTime(freq, now);
    osc.detune.setValueAtTime(oscConfig.detune, now);

    // Divide gain by number of oscillators to prevent clipping
    oscGain.gain.value = 1 / oscillators.length;

    osc.connect(oscGain);
    oscGain.connect(filter);

    osc.start(now);
    osc.stop(releaseEnd + 0.1);
  });

  filter.connect(masterGain);
  masterGain.connect(destination);
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
      // Use sourceType to determine drum vs synth, NOT melodicNotes
      const isDrum = voice.sourceType === 'drum' || voice.type === 'drum';

      if (isDrum) {
        // Percussion voice - use drumKit from voice if available
        playDrum(voiceId, voice.name, time, voice.volume || 1, voice.drumKit || '808');
      } else {
        // Melodic voice
        const melodicNotes = voice.content?.melodicNotes;
        let midiNote;

        if (melodicNotes && melodicNotes.length > 0) {
          // Cycle through melodic notes
          const noteIndex = step % melodicNotes.length;
          midiNote = melodicNotes[noteIndex];
        } else {
          // No melodic notes - use a default note based on voice type
          // Bass = C2, Lead/Arp = C4, Pad = C3, default = C3
          const voiceName = (voice.name || '').toLowerCase();
          if (voiceName.includes('bass') || voiceName.includes('sub')) {
            midiNote = 36; // C2
          } else if (voiceName.includes('lead') || voiceName.includes('arp')) {
            midiNote = 60; // C4
          } else {
            midiNote = 48; // C3
          }
        }

        // Pass voice name and synthPreset for preset selection, use longer duration for pads
        const isPad = voice.name?.toLowerCase().includes('pad') || voice.synthPreset === 'pad';
        const duration = isPad ? 0.8 : 0.2;
        playNote(voiceId, midiNote, time, duration, voice.volume || 1, voice.name || '', voice.synthPreset || '');
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
