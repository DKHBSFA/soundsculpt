/**
 * SoundSculpt - Music Generation Module
 * Phase 6: Generation (AI/Preset) functionality
 *
 * Creates voices with patterns based on selected style and parameters.
 */

import { state } from './state.js';
import { eventBus, Events } from './event-bus.js';

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

// === Pattern Presets for each style ===
const STYLE_PATTERNS = {
  electronic: {
    tempo: 120,
    key: 'A minor',
    voices: [
      { name: 'Kick', icon: '🥁', pattern: "s('RolandTR808_bd').struct('t ~ ~ ~ t ~ ~ ~')" },
      { name: 'HiHat', icon: '🎩', pattern: "s('RolandTR808_hh').struct('t t t t t t t t').gain(0.6)" },
      { name: 'Arp', icon: '🎹', pattern: "note('<a3 c4 e4 a4>(3,8)').s('square').lpf(2500).delay(0.3).gain(0.7)" },
      { name: 'Bass', icon: '🎸', pattern: "note('<a1 ~ e2 ~ c2 ~ g2 ~>').s('sawtooth').lpf(400).gain(0.8)" },
      { name: 'Pad', icon: '🌊', pattern: "chord('<Am C F G>').voicing().s('sine').room(0.35).gain(0.4).slow(4)" },
    ],
  },
  trap: {
    tempo: 140,
    key: 'F minor',
    voices: [
      { name: '808', icon: '🔊', pattern: "note('<f1 ~ ~ f1 ~ f1 ~ ~>').s('sawtooth').lpf(100).gain(0.9).decay(0.8)" },
      { name: 'Snare', icon: '🥁', pattern: "s('RolandTR808_sd').struct('~ ~ ~ ~ t ~ ~ ~').gain(0.85)" },
      { name: 'HiHat', icon: '🎩', pattern: "s('RolandTR808_hh').struct('t*16').gain(perlin.range(0.3,0.7))" },
      { name: 'Lead', icon: '🎹', pattern: "note('<f4 ab4 c5 eb5>(5,8)').s('sawtooth').lpf(1500).gain(0.6)" },
    ],
  },
  dnb: {
    tempo: 174,
    key: 'E minor',
    voices: [
      { name: 'Kick', icon: '🥁', pattern: "s('RolandTR909_bd').struct('t ~ ~ ~ ~ ~ t ~')" },
      { name: 'Snare', icon: '🥁', pattern: "s('RolandTR909_sd').struct('~ ~ t ~ ~ ~ t ~').room(0.2)" },
      { name: 'Break', icon: '⚡', pattern: "s('RolandTR909_hh').struct('t*8').gain(sine.range(0.4,0.7))" },
      { name: 'Bass', icon: '🎸', pattern: "note('<e1 ~ b1 ~ e1 g1 ~ b1>').s('sawtooth').lpf(300).gain(0.85)" },
      { name: 'Pad', icon: '🌊', pattern: "chord('<Em G D Am>').voicing().s('sine').room(0.4).gain(0.35).slow(4)" },
    ],
  },
  'minimal-techno': {
    tempo: 125,
    key: 'A minor',
    voices: [
      { name: 'Kick', icon: '🥁', pattern: "s('RolandTR909_bd').struct('t ~ ~ ~ t ~ ~ ~').room(0.1)" },
      { name: 'HiHat', icon: '🎩', pattern: "s('RolandTR909_hh').struct('~ t ~ t ~ t ~ t').gain(0.5)" },
      { name: 'Perc', icon: '🪘', pattern: "s('RolandTR909_rim').struct('~ ~ ~ t ~ ~ ~ ~').gain(0.6)" },
      { name: 'Bass', icon: '🔊', pattern: "note('a1').s('sine').struct('t ~ ~ ~ t ~ t ~').gain(0.8)" },
    ],
  },
  synthwave: {
    tempo: 110,
    key: 'D minor',
    voices: [
      { name: 'Kick', icon: '🥁', pattern: "s('RolandTR808_bd').struct('t ~ ~ ~ t ~ ~ ~')" },
      { name: 'Snare', icon: '🥁', pattern: "s('RolandTR808_sd').struct('~ ~ ~ ~ t ~ ~ ~').room(0.4).gain(0.9)" },
      { name: 'Arp', icon: '🎹', pattern: "note('<d4 f4 a4 c5>(4,8)').s('sawtooth').lpf(3000).delay(0.4).gain(0.65)" },
      { name: 'Bass', icon: '🎸', pattern: "note('<d2 ~ a2 ~ g2 ~ f2 ~>').s('square').lpf(800).gain(0.75)" },
      { name: 'Pad', icon: '🌆', pattern: "chord('<Dm Bb C F>').voicing().s('sawtooth').lpf(2000).room(0.5).gain(0.4).slow(8)" },
    ],
  },
  glitch: {
    tempo: 130,
    key: 'C minor',
    voices: [
      { name: 'Kick', icon: '🥁', pattern: "s('RolandTR808_bd').struct('<t ~ ~ ~> <t t ~ ~>').gain(0.9)" },
      { name: 'Glitch', icon: '💥', pattern: "s('RolandTR909_hh RolandTR909_rim').struct('t*8').chop(8).gain(perlin.range(0.3,0.8))" },
      { name: 'Noise', icon: '📻', pattern: "s('white').gain(0.15).lpf(sine.range(500,5000)).struct('t/2')" },
      { name: 'Bass', icon: '🔊', pattern: "note('<c1 ~ eb1 ~ g1 ~ c2 ~>').s('square').lpf(200).gain(0.75)" },
    ],
  },
  industrial: {
    tempo: 120,
    key: 'B minor',
    voices: [
      { name: 'Kick', icon: '🥁', pattern: "s('RolandTR909_bd').struct('t ~ t ~ t ~ t ~').gain(0.95)" },
      { name: 'Metal', icon: '🏭', pattern: "s('RolandTR909_hh').struct('t*16').hpf(5000).gain(perlin.range(0.2,0.5))" },
      { name: 'Noise', icon: '⚙️', pattern: "s('white').gain(0.2).lpf(2000).struct('~ ~ t ~ ~ ~ t ~')" },
      { name: 'Bass', icon: '🔊', pattern: "note('<b1 ~ ~ b1 ~ ~ b1 ~>').s('sawtooth').lpf(250).distort(0.3).gain(0.8)" },
    ],
  },
  dramatic: {
    tempo: 100,
    key: 'D minor',
    voices: [
      { name: 'Timpani', icon: '🥁', pattern: "note('<d2 ~ ~ ~ d2 ~ a2 ~>').s('triangle').decay(0.8).gain(0.9)" },
      { name: 'Strings', icon: '🎻', pattern: "chord('<Dm Bb Gm A>').voicing().s('sawtooth').lpf(3000).room(0.5).gain(0.6).slow(4)" },
      { name: 'Brass', icon: '🎺', pattern: "note('<d4 ~ f4 ~ a4 ~ d5 ~>').s('sawtooth').lpf(2500).gain(0.5).slow(2)" },
    ],
  },
  horror: {
    tempo: 80,
    key: 'B minor',
    voices: [
      { name: 'Drone', icon: '👻', pattern: "note('b1').s('sine').fm(0.5).fmh(0.5).room(0.6).gain(0.4)" },
      { name: 'Texture', icon: '🌑', pattern: "s('white').gain(0.1).lpf(perlin.range(200,2000)).slow(4)" },
      { name: 'Plucks', icon: '🎸', pattern: "note('<b3 ~ d4 ~ f#4 ~ ~ ~>').s('triangle').decay(0.5).delay(0.5).gain(0.35).slow(2)" },
    ],
  },
  jazz: {
    tempo: 120,
    key: 'G major',
    voices: [
      { name: 'Ride', icon: '🥁', pattern: "s('RolandTR909_hh').struct('t ~ t t ~ t t ~').gain(0.5)" },
      { name: 'Bass', icon: '🎸', pattern: "note('<g2 b2 d3 f#3>(3,8)').s('triangle').gain(0.7)" },
      { name: 'Piano', icon: '🎹', pattern: "chord('<Gmaj7 Am7 Bm7 Cmaj7>').voicing().s('sine').room(0.3).gain(0.5).slow(4)" },
      { name: 'Lead', icon: '🎷', pattern: "note('<g4 a4 b4 d5 e5 d5 b4 a4>(5,8)').s('sawtooth').lpf(2000).gain(0.4)" },
    ],
  },
  orchestral: {
    tempo: 90,
    key: 'C major',
    voices: [
      { name: 'Strings', icon: '🎻', pattern: "chord('<C Am F G>').voicing().s('sawtooth').lpf(4000).room(0.5).gain(0.55).slow(4)" },
      { name: 'Cellos', icon: '🎻', pattern: "note('<c3 e3 f3 g3>').s('sawtooth').lpf(1500).room(0.4).gain(0.5).slow(4)" },
      { name: 'Timpani', icon: '🥁', pattern: "note('<c2 ~ ~ ~ g2 ~ ~ ~>').s('triangle').decay(1).gain(0.7).slow(2)" },
      { name: 'Brass', icon: '🎺', pattern: "chord('<C F G C>').s('sawtooth').lpf(2000).gain(0.4).slow(8)" },
    ],
  },
  'neo-classical': {
    tempo: 85,
    key: 'A minor',
    voices: [
      { name: 'Piano', icon: '🎹', pattern: "note('<a3 c4 e4 a4 e4 c4>(3,8)').s('sine').room(0.4).gain(0.6)" },
      { name: 'Strings', icon: '🎻', pattern: "chord('<Am F C G>').voicing().s('sawtooth').lpf(3000).room(0.5).gain(0.4).slow(8)" },
      { name: 'Bass', icon: '🎻', pattern: "note('<a2 ~ f2 ~ c2 ~ g2 ~>').s('triangle').gain(0.55).slow(2)" },
    ],
  },
  acoustic: {
    tempo: 100,
    key: 'G major',
    voices: [
      { name: 'Guitar', icon: '🎸', pattern: "note('<g3 b3 d4 g4>(4,8)').s('triangle').decay(0.4).gain(0.65)" },
      { name: 'Bass', icon: '🎸', pattern: "note('<g2 ~ d3 ~ b2 ~ c3 ~>').s('triangle').gain(0.6)" },
      { name: 'Perc', icon: '🪘', pattern: "s('RolandTR808_hh').struct('t ~ t ~ t ~ t ~').gain(0.4)" },
    ],
  },
  cinematic: {
    tempo: 95,
    key: 'D minor',
    voices: [
      { name: 'Strings', icon: '🎻', pattern: "chord('<Dm Bb F C>').voicing().s('sawtooth').lpf(4000).room(0.6).gain(0.55).slow(4)" },
      { name: 'Brass', icon: '🎺', pattern: "note('<d4 f4 a4 c5>').s('sawtooth').lpf(2500).room(0.4).gain(0.45).slow(8)" },
      { name: 'Timpani', icon: '🥁', pattern: "note('<d2 ~ ~ d2 ~ a2 ~ ~>').s('triangle').decay(1).gain(0.75)" },
      { name: 'Sub', icon: '🔊', pattern: "note('<d1 ~ ~ ~ d1 ~ ~ ~>').s('sine').gain(0.6).slow(2)" },
    ],
  },
  corporate: {
    tempo: 110,
    key: 'C major',
    voices: [
      { name: 'Piano', icon: '🎹', pattern: "note('<c4 e4 g4 c5>(4,8)').s('sine').room(0.3).gain(0.55)" },
      { name: 'Pad', icon: '🌊', pattern: "chord('<C G Am F>').voicing().s('sine').room(0.4).gain(0.35).slow(8)" },
      { name: 'Bass', icon: '🎸', pattern: "note('<c2 ~ g2 ~ a2 ~ f2 ~>').s('triangle').gain(0.5)" },
      { name: 'Perc', icon: '🥁', pattern: "s('RolandTR808_hh').struct('t ~ t ~ t ~ t ~').gain(0.35)" },
    ],
  },
  upbeat: {
    tempo: 125,
    key: 'G major',
    voices: [
      { name: 'Kick', icon: '🥁', pattern: "s('RolandTR808_bd').struct('t ~ ~ ~ t ~ ~ ~')" },
      { name: 'Snare', icon: '🥁', pattern: "s('RolandTR808_sd').struct('~ ~ ~ ~ t ~ ~ ~').gain(0.85)" },
      { name: 'HiHat', icon: '🎩', pattern: "s('RolandTR808_hh').struct('t t t t t t t t').gain(0.55)" },
      { name: 'Bass', icon: '🎸', pattern: "note('<g2 ~ b2 ~ d3 ~ g2 ~>').s('triangle').gain(0.7)" },
      { name: 'Synth', icon: '🎹', pattern: "note('<g4 b4 d5 g5>(4,8)').s('square').lpf(3000).gain(0.5)" },
    ],
  },
  world: {
    tempo: 105,
    key: 'E minor',
    voices: [
      { name: 'Perc', icon: '🪘', pattern: "s('RolandTR808_bd RolandTR808_rim').struct('t ~ t ~ ~ t ~ t').gain(0.7)" },
      { name: 'Shaker', icon: '🎵', pattern: "s('RolandTR808_hh').struct('t*8').gain(perlin.range(0.2,0.5))" },
      { name: 'Bass', icon: '🎸', pattern: "note('<e2 ~ g2 ~ a2 ~ b2 ~>').s('triangle').gain(0.65)" },
      { name: 'Lead', icon: '🪈', pattern: "note('<e4 g4 a4 b4 a4 g4>(5,8)').s('sine').room(0.3).gain(0.5)" },
    ],
  },
  ambient: {
    tempo: 70,
    key: 'C major',
    voices: [
      { name: 'Pad', icon: '🌊', pattern: "chord('<C Em Am G>').voicing().s('sine').room(0.7).gain(0.4).slow(16)" },
      { name: 'Texture', icon: '🌌', pattern: "s('white').gain(0.05).lpf(perlin.range(500,3000)).slow(8)" },
      { name: 'Bells', icon: '🔔', pattern: "note('<c5 e5 g5 b5>(3,16)').s('sine').room(0.6).decay(2).gain(0.3)" },
    ],
  },
  chillwave: {
    tempo: 95,
    key: 'F major',
    voices: [
      { name: 'Pad', icon: '🌅', pattern: "chord('<F Dm Bb C>').voicing().s('sawtooth').lpf(2000).room(0.5).gain(0.45).slow(8)" },
      { name: 'Bass', icon: '🎸', pattern: "note('<f2 ~ d2 ~ bb2 ~ c2 ~>').s('triangle').gain(0.55).slow(2)" },
      { name: 'Arp', icon: '🎹', pattern: "note('<f4 a4 c5 a4>(4,8)').s('square').lpf(1500).delay(0.35).gain(0.4)" },
      { name: 'HiHat', icon: '🥁', pattern: "s('RolandTR808_hh').struct('t ~ t ~ t ~ t ~').gain(0.35)" },
    ],
  },
  'lo-fi': {
    tempo: 85,
    key: 'D major',
    voices: [
      { name: 'Kick', icon: '🥁', pattern: "s('RolandTR808_bd').struct('t ~ ~ ~ t ~ ~ t').gain(0.8)" },
      { name: 'Snare', icon: '🥁', pattern: "s('RolandTR808_sd').struct('~ ~ ~ ~ t ~ ~ ~').room(0.3).gain(0.7)" },
      { name: 'HiHat', icon: '🎩', pattern: "s('RolandTR808_hh').struct('t t t t t t t t').gain(0.4).hpf(5000)" },
      { name: 'Piano', icon: '🎹', pattern: "chord('<Dmaj7 Bm7 Gmaj7 A7>').voicing().s('sine').lpf(1500).room(0.4).gain(0.5).slow(4)" },
      { name: 'Bass', icon: '🎸', pattern: "note('<d2 ~ b2 ~ g2 ~ a2 ~>').s('triangle').lpf(500).gain(0.6)" },
    ],
  },
};

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
 * Generate music based on current options
 */
export function generate() {
  const style = STYLE_PATTERNS[selectedStyle];
  if (!style) {
    console.error('Unknown style:', selectedStyle);
    return null;
  }

  // Calculate parameters based on energy
  const energyMultiplier = 0.5 + (energyLevel / 100) * 0.5;

  // Create new project
  const projectName = `${STYLES.find(s => s.id === selectedStyle)?.name || 'Generated'} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  state.newProject(projectName);

  // Set tempo (adjusted by energy)
  const baseTempo = style.tempo;
  const tempoAdjust = Math.round((energyLevel - 50) * 0.2); // +/-10 BPM based on energy
  state.setTempo(baseTempo + tempoAdjust);

  // Calculate loop length based on duration
  const bars = durationToBars(selectedDuration, baseTempo + tempoAdjust);
  state.get('transport').loopEnd = bars * 4; // 4 beats per bar

  // Create voices with patterns
  const createdVoices = [];
  for (const voiceData of style.voices) {
    // Skip some voices at low energy for sparser sound
    if (energyLevel < 40 && voiceData.name.toLowerCase().includes('lead')) continue;
    if (energyLevel < 30 && createdVoices.length >= 3) break;

    // Adjust pattern based on energy
    let patternCode = voiceData.pattern;

    // Apply energy adjustments
    if (energyLevel < 50) {
      // Lower energy: reduce gain, add more space
      patternCode = patternCode.replace(/\.gain\([\d.]+\)/g, (match) => {
        const originalGain = parseFloat(match.match(/[\d.]+/)[0]);
        return `.gain(${(originalGain * energyMultiplier).toFixed(2)})`;
      });
    } else if (energyLevel > 75) {
      // Higher energy: boost gain slightly
      patternCode = patternCode.replace(/\.gain\([\d.]+\)/g, (match) => {
        const originalGain = parseFloat(match.match(/[\d.]+/)[0]);
        const boosted = Math.min(1, originalGain * 1.15);
        return `.gain(${boosted.toFixed(2)})`;
      });
    }

    // Parse pattern to generate sequencer steps
    const steps = parsePatternToSteps(patternCode, 16);

    // Check if melodic and parse notes
    const isMelodic = isMelodicPattern(patternCode);
    const melodicNotes = isMelodic ? parseNotesFromPattern(patternCode) : [];

    // Generate note objects for Piano Roll and Score
    const noteObjects = isMelodic ? generateNoteObjects(steps, melodicNotes) : [];

    const voice = state.addVoice({
      name: voiceData.name,
      icon: voiceData.icon,
      type: 'pattern',
      sourceType: isMelodic ? 'synth' : 'drum',
      patternCode: patternCode,
      content: {
        steps: steps,
        notes: noteObjects, // Note objects for Piano Roll and Score
        melodicNotes: melodicNotes, // MIDI notes to cycle through for playback
      },
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
