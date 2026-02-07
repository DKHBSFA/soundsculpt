/**
 * SoundSculpt Engine v2 - Style-Specific Prompts
 *
 * Additional context for each musical style.
 */

/**
 * Detailed style definitions with instrumentation guidance
 */
export const STYLE_DEFINITIONS = {
  // TONAL FAMILY
  cinematic: {
    family: 'tonal',
    description: 'Epic film score with dramatic arc',
    tempo: { min: 60, max: 90, default: 72 },
    instruments: {
      required: ['strings', 'sub-bass'],
      climax: ['brass', 'timpani', 'choir'],
      texture: ['tremolo-strings', 'piano']
    },
    characteristics: [
      'Building tension with tremolo strings',
      'Brass fanfare at emotional peaks',
      'Timpani for drama and rhythm',
      'Choir entry at climax',
      'Wide dynamic range (pp to fff)',
      'Modulations to relative keys'
    ]
  },

  orchestral: {
    family: 'tonal',
    description: 'Classical orchestra composition',
    tempo: { min: 50, max: 140, default: 100 },
    instruments: {
      required: ['strings', 'woodwinds'],
      climax: ['brass', 'timpani', 'full-strings'],
      texture: ['violin-solo', 'flute', 'oboe']
    },
    characteristics: [
      'Four-part harmony',
      'Classical voice leading',
      'Proper cadences',
      'Tutti sections at climax',
      'Solo passages in intro/build'
    ]
  },

  jazz: {
    family: 'tonal',
    description: 'Jazz ensemble with swing feel',
    tempo: { min: 80, max: 160, default: 120 },
    instruments: {
      required: ['piano', 'bass', 'drums'],
      climax: ['brass-section', 'sax'],
      texture: ['brushes', 'ride-cymbal']
    },
    characteristics: [
      'Extended chords (7ths, 9ths, 13ths)',
      'Walking bass line',
      'Swing rhythm',
      'ii-V-I progressions',
      'Improvisation-like melodic lines',
      'Comping piano'
    ],
    swing: 0.66
  },

  'neo-classical': {
    family: 'tonal',
    description: 'Modern classical with minimal elements',
    tempo: { min: 60, max: 100, default: 80 },
    instruments: {
      required: ['piano', 'strings'],
      climax: ['full-strings', 'piano-octaves'],
      texture: ['violin-solo', 'cello']
    },
    characteristics: [
      'Arpeggiated piano',
      'Simple but emotional melodies',
      'Repetitive patterns with subtle variation',
      'Sparse orchestration'
    ]
  },

  acoustic: {
    family: 'tonal',
    description: 'Acoustic instruments, folk-influenced',
    tempo: { min: 70, max: 130, default: 100 },
    instruments: {
      required: ['acoustic-guitar', 'bass'],
      climax: ['strings', 'percussion'],
      texture: ['piano', 'shaker']
    },
    characteristics: [
      'Natural instrument sounds',
      'Simple chord progressions',
      'Fingerpicked guitar patterns',
      'Warm, organic feel'
    ]
  },

  corporate: {
    family: 'tonal',
    description: 'Upbeat corporate/commercial music',
    tempo: { min: 100, max: 130, default: 115 },
    instruments: {
      required: ['piano', 'acoustic-guitar', 'drums'],
      climax: ['strings', 'claps'],
      texture: ['bells', 'shaker']
    },
    characteristics: [
      'Positive, uplifting feel',
      'Major keys',
      'Consistent energy',
      'Clean production'
    ]
  },

  upbeat: {
    family: 'tonal',
    description: 'High energy positive music',
    tempo: { min: 110, max: 140, default: 125 },
    instruments: {
      required: ['synth-bass', 'drums', 'piano'],
      climax: ['brass-stabs', 'full-kit'],
      texture: ['claps', 'synth-lead']
    },
    characteristics: [
      'Driving rhythm',
      'Major tonality',
      'Build-drop structure',
      'Energetic'
    ]
  },

  world: {
    family: 'tonal',
    description: 'World music fusion',
    tempo: { min: 80, max: 130, default: 100 },
    instruments: {
      required: ['ethnic-percussion', 'bass'],
      climax: ['strings', 'brass'],
      texture: ['flute', 'sitar', 'tabla']
    },
    characteristics: [
      'World instrument flavors',
      'Polyrhythmic elements',
      'Modal influences',
      'Rich textures'
    ]
  },

  // MODAL FAMILY
  ambient: {
    family: 'modal',
    description: 'Atmospheric ambient soundscape',
    tempo: { min: 60, max: 90, default: 70 },
    instruments: {
      required: ['pad', 'drone'],
      climax: ['texture-synth', 'shimmer'],
      texture: ['bells', 'granular']
    },
    characteristics: [
      'Long sustained notes',
      'Slow evolution',
      'Wide reverb',
      'Minimal rhythmic content',
      'Static harmony',
      'Texture over melody'
    ]
  },

  chillwave: {
    family: 'modal',
    description: 'Nostalgic, dreamy electronic',
    tempo: { min: 80, max: 110, default: 90 },
    instruments: {
      required: ['synth-pad', 'bass'],
      climax: ['chorus-synth', 'drums'],
      texture: ['tape-effect', 'reverb-guitar']
    },
    characteristics: [
      'Vintage synth sounds',
      'Washed out production',
      'Nostalgic feel',
      'Lazy grooves'
    ]
  },

  'lo-fi': {
    family: 'modal',
    description: 'Lo-fi hip hop beats',
    tempo: { min: 70, max: 95, default: 85 },
    instruments: {
      required: ['piano', 'bass', 'vinyl-drums'],
      climax: ['rhodes', 'muted-trumpet'],
      texture: ['vinyl-crackle', 'tape-hiss']
    },
    characteristics: [
      'Dusty, warm sound',
      'Jazz chord samples',
      'Lazy, swung drums',
      'Vinyl noise texture',
      'Simple progressions'
    ],
    swing: 0.5
  },

  // LOOP FAMILY
  electronic: {
    family: 'loop',
    description: 'General electronic music',
    tempo: { min: 120, max: 140, default: 128 },
    instruments: {
      required: ['kick', 'bass', 'synth'],
      climax: ['lead', 'full-drums'],
      texture: ['hats', 'fx']
    },
    characteristics: [
      '4/4 kick pattern',
      'Synth bassline',
      'Build and drop',
      'Filter automation'
    ]
  },

  trap: {
    family: 'loop',
    description: 'Trap/hip-hop beats',
    tempo: { min: 130, max: 160, default: 140 },
    instruments: {
      required: ['808', 'hi-hats', 'snare'],
      climax: ['brass-hits', 'lead'],
      texture: ['fx', 'vox-chops']
    },
    characteristics: [
      '808 sub-bass slides',
      'Fast hi-hat rolls',
      'Hard snares',
      'Sparse melodic elements',
      'Half-time feel'
    ],
    swing: 0.1
  },

  dnb: {
    family: 'loop',
    description: 'Drum and bass',
    tempo: { min: 160, max: 180, default: 174 },
    instruments: {
      required: ['kick', 'snare', 'reese-bass'],
      climax: ['full-break', 'lead'],
      texture: ['hats', 'amens']
    },
    characteristics: [
      'Fast breakbeats',
      'Heavy bass (reese)',
      'Syncopated drums',
      'Build-drop structure'
    ]
  },

  'minimal-techno': {
    family: 'loop',
    description: 'Minimal techno grooves',
    tempo: { min: 120, max: 135, default: 126 },
    instruments: {
      required: ['kick', 'hats', 'bass'],
      climax: ['perc', 'stab'],
      texture: ['click', 'texture']
    },
    characteristics: [
      'Repetitive, hypnotic',
      'Subtle variations',
      'Sparse arrangement',
      '4/4 kick'
    ]
  },

  synthwave: {
    family: 'loop',
    description: '80s-inspired synthwave',
    tempo: { min: 100, max: 130, default: 118 },
    instruments: {
      required: ['arp-synth', 'bass', 'drums'],
      climax: ['lead', 'pad'],
      texture: ['gated-reverb', 'tom-fills']
    },
    characteristics: [
      '80s synth sounds',
      'Arpeggiated sequences',
      'Gated reverb drums',
      'Neon aesthetic'
    ]
  },

  // EXPERIMENTAL FAMILY
  glitch: {
    family: 'experimental',
    description: 'Glitchy, broken electronics',
    tempo: { min: 90, max: 150, default: 120 },
    instruments: {
      required: ['glitch-drums', 'bass'],
      climax: ['noise', 'granular'],
      texture: ['clicks', 'cuts']
    },
    characteristics: [
      'Broken rhythms',
      'Digital artifacts',
      'Cut-up samples',
      'Unexpected drops'
    ]
  },

  industrial: {
    family: 'experimental',
    description: 'Dark industrial sounds',
    tempo: { min: 100, max: 140, default: 120 },
    instruments: {
      required: ['metal-perc', 'distorted-bass'],
      climax: ['noise', 'screech'],
      texture: ['machinery', 'drone']
    },
    characteristics: [
      'Harsh, metallic sounds',
      'Heavy distortion',
      'Dark atmosphere',
      'Mechanical rhythms'
    ]
  },

  dramatic: {
    family: 'experimental',
    description: 'Intense dramatic soundscapes',
    tempo: { min: 60, max: 100, default: 80 },
    instruments: {
      required: ['strings', 'sub'],
      climax: ['brass', 'percussion', 'noise'],
      texture: ['drones', 'risers']
    },
    characteristics: [
      'Extreme dynamics',
      'Sudden contrasts',
      'Tension building',
      'Experimental orchestration'
    ]
  },

  horror: {
    family: 'experimental',
    description: 'Horror/suspense soundtrack',
    tempo: { min: 50, max: 90, default: 70 },
    instruments: {
      required: ['strings', 'sub-drone'],
      climax: ['stingers', 'screech'],
      texture: ['dissonance', 'breathing']
    },
    characteristics: [
      'Dissonant clusters',
      'Jump scare stingers',
      'Creepy atmospheres',
      'Tension without release'
    ]
  }
};

/**
 * Get style definition
 * @param {string} style - Style name
 * @returns {Object|null}
 */
export function getStyleDefinition(style) {
  return STYLE_DEFINITIONS[style] || null;
}

/**
 * Get instruments for a style
 * @param {string} style - Style name
 * @returns {Object}
 */
export function getStyleInstruments(style) {
  const def = STYLE_DEFINITIONS[style];
  if (!def) return { required: [], climax: [], texture: [] };
  return def.instruments;
}

/**
 * Get characteristics for a style
 * @param {string} style - Style name
 * @returns {string[]}
 */
export function getStyleCharacteristics(style) {
  const def = STYLE_DEFINITIONS[style];
  if (!def) return [];
  return def.characteristics;
}

/**
 * Get default tempo for a style
 * @param {string} style - Style name
 * @returns {number}
 */
export function getDefaultTempo(style) {
  const def = STYLE_DEFINITIONS[style];
  return def?.tempo?.default || 120;
}

/**
 * Build style-specific prompt section
 * @param {string} style - Style name
 * @returns {string}
 */
export function buildStyleSection(style) {
  const def = STYLE_DEFINITIONS[style];
  if (!def) return '';

  return `
## STYLE: ${style.toUpperCase()}
${def.description}

### Characteristics:
${def.characteristics.map(c => `- ${c}`).join('\n')}

### Required instruments: ${def.instruments.required.join(', ')}
### Climax instruments: ${def.instruments.climax.join(', ')}
### Texture instruments: ${def.instruments.texture.join(', ')}

### Tempo range: ${def.tempo.min}-${def.tempo.max} BPM (default: ${def.tempo.default})
${def.swing ? `### Swing: ${Math.round(def.swing * 100)}%` : ''}
`;
}

/**
 * Get all styles in a family
 * @param {string} family - Family name
 * @returns {string[]}
 */
export function getStylesByFamily(family) {
  return Object.entries(STYLE_DEFINITIONS)
    .filter(([_, def]) => def.family === family)
    .map(([name, _]) => name);
}

/**
 * Get all available styles
 * @returns {string[]}
 */
export function getAllStyles() {
  return Object.keys(STYLE_DEFINITIONS);
}
