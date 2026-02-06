/**
 * SoundSculpt - Strudel Pattern Parser
 * Parses a subset of Strudel/Tidal Cycles mini-notation for use in soundsculpt.
 *
 * Supported syntax:
 * - note('<c4 e4 g4>') - Note patterns
 * - chord('<Dm7 G7>') - Chord patterns
 * - .struct('t ~ t ~') - Rhythm structure
 * - .s('sound') - Sound assignment
 * - .gain(n), .room(n), .lpf(n), .hpf(n), .delay(n) - Effects
 * - .slow(n), .fast(n) - Time modifiers
 * - ~ (silence) - Pauses
 * - stack(...) - Layer multiple patterns
 * - .voicing() - Chord voicing (lookup from preset)
 * - t(k,n) - Euclidean rhythm
 *
 * Unsupported (graceful fallback):
 * - perlin.range(a,b) -> (a+b)/2
 * - sine.range(a,b) -> (a+b)/2
 */

// === MIDI Utilities ===

const NOTE_MAP = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const CHORD_TYPES = {
  '': [0, 4, 7],                    // Major
  'maj': [0, 4, 7],
  'm': [0, 3, 7],                   // Minor
  'min': [0, 3, 7],
  'dim': [0, 3, 6],
  'aug': [0, 4, 8],
  'maj7': [0, 4, 7, 11],
  '7': [0, 4, 7, 10],               // Dom7
  'm7': [0, 3, 7, 10],
  'min7': [0, 3, 7, 10],
  'dim7': [0, 3, 6, 9],
  'm7b5': [0, 3, 6, 10],
  'sus2': [0, 2, 7],
  'sus4': [0, 5, 7],
  'add9': [0, 4, 7, 14],
  '6': [0, 4, 7, 9],
  'm6': [0, 3, 7, 9],
  '9': [0, 4, 7, 10, 14],
  'm9': [0, 3, 7, 10, 14],
  'maj9': [0, 4, 7, 11, 14],
  '11': [0, 4, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 17, 21]
};

/**
 * Convert note name to MIDI number
 * @param {string} noteName - Note name (e.g., 'c4', 'f#3', 'bb2')
 * @returns {number} MIDI note number (or 60 if parse fails)
 */
export function noteToMidi(noteName) {
  if (!noteName || noteName === '~' || noteName === '-') return null;

  const match = noteName.toLowerCase().match(/^([a-g])([#b]?)(-?\d+)?$/);
  if (!match) return 60; // Default to middle C

  let [, note, accidental, octaveStr] = match;
  let noteValue = NOTE_MAP[note];

  if (accidental === '#') noteValue++;
  else if (accidental === 'b') noteValue--;

  const octave = octaveStr ? parseInt(octaveStr, 10) : 4;
  return noteValue + (octave + 1) * 12;
}

/**
 * Convert MIDI number to note name
 * @param {number} midi - MIDI note number
 * @returns {string} Note name (e.g., 'c4')
 */
export function midiToNote(midi) {
  const noteNames = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${noteNames[noteIndex]}${octave}`;
}

/**
 * Parse chord symbol to array of MIDI notes
 * @param {string} chordSymbol - Chord symbol (e.g., 'Dm7', 'G', 'Bbmaj7')
 * @param {number} octave - Base octave (default 3)
 * @returns {number[]} Array of MIDI note numbers
 */
export function parseChord(chordSymbol, octave = 3) {
  if (!chordSymbol || chordSymbol === '~') return [];

  // Extract root note and chord type
  const match = chordSymbol.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return [];

  const [, rootNote, accidental, chordType] = match;
  const rootMidi = noteToMidi(`${rootNote}${accidental}${octave}`);

  // Get intervals for chord type
  const intervals = CHORD_TYPES[chordType.toLowerCase()] || CHORD_TYPES[''];

  return intervals.map(interval => rootMidi + interval);
}

// === Pattern Extraction ===

/**
 * Extract note sequence from pattern code
 * Handles: note('<c4 e4 g4>'), note('c4 e4 g4'), etc.
 * @param {string} patternCode - Strudel pattern code
 * @returns {string[]} Array of note names (may include '~' for silence)
 */
export function extractNotes(patternCode) {
  // Match note('<...>') or note("...")
  const noteMatch = patternCode.match(/note\s*\(\s*['"]<?([^'"<>]+)>?['"]/);
  if (!noteMatch) return [];

  const noteStr = noteMatch[1].trim();

  // Handle space-separated notes, possibly with sub-patterns
  // Split by space but preserve content within < > and ( )
  const tokens = tokenizePattern(noteStr);

  // Flatten into note names
  const notes = [];
  for (const token of tokens) {
    if (token === '~' || token === '-') {
      notes.push('~');
    } else if (token.includes('/')) {
      // Handle subdivision like 't/2' - just use t
      notes.push(token.split('/')[0]);
    } else if (token.match(/^[a-g][#b]?-?\d*$/i)) {
      notes.push(token.toLowerCase());
    }
  }

  return notes;
}

/**
 * Extract chord sequence from pattern code
 * Handles: chord('<Dm7 G7 C>'), chord("Am Dm"), etc.
 * @param {string} patternCode - Strudel pattern code
 * @returns {string[]} Array of chord symbols
 */
export function extractChords(patternCode) {
  // Match chord('<...>') or chord("...")
  const chordMatch = patternCode.match(/chord\s*\(\s*['"]<?([^'"<>]+)>?['"]/);
  if (!chordMatch) return [];

  const chordStr = chordMatch[1].trim();
  const tokens = tokenizePattern(chordStr);

  // Filter to valid chord symbols
  return tokens.filter(t => t !== '~' && t !== '-' && t.match(/^[A-Ga-g]/));
}

/**
 * Extract struct pattern from code
 * Handles: .struct('t ~ t ~'), .struct("t t t t")
 * @param {string} patternCode - Pattern code
 * @returns {string|null} Struct pattern or null
 */
export function extractStruct(patternCode) {
  const structMatch = patternCode.match(/\.struct\s*\(\s*['"]([^'"]+)['"]/);
  return structMatch ? structMatch[1].trim() : null;
}

/**
 * Extract sound/instrument from pattern
 * Handles: .s('piano'), s('kick')
 * @param {string} patternCode - Pattern code
 * @returns {string|null} Sound name or null
 */
export function extractSound(patternCode) {
  // Match .s('...') or s('...')
  const soundMatch = patternCode.match(/\.?s\s*\(\s*['"]([^'"]+)['"]/);
  return soundMatch ? soundMatch[1] : null;
}

/**
 * Extract numeric parameter value
 * Handles: .gain(0.8), .room(0.3), .lpf(800)
 * Also handles modulated params: .gain(sine.range(0.3,0.7)) -> 0.5
 * @param {string} patternCode - Pattern code
 * @param {string} param - Parameter name
 * @returns {number|null} Parameter value or null
 */
export function extractParam(patternCode, param) {
  // Try simple numeric value first
  const simpleMatch = patternCode.match(new RegExp(`\\.${param}\\s*\\(\\s*([\\d.]+)\\s*\\)`));
  if (simpleMatch) {
    return parseFloat(simpleMatch[1]);
  }

  // Try modulated value (sine.range, perlin.range)
  const modMatch = patternCode.match(new RegExp(`\\.${param}\\s*\\(\\s*(?:sine|perlin|rand)\\.range\\s*\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*\\)`));
  if (modMatch) {
    const min = parseFloat(modMatch[1]);
    const max = parseFloat(modMatch[2]);
    return (min + max) / 2; // Return average
  }

  return null;
}

/**
 * Extract time modifier (.slow or .fast)
 * @param {string} patternCode - Pattern code
 * @returns {number} Time multiplier (>1 for slow, <1 for fast, 1 for normal)
 */
export function extractTimeModifier(patternCode) {
  const slowMatch = patternCode.match(/\.slow\s*\(\s*([\d.]+)\s*\)/);
  if (slowMatch) return parseFloat(slowMatch[1]);

  const fastMatch = patternCode.match(/\.fast\s*\(\s*([\d.]+)\s*\)/);
  if (fastMatch) return 1 / parseFloat(fastMatch[1]);

  return 1;
}

/**
 * Check if pattern has .voicing() modifier
 * @param {string} patternCode - Pattern code
 * @returns {boolean}
 */
export function hasVoicing(patternCode) {
  return patternCode.includes('.voicing()');
}

// === Struct Pattern Processing ===

/**
 * Parse struct pattern to boolean steps array
 * Handles: 't ~ t ~', 't(3,8)', 't t/2 t t/2', etc.
 * @param {string} struct - Struct pattern string
 * @param {number} totalSteps - Total number of steps (default 16)
 * @returns {boolean[]} Steps array
 */
export function structToSteps(struct, totalSteps = 16) {
  if (!struct) return new Array(totalSteps).fill(false);

  // Handle euclidean rhythm: t(k,n)
  const eucMatch = struct.match(/t\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (eucMatch) {
    const k = parseInt(eucMatch[1], 10);
    const n = parseInt(eucMatch[2], 10);
    return euclideanRhythm(k, n, totalSteps);
  }

  // Parse regular struct pattern
  const tokens = struct.trim().split(/\s+/);
  const steps = new Array(totalSteps).fill(false);

  // Calculate step duration based on token count
  const stepDuration = totalSteps / tokens.length;

  tokens.forEach((token, tokenIndex) => {
    const stepIndex = Math.floor(tokenIndex * stepDuration);
    if (stepIndex < totalSteps) {
      if (token === 't' || token === '1' || token === 'x') {
        steps[stepIndex] = true;
      } else if (token.startsWith('t*')) {
        // Repeat pattern: t*4 = trigger 4 times
        const repeats = parseInt(token.slice(2), 10) || 1;
        const subDuration = stepDuration / repeats;
        for (let i = 0; i < repeats && stepIndex + i * subDuration < totalSteps; i++) {
          steps[Math.floor(stepIndex + i * subDuration)] = true;
        }
      } else if (token.includes('/')) {
        // Subdivision: t/2 = half duration, but still triggers
        steps[stepIndex] = true;
      }
      // '~' or '-' = silence (already false)
    }
  });

  return steps;
}

/**
 * Generate Euclidean rhythm
 * @param {number} k - Number of triggers
 * @param {number} n - Pattern length
 * @param {number} totalSteps - Total output steps
 * @returns {boolean[]} Steps array
 */
export function euclideanRhythm(k, n, totalSteps = 16) {
  // Generate euclidean pattern of length n
  const pattern = [];
  let bucket = 0;

  for (let i = 0; i < n; i++) {
    bucket += k;
    if (bucket >= n) {
      bucket -= n;
      pattern.push(true);
    } else {
      pattern.push(false);
    }
  }

  // Expand/compress to totalSteps
  const steps = new Array(totalSteps).fill(false);
  const ratio = n / totalSteps;

  for (let i = 0; i < totalSteps; i++) {
    const sourceIndex = Math.floor(i * ratio);
    if (sourceIndex < pattern.length && pattern[sourceIndex]) {
      steps[i] = true;
    }
  }

  return steps;
}

/**
 * Convert boolean steps to struct string
 * @param {boolean[]} steps - Steps array
 * @returns {string} Struct pattern string
 */
export function stepsToStruct(steps) {
  return steps.map(s => s ? 't' : '~').join(' ');
}

// === Main Conversion Functions ===

/**
 * Parse Strudel pattern to notes array
 * @param {string} patternCode - Strudel pattern code
 * @param {number} totalSteps - Total steps (default 16)
 * @param {Object} options - Options { voicingPreset, basePitch }
 * @returns {Array} Array of note objects { id, pitch, startBeat, duration, velocity }
 */
export function parseStrudelToNotes(patternCode, totalSteps = 16, options = {}) {
  const notes = [];
  const stepsPerBeat = totalSteps / 4;

  // Check for chord pattern
  const chordSymbols = extractChords(patternCode);
  if (chordSymbols.length > 0) {
    return parseChordPatternToNotes(patternCode, chordSymbols, totalSteps, options);
  }

  // Check for note pattern
  const noteNames = extractNotes(patternCode);
  if (noteNames.length === 0) return notes;

  // Get rhythm from struct
  const struct = extractStruct(patternCode);
  let stepTriggers;

  if (struct) {
    stepTriggers = structToSteps(struct, totalSteps);
  } else {
    // No struct - distribute notes evenly
    stepTriggers = new Array(totalSteps).fill(false);
    const spacing = totalSteps / noteNames.length;
    noteNames.forEach((_, i) => {
      stepTriggers[Math.floor(i * spacing)] = true;
    });
  }

  // Get time modifier
  const timeModifier = extractTimeModifier(patternCode);
  const velocity = extractParam(patternCode, 'gain') || 0.8;

  // Create notes at trigger points
  let noteIndex = 0;
  const triggeredSteps = stepTriggers.map((t, i) => t ? i : -1).filter(i => i >= 0);

  for (let i = 0; i < triggeredSteps.length; i++) {
    const stepIndex = triggeredSteps[i];
    const noteName = noteNames[noteIndex % noteNames.length];

    if (noteName !== '~' && noteName !== '-') {
      const pitch = noteToMidi(noteName);
      if (pitch !== null) {
        const startBeat = (stepIndex / stepsPerBeat) * timeModifier;

        // Calculate duration (until next note or 1 beat)
        const nextStep = triggeredSteps[i + 1] ?? totalSteps;
        const durationSteps = nextStep - stepIndex;
        const duration = Math.min((durationSteps / stepsPerBeat) * timeModifier, 1);

        notes.push({
          id: `note-${Date.now()}-${i}`,
          pitch,
          startBeat,
          duration,
          velocity
        });
      }
    }
    noteIndex++;
  }

  return notes;
}

/**
 * Parse chord pattern to notes array
 * @param {string} patternCode - Pattern code
 * @param {string[]} chordSymbols - Chord symbols
 * @param {number} totalSteps - Total steps
 * @param {Object} options - { voicingPreset }
 * @returns {Array} Notes array
 */
function parseChordPatternToNotes(patternCode, chordSymbols, totalSteps, options = {}) {
  const notes = [];
  const stepsPerBeat = totalSteps / 4;
  const velocity = extractParam(patternCode, 'gain') || 0.7;
  const timeModifier = extractTimeModifier(patternCode);

  // Get struct or distribute chords evenly
  const struct = extractStruct(patternCode);
  let chordTiming;

  if (struct) {
    const triggers = structToSteps(struct, totalSteps);
    chordTiming = triggers.map((t, i) => t ? i : -1).filter(i => i >= 0);
  } else {
    // Distribute chords evenly
    const spacing = totalSteps / chordSymbols.length;
    chordTiming = chordSymbols.map((_, i) => Math.floor(i * spacing));
  }

  // Check for voicing modifier
  const useVoicing = hasVoicing(patternCode);
  const voicingPreset = options.voicingPreset;

  chordTiming.forEach((stepIndex, i) => {
    const chordSymbol = chordSymbols[i % chordSymbols.length];
    let pitches;

    if (useVoicing && voicingPreset?.chords?.[chordSymbol]) {
      // Use voicing from preset
      const voicing = voicingPreset.chords[chordSymbol];
      const voicingType = options.voicingType || 'root';
      const voicingNotes = voicing[voicingType] || voicing.root || Object.values(voicing)[0];

      if (Array.isArray(voicingNotes)) {
        pitches = voicingNotes.map(n => noteToMidi(n));
      } else {
        pitches = parseChord(chordSymbol, 3);
      }
    } else {
      pitches = parseChord(chordSymbol, 3);
    }

    const startBeat = (stepIndex / stepsPerBeat) * timeModifier;
    const nextStep = chordTiming[i + 1] ?? totalSteps;
    const duration = Math.min(((nextStep - stepIndex) / stepsPerBeat) * timeModifier, 4);

    // Add each note in the chord
    pitches.forEach((pitch, noteIdx) => {
      if (pitch !== null) {
        notes.push({
          id: `chord-${Date.now()}-${i}-${noteIdx}`,
          pitch,
          startBeat,
          duration,
          velocity: velocity * (noteIdx === 0 ? 1 : 0.9) // Root slightly louder
        });
      }
    });
  });

  return notes;
}

/**
 * Parse Strudel pattern to steps array
 * @param {string} patternCode - Strudel pattern code
 * @param {number} totalSteps - Total steps (default 16)
 * @returns {boolean[]} Steps array
 */
export function parseStrudelToSteps(patternCode, totalSteps = 16) {
  // Check for struct pattern
  const struct = extractStruct(patternCode);
  if (struct) {
    return structToSteps(struct, totalSteps);
  }

  // Try to derive from note pattern
  const noteNames = extractNotes(patternCode);
  if (noteNames.length > 0) {
    const steps = new Array(totalSteps).fill(false);
    const spacing = totalSteps / noteNames.length;
    noteNames.forEach((note, i) => {
      if (note !== '~' && note !== '-') {
        steps[Math.floor(i * spacing)] = true;
      }
    });
    return steps;
  }

  // Try s('sound') pattern
  const soundMatch = patternCode.match(/^s\s*\(\s*['"]([^'"]+)['"]\s*\)/);
  if (soundMatch) {
    const sounds = soundMatch[1].split(/\s+/);
    const steps = new Array(totalSteps).fill(false);
    const spacing = totalSteps / sounds.length;
    sounds.forEach((sound, i) => {
      if (sound !== '~' && sound !== '-') {
        steps[Math.floor(i * spacing)] = true;
      }
    });
    return steps;
  }

  return new Array(totalSteps).fill(false);
}

/**
 * Extract all effects/params from pattern
 * @param {string} patternCode - Pattern code
 * @returns {Object} Effects object
 */
export function extractEffects(patternCode) {
  const effects = {};

  const gain = extractParam(patternCode, 'gain');
  if (gain !== null) effects.gain = gain;

  const room = extractParam(patternCode, 'room');
  if (room !== null) effects.room = room;

  const delay = extractParam(patternCode, 'delay');
  if (delay !== null) effects.delay = delay;

  const lpf = extractParam(patternCode, 'lpf');
  if (lpf !== null) effects.lpf = lpf;

  const hpf = extractParam(patternCode, 'hpf');
  if (hpf !== null) effects.hpf = hpf;

  const fm = extractParam(patternCode, 'fm');
  if (fm !== null) effects.fm = fm;

  const fmh = extractParam(patternCode, 'fmh');
  if (fmh !== null) effects.fmh = fmh;

  return effects;
}

/**
 * Parse a full voice pattern to voice data
 * @param {string} patternCode - Full Strudel pattern code
 * @param {number} totalSteps - Total steps (default 16)
 * @param {Object} options - { voicingPreset, voicingType }
 * @returns {Object} Voice data { notes, steps, sound, effects, timeModifier }
 */
export function parsePatternToVoiceData(patternCode, totalSteps = 16, options = {}) {
  return {
    notes: parseStrudelToNotes(patternCode, totalSteps, options),
    steps: parseStrudelToSteps(patternCode, totalSteps),
    sound: extractSound(patternCode),
    effects: extractEffects(patternCode),
    timeModifier: extractTimeModifier(patternCode),
    hasVoicing: hasVoicing(patternCode)
  };
}

// === Stack Pattern Handling ===

/**
 * Parse stack() pattern into array of sub-patterns
 * @param {string} patternCode - Pattern code containing stack(...)
 * @returns {string[]} Array of individual patterns
 */
export function parseStack(patternCode) {
  const stackMatch = patternCode.match(/stack\s*\(([\s\S]+)\)/);
  if (!stackMatch) return [patternCode];

  const content = stackMatch[1];

  // Split by comma, but respect parentheses
  const patterns = [];
  let depth = 0;
  let current = '';

  for (const char of content) {
    if (char === '(' || char === '[' || char === '{') {
      depth++;
      current += char;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      if (current.trim()) patterns.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) patterns.push(current.trim());
  return patterns;
}

// === Helper Functions ===

/**
 * Tokenize pattern string respecting nested structures
 * @param {string} pattern - Pattern string
 * @returns {string[]} Tokens
 */
function tokenizePattern(pattern) {
  const tokens = [];
  let current = '';
  let depth = 0;

  for (const char of pattern) {
    if (char === '<' || char === '(' || char === '[') {
      depth++;
      current += char;
    } else if (char === '>' || char === ')' || char === ']') {
      depth--;
      current += char;
    } else if (char === ' ' && depth === 0) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

/**
 * Detect if pattern code is for drums (rhythm only, no pitch)
 * @param {string} patternCode - Pattern code
 * @returns {boolean}
 */
export function isDrumPattern(patternCode) {
  // Has s() but no note() or chord()
  const hasSound = patternCode.match(/\.?s\s*\(/);
  const hasNotes = patternCode.match(/note\s*\(/) || patternCode.match(/chord\s*\(/);
  return hasSound && !hasNotes;
}

/**
 * Check if pattern is silent
 * @param {string} patternCode - Pattern code
 * @returns {boolean}
 */
export function isSilent(patternCode) {
  return patternCode.toLowerCase().trim() === 'silent' ||
         patternCode.trim() === '~' ||
         patternCode.trim() === '';
}

export default {
  noteToMidi,
  midiToNote,
  parseChord,
  extractNotes,
  extractChords,
  extractStruct,
  extractSound,
  extractParam,
  extractTimeModifier,
  extractEffects,
  hasVoicing,
  structToSteps,
  stepsToStruct,
  euclideanRhythm,
  parseStrudelToNotes,
  parseStrudelToSteps,
  parsePatternToVoiceData,
  parseStack,
  isDrumPattern,
  isSilent
};
