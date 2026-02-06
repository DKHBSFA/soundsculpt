/**
 * Music Theory Module - Scales, chords, intervals, and theory utilities
 */

// Note names
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Interval names
const INTERVAL_NAMES = [
  'unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd',
  'perfect 4th', 'tritone', 'perfect 5th', 'minor 6th', 'major 6th',
  'minor 7th', 'major 7th', 'octave'
];

// ============================================
// SCALE DEFINITIONS
// ============================================

/**
 * Scale intervals (semitones from root)
 */
export const SCALES = {
  // Major and minor
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  'harmonic-minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic-minor': [0, 2, 3, 5, 7, 9, 11],

  // Modes
  ionian: [0, 2, 4, 5, 7, 9, 11],      // Same as major
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],     // Same as natural minor
  locrian: [0, 1, 3, 5, 6, 8, 10],

  // Pentatonic
  'major-pentatonic': [0, 2, 4, 7, 9],
  'minor-pentatonic': [0, 3, 5, 7, 10],

  // Blues
  blues: [0, 3, 5, 6, 7, 10],

  // Other common scales
  'whole-tone': [0, 2, 4, 6, 8, 10],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/**
 * Scale display names
 */
export const SCALE_NAMES = {
  major: 'Major',
  minor: 'Natural Minor',
  'harmonic-minor': 'Harmonic Minor',
  'melodic-minor': 'Melodic Minor',
  ionian: 'Ionian',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  aeolian: 'Aeolian',
  locrian: 'Locrian',
  'major-pentatonic': 'Major Pentatonic',
  'minor-pentatonic': 'Minor Pentatonic',
  blues: 'Blues',
  'whole-tone': 'Whole Tone',
  diminished: 'Diminished',
  chromatic: 'Chromatic',
};

// ============================================
// CHORD DEFINITIONS
// ============================================

/**
 * Chord intervals (semitones from root)
 */
export const CHORDS = {
  // Triads
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],

  // Seventh chords
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  '7': [0, 4, 7, 10],         // Dominant 7th
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],        // Half-diminished
  minMaj7: [0, 3, 7, 11],
  aug7: [0, 4, 8, 10],

  // Extended chords
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  '9': [0, 4, 7, 10, 14],
  min9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  '11': [0, 4, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 17, 21],

  // Power chord
  '5': [0, 7],
};

/**
 * Chord display names and symbols
 */
export const CHORD_NAMES = {
  major: { name: 'Major', symbol: '' },
  minor: { name: 'Minor', symbol: 'm' },
  diminished: { name: 'Diminished', symbol: '°' },
  augmented: { name: 'Augmented', symbol: '+' },
  sus2: { name: 'Suspended 2nd', symbol: 'sus2' },
  sus4: { name: 'Suspended 4th', symbol: 'sus4' },
  maj7: { name: 'Major 7th', symbol: 'maj7' },
  min7: { name: 'Minor 7th', symbol: 'm7' },
  '7': { name: 'Dominant 7th', symbol: '7' },
  dim7: { name: 'Diminished 7th', symbol: '°7' },
  m7b5: { name: 'Half-Diminished', symbol: 'ø7' },
  minMaj7: { name: 'Minor Major 7th', symbol: 'mM7' },
  aug7: { name: 'Augmented 7th', symbol: '+7' },
  add9: { name: 'Add 9', symbol: 'add9' },
  madd9: { name: 'Minor Add 9', symbol: 'madd9' },
  '9': { name: 'Dominant 9th', symbol: '9' },
  min9: { name: 'Minor 9th', symbol: 'm9' },
  maj9: { name: 'Major 9th', symbol: 'maj9' },
  '11': { name: '11th', symbol: '11' },
  '13': { name: '13th', symbol: '13' },
  '5': { name: 'Power Chord', symbol: '5' },
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Convert note name to pitch class (0-11)
 * @param {string} noteName - e.g., 'C', 'C#', 'Db'
 * @returns {number} Pitch class (0-11)
 */
export function noteNameToPitchClass(noteName) {
  const name = noteName.charAt(0).toUpperCase();
  const accidental = noteName.slice(1);

  let pc = NOTE_NAMES.indexOf(name);
  if (pc === -1) {
    pc = NOTE_NAMES_FLAT.indexOf(name);
  }
  if (pc === -1) return 0;

  if (accidental === '#' || accidental === '♯') pc += 1;
  if (accidental === 'b' || accidental === '♭') pc -= 1;

  return ((pc % 12) + 12) % 12;
}

/**
 * Convert pitch class to note name
 * @param {number} pc - Pitch class (0-11)
 * @param {boolean} useFlats - Use flats instead of sharps
 * @returns {string} Note name
 */
export function pitchClassToNoteName(pc, useFlats = false) {
  const normalizedPc = ((pc % 12) + 12) % 12;
  return useFlats ? NOTE_NAMES_FLAT[normalizedPc] : NOTE_NAMES[normalizedPc];
}

/**
 * Convert MIDI note to note name with octave
 * @param {number} midiNote - MIDI note number (0-127)
 * @param {boolean} useFlats - Use flats instead of sharps
 * @returns {string} Note name with octave (e.g., 'C4')
 */
export function midiToNoteName(midiNote, useFlats = false) {
  const pc = midiNote % 12;
  const octave = Math.floor(midiNote / 12) - 1;
  return `${pitchClassToNoteName(pc, useFlats)}${octave}`;
}

/**
 * Convert note name with octave to MIDI note
 * @param {string} noteName - e.g., 'C4', 'C#4', 'Db4'
 * @returns {number} MIDI note number
 */
export function noteNameToMidi(noteName) {
  const match = noteName.match(/^([A-Ga-g][#b♯♭]?)(-?\d+)$/);
  if (!match) return 60; // Default to C4

  const pc = noteNameToPitchClass(match[1]);
  const octave = parseInt(match[2], 10);

  return (octave + 1) * 12 + pc;
}

/**
 * Get pitch class from MIDI note
 * @param {number} midiNote - MIDI note number
 * @returns {number} Pitch class (0-11)
 */
export function midiToPitchClass(midiNote) {
  return ((midiNote % 12) + 12) % 12;
}

// ============================================
// SCALE FUNCTIONS
// ============================================

/**
 * Get scale notes as pitch classes
 * @param {string} root - Root note name (e.g., 'C', 'F#')
 * @param {string} scaleType - Scale type from SCALES
 * @returns {number[]} Array of pitch classes
 */
export function getScalePitchClasses(root, scaleType) {
  const intervals = SCALES[scaleType];
  if (!intervals) return [0, 2, 4, 5, 7, 9, 11]; // Default to major

  const rootPc = noteNameToPitchClass(root);
  return intervals.map(interval => (rootPc + interval) % 12);
}

/**
 * Get scale notes as note names
 * @param {string} root - Root note name
 * @param {string} scaleType - Scale type
 * @returns {string[]} Array of note names
 */
export function getScaleNoteNames(root, scaleType) {
  const pitchClasses = getScalePitchClasses(root, scaleType);
  const rootPc = noteNameToPitchClass(root);

  // Determine if we should use flats based on root
  const useFlats = root.includes('b') || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(root);

  return pitchClasses.map(pc => pitchClassToNoteName(pc, useFlats));
}

/**
 * Check if a MIDI note is in a given scale
 * @param {number} midiNote - MIDI note number
 * @param {string} root - Scale root note
 * @param {string} scaleType - Scale type
 * @returns {boolean}
 */
export function isNoteInScale(midiNote, root, scaleType) {
  const scalePcs = getScalePitchClasses(root, scaleType);
  const notePc = midiToPitchClass(midiNote);
  return scalePcs.includes(notePc);
}

/**
 * Quantize a MIDI note to the nearest note in a scale
 * @param {number} midiNote - MIDI note number
 * @param {string} root - Scale root note
 * @param {string} scaleType - Scale type
 * @param {string} direction - 'nearest', 'up', 'down'
 * @returns {number} Quantized MIDI note
 */
export function quantizeToScale(midiNote, root, scaleType, direction = 'nearest') {
  if (isNoteInScale(midiNote, root, scaleType)) {
    return midiNote;
  }

  const scalePcs = getScalePitchClasses(root, scaleType);
  const notePc = midiToPitchClass(midiNote);

  // Find nearest scale degree
  let nearestUp = null;
  let nearestDown = null;

  for (let i = 0; i <= 12; i++) {
    const upPc = (notePc + i) % 12;
    const downPc = ((notePc - i) % 12 + 12) % 12;

    if (nearestUp === null && scalePcs.includes(upPc)) {
      nearestUp = i;
    }
    if (nearestDown === null && scalePcs.includes(downPc)) {
      nearestDown = i;
    }

    if (nearestUp !== null && nearestDown !== null) break;
  }

  if (direction === 'up') {
    return midiNote + nearestUp;
  }
  if (direction === 'down') {
    return midiNote - nearestDown;
  }

  // Nearest
  if (nearestUp <= nearestDown) {
    return midiNote + nearestUp;
  }
  return midiNote - nearestDown;
}

/**
 * Get scale degree of a note (1-7)
 * @param {number} midiNote - MIDI note number
 * @param {string} root - Scale root note
 * @param {string} scaleType - Scale type
 * @returns {number|null} Scale degree (1-7) or null if not in scale
 */
export function getScaleDegree(midiNote, root, scaleType) {
  const scalePcs = getScalePitchClasses(root, scaleType);
  const notePc = midiToPitchClass(midiNote);
  const index = scalePcs.indexOf(notePc);
  return index === -1 ? null : index + 1;
}

// ============================================
// CHORD FUNCTIONS
// ============================================

/**
 * Get chord notes as MIDI notes
 * @param {string} root - Root note with octave (e.g., 'C4')
 * @param {string} chordType - Chord type from CHORDS
 * @returns {number[]} Array of MIDI notes
 */
export function getChordMidi(root, chordType) {
  const intervals = CHORDS[chordType];
  if (!intervals) return [];

  const rootMidi = noteNameToMidi(root);
  return intervals.map(interval => rootMidi + interval);
}

/**
 * Get chord notes as note names
 * @param {string} root - Root note (e.g., 'C')
 * @param {string} chordType - Chord type
 * @returns {string[]} Array of note names (without octave)
 */
export function getChordNoteNames(root, chordType) {
  const intervals = CHORDS[chordType];
  if (!intervals) return [];

  const rootPc = noteNameToPitchClass(root);
  const useFlats = root.includes('b') || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(root);

  return intervals.map(interval => {
    const pc = (rootPc + interval) % 12;
    return pitchClassToNoteName(pc, useFlats);
  });
}

/**
 * Get diatonic chords for a scale
 * @param {string} root - Scale root
 * @param {string} scaleType - Scale type
 * @returns {Object[]} Array of chord objects with root, type, symbol
 */
export function getDiatonicChords(root, scaleType) {
  const scaleNotes = getScaleNoteNames(root, scaleType);

  // Chord quality for each scale degree (major scale pattern)
  const majorChordQualities = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'];
  const minorChordQualities = ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'];

  const isMinor = scaleType.includes('minor') || ['aeolian', 'dorian', 'phrygian', 'locrian'].includes(scaleType);
  const qualities = isMinor ? minorChordQualities : majorChordQualities;

  return scaleNotes.slice(0, 7).map((note, i) => {
    const quality = qualities[i] || 'major';
    const info = CHORD_NAMES[quality];
    return {
      root: note,
      type: quality,
      symbol: note + (info?.symbol || ''),
      degree: i + 1,
      romanNumeral: getRomanNumeral(i + 1, quality),
    };
  });
}

/**
 * Get Roman numeral for scale degree
 */
function getRomanNumeral(degree, quality) {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const numeral = numerals[degree - 1] || 'I';

  if (quality === 'minor' || quality === 'diminished') {
    return numeral.toLowerCase() + (quality === 'diminished' ? '°' : '');
  }
  return numeral + (quality === 'augmented' ? '+' : '');
}

/**
 * Get diatonic seventh chords for a scale
 */
export function getDiatonicSeventhChords(root, scaleType) {
  const scaleNotes = getScaleNoteNames(root, scaleType);

  const majorSeventhQualities = ['maj7', 'min7', 'min7', 'maj7', '7', 'min7', 'm7b5'];
  const minorSeventhQualities = ['min7', 'm7b5', 'maj7', 'min7', 'min7', 'maj7', '7'];

  const isMinor = scaleType.includes('minor') || ['aeolian', 'dorian', 'phrygian', 'locrian'].includes(scaleType);
  const qualities = isMinor ? minorSeventhQualities : majorSeventhQualities;

  return scaleNotes.slice(0, 7).map((note, i) => {
    const quality = qualities[i] || 'maj7';
    const info = CHORD_NAMES[quality];
    return {
      root: note,
      type: quality,
      symbol: note + (info?.symbol || ''),
      degree: i + 1,
    };
  });
}

// ============================================
// ARPEGGIATOR
// ============================================

/**
 * Arpeggiator patterns
 */
export const ARP_PATTERNS = {
  up: 'up',
  down: 'down',
  updown: 'updown',
  downup: 'downup',
  random: 'random',
  'up-oct': 'up-oct',     // Up with octave
  'down-oct': 'down-oct', // Down with octave
  'as-played': 'as-played',
};

/**
 * Generate arpeggiated note sequence
 * @param {number[]} notes - MIDI notes to arpeggiate
 * @param {string} pattern - Arpeggio pattern
 * @param {number} octaves - Number of octaves to span (1-4)
 * @returns {number[]} Sequence of MIDI notes
 */
export function generateArpSequence(notes, pattern = 'up', octaves = 1) {
  if (!notes.length) return [];

  // Sort notes for ordered patterns
  const sorted = [...notes].sort((a, b) => a - b);

  // Expand across octaves
  const expanded = [];
  for (let oct = 0; oct < octaves; oct++) {
    sorted.forEach(note => {
      expanded.push(note + (oct * 12));
    });
  }

  switch (pattern) {
    case 'up':
      return expanded;

    case 'down':
      return expanded.reverse();

    case 'updown':
      const updown = [...expanded];
      if (expanded.length > 1) {
        updown.push(...expanded.slice(1, -1).reverse());
      }
      return updown;

    case 'downup':
      const downup = [...expanded].reverse();
      if (expanded.length > 1) {
        downup.push(...expanded.slice(1, -1));
      }
      return downup;

    case 'random':
      return [...expanded].sort(() => Math.random() - 0.5);

    case 'up-oct':
      const upOct = [];
      sorted.forEach(note => {
        for (let oct = 0; oct < octaves; oct++) {
          upOct.push(note + (oct * 12));
        }
      });
      return upOct;

    case 'down-oct':
      const downOct = [];
      sorted.forEach(note => {
        for (let oct = octaves - 1; oct >= 0; oct--) {
          downOct.push(note + (oct * 12));
        }
      });
      return downOct;

    case 'as-played':
    default:
      const asPlayed = [];
      for (let oct = 0; oct < octaves; oct++) {
        notes.forEach(note => {
          asPlayed.push(note + (oct * 12));
        });
      }
      return asPlayed;
  }
}

// ============================================
// VOICE LEADING
// ============================================

/**
 * Calculate voice leading distance between two chords
 * Lower is better (smoother voice leading)
 * @param {number[]} chord1 - First chord (MIDI notes)
 * @param {number[]} chord2 - Second chord (MIDI notes)
 * @returns {number} Total semitone movement
 */
export function voiceLeadingDistance(chord1, chord2) {
  if (chord1.length !== chord2.length) {
    return Infinity;
  }

  // Simple: sum of smallest movements
  const sorted1 = [...chord1].sort((a, b) => a - b);
  const sorted2 = [...chord2].sort((a, b) => a - b);

  return sorted1.reduce((sum, note1, i) => {
    return sum + Math.abs(note1 - sorted2[i]);
  }, 0);
}

/**
 * Find best voicing for chord to minimize voice leading from previous chord
 * @param {number[]} targetNotes - Target chord pitch classes
 * @param {number[]} previousChord - Previous chord MIDI notes
 * @param {number} baseOctave - Base octave (MIDI note range)
 * @returns {number[]} Best voicing as MIDI notes
 */
export function findBestVoicing(targetNotes, previousChord, baseOctave = 60) {
  if (!previousChord.length) {
    // No previous chord, return default voicing
    return targetNotes.map((pc, i) => baseOctave + pc + (i > 0 && pc < targetNotes[0] ? 12 : 0));
  }

  // Generate possible voicings (within an octave range)
  const voicings = [];

  // For each note, try different octave placements
  const generateVoicings = (index, current) => {
    if (index === targetNotes.length) {
      voicings.push([...current]);
      return;
    }

    const pc = targetNotes[index];
    // Try placing note in different octaves near the base
    for (let oct = -1; oct <= 1; oct++) {
      const midi = baseOctave + pc + (oct * 12);
      if (midi >= 36 && midi <= 96) { // Reasonable range
        current.push(midi);
        generateVoicings(index + 1, current);
        current.pop();
      }
    }
  };

  generateVoicings(0, []);

  // Find voicing with minimum voice leading distance
  let bestVoicing = voicings[0] || targetNotes.map(pc => baseOctave + pc);
  let minDistance = Infinity;

  for (const voicing of voicings) {
    const distance = voiceLeadingDistance(previousChord, voicing);
    if (distance < minDistance) {
      minDistance = distance;
      bestVoicing = voicing;
    }
  }

  return bestVoicing.sort((a, b) => a - b);
}

/**
 * Suggest next chords based on current chord and scale
 * @param {string} currentRoot - Current chord root
 * @param {string} currentType - Current chord type
 * @param {string} scaleRoot - Scale root
 * @param {string} scaleType - Scale type
 * @returns {Object[]} Array of chord suggestions with scores
 */
export function suggestNextChords(currentRoot, currentType, scaleRoot, scaleType) {
  const diatonic = getDiatonicChords(scaleRoot, scaleType);
  const currentPc = noteNameToPitchClass(currentRoot);

  // Common progressions patterns (scale degree movements)
  const commonProgressions = {
    1: [4, 5, 6],      // I -> IV, V, vi
    2: [5, 4, 7],      // ii -> V, IV, vii
    3: [6, 4, 2],      // iii -> vi, IV, ii
    4: [5, 1, 2],      // IV -> V, I, ii
    5: [1, 6, 4],      // V -> I, vi, IV
    6: [4, 2, 5],      // vi -> IV, ii, V
    7: [1, 3, 5],      // vii° -> I, iii, V
  };

  // Find current chord's degree
  const currentDegree = diatonic.findIndex(c =>
    noteNameToPitchClass(c.root) === currentPc && c.type === currentType
  ) + 1;

  const suggestions = diatonic.map(chord => {
    const progressionScore = commonProgressions[currentDegree]?.includes(chord.degree) ? 2 : 0;

    return {
      ...chord,
      score: progressionScore,
      isCommon: progressionScore > 0,
    };
  });

  // Sort by score (common progressions first)
  return suggestions.sort((a, b) => b.score - a.score);
}

// ============================================
// EXPORT STATE HELPERS
// ============================================

/**
 * Create default scale state
 */
export function createDefaultScaleState() {
  return {
    root: 'C',
    type: 'major',
    quantize: false,
  };
}

/**
 * Create default arpeggiator state
 */
export function createDefaultArpState() {
  return {
    enabled: false,
    pattern: 'up',
    octaves: 1,
    rate: '1/8', // Note division
    gate: 0.8,   // Note length as fraction of rate
  };
}
