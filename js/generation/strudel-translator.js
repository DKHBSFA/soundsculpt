/**
 * SoundSculpt Engine v2 - Strudel Translator
 *
 * Converts JSON Compositional Plans to Strudel patterns.
 * Handles both soundfont instruments (orchestral) and native synths (electronic).
 */

import { DYNAMIC_GAIN, SOUNDFONT_INSTRUMENTS } from './plan-schema.js';
import { noteNameToMidi, midiToNoteName } from '../music-theory.js';

/**
 * Translate a compositional plan to Strudel voice patterns
 * @param {Object} plan - Validated compositional plan
 * @param {Object} preset - Style preset (optional)
 * @returns {Object[]} Array of voice objects with Strudel patterns
 */
export function translateToStrudel(plan, preset = {}) {
  const voices = [];
  const phases = plan.form?.phases || [];

  for (const voiceConfig of (plan.orchestration?.voices || [])) {
    const patternCode = {};

    for (const phase of phases) {
      if (!voiceConfig.activePhases?.includes(phase.name)) {
        patternCode[phase.name] = 'silence';
        continue;
      }

      const melodicContent = plan.melodicContent?.voices?.[voiceConfig.id]?.[phase.name];
      const rhythmContent = plan.rhythmicContent?.voices?.[voiceConfig.id]?.[phase.name];
      const voiceEffects = plan.effects?.perVoice?.[voiceConfig.id] || {};
      const globalEffects = plan.effects?.global || {};

      let pattern = buildPattern(voiceConfig, melodicContent, rhythmContent, phase, plan);
      pattern = applyEffects(pattern, voiceEffects, globalEffects);
      pattern = applyDynamics(pattern, phase.dynamic, melodicContent?.dynamic);

      patternCode[phase.name] = pattern;
    }

    voices.push({
      id: voiceConfig.id,
      name: formatVoiceName(voiceConfig.id),
      type: voiceConfig.instrument?.family === 'percussion' ? 'drum' : 'melodic',
      patternCode,
      soundfont: voiceConfig.soundfont,
      instrument: voiceConfig.instrument,
      role: voiceConfig.role
    });
  }

  return voices;
}

/**
 * Build a Strudel pattern for a voice in a phase
 * @param {Object} voiceConfig - Voice configuration
 * @param {Object} melodic - Melodic content for this phase
 * @param {Object} rhythm - Rhythmic content for this phase
 * @param {Object} phase - Phase configuration
 * @param {Object} plan - Full plan for context
 * @returns {string} Strudel pattern code
 */
function buildPattern(voiceConfig, melodic, rhythm, phase, plan) {
  const { instrument, soundfont } = voiceConfig;

  // Soundfont instrument (orchestral)
  if (soundfont) {
    return buildSoundfontPattern(soundfont, melodic, rhythm, voiceConfig, plan);
  }

  // Synth instrument (electronic)
  return buildSynthPattern(instrument, melodic, rhythm, voiceConfig, plan);
}

/**
 * Build pattern for soundfont instruments
 * @param {string} soundfont - Soundfont name
 * @param {Object} melodic - Melodic content
 * @param {Object} rhythm - Rhythmic content
 * @param {Object} voiceConfig - Voice configuration
 * @param {Object} plan - Full plan
 * @returns {string} Strudel pattern
 */
function buildSoundfontPattern(soundfont, melodic, rhythm, voiceConfig, plan) {
  const sfName = getSoundfontName(soundfont);

  // Percussion/rhythmic voice
  if (voiceConfig.instrument?.family === 'percussion' || rhythm) {
    const pitches = rhythm?.pitches || voiceConfig.pitches || [plan.metadata?.key?.root + '2' || 'c3'];
    const struct = densityToStruct(rhythm?.density || 0.25);
    const noteStr = pitches.map(p => p.toLowerCase()).join(' ');
    return `note("<${noteStr}>").s("${sfName}").struct("${struct}")`;
  }

  // No melodic content - simple sustained
  if (!melodic) {
    const rootNote = (plan.metadata?.key?.root || 'C') + '3';
    return `note("${rootNote.toLowerCase()}").s("${sfName}").slow(8)`;
  }

  // Build based on melodic type
  switch (melodic.type) {
    case 'sustained':
    case 'pedal': {
      const note = melodic.notes?.[0]?.toLowerCase() || 'c3';
      const slow = melodic.type === 'pedal' ? 8 : 4;
      return `note("${note}").s("${sfName}").slow(${slow})`;
    }

    case 'arpeggiated': {
      const chordNotes = melodic.notes || getChordNotesFromPlan(plan);
      const noteStr = chordNotes.map(n => n.toLowerCase()).join(' ');
      const rate = melodic.rate || '1/4';
      const pattern = melodic.pattern || 'up';
      // For arpeggio, use fast to control rate
      const fastVal = rate === '1/8' ? 2 : rate === '1/2' ? 0.5 : 1;
      return `note("<${noteStr}>").s("${sfName}").fast(${fastVal})`;
    }

    case 'motif':
    case 'melodic': {
      const notes = melodic.notes?.map(n => n.toLowerCase()).join(' ') || 'c4';
      const rhythm = melodic.rhythm;
      if (rhythm && Array.isArray(rhythm)) {
        // Apply rhythm as durations
        const durPattern = rhythm.join(' ');
        return `note("<${notes}>").s("${sfName}").dur("<${durPattern}>")`;
      }
      return `note("<${notes}>").s("${sfName}")`;
    }

    case 'ascending':
    case 'descending': {
      const notes = melodic.notes?.map(n => n.toLowerCase()) || ['c4', 'd4', 'e4', 'f4'];
      const noteStr = melodic.type === 'descending' ? notes.reverse().join(' ') : notes.join(' ');
      return `note("<${noteStr}>").s("${sfName}")`;
    }

    case 'unison': {
      // Doubling another voice - just use their first note
      const note = melodic.notes?.[0]?.toLowerCase() || 'c4';
      return `note("${note}").s("${sfName}")`;
    }

    default: {
      const note = melodic.notes?.[0]?.toLowerCase() || 'c4';
      return `note("${note}").s("${sfName}")`;
    }
  }
}

/**
 * Build pattern for synth instruments
 * @param {Object} instrument - Instrument configuration
 * @param {Object} melodic - Melodic content
 * @param {Object} rhythm - Rhythmic content
 * @param {Object} voiceConfig - Voice configuration
 * @param {Object} plan - Full plan
 * @returns {string} Strudel pattern
 */
function buildSynthPattern(instrument, melodic, rhythm, voiceConfig, plan) {
  const synthType = instrument?.type || 'sawtooth';

  // Rhythm-only (drums/percussion)
  if (rhythm && !melodic) {
    const struct = densityToStruct(rhythm.density || 0.25);
    const note = 'c3';
    let pattern = `s("${synthType}").note("${note}").struct("${struct}")`;
    if (instrument?.lpf) pattern += `.lpf(${instrument.lpf})`;
    return pattern;
  }

  // No content - fallback
  if (!melodic) {
    const root = plan.metadata?.key?.root || 'C';
    return `note("${root.toLowerCase()}3").s("${synthType}")`;
  }

  // Build based on melodic content
  const notes = melodic.notes?.map(n => n.toLowerCase()) || ['c3'];
  let pattern;

  switch (melodic.type) {
    case 'pedal':
    case 'sustained':
      pattern = `note("${notes[0]}").s("${synthType}").slow(8)`;
      break;

    case 'arpeggiated': {
      const noteStr = notes.join(' ');
      pattern = `note("<${noteStr}>").s("${synthType}")`;
      break;
    }

    case 'motif':
    case 'melodic':
    case 'ascending':
    case 'descending': {
      const noteStr = notes.join(' ');
      pattern = `note("<${noteStr}>").s("${synthType}")`;
      break;
    }

    default:
      pattern = `note("<${notes.join(' ')}>").s("${synthType}")`;
  }

  // Apply synth-specific filters
  if (instrument?.lpf) pattern += `.lpf(${instrument.lpf})`;
  if (instrument?.hpf) pattern += `.hpf(${instrument.hpf})`;
  if (instrument?.resonance) pattern += `.resonance(${instrument.resonance})`;

  return pattern;
}

/**
 * Apply effects to a pattern
 * @param {string} pattern - Base pattern
 * @param {Object} voiceEffects - Per-voice effects
 * @param {Object} globalEffects - Global effects
 * @returns {string} Pattern with effects
 */
function applyEffects(pattern, voiceEffects, globalEffects) {
  const effects = { ...globalEffects, ...voiceEffects };
  let result = pattern;

  // Room/reverb
  if (effects.reverb !== undefined && !result.includes('.room(')) {
    result += `.room(${effects.reverb})`;
  }

  // Delay
  if (effects.delay !== undefined && !result.includes('.delay(')) {
    result += `.delay(${effects.delay})`;
  }

  // Chorus
  if (effects.chorus !== undefined && !result.includes('.chorus(')) {
    // Strudel doesn't have native chorus, simulate with slight detune + delay
    result += `.room(${effects.chorus * 0.3})`;
  }

  // Pan
  if (effects.pan !== undefined && !result.includes('.pan(')) {
    result += `.pan(${effects.pan})`;
  }

  return result;
}

/**
 * Apply dynamics (gain) to a pattern
 * @param {string} pattern - Pattern string
 * @param {string} phaseDynamic - Phase dynamic marking
 * @param {string} contentDynamic - Content-specific dynamic
 * @returns {string} Pattern with gain
 */
function applyDynamics(pattern, phaseDynamic, contentDynamic) {
  // Content dynamic overrides phase dynamic
  const dynamic = contentDynamic || phaseDynamic || 'mf';
  const gain = DYNAMIC_GAIN[dynamic] || 0.65;

  if (!pattern.includes('.gain(')) {
    return `${pattern}.gain(${gain})`;
  }
  return pattern;
}

/**
 * Convert density (0-1) to Strudel struct pattern
 * @param {number} density - Density value
 * @returns {string} Struct pattern string
 */
function densityToStruct(density) {
  const steps = 8;
  const triggers = Math.round(density * steps);

  if (triggers === 0) return '~ ~ ~ ~ ~ ~ ~ ~';
  if (triggers === steps) return 't t t t t t t t';

  // Euclidean-ish distribution
  const pattern = [];
  let bucket = 0;

  for (let i = 0; i < steps; i++) {
    bucket += triggers;
    if (bucket >= steps) {
      bucket -= steps;
      pattern.push('t');
    } else {
      pattern.push('~');
    }
  }

  return pattern.join(' ');
}

/**
 * Get soundfont GM name
 * @param {string} soundfont - Short soundfont name
 * @returns {string} Full GM soundfont name
 */
function getSoundfontName(soundfont) {
  // If already prefixed with gm_
  if (soundfont.startsWith('gm_')) {
    return soundfont;
  }

  // Look up in mapping
  const mapped = SOUNDFONT_INSTRUMENTS[soundfont];
  if (mapped) {
    return mapped;
  }

  // Common mappings
  const shortcuts = {
    'piano': 'gm_acoustic_grand_piano',
    'violin': 'gm_violin',
    'viola': 'gm_viola',
    'cello': 'gm_cello',
    'contrabass': 'gm_contrabass',
    'tremolo_strings': 'gm_tremolo_strings',
    'string_ensemble': 'gm_string_ensemble_1',
    'french_horn': 'gm_french_horn',
    'trumpet': 'gm_trumpet',
    'trombone': 'gm_trombone',
    'tuba': 'gm_tuba',
    'brass_section': 'gm_brass_section',
    'flute': 'gm_flute',
    'oboe': 'gm_oboe',
    'clarinet': 'gm_clarinet',
    'bassoon': 'gm_bassoon',
    'timpani': 'gm_timpani',
    'harp': 'gm_orchestral_harp',
    'choir_aahs': 'gm_choir_aahs',
    'choir': 'gm_choir_aahs',
    'voice_oohs': 'gm_voice_oohs'
  };

  return shortcuts[soundfont] || `gm_${soundfont}`;
}

/**
 * Format voice ID to display name
 * @param {string} id - Voice ID
 * @returns {string} Formatted name
 */
function formatVoiceName(id) {
  return id
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Extract chord notes from plan's harmony
 * @param {Object} plan - Compositional plan
 * @returns {string[]} Array of note names
 */
function getChordNotesFromPlan(plan) {
  const root = plan.metadata?.key?.root || 'C';
  const mode = plan.metadata?.key?.mode || 'minor';

  // Return basic triad
  if (mode === 'minor') {
    return [`${root}3`, `${root}3`.replace(root, getNote(root, 3)), `${root}3`.replace(root, getNote(root, 7))];
  }
  return [`${root}3`, `${root}3`.replace(root, getNote(root, 4)), `${root}3`.replace(root, getNote(root, 7))];
}

/**
 * Get note at interval from root
 * @param {string} root - Root note
 * @param {number} semitones - Semitones above root
 * @returns {string} Note name
 */
function getNote(root, semitones) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const idx = notes.indexOf(root.toUpperCase());
  if (idx === -1) return root;
  return notes[(idx + semitones) % 12];
}

/**
 * Generate a complete Strudel code string for all voices in a phase
 * @param {Object[]} voices - Voice patterns from translateToStrudel
 * @param {string} phase - Phase name
 * @returns {string} Complete Strudel code
 */
export function generatePhaseCode(voices, phase) {
  const activePatterns = voices
    .filter(v => v.patternCode[phase] && v.patternCode[phase] !== 'silence')
    .map(v => `  // ${v.name}\n  ${v.patternCode[phase]}`);

  if (activePatterns.length === 0) {
    return 'silence';
  }

  return `stack(\n${activePatterns.join(',\n')}\n)`;
}

/**
 * Generate voice data for SoundSculpt state
 * @param {Object} plan - Compositional plan
 * @param {Object[]} translatedVoices - Voices from translateToStrudel
 * @returns {Object[]} Voices ready for SoundSculpt state
 */
export function generateSoundSculptVoices(plan, translatedVoices) {
  return translatedVoices.map((voice, index) => {
    // Combine all phase patterns into a single patternCode
    // For now, use the climax pattern as the main pattern (most complete)
    const mainPattern = voice.patternCode.climax ||
                       voice.patternCode.build ||
                       voice.patternCode.intro ||
                       voice.patternCode.resolve ||
                       'silence';

    return {
      id: `voice-${index}`,
      name: voice.name,
      type: voice.type,
      color: getVoiceColor(voice.role, index),
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      steps: [],
      notes: [],
      patternCode: mainPattern,
      phasedPatterns: voice.patternCode,
      soundfont: voice.soundfont,
      instrument: voice.instrument,
      role: voice.role
    };
  });
}

/**
 * Get a color for a voice based on role
 * @param {string} role - Voice role
 * @param {number} index - Voice index
 * @returns {string} Hex color
 */
function getVoiceColor(role, index) {
  const roleColors = {
    'foundation': '#4a5568',
    'harmonic-bed': '#2d3748',
    'texture': '#718096',
    'rhythmic-anchor': '#1a202c',
    'accent': '#e53e3e',
    'climax-power': '#dd6b20'
  };

  const fallbackColors = [
    '#4299e1', '#48bb78', '#ed8936', '#9f7aea',
    '#f56565', '#38b2ac', '#ed64a6', '#667eea'
  ];

  return roleColors[role] || fallbackColors[index % fallbackColors.length];
}
