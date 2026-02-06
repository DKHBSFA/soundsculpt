/**
 * SoundSculpt - Music Generation Module
 * Phase 6: Generation (AI/Preset) functionality
 *
 * Creates voices with patterns based on selected style and parameters.
 * Uses music-theory.js for procedural melodic generation.
 */

import { state } from './state.js';
import { eventBus, Events } from './event-bus.js';
import {
  getScalePitchClasses,
  noteNameToPitchClass,
  pitchClassToNoteName,
  getChordMidi,
  getDiatonicChords,
  generateArpSequence,
  SCALES,
  CHORDS,
} from './music-theory.js';

// === Pattern Parsing ===

/**
 * Parse a .struct('...') pattern and convert to steps array
 * @param {string} patternCode - The full pattern code
 * @param {number} totalSteps - Target number of steps (default 16)
 * @returns {boolean[]} Array of step states
 */
function parsePatternToSteps(patternCode, totalSteps = 16) {
  // Try to extract .struct('...') pattern
  const structMatch = patternCode.match(/\.struct\s*\(\s*['"]([^'"]+)['"]\s*\)/);

  if (structMatch) {
    const structPattern = structMatch[1];
    // Parse the pattern: 't' = trigger, '~' = rest, space separates
    const tokens = structPattern.split(/\s+/).filter(t => t);
    const patternLength = tokens.length;

    // Create steps array by repeating/scaling the pattern to fit totalSteps
    const steps = new Array(totalSteps).fill(false);
    for (let i = 0; i < totalSteps; i++) {
      const tokenIndex = Math.floor((i / totalSteps) * patternLength);
      steps[i] = tokens[tokenIndex] === 't';
    }
    return steps;
  }

  // Try to extract Euclidean rhythm: (n,m) means n hits in m slots
  const euclidMatch = patternCode.match(/\((\d+)\s*,\s*(\d+)\)/);
  if (euclidMatch) {
    const hits = parseInt(euclidMatch[1], 10);
    const slots = parseInt(euclidMatch[2], 10);
    return generateEuclideanRhythm(hits, slots, totalSteps);
  }

  // For note patterns without rhythm info, create a simple pattern
  if (patternCode.includes('note(') || patternCode.includes("note('<")) {
    // Default: play on beats 1, 3, 5, 7 etc (every other step in first half)
    const steps = new Array(totalSteps).fill(false);
    for (let i = 0; i < totalSteps; i += 4) {
      steps[i] = true;
    }
    return steps;
  }

  // Default: quarter notes (every 4 steps)
  const steps = new Array(totalSteps).fill(false);
  for (let i = 0; i < totalSteps; i += 4) {
    steps[i] = true;
  }
  return steps;
}

/**
 * Parse notes from a pattern like note('<a3 c4 e4 a4>...')
 * @param {string} patternCode - The pattern code
 * @returns {number[]} Array of MIDI note numbers
 */
function parseNotesFromPattern(patternCode) {
  // Match note('<...>') or note("...")
  const noteMatch = patternCode.match(/note\s*\(\s*['"]<?\s*([^'"<>]+)\s*>?['"]/);
  if (!noteMatch) return [];

  const noteStr = noteMatch[1];
  // Split by space, filter out rests (~)
  const noteNames = noteStr.split(/\s+/).filter(n => n && n !== '~');

  return noteNames.map(noteToMidi).filter(n => n !== null);
}

/**
 * Convert note name to MIDI number
 * @param {string} noteName - e.g., 'c4', 'a#3', 'bb5'
 * @returns {number|null}
 */
function noteToMidi(noteName) {
  const noteMap = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const match = noteName.toLowerCase().match(/^([a-g])([#b]?)(\d)?$/);

  if (!match) return null;

  let semitone = noteMap[match[1]];
  if (semitone === undefined) return null;

  if (match[2] === '#') semitone++;
  if (match[2] === 'b') semitone--;

  const octave = match[3] ? parseInt(match[3], 10) : 4;
  return semitone + (octave + 1) * 12;
}

/**
 * Check if pattern is melodic (has note()) vs percussive (has s())
 * @param {string} patternCode
 * @returns {boolean}
 */
function isMelodicPattern(patternCode) {
  return patternCode.includes('note(') || patternCode.includes('chord(');
}

/**
 * Generate note objects for Piano Roll and Score from steps and melodic notes
 * @param {boolean[]} steps - Step triggers
 * @param {number[]} melodicNotes - MIDI notes to cycle through
 * @returns {object[]} Array of note objects
 */
function generateNoteObjects(steps, melodicNotes) {
  if (!melodicNotes || melodicNotes.length === 0) return [];

  const notes = [];
  let noteIndex = 0;

  for (let i = 0; i < steps.length; i++) {
    if (steps[i]) {
      const pitch = melodicNotes[noteIndex % melodicNotes.length];
      notes.push({
        id: `gen-${Date.now()}-${i}`,
        pitch: pitch,
        startBeat: i, // step index = beat position
        durationBeats: 1,
        velocity: 100,
      });
      noteIndex++;
    }
  }

  return notes;
}

/**
 * Generate Euclidean rhythm pattern
 * @param {number} hits - Number of hits
 * @param {number} slots - Number of slots
 * @param {number} totalSteps - Target step count
 * @returns {boolean[]}
 */
function generateEuclideanRhythm(hits, slots, totalSteps) {
  // Generate base Euclidean rhythm
  const pattern = [];
  let bucket = 0;
  for (let i = 0; i < slots; i++) {
    bucket += hits;
    if (bucket >= slots) {
      bucket -= slots;
      pattern.push(true);
    } else {
      pattern.push(false);
    }
  }

  // Scale to totalSteps
  const steps = new Array(totalSteps).fill(false);
  for (let i = 0; i < totalSteps; i++) {
    const srcIndex = Math.floor((i / totalSteps) * slots);
    steps[i] = pattern[srcIndex];
  }
  return steps;
}

// ============================================
// PROCEDURAL MELODY GENERATION
// ============================================

/**
 * Parse key string like "A minor" to root and scale type
 * @param {string} keyStr - e.g., "A minor", "C major", "F# minor"
 * @returns {{ root: string, scaleType: string }}
 */
function parseKeyString(keyStr) {
  const match = keyStr.match(/^([A-G][#b]?)\s*(major|minor)?$/i);
  if (!match) return { root: 'C', scaleType: 'major' };
  return {
    root: match[1].charAt(0).toUpperCase() + match[1].slice(1),
    scaleType: match[2]?.toLowerCase() || 'major',
  };
}

/**
 * Generate a melodic line procedurally based on scale and rhythm
 * @param {string} root - Scale root note
 * @param {string} scaleType - Scale type
 * @param {number} baseOctave - Base MIDI octave (e.g., 4 for middle range)
 * @param {boolean[]} rhythmPattern - When to trigger notes
 * @param {string} melodicStyle - 'arp', 'stepwise', 'chord', 'bass'
 * @param {object} options - Additional options
 * @returns {{ notes: object[], midiNotes: number[] }}
 */
function generateMelody(root, scaleType, baseOctave, rhythmPattern, melodicStyle, options = {}) {
  const scalePcs = getScalePitchClasses(root, scaleType);
  const rootPc = noteNameToPitchClass(root);
  const baseNote = (baseOctave + 1) * 12 + rootPc; // MIDI note at base octave

  // Convert scale to MIDI notes in the target range
  const scaleNotes = scalePcs.map(pc => {
    let midi = (baseOctave + 1) * 12 + pc;
    // Ensure notes are above the root
    if (pc < rootPc) midi += 12;
    return midi;
  });

  const notes = [];
  const midiNotes = [];
  let prevPitch = baseNote;
  let direction = 1;

  // Get chord tones for harmonic awareness
  const chordPcs = [scalePcs[0], scalePcs[2], scalePcs[4]]; // 1, 3, 5 of scale

  for (let i = 0; i < rhythmPattern.length; i++) {
    if (!rhythmPattern[i]) continue;

    let pitch;
    const beatInBar = i % 4;

    switch (melodicStyle) {
      case 'arp':
        // Arpeggiate through chord tones
        const arpIndex = notes.length % chordPcs.length;
        const arpOctaveOffset = Math.floor(notes.length / chordPcs.length) % (options.octaves || 2);
        pitch = (baseOctave + 1 + arpOctaveOffset) * 12 + chordPcs[arpIndex];
        break;

      case 'stepwise':
        // Move by scale steps, mostly conjunct motion
        if (notes.length === 0) {
          pitch = baseNote;
        } else {
          const currentIndex = scaleNotes.indexOf(prevPitch);
          if (currentIndex !== -1) {
            // Decide direction: tend to reverse at extremes
            if (prevPitch >= baseNote + 12) direction = -1;
            if (prevPitch <= baseNote - 5) direction = 1;
            // Occasionally change direction
            if (Math.random() < 0.3) direction *= -1;

            const newIndex = Math.max(0, Math.min(scaleNotes.length - 1, currentIndex + direction));
            pitch = scaleNotes[newIndex];
            // Allow octave jumps occasionally
            if (Math.random() < 0.2) {
              pitch += direction * 12;
            }
          } else {
            // Snap to nearest scale note
            pitch = scaleNotes.reduce((a, b) =>
              Math.abs(b - prevPitch) < Math.abs(a - prevPitch) ? b : a
            );
          }
        }
        // On strong beats, prefer chord tones
        if (beatInBar === 0 && Math.random() < 0.7) {
          const chordNote = (baseOctave + 1) * 12 + chordPcs[Math.floor(Math.random() * chordPcs.length)];
          if (Math.abs(chordNote - pitch) <= 4) pitch = chordNote;
        }
        break;

      case 'bass':
        // Root-fifth patterns with occasional chromatic approach
        if (beatInBar === 0) {
          pitch = baseNote; // Root on beat 1
        } else if (beatInBar === 2) {
          pitch = baseNote + 7; // Fifth
        } else {
          // Passing tones
          const passingOptions = [baseNote, baseNote + 7, baseNote + 5, baseNote + 3];
          pitch = passingOptions[Math.floor(Math.random() * passingOptions.length)];
        }
        // Keep bass in low range
        while (pitch > baseNote + 12) pitch -= 12;
        while (pitch < baseNote - 12) pitch += 12;
        break;

      case 'chord':
        // Play full chord on each trigger (for pad-style)
        const chordMidi = chordPcs.map(pc => (baseOctave + 1) * 12 + pc);
        pitch = chordMidi[notes.length % chordMidi.length];
        break;

      default:
        pitch = scaleNotes[notes.length % scaleNotes.length];
    }

    // Clamp to reasonable range
    pitch = Math.max(36, Math.min(96, pitch));

    // Determine duration based on next note
    let duration = 1;
    for (let j = i + 1; j < Math.min(i + 4, rhythmPattern.length); j++) {
      if (rhythmPattern[j]) break;
      duration++;
    }
    if (options.shortNotes) duration = Math.min(duration, 0.5);

    notes.push({
      id: `gen-${Date.now()}-${i}`,
      pitch,
      startBeat: i,
      durationBeats: Math.min(duration, 4),
      velocity: 80 + Math.floor(Math.random() * 40), // 80-120
    });

    midiNotes.push(pitch);
    prevPitch = pitch;
  }

  return { notes, midiNotes };
}

/**
 * Generate a chord progression
 * @param {string} root - Scale root
 * @param {string} scaleType - Scale type
 * @param {number} bars - Number of bars
 * @param {string} progressionStyle - 'pop', 'jazz', 'minimal'
 * @returns {string[]} Array of chord symbols
 */
function generateChordProgression(root, scaleType, bars, progressionStyle) {
  const diatonic = getDiatonicChords(root, scaleType);

  // Common progressions by style
  const progressions = {
    pop: [
      [1, 5, 6, 4],    // I-V-vi-IV
      [1, 4, 5, 4],    // I-IV-V-IV
      [6, 4, 1, 5],    // vi-IV-I-V
      [1, 6, 4, 5],    // I-vi-IV-V
    ],
    jazz: [
      [2, 5, 1, 1],    // ii-V-I
      [1, 6, 2, 5],    // I-vi-ii-V
      [3, 6, 2, 5],    // iii-vi-ii-V
      [1, 4, 3, 6],    // I-IV-iii-vi
    ],
    minimal: [
      [1, 1, 4, 4],    // I-I-IV-IV
      [1, 4, 1, 4],    // I-IV-I-IV
      [6, 6, 4, 4],    // vi-vi-IV-IV
      [1, 5, 1, 5],    // I-V-I-V
    ],
  };

  const styleProgressions = progressions[progressionStyle] || progressions.pop;
  const selectedProgression = styleProgressions[Math.floor(Math.random() * styleProgressions.length)];

  // Expand to fill bars
  const chords = [];
  for (let bar = 0; bar < bars; bar++) {
    const degree = selectedProgression[bar % selectedProgression.length];
    const chord = diatonic[degree - 1];
    if (chord) {
      chords.push(chord.symbol);
    } else {
      chords.push(root);
    }
  }

  return chords;
}

/**
 * Generate procedural voice data based on voice type and style
 * @param {object} voiceConfig - Voice configuration from style
 * @param {string} key - Key string (e.g., "A minor")
 * @param {number} energy - Energy level 0-100
 * @returns {object} Generated voice data with steps and notes
 */
function generateProceduralVoice(voiceConfig, key, energy) {
  const { root, scaleType } = parseKeyString(key);
  const name = voiceConfig.name.toLowerCase();

  // Determine voice characteristics
  let melodicStyle = 'stepwise';
  let baseOctave = 4;
  let rhythmDensity = 4; // hits per 8 steps

  if (name.includes('bass') || name.includes('808') || name.includes('sub')) {
    melodicStyle = 'bass';
    baseOctave = 2;
    rhythmDensity = Math.floor(2 + (energy / 50));
  } else if (name.includes('arp') || name.includes('lead') || name.includes('synth')) {
    melodicStyle = 'arp';
    baseOctave = 4;
    rhythmDensity = Math.floor(4 + (energy / 25));
  } else if (name.includes('pad') || name.includes('string') || name.includes('chord')) {
    melodicStyle = 'chord';
    baseOctave = 3;
    rhythmDensity = Math.floor(2 + (energy / 100));
  } else if (name.includes('piano')) {
    melodicStyle = Math.random() > 0.5 ? 'arp' : 'stepwise';
    baseOctave = 3;
    rhythmDensity = Math.floor(3 + (energy / 30));
  }

  // Generate rhythm pattern
  const totalSteps = 16;
  rhythmDensity = Math.max(2, Math.min(12, rhythmDensity));
  const steps = generateEuclideanRhythm(rhythmDensity, totalSteps, totalSteps);

  // Adjust for energy - at low energy, thin out the pattern
  if (energy < 40) {
    for (let i = 0; i < steps.length; i++) {
      if (steps[i] && Math.random() > energy / 40) {
        steps[i] = false;
      }
    }
  }

  // Generate melodic content
  const { notes, midiNotes } = generateMelody(
    root,
    scaleType,
    baseOctave,
    steps,
    melodicStyle,
    { octaves: melodicStyle === 'arp' ? 2 : 1, shortNotes: energy > 70 }
  );

  return {
    steps,
    notes,
    melodicNotes: midiNotes,
  };
}

// === Style Definitions (20 styles from audiosculpt presets) ===
export const STYLES = [
  // Loop family (electronic, beat-driven)
  { id: 'electronic', name: 'Electronic', family: 'loop', icon: '🎛️', description: 'Energetic synth-driven production' },
  { id: 'trap', name: 'Trap', family: 'loop', icon: '🔊', description: 'Hard-hitting 808s and hi-hats' },
  { id: 'dnb', name: 'Drum & Bass', family: 'loop', icon: '⚡', description: 'Fast breaks and deep bass' },
  { id: 'minimal-techno', name: 'Minimal Techno', family: 'loop', icon: '🔲', description: 'Hypnotic loops, sparse elements' },
  { id: 'synthwave', name: 'Synthwave', family: 'loop', icon: '🌆', description: 'Retro 80s synths and arpeggios' },

  // Experimental family
  { id: 'glitch', name: 'Glitch', family: 'experimental', icon: '💥', description: 'Choppy, glitchy electronics' },
  { id: 'industrial', name: 'Industrial', family: 'experimental', icon: '🏭', description: 'Dark, mechanical textures' },
  { id: 'dramatic', name: 'Dramatic', family: 'experimental', icon: '🎭', description: 'Intense, cinematic tension' },
  { id: 'horror', name: 'Horror', family: 'experimental', icon: '👻', description: 'Dark, unsettling soundscapes' },

  // Tonal family (harmonic, melodic)
  { id: 'jazz', name: 'Jazz', family: 'tonal', icon: '🎷', description: 'Sophisticated chords and improvisation' },
  { id: 'orchestral', name: 'Orchestral', family: 'tonal', icon: '🎻', description: 'Cinematic strings and brass' },
  { id: 'neo-classical', name: 'Neo-Classical', family: 'tonal', icon: '🎹', description: 'Modern classical piano and strings' },
  { id: 'acoustic', name: 'Acoustic', family: 'tonal', icon: '🎸', description: 'Warm guitar and natural instruments' },
  { id: 'cinematic', name: 'Cinematic', family: 'tonal', icon: '🎬', description: 'Epic film score textures' },
  { id: 'corporate', name: 'Corporate', family: 'tonal', icon: '💼', description: 'Clean, professional background' },
  { id: 'upbeat', name: 'Upbeat', family: 'tonal', icon: '☀️', description: 'Positive, energetic pop feel' },
  { id: 'world', name: 'World', family: 'tonal', icon: '🌍', description: 'Ethnic instruments and rhythms' },

  // Modal family (atmospheric, ambient)
  { id: 'ambient', name: 'Ambient', family: 'modal', icon: '🌊', description: 'Atmospheric, floating textures' },
  { id: 'chillwave', name: 'Chillwave', family: 'modal', icon: '🌅', description: 'Dreamy, nostalgic synths' },
  { id: 'lo-fi', name: 'Lo-Fi', family: 'modal', icon: '📻', description: 'Warm, dusty hip-hop beats' },
];

// === Template Definitions (6 templates) ===
export const TEMPLATES = [
  { id: 'tech_promo', name: 'Tech Promo', description: 'SaaS, apps, AI demos', baseStyle: 'electronic' },
  { id: 'epic_trailer', name: 'Epic Trailer', description: 'Cinematic, dramatic', baseStyle: 'cinematic' },
  { id: 'chill_lifestyle', name: 'Chill Lifestyle', description: 'Relaxed, aspirational', baseStyle: 'chillwave' },
  { id: 'corporate_safe', name: 'Corporate Safe', description: 'Professional, neutral', baseStyle: 'corporate' },
  { id: 'hype_social', name: 'Hype Social', description: 'TikTok, Reels, energy', baseStyle: 'trap' },
  { id: 'luxury_minimal', name: 'Luxury Minimal', description: 'High-end, sophisticated', baseStyle: 'minimal-techno' },
];

// === NEW: Phase-based Preset System ===
// Each style has distinct patterns for intro/build/climax/resolve phases
// with genre-specific rhythms, swing, and orchestration

/**
 * Genre-specific rhythm patterns (16 steps)
 * true = hit, false = rest
 * Patterns capture the essential feel of each genre
 */
const RHYTHM_PATTERNS = {
  // Four-on-floor kick
  fourOnFloor: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
  // Backbeat snare (2 and 4)
  backbeat: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
  // Trap hi-hat (triplet feel with rolls)
  trapHihat: [true, false, true, true, false, true, true, false, true, false, true, true, false, true, true, false],
  // Trap 808 (syncopated)
  trap808: [true, false, false, true, false, true, false, false, true, false, false, false, true, false, false, true],
  // DnB two-step
  dnbKick: [true, false, false, false, false, false, true, false, false, false, false, false, false, false, true, false],
  dnbSnare: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
  // Jazz ride (swing pattern)
  jazzRide: [true, false, true, true, false, true, true, false, true, false, true, true, false, true, true, false],
  // Lo-fi boom bap
  lofiKick: [true, false, false, false, false, false, true, false, false, true, false, false, false, false, false, true],
  // Sparse intro
  sparse: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
  // Offbeat hi-hat
  offbeat: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
  // Straight 8ths
  straight8: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
  // Straight 16ths
  straight16: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
  // Half notes
  halfNotes: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
  // Quarter notes
  quarterNotes: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
};

// ============================================
// PATTERN VARIATIONS - Fills and phrase variations
// ============================================

/**
 * Pattern variations per style for musical interest
 * base: standard pattern, fill: end of phrase, sparse: after fill for contrast
 */
const PATTERN_VARIATIONS = {
  trap: {
    'HiHat': {
      base: [true, false, true, true, false, true, true, false, true, false, true, true, false, true, true, false],
      fill: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true], // Roll
      sparse: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    },
    '808': {
      base: [true, false, false, true, false, true, false, false, true, false, false, false, true, false, false, true],
      fill: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, true], // Slide effect
      sparse: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    },
  },
  'lo-fi': {
    'HiHat': {
      base: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      fill: [true, false, true, false, true, false, true, false, true, false, true, false, true, true, true, true],
      sparse: [false, false, true, false, false, false, false, false, false, false, true, false, false, false, false, false],
    },
    'Kick': {
      base: [true, false, false, false, false, false, true, false, false, true, false, false, false, false, false, true],
      fill: [true, false, false, true, false, false, true, false, true, false, false, true, false, true, true, false],
      sparse: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
    },
  },
  jazz: {
    'Ride': {
      base: [true, false, true, true, false, true, true, false, true, false, true, true, false, true, true, false],
      fill: [true, true, true, true, false, true, true, true, true, true, false, true, true, false, true, true], // Busy cymbal
      sparse: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    },
  },
  electronic: {
    'HiHat': {
      base: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
      fill: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      sparse: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
    },
  },
  dnb: {
    'Snare': {
      base: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
      fill: [false, false, true, false, true, false, true, false, false, true, true, false, true, true, true, true], // Break fill
      sparse: [false, false, false, false, false, false, true, false, false, false, false, false, false, false, true, false],
    },
    'HiHat': {
      base: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
      fill: [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      sparse: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    },
  },
  ambient: {
    'Pad': {
      base: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
      fill: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
      sparse: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    },
  },
};

// ============================================
// VOICE LEADING RULES
// ============================================

/**
 * Voice leading rules for smooth melodic motion
 */
const VOICE_LEADING_RULES = {
  bass: {
    maxInterval: 7, // Perfect fifth
    preferRoot: true,
    allowChromaticApproach: true,
  },
  lead: {
    maxInterval: 5, // Perfect fourth (allow some leaps)
    preferStepwise: true,
    targetChordTones: 0.7,
  },
  arp: {
    maxInterval: 12, // Octave - arps can jump
    preferStepwise: false,
    targetChordTones: 1.0,
  },
  pad: {
    maxInterval: 4, // Major third
    voiceIndependence: true,
    smoothConnection: true,
  },
  chord: {
    maxInterval: 4,
    smoothConnection: true,
  },
};

/**
 * Select pattern variation based on position in phrase
 * @param {string} voiceName - Voice name
 * @param {string} style - Style ID
 * @param {number} barInPhrase - Current bar in 4-bar phrase (0-3)
 * @param {number} phase - Current phase
 * @returns {boolean[]|null} Pattern variation or null
 */
function selectPatternVariation(voiceName, style, barInPhrase, phase) {
  const styleVariations = PATTERN_VARIATIONS[style];
  if (!styleVariations) return null;

  const voiceVariations = styleVariations[voiceName];
  if (!voiceVariations) return null;

  // Last bar of phrase = fill (only in build/climax)
  if (barInPhrase === 3 && (phase === 'build' || phase === 'climax')) {
    return voiceVariations.fill || voiceVariations.base;
  }

  // First bar after fill = sparse for contrast
  if (barInPhrase === 0 && phase !== 'intro') {
    // 30% chance of sparse variation for musical breathing
    if (Math.random() < 0.3) {
      return voiceVariations.sparse || voiceVariations.base;
    }
  }

  return voiceVariations.base;
}

/**
 * Apply voice leading to smooth out melodic lines
 * @param {object[]} notes - Array of note objects
 * @param {string} voiceType - Voice type (bass, lead, arp, pad)
 * @returns {object[]} Smoothed notes
 */
function applyVoiceLeading(notes, voiceType) {
  const rules = VOICE_LEADING_RULES[voiceType];
  if (!rules || notes.length === 0) return notes;

  const smoothedNotes = [];
  let prevPitch = null;

  for (const note of notes) {
    let pitch = note.pitch;

    if (prevPitch !== null && rules.maxInterval) {
      const interval = Math.abs(pitch - prevPitch);

      // If interval too large, find closest octave
      if (interval > rules.maxInterval) {
        // Try octave adjustments
        const options = [pitch, pitch + 12, pitch - 12, pitch + 24, pitch - 24];
        let bestPitch = pitch;
        let bestInterval = interval;

        for (const opt of options) {
          if (opt >= 24 && opt <= 108) { // Valid MIDI range
            const optInterval = Math.abs(opt - prevPitch);
            if (optInterval < bestInterval) {
              bestInterval = optInterval;
              bestPitch = opt;
            }
          }
        }
        pitch = bestPitch;
      }
    }

    smoothedNotes.push({ ...note, pitch });
    prevPitch = pitch;
  }

  return smoothedNotes;
}

// ============================================
// STRUDEL PATTERN GENERATION
// ============================================

/**
 * Convert MIDI note number to note name for Strudel
 * @param {number} midi - MIDI note number
 * @returns {string} Note name (e.g., 'c4', 'f#3')
 */
function midiToStrudelNote(midi) {
  const noteNames = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${noteNames[noteIndex]}${octave}`;
}

/**
 * Convert boolean steps array to Strudel struct string
 * @param {boolean[]} steps - Step pattern
 * @returns {string} Struct pattern (e.g., 't ~ t ~ t ~ t ~')
 */
function stepsToStruct(steps) {
  return steps.map(s => s ? 't' : '~').join(' ');
}

/**
 * Generate Strudel pattern code for a voice
 * @param {object} voiceConfig - Voice configuration
 * @param {object} preset - Style preset
 * @param {string} phase - Phase to generate for (default: climax)
 * @returns {string} Strudel pattern code
 */
function generateStrudelPattern(voiceConfig, preset, phase = 'climax') {
  const { type, name, baseOctave = 3, sound } = voiceConfig;
  const phaseConfig = preset.phases[phase];
  const pattern = phaseConfig?.patterns?.[name];
  const velocity = phaseConfig?.velocity || 0.7;

  // Get chord notes for melodic voices
  const chordNotes = [];
  if (preset.chordMidi) {
    const firstChord = Object.values(preset.chordMidi)[0];
    if (firstChord) {
      chordNotes.push(...firstChord.map(m => midiToStrudelNote(m + (baseOctave - 2) * 12)));
    }
  }

  if (type === 'drum') {
    return generateDrumStrudel(sound, pattern, velocity);
  } else if (type === 'bass') {
    return generateBassStrudel(preset, pattern, baseOctave, velocity);
  } else if (type === 'arp') {
    return generateArpStrudel(chordNotes, pattern, velocity);
  } else if (type === 'pad' || type === 'chord') {
    return generatePadStrudel(chordNotes, velocity);
  } else if (type === 'lead') {
    return generateLeadStrudel(chordNotes, pattern, velocity);
  }
  return '';
}

/**
 * Generate Strudel pattern for drum voice
 */
function generateDrumStrudel(sound, pattern, velocity) {
  const soundMap = {
    kick: 'bd',
    snare: 'sd',
    hihat: 'hh',
    openhat: 'oh',
  };
  const sampleName = soundMap[sound] || 'bd';

  if (pattern) {
    const struct = stepsToStruct(pattern);
    return `s('${sampleName}').struct('${struct}').gain(${velocity.toFixed(2)})`;
  }

  // Default patterns based on sound
  const defaultStructs = {
    bd: 't ~ ~ ~ t ~ ~ ~ t ~ ~ ~ t ~ ~ ~',
    sd: '~ ~ ~ ~ t ~ ~ ~ ~ ~ ~ ~ t ~ ~ ~',
    hh: '~ ~ t ~ ~ ~ t ~ ~ ~ t ~ ~ ~ t ~',
    oh: '~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ t ~',
  };
  const struct = defaultStructs[sampleName] || 't ~ ~ ~ t ~ ~ ~ t ~ ~ ~ t ~ ~ ~';
  return `s('${sampleName}').struct('${struct}').gain(${velocity.toFixed(2)})`;
}

/**
 * Generate Strudel pattern for bass voice
 */
function generateBassStrudel(preset, pattern, baseOctave, velocity) {
  // Get root notes from chord progression
  const roots = [];
  if (preset.chordMidi) {
    for (const chord of Object.values(preset.chordMidi)) {
      if (chord && chord[0]) {
        roots.push(midiToStrudelNote(chord[0]));
      }
    }
  }

  const noteStr = roots.length > 0 ? roots.join(' ') : `c${baseOctave}`;

  if (pattern) {
    const struct = stepsToStruct(pattern);
    return `note('<${noteStr}>').s('sawtooth').struct('${struct}').lpf(200).gain(${velocity.toFixed(2)})`;
  }

  return `note('<${noteStr}>').s('sawtooth').struct('t ~ ~ t ~ t ~ ~ t ~ ~ ~ t ~ ~ t').lpf(200).gain(${velocity.toFixed(2)})`;
}

/**
 * Generate Strudel pattern for arp voice
 */
function generateArpStrudel(chordNotes, pattern, velocity) {
  const noteStr = chordNotes.length > 0 ? chordNotes.join(' ') : 'c4 e4 g4';

  if (pattern) {
    const struct = stepsToStruct(pattern);
    return `note('<${noteStr}>').s('triangle').struct('${struct}').gain(${velocity.toFixed(2)})`;
  }

  return `note('<${noteStr}>').s('triangle').struct('t ~ t ~ t ~ t t t ~ t ~ t t t ~').gain(${velocity.toFixed(2)})`;
}

/**
 * Generate Strudel pattern for pad/chord voice
 */
function generatePadStrudel(chordNotes, velocity) {
  const noteStr = chordNotes.length > 0 ? chordNotes.join(' ') : 'c3 e3 g3';

  return `note('<${noteStr}>').s('sine').lpf(800).room(0.3).gain(${velocity.toFixed(2)})`;
}

/**
 * Generate Strudel pattern for lead voice
 */
function generateLeadStrudel(chordNotes, pattern, velocity) {
  const noteStr = chordNotes.length > 0 ? chordNotes.join(' ') : 'e4 g4 a4 c5';

  if (pattern) {
    const struct = stepsToStruct(pattern);
    return `note('<${noteStr}>').s('square').struct('${struct}').lpf(2000).gain(${velocity.toFixed(2)})`;
  }

  return `note('<${noteStr}>').s('square').struct('t ~ t ~ t ~ t t').lpf(2000).gain(${velocity.toFixed(2)})`;
}

/**
 * Swing amount per genre (0 = straight, 0.67 = full triplet swing)
 */
const SWING_BY_STYLE = {
  'jazz': 0.65,
  'lo-fi': 0.58,
  'chillwave': 0.55,
  'trap': 0, // Straight, triplet feel is in the pattern itself
  'dnb': 0,
  'electronic': 0,
  'minimal-techno': 0,
  'synthwave': 0,
  'glitch': 0,
  'industrial': 0,
  'upbeat': 0,
  'acoustic': 0.3,
  'world': 0.4,
  'orchestral': 0,
  'cinematic': 0,
  'neo-classical': 0,
  'corporate': 0,
  'dramatic': 0,
  'horror': 0,
  'ambient': 0,
};

/**
 * NEW: Style presets with phase-based orchestration
 * Each phase defines which voices are active and their velocity
 */
const STYLE_PRESETS = {
  trap: {
    tempo: 140,
    key: 'F# minor',
    swing: 0,
    progression: ['i', 'bVI', 'bVII', 'v'], // F#m, D, E, C#m
    chordMidi: {
      'i': [42, 46, 49],      // F#m: F#2, A2, C#3
      'bVI': [38, 42, 45],    // D: D2, F#2, A2
      'bVII': [40, 44, 47],   // E: E2, G#2, B2
      'v': [37, 41, 44],      // C#m: C#2, E2, G#2
    },
    voices: [
      { name: '808', icon: '🔊', type: 'bass', baseOctave: 1 },
      { name: 'Kick', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'Snare', icon: '🥁', type: 'drum', sound: 'snare' },
      { name: 'HiHat', icon: '🎩', type: 'drum', sound: 'hihat' },
      { name: 'OpenHat', icon: '🎩', type: 'drum', sound: 'openhat' },
      { name: 'Lead', icon: '🎹', type: 'lead', baseOctave: 4 },
      { name: 'Pad', icon: '🌑', type: 'pad', baseOctave: 3 },
    ],
    phases: {
      intro: {
        activeVoices: ['Pad', 'HiHat'],
        velocity: 0.4,
        patterns: {
          'HiHat': [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
        },
      },
      build: {
        activeVoices: ['808', 'Kick', 'Snare', 'HiHat', 'Pad'],
        velocity: 0.65,
        patterns: {
          '808': RHYTHM_PATTERNS.trap808,
          'Kick': [true, false, false, false, false, false, false, true, false, false, true, false, false, false, false, false],
          'Snare': RHYTHM_PATTERNS.backbeat,
          'HiHat': RHYTHM_PATTERNS.trapHihat,
        },
      },
      climax: {
        activeVoices: ['808', 'Kick', 'Snare', 'HiHat', 'OpenHat', 'Lead', 'Pad'],
        velocity: 0.9,
        patterns: {
          '808': RHYTHM_PATTERNS.trap808,
          'Kick': [true, false, false, false, false, false, true, false, false, false, true, false, false, false, true, false],
          'Snare': RHYTHM_PATTERNS.backbeat,
          'HiHat': RHYTHM_PATTERNS.straight16,
          'OpenHat': [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
        },
      },
      resolve: {
        activeVoices: ['808', 'Pad'],
        velocity: 0.35,
        patterns: {
          '808': [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
        },
      },
    },
  },

  'lo-fi': {
    tempo: 78,
    key: 'Eb major',
    swing: 0.58,
    progression: ['ii7', 'V7', 'Imaj7', 'vi7'], // Fm7, Bb7, Ebmaj7, Cm7
    chordMidi: {
      'ii7': [41, 44, 48, 51],    // Fm7
      'V7': [46, 50, 53, 56],     // Bb7
      'Imaj7': [39, 43, 46, 50],  // Ebmaj7
      'vi7': [36, 39, 43, 46],    // Cm7
    },
    voices: [
      { name: 'Kick', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'Snare', icon: '🥁', type: 'drum', sound: 'snare' },
      { name: 'HiHat', icon: '🎩', type: 'drum', sound: 'hihat' },
      { name: 'Bass', icon: '🎸', type: 'bass', baseOctave: 2 },
      { name: 'Piano', icon: '🎹', type: 'chord', baseOctave: 3 },
      { name: 'Texture', icon: '📻', type: 'texture' },
    ],
    phases: {
      intro: {
        activeVoices: ['Piano', 'Texture'],
        velocity: 0.4,
        patterns: {},
      },
      build: {
        activeVoices: ['Kick', 'Snare', 'HiHat', 'Bass', 'Piano', 'Texture'],
        velocity: 0.55,
        patterns: {
          'Kick': RHYTHM_PATTERNS.lofiKick,
          'Snare': RHYTHM_PATTERNS.backbeat,
          'HiHat': [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
        },
      },
      climax: {
        activeVoices: ['Kick', 'Snare', 'HiHat', 'Bass', 'Piano', 'Texture'],
        velocity: 0.65,
        patterns: {
          'Kick': [true, false, false, true, false, false, true, false, false, true, false, false, false, false, false, true],
          'Snare': RHYTHM_PATTERNS.backbeat,
          'HiHat': [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
        },
      },
      resolve: {
        activeVoices: ['Piano', 'Texture'],
        velocity: 0.35,
        patterns: {},
      },
    },
  },

  jazz: {
    tempo: 120,
    key: 'Bb major',
    swing: 0.65,
    progression: ['IImaj7', 'V7', 'Imaj7', 'Imaj7'], // Cm7, F7, Bbmaj7
    chordMidi: {
      'IImaj7': [36, 39, 43, 46],  // Cm7
      'V7': [41, 45, 48, 51],      // F7
      'Imaj7': [46, 50, 53, 57],   // Bbmaj7
    },
    voices: [
      { name: 'Ride', icon: '🥁', type: 'drum', sound: 'hihat' },
      { name: 'Brush', icon: '🥁', type: 'texture' },
      { name: 'Bass', icon: '🎸', type: 'bass', baseOctave: 2 },
      { name: 'Piano', icon: '🎹', type: 'chord', baseOctave: 3 },
      { name: 'Lead', icon: '🎷', type: 'lead', baseOctave: 4 },
    ],
    phases: {
      intro: {
        activeVoices: ['Ride', 'Bass'],
        velocity: 0.4,
        patterns: {
          'Ride': RHYTHM_PATTERNS.jazzRide,
        },
      },
      build: {
        activeVoices: ['Ride', 'Brush', 'Bass', 'Piano'],
        velocity: 0.55,
        patterns: {
          'Ride': RHYTHM_PATTERNS.jazzRide,
        },
      },
      climax: {
        activeVoices: ['Ride', 'Brush', 'Bass', 'Piano', 'Lead'],
        velocity: 0.75,
        patterns: {
          'Ride': [true, false, true, true, false, true, true, true, true, false, true, true, false, true, true, false],
        },
      },
      resolve: {
        activeVoices: ['Ride', 'Piano', 'Bass'],
        velocity: 0.35,
        patterns: {
          'Ride': RHYTHM_PATTERNS.sparse,
        },
      },
    },
  },

  electronic: {
    tempo: 124,
    key: 'A minor',
    swing: 0,
    progression: ['i', 'III', 'VI', 'VII'], // Am, C, F, G
    chordMidi: {
      'i': [45, 48, 52],      // Am
      'III': [48, 52, 55],    // C
      'VI': [41, 45, 48],     // F
      'VII': [43, 47, 50],    // G
    },
    voices: [
      { name: 'Kick', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'Snare', icon: '🥁', type: 'drum', sound: 'snare' },
      { name: 'HiHat', icon: '🎩', type: 'drum', sound: 'hihat' },
      { name: 'Bass', icon: '🎸', type: 'bass', baseOctave: 2 },
      { name: 'Arp', icon: '🎹', type: 'arp', baseOctave: 4 },
      { name: 'Pad', icon: '🌊', type: 'pad', baseOctave: 3 },
    ],
    phases: {
      intro: {
        activeVoices: ['HiHat', 'Pad'],
        velocity: 0.4,
        patterns: {
          'HiHat': RHYTHM_PATTERNS.offbeat,
        },
      },
      build: {
        activeVoices: ['Kick', 'HiHat', 'Bass', 'Pad'],
        velocity: 0.6,
        patterns: {
          'Kick': RHYTHM_PATTERNS.fourOnFloor,
          'HiHat': RHYTHM_PATTERNS.straight8,
        },
      },
      climax: {
        activeVoices: ['Kick', 'Snare', 'HiHat', 'Bass', 'Arp', 'Pad'],
        velocity: 0.85,
        patterns: {
          'Kick': RHYTHM_PATTERNS.fourOnFloor,
          'Snare': [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, true],
          'HiHat': RHYTHM_PATTERNS.straight16,
        },
      },
      resolve: {
        activeVoices: ['Pad', 'Bass'],
        velocity: 0.35,
        patterns: {},
      },
    },
  },

  dnb: {
    tempo: 174,
    key: 'E minor',
    swing: 0,
    progression: ['i', 'III', 'VII', 'iv'], // Em, G, D, Am
    chordMidi: {
      'i': [40, 43, 47],      // Em
      'III': [43, 47, 50],    // G
      'VII': [38, 42, 45],    // D
      'iv': [45, 48, 52],     // Am
    },
    voices: [
      { name: 'Kick', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'Snare', icon: '🥁', type: 'drum', sound: 'snare' },
      { name: 'HiHat', icon: '⚡', type: 'drum', sound: 'hihat' },
      { name: 'Bass', icon: '🎸', type: 'bass', baseOctave: 1 },
      { name: 'Pad', icon: '🌊', type: 'pad', baseOctave: 3 },
    ],
    phases: {
      intro: {
        activeVoices: ['HiHat', 'Pad'],
        velocity: 0.45,
        patterns: {
          'HiHat': RHYTHM_PATTERNS.straight8,
        },
      },
      build: {
        activeVoices: ['Kick', 'Snare', 'HiHat', 'Bass', 'Pad'],
        velocity: 0.7,
        patterns: {
          'Kick': RHYTHM_PATTERNS.dnbKick,
          'Snare': RHYTHM_PATTERNS.dnbSnare,
          'HiHat': RHYTHM_PATTERNS.straight8,
        },
      },
      climax: {
        activeVoices: ['Kick', 'Snare', 'HiHat', 'Bass', 'Pad'],
        velocity: 0.95,
        patterns: {
          'Kick': [true, false, false, false, false, false, true, false, false, false, true, false, false, false, true, false],
          'Snare': [false, false, true, false, false, true, true, false, false, false, true, false, false, true, true, false],
          'HiHat': RHYTHM_PATTERNS.straight16,
        },
      },
      resolve: {
        activeVoices: ['Pad', 'Bass'],
        velocity: 0.35,
        patterns: {},
      },
    },
  },

  cinematic: {
    tempo: 95,
    key: 'D minor',
    swing: 0,
    progression: ['i', 'bVI', 'III', 'bVII'], // Dm, Bb, F, C
    chordMidi: {
      'i': [38, 41, 45],      // Dm
      'bVI': [46, 50, 53],    // Bb
      'III': [41, 45, 48],    // F
      'bVII': [36, 40, 43],   // C
    },
    voices: [
      { name: 'Strings', icon: '🎻', type: 'pad', baseOctave: 3 },
      { name: 'Brass', icon: '🎺', type: 'lead', baseOctave: 4 },
      { name: 'Timpani', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'Sub', icon: '🔊', type: 'bass', baseOctave: 1 },
    ],
    phases: {
      intro: {
        activeVoices: ['Strings'],
        velocity: 0.4,
        patterns: {},
      },
      build: {
        activeVoices: ['Strings', 'Sub', 'Timpani'],
        velocity: 0.6,
        patterns: {
          'Timpani': RHYTHM_PATTERNS.sparse,
        },
      },
      climax: {
        activeVoices: ['Strings', 'Brass', 'Timpani', 'Sub'],
        velocity: 0.9,
        patterns: {
          'Timpani': [true, false, false, true, false, true, false, false, true, false, false, false, true, false, true, false],
        },
      },
      resolve: {
        activeVoices: ['Strings', 'Sub'],
        velocity: 0.35,
        patterns: {},
      },
    },
  },

  ambient: {
    tempo: 70,
    key: 'C major',
    swing: 0,
    progression: ['I', 'iii', 'vi', 'V'], // C, Em, Am, G
    chordMidi: {
      'I': [36, 40, 43],      // C
      'iii': [40, 43, 47],    // Em
      'vi': [45, 48, 52],     // Am
      'V': [43, 47, 50],      // G
    },
    voices: [
      { name: 'Pad', icon: '🌊', type: 'pad', baseOctave: 3 },
      { name: 'Bells', icon: '🔔', type: 'lead', baseOctave: 5 },
      { name: 'Texture', icon: '🌌', type: 'texture' },
    ],
    phases: {
      intro: {
        activeVoices: ['Texture'],
        velocity: 0.3,
        patterns: {},
      },
      build: {
        activeVoices: ['Pad', 'Texture'],
        velocity: 0.4,
        patterns: {},
      },
      climax: {
        activeVoices: ['Pad', 'Bells', 'Texture'],
        velocity: 0.5,
        patterns: {},
      },
      resolve: {
        activeVoices: ['Pad', 'Texture'],
        velocity: 0.25,
        patterns: {},
      },
    },
  },

  'minimal-techno': {
    tempo: 125,
    key: 'A minor',
    swing: 0,
    progression: ['i'], // Single chord, hypnotic
    chordMidi: {
      'i': [45, 48, 52],      // Am
    },
    voices: [
      { name: 'Kick', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'HiHat', icon: '🎩', type: 'drum', sound: 'hihat' },
      { name: 'Rim', icon: '🪘', type: 'drum', sound: 'snare' },
      { name: 'Bass', icon: '🔊', type: 'bass', baseOctave: 2 },
      { name: 'Stab', icon: '🎹', type: 'lead', baseOctave: 4 },
    ],
    phases: {
      intro: {
        activeVoices: ['HiHat'],
        velocity: 0.35,
        patterns: {
          'HiHat': RHYTHM_PATTERNS.offbeat,
        },
      },
      build: {
        activeVoices: ['Kick', 'HiHat', 'Bass'],
        velocity: 0.6,
        patterns: {
          'Kick': RHYTHM_PATTERNS.fourOnFloor,
          'HiHat': RHYTHM_PATTERNS.offbeat,
          'Bass': [true, false, false, false, false, false, true, false, false, false, true, false, false, false, false, true],
        },
      },
      climax: {
        activeVoices: ['Kick', 'HiHat', 'Rim', 'Bass', 'Stab'],
        velocity: 0.85,
        patterns: {
          'Kick': RHYTHM_PATTERNS.fourOnFloor,
          'HiHat': RHYTHM_PATTERNS.straight16,
          'Rim': [false, false, false, false, false, false, true, false, false, false, false, false, false, false, true, false],
          'Bass': [true, false, false, false, true, false, true, false, false, true, true, false, false, true, false, false],
        },
      },
      resolve: {
        activeVoices: ['Kick', 'Bass'],
        velocity: 0.4,
        patterns: {
          'Kick': RHYTHM_PATTERNS.sparse,
          'Bass': RHYTHM_PATTERNS.halfNotes,
        },
      },
    },
  },

  synthwave: {
    tempo: 110,
    key: 'D minor',
    swing: 0,
    progression: ['i', 'bVI', 'bVII', 'III'], // Dm, Bb, C, F
    chordMidi: {
      'i': [38, 41, 45],      // Dm
      'bVI': [46, 50, 53],    // Bb
      'bVII': [36, 40, 43],   // C
      'III': [41, 45, 48],    // F
    },
    voices: [
      { name: 'Kick', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'Snare', icon: '🥁', type: 'drum', sound: 'snare' },
      { name: 'HiHat', icon: '🎩', type: 'drum', sound: 'hihat' },
      { name: 'Bass', icon: '🎸', type: 'bass', baseOctave: 2 },
      { name: 'Arp', icon: '🎹', type: 'arp', baseOctave: 4 },
      { name: 'Pad', icon: '🌆', type: 'pad', baseOctave: 3 },
      { name: 'Lead', icon: '🎹', type: 'lead', baseOctave: 5 },
    ],
    phases: {
      intro: {
        activeVoices: ['Pad'],
        velocity: 0.4,
        patterns: {},
      },
      build: {
        activeVoices: ['Kick', 'Snare', 'HiHat', 'Bass', 'Pad'],
        velocity: 0.6,
        patterns: {
          'Kick': RHYTHM_PATTERNS.fourOnFloor,
          'Snare': RHYTHM_PATTERNS.backbeat,
          'HiHat': RHYTHM_PATTERNS.straight8,
          'Bass': [true, false, false, true, false, false, true, false, false, true, false, true, false, false, true, false],
        },
      },
      climax: {
        activeVoices: ['Kick', 'Snare', 'HiHat', 'Bass', 'Arp', 'Pad', 'Lead'],
        velocity: 0.85,
        patterns: {
          'Kick': RHYTHM_PATTERNS.fourOnFloor,
          'Snare': RHYTHM_PATTERNS.backbeat,
          'HiHat': RHYTHM_PATTERNS.straight16,
          'Bass': [true, false, false, true, false, false, true, false, true, false, false, true, false, true, false, false],
          'Arp': RHYTHM_PATTERNS.straight16,
        },
      },
      resolve: {
        activeVoices: ['Pad', 'Bass'],
        velocity: 0.35,
        patterns: {},
      },
    },
  },

  glitch: {
    tempo: 130,
    key: 'C minor',
    swing: 0,
    progression: ['i'], // Static, atonal focus
    chordMidi: {
      'i': [36, 39, 43],      // Cm
    },
    voices: [
      { name: 'Kick', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'Glitch', icon: '💥', type: 'drum', sound: 'snare' },
      { name: 'HiHat', icon: '🎩', type: 'drum', sound: 'hihat' },
      { name: 'Bass', icon: '🔊', type: 'bass', baseOctave: 2 },
      { name: 'Stutter', icon: '🔀', type: 'lead', baseOctave: 4 },
    ],
    phases: {
      intro: {
        activeVoices: ['HiHat'],
        velocity: 0.35,
        patterns: {
          // Irregular pattern
          'HiHat': [true, false, true, false, false, true, false, false, true, true, false, false, true, false, false, true],
        },
      },
      build: {
        activeVoices: ['Kick', 'Glitch', 'HiHat', 'Bass'],
        velocity: 0.6,
        patterns: {
          // Broken kick pattern
          'Kick': [true, false, false, true, false, false, false, true, false, true, false, false, true, false, true, false],
          'Glitch': [false, false, true, false, false, true, true, false, false, false, true, false, true, true, false, false],
          'HiHat': [true, true, false, true, true, false, true, false, true, true, true, false, true, false, true, true],
        },
      },
      climax: {
        activeVoices: ['Kick', 'Glitch', 'HiHat', 'Bass', 'Stutter'],
        velocity: 0.9,
        patterns: {
          // Chaotic patterns
          'Kick': [true, false, true, false, false, true, false, true, true, false, false, true, false, true, true, false],
          'Glitch': [true, true, false, true, true, false, true, false, true, true, true, false, true, false, true, true],
          'HiHat': RHYTHM_PATTERNS.straight16,
        },
      },
      resolve: {
        activeVoices: ['Bass', 'HiHat'],
        velocity: 0.3,
        patterns: {
          'HiHat': [true, false, false, false, false, false, true, false, false, false, false, false, true, false, false, false],
        },
      },
    },
  },

  industrial: {
    tempo: 120,
    key: 'B minor',
    swing: 0,
    progression: ['i'], // Single chord, drone-like
    chordMidi: {
      'i': [35, 38, 42],      // Bm
    },
    voices: [
      { name: 'Kick', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'Metal', icon: '🏭', type: 'drum', sound: 'hihat' },
      { name: 'Noise', icon: '⚙️', type: 'texture' },
      { name: 'Bass', icon: '🔊', type: 'bass', baseOctave: 1 },
      { name: 'Stab', icon: '🔪', type: 'lead', baseOctave: 3 },
    ],
    phases: {
      intro: {
        activeVoices: ['Noise'],
        velocity: 0.35,
        patterns: {},
      },
      build: {
        activeVoices: ['Kick', 'Metal', 'Noise', 'Bass'],
        velocity: 0.7,
        patterns: {
          // Mechanical kick
          'Kick': RHYTHM_PATTERNS.fourOnFloor,
          // Clanking metal
          'Metal': [false, false, true, false, false, false, true, true, false, false, true, false, false, true, true, false],
          'Bass': [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        },
      },
      climax: {
        activeVoices: ['Kick', 'Metal', 'Noise', 'Bass', 'Stab'],
        velocity: 0.95,
        patterns: {
          // Relentless kick
          'Kick': RHYTHM_PATTERNS.straight8,
          'Metal': RHYTHM_PATTERNS.straight16,
          'Bass': [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
        },
      },
      resolve: {
        activeVoices: ['Noise', 'Bass'],
        velocity: 0.35,
        patterns: {
          'Bass': RHYTHM_PATTERNS.halfNotes,
        },
      },
    },
  },

  dramatic: {
    tempo: 100,
    key: 'D minor',
    swing: 0,
    progression: ['i', 'bVI', 'iv', 'V'], // Dm, Bb, Gm, A
    chordMidi: {
      'i': [38, 41, 45],      // Dm
      'bVI': [46, 50, 53],    // Bb
      'iv': [43, 46, 50],     // Gm
      'V': [45, 49, 52],      // A
    },
    voices: [
      { name: 'Timpani', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'Strings', icon: '🎻', type: 'pad', baseOctave: 3 },
      { name: 'Brass', icon: '🎺', type: 'lead', baseOctave: 4 },
      { name: 'Sub', icon: '🔊', type: 'bass', baseOctave: 1 },
      { name: 'Choir', icon: '🎤', type: 'pad', baseOctave: 4 },
    ],
    phases: {
      intro: {
        activeVoices: ['Strings'],
        velocity: 0.4,
        patterns: {},
      },
      build: {
        activeVoices: ['Timpani', 'Strings', 'Sub'],
        velocity: 0.6,
        patterns: {
          'Timpani': [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, true],
        },
      },
      climax: {
        activeVoices: ['Timpani', 'Strings', 'Brass', 'Sub', 'Choir'],
        velocity: 0.95,
        patterns: {
          'Timpani': [true, false, true, false, true, false, false, true, true, false, true, false, true, true, true, false],
        },
      },
      resolve: {
        activeVoices: ['Strings', 'Sub'],
        velocity: 0.35,
        patterns: {},
      },
    },
  },

  horror: {
    tempo: 80,
    key: 'B minor',
    swing: 0,
    progression: ['i', 'bII', 'bVI'], // Bm, C (tritone), G
    chordMidi: {
      'i': [35, 38, 42],      // Bm
      'bII': [36, 40, 43],    // C (tritone relation)
      'bVI': [43, 47, 50],    // G
    },
    voices: [
      { name: 'Drone', icon: '👻', type: 'pad', baseOctave: 2 },
      { name: 'Texture', icon: '🌑', type: 'texture' },
      { name: 'Plucks', icon: '🩸', type: 'lead', baseOctave: 4 },
      { name: 'Sub', icon: '🔊', type: 'bass', baseOctave: 1 },
      { name: 'Hits', icon: '💀', type: 'drum', sound: 'kick' },
    ],
    phases: {
      intro: {
        activeVoices: ['Drone', 'Texture'],
        velocity: 0.3,
        patterns: {},
      },
      build: {
        activeVoices: ['Drone', 'Texture', 'Sub', 'Plucks'],
        velocity: 0.5,
        patterns: {
          'Plucks': [true, false, false, false, false, false, false, false, false, false, false, true, false, false, false, false],
        },
      },
      climax: {
        activeVoices: ['Drone', 'Texture', 'Sub', 'Plucks', 'Hits'],
        velocity: 0.85,
        patterns: {
          'Plucks': [true, false, false, true, false, false, true, false, false, false, true, false, false, true, false, false],
          'Hits': [true, false, false, false, false, false, false, false, true, false, false, false, false, false, true, false],
        },
      },
      resolve: {
        activeVoices: ['Drone', 'Texture'],
        velocity: 0.25,
        patterns: {},
      },
    },
  },

  orchestral: {
    tempo: 90,
    key: 'C major',
    swing: 0,
    progression: ['I', 'vi', 'IV', 'V'], // C, Am, F, G
    chordMidi: {
      'I': [36, 40, 43],      // C
      'vi': [45, 48, 52],     // Am
      'IV': [41, 45, 48],     // F
      'V': [43, 47, 50],      // G
    },
    voices: [
      { name: 'Strings', icon: '🎻', type: 'pad', baseOctave: 3 },
      { name: 'Cellos', icon: '🎻', type: 'bass', baseOctave: 2 },
      { name: 'Brass', icon: '🎺', type: 'lead', baseOctave: 4 },
      { name: 'Timpani', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'Woodwinds', icon: '🎷', type: 'lead', baseOctave: 5 },
    ],
    phases: {
      intro: {
        activeVoices: ['Strings'],
        velocity: 0.4,
        patterns: {},
      },
      build: {
        activeVoices: ['Strings', 'Cellos', 'Brass'],
        velocity: 0.6,
        patterns: {},
      },
      climax: {
        activeVoices: ['Strings', 'Cellos', 'Brass', 'Timpani', 'Woodwinds'],
        velocity: 0.9,
        patterns: {
          'Timpani': [true, false, false, false, false, false, false, true, true, false, false, false, false, false, true, false],
        },
      },
      resolve: {
        activeVoices: ['Strings', 'Cellos'],
        velocity: 0.35,
        patterns: {},
      },
    },
  },

  'neo-classical': {
    tempo: 85,
    key: 'A minor',
    swing: 0,
    progression: ['i', 'VI', 'III', 'VII'], // Am, F, C, G
    chordMidi: {
      'i': [45, 48, 52],      // Am
      'VI': [41, 45, 48],     // F
      'III': [36, 40, 43],    // C
      'VII': [43, 47, 50],    // G
    },
    voices: [
      { name: 'Piano', icon: '🎹', type: 'arp', baseOctave: 4 },
      { name: 'Strings', icon: '🎻', type: 'pad', baseOctave: 3 },
      { name: 'Cello', icon: '🎻', type: 'bass', baseOctave: 2 },
    ],
    phases: {
      intro: {
        activeVoices: ['Piano'],
        velocity: 0.45,
        patterns: {
          'Piano': [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
        },
      },
      build: {
        activeVoices: ['Piano', 'Strings'],
        velocity: 0.6,
        patterns: {
          'Piano': RHYTHM_PATTERNS.straight16,
        },
      },
      climax: {
        activeVoices: ['Piano', 'Strings', 'Cello'],
        velocity: 0.8,
        patterns: {
          'Piano': RHYTHM_PATTERNS.straight16,
        },
      },
      resolve: {
        activeVoices: ['Piano'],
        velocity: 0.35,
        patterns: {
          'Piano': [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        },
      },
    },
  },

  acoustic: {
    tempo: 100,
    key: 'G major',
    swing: 0.3,
    progression: ['I', 'V', 'vi', 'IV'], // G, D, Em, C
    chordMidi: {
      'I': [43, 47, 50],      // G
      'V': [38, 42, 45],      // D
      'vi': [40, 43, 47],     // Em
      'IV': [36, 40, 43],     // C
    },
    voices: [
      { name: 'Guitar', icon: '🎸', type: 'arp', baseOctave: 3 },
      { name: 'Bass', icon: '🎸', type: 'bass', baseOctave: 2 },
      { name: 'Perc', icon: '🪘', type: 'drum', sound: 'hihat' },
      { name: 'Shaker', icon: '🎵', type: 'drum', sound: 'snare' },
    ],
    phases: {
      intro: {
        activeVoices: ['Guitar'],
        velocity: 0.45,
        patterns: {
          // Fingerpicking pattern
          'Guitar': [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
        },
      },
      build: {
        activeVoices: ['Guitar', 'Bass', 'Perc'],
        velocity: 0.6,
        patterns: {
          'Guitar': RHYTHM_PATTERNS.straight8,
          'Perc': RHYTHM_PATTERNS.offbeat,
        },
      },
      climax: {
        activeVoices: ['Guitar', 'Bass', 'Perc', 'Shaker'],
        velocity: 0.75,
        patterns: {
          'Guitar': RHYTHM_PATTERNS.straight8,
          'Perc': RHYTHM_PATTERNS.straight8,
          'Shaker': RHYTHM_PATTERNS.straight16,
        },
      },
      resolve: {
        activeVoices: ['Guitar'],
        velocity: 0.35,
        patterns: {
          'Guitar': [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        },
      },
    },
  },

  corporate: {
    tempo: 110,
    key: 'C major',
    swing: 0,
    progression: ['I', 'V', 'vi', 'IV'], // C, G, Am, F
    chordMidi: {
      'I': [36, 40, 43],      // C
      'V': [43, 47, 50],      // G
      'vi': [45, 48, 52],     // Am
      'IV': [41, 45, 48],     // F
    },
    voices: [
      { name: 'Piano', icon: '🎹', type: 'chord', baseOctave: 4 },
      { name: 'Pad', icon: '🌊', type: 'pad', baseOctave: 3 },
      { name: 'Bass', icon: '🎸', type: 'bass', baseOctave: 2 },
      { name: 'HiHat', icon: '🎩', type: 'drum', sound: 'hihat' },
      { name: 'Kick', icon: '🥁', type: 'drum', sound: 'kick' },
    ],
    phases: {
      intro: {
        activeVoices: ['Piano', 'Pad'],
        velocity: 0.4,
        patterns: {
          'Piano': [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
        },
      },
      build: {
        activeVoices: ['Piano', 'Pad', 'Bass', 'HiHat'],
        velocity: 0.55,
        patterns: {
          'Piano': RHYTHM_PATTERNS.quarterNotes,
          'HiHat': RHYTHM_PATTERNS.straight8,
        },
      },
      climax: {
        activeVoices: ['Piano', 'Pad', 'Bass', 'HiHat', 'Kick'],
        velocity: 0.7,
        patterns: {
          'Piano': RHYTHM_PATTERNS.straight8,
          'HiHat': RHYTHM_PATTERNS.straight8,
          'Kick': RHYTHM_PATTERNS.fourOnFloor,
        },
      },
      resolve: {
        activeVoices: ['Piano', 'Pad'],
        velocity: 0.35,
        patterns: {
          'Piano': RHYTHM_PATTERNS.halfNotes,
        },
      },
    },
  },

  upbeat: {
    tempo: 125,
    key: 'G major',
    swing: 0,
    progression: ['I', 'V', 'vi', 'IV'], // G, D, Em, C
    chordMidi: {
      'I': [43, 47, 50],      // G
      'V': [38, 42, 45],      // D
      'vi': [40, 43, 47],     // Em
      'IV': [36, 40, 43],     // C
    },
    voices: [
      { name: 'Kick', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'Clap', icon: '👏', type: 'drum', sound: 'snare' },
      { name: 'HiHat', icon: '🎩', type: 'drum', sound: 'hihat' },
      { name: 'Bass', icon: '🎸', type: 'bass', baseOctave: 2 },
      { name: 'Synth', icon: '🎹', type: 'lead', baseOctave: 4 },
      { name: 'Pad', icon: '☀️', type: 'pad', baseOctave: 3 },
    ],
    phases: {
      intro: {
        activeVoices: ['HiHat', 'Pad'],
        velocity: 0.4,
        patterns: {
          'HiHat': RHYTHM_PATTERNS.offbeat,
        },
      },
      build: {
        activeVoices: ['Kick', 'Clap', 'HiHat', 'Bass', 'Pad'],
        velocity: 0.65,
        patterns: {
          'Kick': RHYTHM_PATTERNS.fourOnFloor,
          'Clap': RHYTHM_PATTERNS.backbeat,
          'HiHat': RHYTHM_PATTERNS.straight8,
        },
      },
      climax: {
        activeVoices: ['Kick', 'Clap', 'HiHat', 'Bass', 'Synth', 'Pad'],
        velocity: 0.9,
        patterns: {
          'Kick': RHYTHM_PATTERNS.fourOnFloor,
          'Clap': RHYTHM_PATTERNS.backbeat,
          'HiHat': RHYTHM_PATTERNS.straight16,
        },
      },
      resolve: {
        activeVoices: ['Pad', 'Bass'],
        velocity: 0.35,
        patterns: {},
      },
    },
  },

  world: {
    tempo: 105,
    key: 'E minor',
    swing: 0.4,
    progression: ['i', 'III', 'VII', 'iv'], // Em, G, D, Am
    chordMidi: {
      'i': [40, 43, 47],      // Em
      'III': [43, 47, 50],    // G
      'VII': [38, 42, 45],    // D
      'iv': [45, 48, 52],     // Am
    },
    voices: [
      { name: 'Djembe', icon: '🪘', type: 'drum', sound: 'kick' },
      { name: 'Shaker', icon: '🎵', type: 'drum', sound: 'hihat' },
      { name: 'Bass', icon: '🎸', type: 'bass', baseOctave: 2 },
      { name: 'Kalimba', icon: '🎹', type: 'lead', baseOctave: 4 },
      { name: 'Pad', icon: '🌍', type: 'pad', baseOctave: 3 },
    ],
    phases: {
      intro: {
        activeVoices: ['Shaker', 'Pad'],
        velocity: 0.4,
        patterns: {
          'Shaker': [true, false, true, true, false, true, false, true, true, false, true, true, false, true, false, true],
        },
      },
      build: {
        activeVoices: ['Djembe', 'Shaker', 'Bass', 'Pad'],
        velocity: 0.6,
        patterns: {
          'Djembe': [true, false, false, true, false, true, true, false, true, false, false, true, false, true, false, true],
          'Shaker': RHYTHM_PATTERNS.straight8,
        },
      },
      climax: {
        activeVoices: ['Djembe', 'Shaker', 'Bass', 'Kalimba', 'Pad'],
        velocity: 0.8,
        patterns: {
          'Djembe': [true, false, true, true, false, true, true, false, true, true, false, true, false, true, true, false],
          'Shaker': RHYTHM_PATTERNS.straight16,
        },
      },
      resolve: {
        activeVoices: ['Shaker', 'Pad'],
        velocity: 0.35,
        patterns: {
          'Shaker': [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        },
      },
    },
  },

  chillwave: {
    tempo: 95,
    key: 'F major',
    swing: 0.55,
    progression: ['I', 'ii', 'IV', 'V'], // F, Gm, Bb, C
    chordMidi: {
      'I': [41, 45, 48],      // F
      'ii': [43, 46, 50],     // Gm
      'IV': [46, 50, 53],     // Bb
      'V': [36, 40, 43],      // C
    },
    voices: [
      { name: 'Pad', icon: '🌅', type: 'pad', baseOctave: 3 },
      { name: 'Arp', icon: '🎹', type: 'arp', baseOctave: 4 },
      { name: 'Bass', icon: '🎸', type: 'bass', baseOctave: 2 },
      { name: 'Kick', icon: '🥁', type: 'drum', sound: 'kick' },
      { name: 'HiHat', icon: '🎩', type: 'drum', sound: 'hihat' },
    ],
    phases: {
      intro: {
        activeVoices: ['Pad'],
        velocity: 0.4,
        patterns: {},
      },
      build: {
        activeVoices: ['Pad', 'Bass', 'Kick', 'HiHat'],
        velocity: 0.55,
        patterns: {
          'Kick': [true, false, false, false, false, false, true, false, false, true, false, false, false, false, false, false],
          'HiHat': RHYTHM_PATTERNS.offbeat,
        },
      },
      climax: {
        activeVoices: ['Pad', 'Arp', 'Bass', 'Kick', 'HiHat'],
        velocity: 0.7,
        patterns: {
          'Kick': [true, false, false, false, false, false, true, false, false, true, false, false, false, false, true, false],
          'HiHat': RHYTHM_PATTERNS.straight8,
          'Arp': RHYTHM_PATTERNS.straight16,
        },
      },
      resolve: {
        activeVoices: ['Pad'],
        velocity: 0.3,
        patterns: {},
      },
    },
  },
};

// Legacy fallback (all styles now converted to phase-based system)
const STYLE_PATTERNS = {};

// === Generation State ===
let selectedStyle = 'electronic';
let selectedTemplate = null;
let selectedDuration = 30; // seconds
let energyLevel = 70; // 0-100

/**
 * Get currently selected options
 */
export function getGenerationOptions() {
  return {
    style: selectedStyle,
    template: selectedTemplate,
    duration: selectedDuration,
    energy: energyLevel,
  };
}

/**
 * Set selected style
 */
export function setStyle(styleId) {
  if (STYLES.find(s => s.id === styleId)) {
    selectedStyle = styleId;
    updateSummary();
    return true;
  }
  return false;
}

/**
 * Set selected template
 */
export function setTemplate(templateId) {
  if (templateId === null || TEMPLATES.find(t => t.id === templateId)) {
    selectedTemplate = templateId;
    updateSummary();
    return true;
  }
  return false;
}

/**
 * Set duration
 */
export function setDuration(seconds) {
  selectedDuration = Math.max(5, Math.min(120, seconds));
  updateSummary();
}

/**
 * Set energy level
 */
export function setEnergy(level) {
  energyLevel = Math.max(0, Math.min(100, level));
  updateSummary();
}

/**
 * Update the summary text
 */
function updateSummary() {
  const summaryEl = document.getElementById('generation-summary');
  if (summaryEl) {
    const style = STYLES.find(s => s.id === selectedStyle);
    const styleName = style?.name || 'Unknown';
    summaryEl.textContent = `${styleName} \u2022 ${selectedDuration}s \u2022 ${energyLevel}% energy`;
  }
}

/**
 * Calculate phase structure based on duration
 * @param {number} totalBars - Total number of bars
 * @returns {object} Phase boundaries in bars
 */
function calculatePhaseStructure(totalBars) {
  if (totalBars <= 8) {
    // Very short: no intro, mostly climax
    return {
      intro: { start: 0, end: 0 },
      build: { start: 0, end: 2 },
      climax: { start: 2, end: totalBars - 1 },
      resolve: { start: totalBars - 1, end: totalBars },
    };
  } else if (totalBars <= 16) {
    // Short: compressed arc
    return {
      intro: { start: 0, end: 2 },
      build: { start: 2, end: Math.floor(totalBars * 0.4) },
      climax: { start: Math.floor(totalBars * 0.4), end: totalBars - 2 },
      resolve: { start: totalBars - 2, end: totalBars },
    };
  } else {
    // Full arc
    return {
      intro: { start: 0, end: Math.floor(totalBars * 0.15) },
      build: { start: Math.floor(totalBars * 0.15), end: Math.floor(totalBars * 0.4) },
      climax: { start: Math.floor(totalBars * 0.4), end: Math.floor(totalBars * 0.85) },
      resolve: { start: Math.floor(totalBars * 0.85), end: totalBars },
    };
  }
}

/**
 * Get the phase for a given bar number
 * @param {number} bar - Bar number
 * @param {object} phaseStructure - Phase boundaries
 * @returns {string} Phase name
 */
function getPhaseForBar(bar, phaseStructure) {
  if (bar >= phaseStructure.resolve.start) return 'resolve';
  if (bar >= phaseStructure.climax.start) return 'climax';
  if (bar >= phaseStructure.build.start) return 'build';
  return 'intro';
}

/**
 * Generate phase-aware pattern for a voice across all bars
 * @param {object} voiceConfig - Voice configuration from preset
 * @param {object} preset - Full style preset
 * @param {number} totalBars - Total bars to generate
 * @param {object} phaseStructure - Phase boundaries
 * @param {number} energy - Energy level (0-100)
 * @returns {object} Generated steps and notes for this voice
 */
function generatePhaseAwareVoice(voiceConfig, preset, totalBars, phaseStructure, energy) {
  const stepsPerBar = 16;
  const totalSteps = totalBars * stepsPerBar;
  const steps = new Array(totalSteps).fill(false);
  const notes = [];

  const { root, scaleType } = parseKeyString(preset.key);
  const swing = preset.swing || 0;
  const styleId = Object.keys(STYLE_PRESETS).find(k => STYLE_PRESETS[k] === preset) || 'electronic';

  for (let bar = 0; bar < totalBars; bar++) {
    const phase = getPhaseForBar(bar, phaseStructure);
    const phaseConfig = preset.phases[phase];

    // Skip voice if not active in this phase
    if (!phaseConfig.activeVoices.includes(voiceConfig.name)) {
      continue;
    }

    // Get pattern for this voice in this phase
    let pattern = phaseConfig.patterns?.[voiceConfig.name];
    if (!pattern) {
      // Use default pattern based on voice type
      pattern = getDefaultPatternForType(voiceConfig.type, phase);
    }

    // Apply pattern variations for musical interest
    const barInPhrase = bar % 4;
    const variation = selectPatternVariation(voiceConfig.name, styleId, barInPhrase, phase);
    if (variation) {
      pattern = variation;
    }

    // Apply pattern to this bar's steps
    const barStartStep = bar * stepsPerBar;
    for (let i = 0; i < stepsPerBar; i++) {
      if (pattern[i]) {
        steps[barStartStep + i] = true;

        // Generate notes for melodic voices
        if (['bass', 'lead', 'arp', 'chord', 'pad'].includes(voiceConfig.type)) {
          const chordIndex = Math.floor(bar / 2) % preset.progression.length;
          const chordSymbol = preset.progression[chordIndex];
          const chordMidi = preset.chordMidi?.[chordSymbol];

          let pitch;
          if (voiceConfig.type === 'bass') {
            // Bass plays root
            pitch = chordMidi ? chordMidi[0] : 36;
          } else if (voiceConfig.type === 'lead') {
            // Lead plays melodic line based on chord tones with variation
            const melodicIndex = (notes.length + i) % (chordMidi?.length || 3);
            pitch = chordMidi ? chordMidi[melodicIndex] + (voiceConfig.baseOctave - 2) * 12 : 60;
            // Add some melodic variation
            if (Math.random() > 0.7) pitch += [-2, 2, 5][Math.floor(Math.random() * 3)];
          } else if (voiceConfig.type === 'arp') {
            // Arp cycles through chord tones
            const arpIndex = notes.length % (chordMidi?.length || 3);
            pitch = chordMidi ? chordMidi[arpIndex] + (voiceConfig.baseOctave - 2) * 12 : 60;
          } else {
            // Pad/chord - use root position
            pitch = chordMidi ? chordMidi[0] + (voiceConfig.baseOctave - 2) * 12 : 48;
          }

          // Add variation based on energy
          const velocityBase = Math.floor(phaseConfig.velocity * 127);
          const velocityVariation = Math.floor((energy / 100) * 20);
          const velocity = Math.min(127, velocityBase + Math.floor(Math.random() * velocityVariation));

          notes.push({
            id: `gen-${Date.now()}-${bar}-${i}`,
            pitch: pitch,
            startBeat: barStartStep + i,
            durationBeats: getDurationForType(voiceConfig.type, pattern, i, stepsPerBar),
            velocity: velocity,
          });
        }
      }
    }

    // Add fill at end of every 4 bars during build/climax
    if ((bar + 1) % 4 === 0 && (phase === 'build' || phase === 'climax') && voiceConfig.type === 'drum') {
      addFillPattern(steps, barStartStep, stepsPerBar, voiceConfig.sound);
    }
  }

  // Apply voice leading to smooth melodic lines
  const smoothedNotes = applyVoiceLeading(notes, voiceConfig.type);

  return { steps, notes: smoothedNotes };
}

/**
 * Get default pattern for voice type
 */
function getDefaultPatternForType(type, phase) {
  if (type === 'texture') {
    return RHYTHM_PATTERNS.halfNotes;
  }
  if (type === 'pad' || type === 'chord') {
    return phase === 'climax' ? RHYTHM_PATTERNS.halfNotes : RHYTHM_PATTERNS.sparse;
  }
  if (type === 'bass') {
    return phase === 'climax' ? RHYTHM_PATTERNS.straight8 : RHYTHM_PATTERNS.quarterNotes;
  }
  if (type === 'lead' || type === 'arp') {
    return phase === 'climax'
      ? [true, false, true, false, true, false, true, true, true, false, true, false, true, true, true, false]
      : RHYTHM_PATTERNS.quarterNotes;
  }
  return RHYTHM_PATTERNS.quarterNotes;
}

/**
 * Get duration based on voice type
 */
function getDurationForType(type, pattern, currentIndex, stepsPerBar) {
  if (type === 'pad' || type === 'chord') {
    return 8; // Half bar for sustained sounds
  }
  if (type === 'bass') {
    // Find next hit
    for (let i = currentIndex + 1; i < stepsPerBar; i++) {
      if (pattern[i]) return i - currentIndex;
    }
    return 4;
  }
  if (type === 'lead' || type === 'arp') {
    return 1; // Short notes
  }
  return 1;
}

/**
 * Add a fill pattern at the end of a phrase
 */
function addFillPattern(steps, barStartStep, stepsPerBar, sound) {
  // Add hits in the last 4 steps of the bar
  const fillPattern = sound === 'snare'
    ? [false, false, false, false, false, false, false, false, false, false, false, false, true, true, true, true]
    : [false, false, false, false, false, false, false, false, false, false, true, false, true, false, true, false];

  for (let i = 0; i < stepsPerBar; i++) {
    if (fillPattern[i]) {
      steps[barStartStep + i] = true;
    }
  }
}

/**
 * Generate music based on current options - NEW PHASE-BASED SYSTEM
 */
export function generate() {
  // Check if we have a new-style preset
  const preset = STYLE_PRESETS[selectedStyle];
  const fallbackStyle = STYLE_PATTERNS[selectedStyle];

  if (!preset && !fallbackStyle) {
    console.error('Unknown style:', selectedStyle);
    return null;
  }

  // Create new project
  const projectName = `${STYLES.find(s => s.id === selectedStyle)?.name || 'Generated'} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  state.newProject(projectName);

  // Use new system if preset exists, otherwise fallback
  if (preset) {
    return generateWithPhases(preset, projectName);
  } else {
    return generateLegacy(fallbackStyle, projectName);
  }
}

/**
 * NEW: Generate music with phase-based system
 */
function generateWithPhases(preset, projectName) {
  // Set tempo (adjusted by energy)
  const baseTempo = preset.tempo;
  const tempoAdjust = Math.round((energyLevel - 50) * 0.15);
  const finalTempo = baseTempo + tempoAdjust;
  state.setTempo(finalTempo);

  // Calculate bars and phase structure
  const bars = durationToBars(selectedDuration, finalTempo);
  const phaseStructure = calculatePhaseStructure(bars);
  state.get('transport').loopEnd = bars * 16; // 16 steps per bar

  // Create voices with phase-aware patterns
  const createdVoices = [];

  for (const voiceConfig of preset.voices) {
    // Skip some voices at low energy
    if (energyLevel < 40 && voiceConfig.type === 'lead') continue;
    if (energyLevel < 30 && createdVoices.length >= 4) break;

    // Generate phase-aware content
    const { steps, notes } = generatePhaseAwareVoice(
      voiceConfig,
      preset,
      bars,
      phaseStructure,
      energyLevel
    );

    // Determine source type
    const sourceType = voiceConfig.type === 'drum' ? 'drum' : 'synth';

    // Generate Strudel pattern code for Code Editor view
    const patternCode = generateStrudelPattern(voiceConfig, preset, 'climax');

    const voice = state.addVoice({
      name: voiceConfig.name,
      icon: voiceConfig.icon,
      type: 'pattern',
      sourceType: sourceType,
      patternCode: patternCode,
      content: {
        steps: steps,
        notes: notes,
        melodicNotes: notes.map(n => n.pitch),
      },
    });

    createdVoices.push(voice);
  }

  eventBus.emit(Events.TOAST_SHOW, {
    message: `Generated ${createdVoices.length} voices with ${bars}-bar arc in ${STYLES.find(s => s.id === selectedStyle)?.name} style`,
    type: 'success',
  });

  return {
    projectName,
    style: selectedStyle,
    voices: createdVoices,
    tempo: finalTempo,
    bars,
    phases: phaseStructure,
  };
}

/**
 * LEGACY: Generate music with old pattern system (for styles not yet converted)
 */
function generateLegacy(style, projectName) {
  const energyMultiplier = 0.5 + (energyLevel / 100) * 0.5;
  const baseTempo = style.tempo;
  const tempoAdjust = Math.round((energyLevel - 50) * 0.2);
  state.setTempo(baseTempo + tempoAdjust);

  const bars = durationToBars(selectedDuration, baseTempo + tempoAdjust);
  state.get('transport').loopEnd = bars * 4;

  const createdVoices = [];
  for (const voiceData of style.voices) {
    if (energyLevel < 40 && voiceData.name.toLowerCase().includes('lead')) continue;
    if (energyLevel < 30 && createdVoices.length >= 3) break;

    let patternCode = voiceData.pattern || '';
    const isMelodic = isMelodicPattern(patternCode);

    let steps, noteObjects, melodicNotes;

    if (isMelodic && patternCode) {
      const proceduralData = generateProceduralVoice(voiceData, style.key, energyLevel);
      steps = proceduralData.steps;
      noteObjects = proceduralData.notes;
      melodicNotes = proceduralData.melodicNotes;
    } else {
      steps = patternCode ? parsePatternToSteps(patternCode, 16) : new Array(16).fill(false);
      melodicNotes = [];
      noteObjects = [];
    }

    const voice = state.addVoice({
      name: voiceData.name,
      icon: voiceData.icon,
      type: 'pattern',
      sourceType: isMelodic ? 'synth' : 'drum',
      patternCode: patternCode,
      content: { steps, notes: noteObjects, melodicNotes },
    });

    createdVoices.push(voice);
  }

  eventBus.emit(Events.TOAST_SHOW, {
    message: `Generated ${createdVoices.length} voices in ${STYLES.find(s => s.id === selectedStyle)?.name} style`,
    type: 'success',
  });

  return {
    projectName,
    style: selectedStyle,
    voices: createdVoices,
    tempo: baseTempo + tempoAdjust,
    bars,
  };
}

/**
 * Convert duration in seconds to bars
 */
function durationToBars(seconds, tempo) {
  const beatsPerSecond = tempo / 60;
  const totalBeats = seconds * beatsPerSecond;
  const bars = Math.round(totalBeats / 4); // 4 beats per bar
  return Math.max(4, Math.min(64, bars));
}

/**
 * Render style grid
 */
export function renderStyleGrid(container) {
  if (!container) return;

  container.innerHTML = STYLES.map(style => `
    <button class="style-card ${style.id === selectedStyle ? 'selected' : ''}"
            data-style="${style.id}"
            data-family="${style.family}">
      <span class="style-icon">${style.icon}</span>
      <span class="style-name">${style.name}</span>
      <span class="style-desc">${style.description}</span>
    </button>
  `).join('');

  // Add click handlers
  container.querySelectorAll('.style-card').forEach(card => {
    card.addEventListener('click', () => {
      const styleId = card.dataset.style;
      setStyle(styleId);

      // Update UI
      container.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
}

/**
 * Render template grid
 */
export function renderTemplateGrid(container) {
  if (!container) return;

  container.innerHTML = `
    <button class="template-card ${!selectedTemplate ? 'selected' : ''}"
            data-template="">
      <span class="template-name">None</span>
      <span class="template-desc">Use style defaults</span>
    </button>
    ${TEMPLATES.map(template => `
      <button class="template-card ${template.id === selectedTemplate ? 'selected' : ''}"
              data-template="${template.id}">
        <span class="template-name">${template.name}</span>
        <span class="template-desc">${template.description}</span>
      </button>
    `).join('')}
  `;

  // Add click handlers
  container.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      const templateId = card.dataset.template || null;
      setTemplate(templateId);

      // If a template is selected, also set its base style
      if (templateId) {
        const template = TEMPLATES.find(t => t.id === templateId);
        if (template?.baseStyle) {
          setStyle(template.baseStyle);
          // Update style grid UI
          const styleGrid = document.getElementById('style-grid');
          if (styleGrid) {
            styleGrid.querySelectorAll('.style-card').forEach(c => {
              c.classList.toggle('selected', c.dataset.style === template.baseStyle);
            });
          }
        }
      }

      // Update UI
      container.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
}

/**
 * Initialize generation UI
 */
export function initGenerationUI() {
  const styleGrid = document.getElementById('style-grid');
  const templateGrid = document.getElementById('template-grid');

  renderStyleGrid(styleGrid);
  renderTemplateGrid(templateGrid);

  // Duration buttons
  const durationBtns = document.querySelectorAll('#duration-buttons .param-btn');
  const customDurationInput = document.getElementById('custom-duration');

  durationBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      durationBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const duration = btn.dataset.duration;
      if (duration === 'custom') {
        customDurationInput?.classList.remove('hidden');
        customDurationInput?.focus();
      } else {
        customDurationInput?.classList.add('hidden');
        setDuration(parseInt(duration, 10));
      }
    });
  });

  customDurationInput?.addEventListener('change', (e) => {
    const bars = parseInt(e.target.value, 10);
    if (!isNaN(bars)) {
      // Convert bars to approximate seconds (assuming ~120 BPM)
      const seconds = Math.round(bars * 4 * 60 / 120);
      setDuration(seconds);
    }
  });

  // Energy slider
  const energySlider = document.getElementById('energy-slider');
  const energyValue = document.getElementById('energy-value');

  energySlider?.addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    setEnergy(value);
    if (energyValue) {
      energyValue.textContent = `${value}%`;
    }
  });

  // Initial summary
  updateSummary();
}

/**
 * Reset generation options to defaults
 */
export function resetOptions() {
  selectedStyle = 'electronic';
  selectedTemplate = null;
  selectedDuration = 30;
  energyLevel = 70;
  updateSummary();
}
