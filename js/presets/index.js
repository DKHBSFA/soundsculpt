/**
 * SoundSculpt - Preset Index
 * Central export for all audiosculpt presets
 */

// Family mapping (style -> family type)
import familyMap from './soundtrack/_family-map.json' with { type: 'json' };
import coherenceMatrix from './coherence-matrix.json' with { type: 'json' };

// === Soundtrack Presets (20 styles) ===
import acoustic from './soundtrack/acoustic.json' with { type: 'json' };
import ambient from './soundtrack/ambient.json' with { type: 'json' };
import chillwave from './soundtrack/chillwave.json' with { type: 'json' };
import cinematic from './soundtrack/cinematic.json' with { type: 'json' };
import corporate from './soundtrack/corporate.json' with { type: 'json' };
import dnb from './soundtrack/dnb.json' with { type: 'json' };
import dramatic from './soundtrack/dramatic.json' with { type: 'json' };
import electronic from './soundtrack/electronic.json' with { type: 'json' };
import glitch from './soundtrack/glitch.json' with { type: 'json' };
import horror from './soundtrack/horror.json' with { type: 'json' };
import industrial from './soundtrack/industrial.json' with { type: 'json' };
import jazz from './soundtrack/jazz.json' with { type: 'json' };
import lofi from './soundtrack/lo-fi.json' with { type: 'json' };
import minimalTechno from './soundtrack/minimal-techno.json' with { type: 'json' };
import neoClassical from './soundtrack/neo-classical.json' with { type: 'json' };
import orchestral from './soundtrack/orchestral.json' with { type: 'json' };
import synthwave from './soundtrack/synthwave.json' with { type: 'json' };
import trap from './soundtrack/trap.json' with { type: 'json' };
import upbeat from './soundtrack/upbeat.json' with { type: 'json' };
import world from './soundtrack/world.json' with { type: 'json' };

// === SFX Presets (6 families) ===
import sfxCinematic from './sfx/cinematic.json' with { type: 'json' };
import sfxClean from './sfx/clean.json' with { type: 'json' };
import sfxDark from './sfx/dark.json' with { type: 'json' };
import sfxDigital from './sfx/digital.json' with { type: 'json' };
import sfxHyper from './sfx/hyper.json' with { type: 'json' };
import sfxOrganic from './sfx/organic.json' with { type: 'json' };

// === Templates (6 quick templates) ===
import techPromo from './templates/tech_promo.json' with { type: 'json' };
import epicTrailer from './templates/epic_trailer.json' with { type: 'json' };
import chillLifestyle from './templates/chill_lifestyle.json' with { type: 'json' };
import corporateSafe from './templates/corporate_safe.json' with { type: 'json' };
import hypeSocial from './templates/hype_social.json' with { type: 'json' };
import luxuryMinimal from './templates/luxury_minimal.json' with { type: 'json' };

// === Voice Leading Presets ===
import tonalMajor from './voice-leading/tonal-major.json' with { type: 'json' };
import tonalMinor from './voice-leading/tonal-minor.json' with { type: 'json' };
import jazzExtended from './voice-leading/jazz-extended.json' with { type: 'json' };

/**
 * All soundtrack presets indexed by style name
 */
export const SOUNDTRACK_PRESETS = {
  acoustic,
  ambient,
  chillwave,
  cinematic,
  corporate,
  dnb,
  dramatic,
  electronic,
  glitch,
  horror,
  industrial,
  jazz,
  'lo-fi': lofi,
  'minimal-techno': minimalTechno,
  'neo-classical': neoClassical,
  orchestral,
  synthwave,
  trap,
  upbeat,
  world
};

/**
 * SFX presets indexed by family name
 */
export const SFX_PRESETS = {
  cinematic: sfxCinematic,
  clean: sfxClean,
  dark: sfxDark,
  digital: sfxDigital,
  hyper: sfxHyper,
  organic: sfxOrganic
};

/**
 * Quick templates indexed by template name
 */
export const TEMPLATE_PRESETS = {
  tech_promo: techPromo,
  epic_trailer: epicTrailer,
  chill_lifestyle: chillLifestyle,
  corporate_safe: corporateSafe,
  hype_social: hypeSocial,
  luxury_minimal: luxuryMinimal
};

/**
 * Voice leading presets indexed by type
 */
export const VOICE_LEADING_PRESETS = {
  'tonal-major': tonalMajor,
  'tonal-minor': tonalMinor,
  'jazz-extended': jazzExtended
};

/**
 * Family map: style family -> list of styles
 */
export const FAMILY_MAP = familyMap;

/**
 * Coherence matrix with context->style mappings
 */
export const COHERENCE_MATRIX = coherenceMatrix;

/**
 * Get preset by style name
 * @param {string} style - Style name (e.g., 'jazz', 'electronic', 'lo-fi')
 * @returns {Object|null} Preset data or null if not found
 */
export function getPreset(style) {
  return SOUNDTRACK_PRESETS[style] || null;
}

/**
 * Get family for a style
 * @param {string} style - Style name
 * @returns {string} Family name ('tonal' | 'modal' | 'loop' | 'experimental')
 */
export function getFamily(style) {
  for (const [family, styles] of Object.entries(FAMILY_MAP)) {
    if (family === 'hybrid_family') continue;
    if (styles.includes(style)) return family;
  }
  // Check hybrid families
  if (FAMILY_MAP.hybrid_family?.[style]) {
    return FAMILY_MAP.hybrid_family[style][0]; // Return primary family
  }
  return 'loop'; // Default fallback
}

/**
 * Get all styles in a family
 * @param {string} family - Family name
 * @returns {string[]} List of style names
 */
export function getStylesByFamily(family) {
  return FAMILY_MAP[family] || [];
}

/**
 * Get template preset by name
 * @param {string} templateName - Template name
 * @returns {Object|null} Template preset or null
 */
export function getTemplate(templateName) {
  return TEMPLATE_PRESETS[templateName] || null;
}

/**
 * Get SFX preset by family
 * @param {string} sfxFamily - SFX family name
 * @returns {Object|null} SFX preset or null
 */
export function getSFXPreset(sfxFamily) {
  return SFX_PRESETS[sfxFamily] || null;
}

/**
 * Get default SFX family for a style
 * @param {string} style - Style name
 * @returns {string} SFX family name
 */
export function getDefaultSFXFamily(style) {
  return COHERENCE_MATRIX.styles[style]?.default_sfx || 'clean';
}

/**
 * Get voice leading preset for a scale type
 * @param {string} scaleType - Scale type ('major', 'minor', 'jazz')
 * @returns {Object|null} Voice leading preset
 */
export function getVoiceLeadingPreset(scaleType) {
  if (scaleType.includes('jazz') || scaleType.includes('extended')) {
    return VOICE_LEADING_PRESETS['jazz-extended'];
  }
  if (scaleType.includes('minor')) {
    return VOICE_LEADING_PRESETS['tonal-minor'];
  }
  return VOICE_LEADING_PRESETS['tonal-major'];
}

/**
 * List all available style names
 * @returns {string[]} List of style names
 */
export function listStyles() {
  return Object.keys(SOUNDTRACK_PRESETS);
}

/**
 * List all available template names
 * @returns {string[]} List of template names
 */
export function listTemplates() {
  return Object.keys(TEMPLATE_PRESETS);
}

export default {
  SOUNDTRACK_PRESETS,
  SFX_PRESETS,
  TEMPLATE_PRESETS,
  VOICE_LEADING_PRESETS,
  FAMILY_MAP,
  COHERENCE_MATRIX,
  getPreset,
  getFamily,
  getStylesByFamily,
  getTemplate,
  getSFXPreset,
  getDefaultSFXFamily,
  getVoiceLeadingPreset,
  listStyles,
  listTemplates
};
