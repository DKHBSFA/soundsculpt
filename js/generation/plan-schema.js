/**
 * SoundSculpt Engine v2 - Compositional Plan Schema
 *
 * Defines the JSON schema for AI-generated compositional plans.
 * The AI generates declarative JSON, NOT Strudel code.
 */

/**
 * JSON Schema for Compositional Plan
 */
export const PLAN_SCHEMA = {
  "$schema": "soundsculpt-plan-v2",

  // Metadata
  metadata: {
    style: "string",           // e.g., "cinematic", "jazz", "electronic"
    family: "string",          // "tonal", "modal", "loop", "experimental"
    intent: "string",          // Human-readable description
    key: {
      root: "string",          // e.g., "D"
      mode: "string",          // "major" or "minor"
      modulatesTo: ["string"]  // Optional modulation targets
    },
    tempo: {
      bpm: "number"            // 40-200
    },
    timeSignature: ["number", "number"],  // e.g., [4, 4]
    totalBars: "number"        // Total bars in piece
  },

  // Form structure
  form: {
    phases: [{
      name: "string",          // "intro", "build", "climax", "resolve"
      bars: ["number", "number"],  // [startBar, endBar]
      dynamic: "string",       // "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"
      texture: "string"        // "sparse", "layered", "tutti"
    }],
    cadences: [{
      bar: "number",           // Bar number of cadence
      type: "string",          // "authentic", "plagal", "half", "deceptive"
      chords: ["string"]       // e.g., ["V7", "I"]
    }]
  },

  // Harmony
  harmony: {
    progression: [{
      bar: "number",
      chord: "string",         // Roman numeral or symbol
      duration: "number",      // Bars
      function: "string"       // "T" (tonic), "SD" (subdominant), "D" (dominant)
    }],
    voicings: {
      // Per-phase voicing style
      intro: "string",         // "spread", "drop2", "close", "open"
      build: "string",
      climax: "string",
      resolve: "string"
    }
  },

  // Orchestration
  orchestration: {
    voices: [{
      id: "string",            // Unique voice identifier
      instrument: {
        family: "string",      // "strings", "brass", "woodwinds", "percussion", "synth", "choir"
        type: "string",        // Specific instrument
        articulation: "string" // "legato", "staccato", "tremolo", "marcato", etc.
      },
      role: "string",          // "foundation", "harmonic-bed", "texture", "accent", "rhythmic-anchor", "climax-power"
      soundfont: "string|null", // GM soundfont name or null for synth
      activePhases: ["string"], // Which phases this voice plays
      register: {
        low: "string",         // e.g., "C2"
        high: "string"         // e.g., "G5"
      }
    }]
  },

  // Melodic content per voice
  melodicContent: {
    voices: {
      // voiceId: { phase: content }
    }
  },

  // Rhythmic content per voice
  rhythmicContent: {
    voices: {
      // voiceId: { phase: content }
    }
  },

  // Transition effects
  transitions: {
    // "phase_to_phase": { type, bars, elements }
  },

  // Effects
  effects: {
    global: {},
    perVoice: {}
  }
};

/**
 * Valid dynamic markings
 */
export const DYNAMICS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];

/**
 * Dynamic to gain mapping
 */
export const DYNAMIC_GAIN = {
  ppp: 0.12,
  pp: 0.22,
  p: 0.35,
  mp: 0.5,
  mf: 0.65,
  f: 0.8,
  ff: 0.92,
  fff: 1.0
};

/**
 * Valid phase names
 */
export const PHASES = ['intro', 'build', 'climax', 'resolve'];

/**
 * Valid texture types
 */
export const TEXTURES = ['sparse', 'layered', 'tutti'];

/**
 * Valid cadence types
 */
export const CADENCE_TYPES = ['authentic', 'plagal', 'half', 'deceptive'];

/**
 * Style families
 */
export const STYLE_FAMILIES = {
  tonal: ['jazz', 'orchestral', 'neo-classical', 'acoustic', 'cinematic', 'corporate', 'upbeat', 'world'],
  modal: ['ambient', 'chillwave', 'lo-fi'],
  loop: ['dnb', 'trap', 'minimal-techno', 'synthwave', 'electronic'],
  experimental: ['glitch', 'industrial', 'dramatic', 'horror']
};

/**
 * Voice roles and their characteristics
 */
export const VOICE_ROLES = {
  'foundation': {
    description: 'Bass instruments providing harmonic foundation',
    registerRange: ['C1', 'C3'],
    examples: ['sub-bass', 'cello', 'contrabass', 'bass-synth']
  },
  'harmonic-bed': {
    description: 'Chords and pads providing harmonic support',
    registerRange: ['C3', 'C5'],
    examples: ['strings', 'piano', 'pads', 'organ']
  },
  'texture': {
    description: 'High-frequency detail and shimmer',
    registerRange: ['C4', 'C7'],
    examples: ['violin-tremolo', 'hats', 'shakers', 'bells']
  },
  'rhythmic-anchor': {
    description: 'Rhythmic foundation',
    registerRange: ['C2', 'C4'],
    examples: ['timpani', 'kick', 'snare', 'toms']
  },
  'accent': {
    description: 'Melodic punctuation and emphasis',
    registerRange: ['C3', 'C6'],
    examples: ['brass-fanfare', 'lead-synth', 'stabs']
  },
  'climax-power': {
    description: 'Added at climax for maximum impact',
    registerRange: ['C3', 'C5'],
    examples: ['choir', 'tutti-strings', 'power-chords']
  }
};

/**
 * Available soundfont instruments (General MIDI)
 */
export const SOUNDFONT_INSTRUMENTS = {
  // Piano
  piano: 'gm_acoustic_grand_piano',
  electric_piano: 'gm_electric_piano_1',

  // Strings
  violin: 'gm_violin',
  viola: 'gm_viola',
  cello: 'gm_cello',
  contrabass: 'gm_contrabass',
  string_ensemble: 'gm_string_ensemble_1',
  tremolo_strings: 'gm_tremolo_strings',
  pizzicato: 'gm_pizzicato_strings',

  // Brass
  trumpet: 'gm_trumpet',
  trombone: 'gm_trombone',
  french_horn: 'gm_french_horn',
  tuba: 'gm_tuba',
  brass_section: 'gm_brass_section',

  // Woodwinds
  flute: 'gm_flute',
  oboe: 'gm_oboe',
  clarinet: 'gm_clarinet',
  bassoon: 'gm_bassoon',

  // Percussion
  timpani: 'gm_timpani',
  orchestral_harp: 'gm_orchestral_harp',

  // Choir
  choir_aahs: 'gm_choir_aahs',
  voice_oohs: 'gm_voice_oohs',

  // Synth (null - use native Strudel synth)
  sine: null,
  sawtooth: null,
  square: null,
  triangle: null
};

/**
 * Melodic content types
 */
export const MELODIC_TYPES = {
  sustained: 'Long held notes',
  pedal: 'Bass pedal tone',
  arpeggiated: 'Broken chord pattern',
  melodic: 'Melodic line',
  ascending: 'Rising melodic line',
  descending: 'Falling melodic line',
  motif: 'Short recurring theme',
  unison: 'Doubling another voice'
};

/**
 * Transition types
 */
export const TRANSITION_TYPES = {
  crescendo: 'Gradual volume increase',
  decrescendo: 'Gradual volume decrease',
  riser: 'Building energy with elements',
  'subito-piano': 'Sudden drop to quiet',
  'subito-forte': 'Sudden jump to loud',
  crossfade: 'Smooth transition between textures'
};

/**
 * Validate a compositional plan structure
 * @param {Object} plan - The plan to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePlanStructure(plan) {
  const errors = [];

  // Check required top-level properties
  if (!plan.metadata) errors.push('Missing metadata');
  if (!plan.form) errors.push('Missing form');
  if (!plan.orchestration) errors.push('Missing orchestration');

  // Validate metadata
  if (plan.metadata) {
    if (!plan.metadata.style) errors.push('Missing metadata.style');
    if (!plan.metadata.key?.root) errors.push('Missing metadata.key.root');
    if (!plan.metadata.tempo?.bpm) errors.push('Missing metadata.tempo.bpm');
    if (typeof plan.metadata.totalBars !== 'number') errors.push('Missing metadata.totalBars');

    // Validate tempo range
    if (plan.metadata.tempo?.bpm < 40 || plan.metadata.tempo?.bpm > 200) {
      errors.push('Tempo must be between 40-200 BPM');
    }
  }

  // Validate form
  if (plan.form) {
    if (!Array.isArray(plan.form.phases) || plan.form.phases.length === 0) {
      errors.push('form.phases must be a non-empty array');
    } else {
      plan.form.phases.forEach((phase, i) => {
        if (!PHASES.includes(phase.name)) {
          errors.push(`Invalid phase name at index ${i}: ${phase.name}`);
        }
        if (!Array.isArray(phase.bars) || phase.bars.length !== 2) {
          errors.push(`Invalid bars range at phase ${i}`);
        }
        if (!DYNAMICS.includes(phase.dynamic)) {
          errors.push(`Invalid dynamic at phase ${i}: ${phase.dynamic}`);
        }
      });
    }

    // Validate cadences (optional but must be valid if present)
    if (plan.form.cadences) {
      plan.form.cadences.forEach((cad, i) => {
        if (!CADENCE_TYPES.includes(cad.type)) {
          errors.push(`Invalid cadence type at index ${i}: ${cad.type}`);
        }
      });
    }
  }

  // Validate orchestration
  if (plan.orchestration) {
    if (!Array.isArray(plan.orchestration.voices) || plan.orchestration.voices.length === 0) {
      errors.push('orchestration.voices must be a non-empty array');
    } else {
      plan.orchestration.voices.forEach((voice, i) => {
        if (!voice.id) errors.push(`Missing voice id at index ${i}`);
        if (!voice.instrument?.family) errors.push(`Missing instrument.family at voice ${i}`);
        if (!Array.isArray(voice.activePhases)) errors.push(`Missing activePhases at voice ${i}`);
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get style family for a given style
 * @param {string} style - The style name
 * @returns {string} Family name
 */
export function getStyleFamily(style) {
  for (const [family, styles] of Object.entries(STYLE_FAMILIES)) {
    if (styles.includes(style)) return family;
  }
  return 'loop'; // Default
}

/**
 * Create a minimal valid plan structure
 * @param {Object} options - Generation options
 * @returns {Object} Minimal plan structure
 */
export function createMinimalPlan(options = {}) {
  const { style = 'cinematic', duration = 30, energy = 70, key = 'D minor' } = options;
  const [root, mode] = key.split(' ');
  const bpm = 72;
  const totalBars = Math.ceil(duration / ((60 / bpm) * 4));

  return {
    metadata: {
      style,
      family: getStyleFamily(style),
      intent: `Generated ${style} piece`,
      key: { root: root || 'D', mode: mode || 'minor', modulatesTo: [] },
      tempo: { bpm },
      timeSignature: [4, 4],
      totalBars
    },
    form: {
      phases: [
        { name: 'intro', bars: [0, Math.floor(totalBars * 0.15)], dynamic: 'pp', texture: 'sparse' },
        { name: 'build', bars: [Math.floor(totalBars * 0.15), Math.floor(totalBars * 0.5)], dynamic: 'mf', texture: 'layered' },
        { name: 'climax', bars: [Math.floor(totalBars * 0.5), Math.floor(totalBars * 0.85)], dynamic: 'ff', texture: 'tutti' },
        { name: 'resolve', bars: [Math.floor(totalBars * 0.85), totalBars], dynamic: 'p', texture: 'sparse' }
      ],
      cadences: []
    },
    harmony: {
      progression: [],
      voicings: { intro: 'spread', build: 'drop2', climax: 'close', resolve: 'spread' }
    },
    orchestration: { voices: [] },
    melodicContent: { voices: {} },
    rhythmicContent: { voices: {} },
    transitions: {},
    effects: { global: { reverb: 0.3 }, perVoice: {} }
  };
}
