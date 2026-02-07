/**
 * Orchestration Rules
 *
 * Validates and enforces orchestration limits:
 * - Maximum voices per phase
 * - Voice role coverage
 * - Register distribution
 */

import { VOICE_ROLES, PHASES } from '../plan-schema.js';

/**
 * Default orchestration limits per style family
 */
export const ORCHESTRATION_LIMITS = {
  tonal: {
    intro: { min_voices: 1, max_voices: 4 },
    build: { min_voices: 3, max_voices: 8 },
    climax: { min_voices: 6, max_voices: 17 },
    resolve: { min_voices: 2, max_voices: 5 }
  },
  modal: {
    intro: { min_voices: 1, max_voices: 3 },
    build: { min_voices: 2, max_voices: 5 },
    climax: { min_voices: 3, max_voices: 8 },
    resolve: { min_voices: 1, max_voices: 3 }
  },
  loop: {
    intro: { min_voices: 1, max_voices: 3 },
    build: { min_voices: 2, max_voices: 6 },
    climax: { min_voices: 4, max_voices: 10 },
    resolve: { min_voices: 2, max_voices: 4 }
  },
  experimental: {
    intro: { min_voices: 1, max_voices: 4 },
    build: { min_voices: 2, max_voices: 8 },
    climax: { min_voices: 4, max_voices: 12 },
    resolve: { min_voices: 1, max_voices: 4 }
  }
};

/**
 * Required role coverage per energy level
 */
const ROLE_REQUIREMENTS = {
  low: ['foundation'],
  medium: ['foundation', 'harmonic-bed'],
  high: ['foundation', 'harmonic-bed', 'texture', 'accent']
};

/**
 * Get voices active in a specific phase
 * @param {Object} plan - Compositional plan
 * @param {string} phase - Phase name
 * @returns {Object[]} Active voice configurations
 */
export function getVoicesInPhase(plan, phase) {
  return (plan.orchestration?.voices || []).filter(
    v => v.activePhases?.includes(phase)
  );
}

/**
 * Validate orchestration against limits
 * @param {Object} plan - Compositional plan
 * @param {Object} preset - Style preset with limits
 * @returns {{ valid: boolean, issues: Object[] }}
 */
export function validateOrchestration(plan, preset = {}) {
  const issues = [];
  const family = plan.metadata?.family || 'loop';
  const limits = preset.orchestration_limits || ORCHESTRATION_LIMITS[family] || ORCHESTRATION_LIMITS.loop;

  // Check each phase
  for (const phase of PHASES) {
    const activeVoices = getVoicesInPhase(plan, phase);
    const phaseLimits = limits[phase] || { min_voices: 1, max_voices: 8 };

    // Check max
    if (activeVoices.length > phaseLimits.max_voices) {
      issues.push({
        type: 'orchestration_overflow',
        phase,
        count: activeVoices.length,
        limit: phaseLimits.max_voices,
        severity: 'error',
        fix: `Reduce voices in ${phase} from ${activeVoices.length} to ${phaseLimits.max_voices}`
      });
    }

    // Check min
    if (activeVoices.length < phaseLimits.min_voices) {
      issues.push({
        type: 'orchestration_underflow',
        phase,
        count: activeVoices.length,
        limit: phaseLimits.min_voices,
        severity: 'warning',
        fix: `Add more voices to ${phase}`
      });
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues
  };
}

/**
 * Validate role coverage
 * @param {Object} plan - Compositional plan
 * @param {number} energy - Energy level (0-100)
 * @returns {{ valid: boolean, issues: Object[] }}
 */
export function validateRoleCoverage(plan, energy = 50) {
  const issues = [];
  const requiredRoles = energy > 70 ? ROLE_REQUIREMENTS.high :
                        energy > 40 ? ROLE_REQUIREMENTS.medium :
                        ROLE_REQUIREMENTS.low;

  const voices = plan.orchestration?.voices || [];
  const presentRoles = new Set(voices.map(v => v.role));

  for (const role of requiredRoles) {
    if (!presentRoles.has(role)) {
      issues.push({
        type: 'missing_role',
        role,
        severity: 'warning',
        fix: `Add a voice with role: ${role}`
      });
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues
  };
}

/**
 * Silence excess voices in a phase to meet limits
 * @param {Object} plan - Compositional plan (will be modified)
 * @param {string} phase - Phase to modify
 * @param {number} excessCount - Number of voices to silence
 * @returns {Object} Modified plan
 */
export function silenceExcessVoices(plan, phase, excessCount) {
  const voices = plan.orchestration?.voices || [];

  // Priority for removal: climax-power, accent, texture (keep foundation, harmonic-bed, rhythmic-anchor)
  const removalPriority = ['climax-power', 'accent', 'texture', 'harmonic-bed'];

  let removed = 0;
  for (const role of removalPriority) {
    if (removed >= excessCount) break;

    for (const voice of voices) {
      if (removed >= excessCount) break;

      if (voice.role === role && voice.activePhases?.includes(phase)) {
        // Remove this phase from voice
        voice.activePhases = voice.activePhases.filter(p => p !== phase);
        removed++;
      }
    }
  }

  return plan;
}

/**
 * Add a foundation voice if missing
 * @param {Object} plan - Compositional plan (will be modified)
 * @returns {Object} Modified plan
 */
export function addFoundationVoice(plan) {
  const voices = plan.orchestration?.voices || [];

  // Check if foundation already exists
  if (voices.some(v => v.role === 'foundation')) {
    return plan;
  }

  // Add a bass voice
  const bassVoice = {
    id: 'sub-bass-auto',
    instrument: { family: 'synth', type: 'sine', lpf: 120 },
    role: 'foundation',
    soundfont: null,
    activePhases: ['build', 'climax'],
    register: { low: 'C1', high: 'C3' }
  };

  plan.orchestration.voices.push(bassVoice);

  // Add melodic content
  plan.melodicContent = plan.melodicContent || { voices: {} };
  plan.melodicContent.voices['sub-bass-auto'] = {
    build: { type: 'pedal', notes: [plan.metadata?.key?.root || 'C' + '2'], dynamic: 'mp' },
    climax: { type: 'pedal', notes: [plan.metadata?.key?.root || 'C' + '2'], dynamic: 'f' }
  };

  return plan;
}

/**
 * Add a texture voice if missing
 * @param {Object} plan - Compositional plan (will be modified)
 * @returns {Object} Modified plan
 */
export function addTextureVoice(plan) {
  const voices = plan.orchestration?.voices || [];

  // Check if texture already exists
  if (voices.some(v => v.role === 'texture')) {
    return plan;
  }

  // Add a string tremolo voice
  const textureVoice = {
    id: 'strings-texture-auto',
    instrument: { family: 'strings', type: 'violin', articulation: 'tremolo' },
    role: 'texture',
    soundfont: 'tremolo_strings',
    activePhases: ['build', 'climax'],
    register: { low: 'G4', high: 'E6' }
  };

  plan.orchestration.voices.push(textureVoice);

  // Add melodic content
  plan.melodicContent = plan.melodicContent || { voices: {} };
  plan.melodicContent.voices['strings-texture-auto'] = {
    build: { type: 'sustained', notes: ['G5'], dynamic: 'pp' },
    climax: { type: 'ascending', notes: ['G5', 'A5', 'B5', 'C6'], dynamic: 'mf' }
  };

  return plan;
}

/**
 * Suggest voices to add for a cinematic style
 * @param {Object} plan - Current plan
 * @param {number} energy - Target energy (0-100)
 * @returns {Object[]} Suggested voices to add
 */
export function suggestCinematicVoices(plan, energy = 70) {
  const suggestions = [];
  const existingIds = new Set((plan.orchestration?.voices || []).map(v => v.id));

  // Base ensemble for cinematic
  const cinemaicEnsemble = [
    {
      id: 'strings-cello',
      instrument: { family: 'strings', type: 'cello', articulation: 'legato' },
      role: 'harmonic-bed',
      soundfont: 'cello',
      activePhases: ['intro', 'build', 'climax', 'resolve']
    },
    {
      id: 'strings-tremolo',
      instrument: { family: 'strings', type: 'violin', articulation: 'tremolo' },
      role: 'texture',
      soundfont: 'tremolo_strings',
      activePhases: ['build', 'climax']
    },
    {
      id: 'timpani',
      instrument: { family: 'percussion', type: 'timpani' },
      role: 'rhythmic-anchor',
      soundfont: 'timpani',
      activePhases: ['build', 'climax']
    }
  ];

  // High energy additions
  if (energy > 60) {
    cinemaicEnsemble.push(
      {
        id: 'brass-fanfare',
        instrument: { family: 'brass', type: 'french-horn', articulation: 'marcato' },
        role: 'accent',
        soundfont: 'french_horn',
        activePhases: ['climax']
      },
      {
        id: 'choir',
        instrument: { family: 'choir', type: 'aah' },
        role: 'climax-power',
        soundfont: 'choir_aahs',
        activePhases: ['climax']
      }
    );
  }

  // Very high energy additions
  if (energy > 80) {
    cinemaicEnsemble.push(
      {
        id: 'brass-section',
        instrument: { family: 'brass', type: 'section', articulation: 'marcato' },
        role: 'accent',
        soundfont: 'brass_section',
        activePhases: ['climax']
      },
      {
        id: 'string-ensemble',
        instrument: { family: 'strings', type: 'ensemble' },
        role: 'harmonic-bed',
        soundfont: 'string_ensemble',
        activePhases: ['build', 'climax']
      }
    );
  }

  // Filter out already existing voices
  for (const voice of cinemaicEnsemble) {
    if (!existingIds.has(voice.id)) {
      suggestions.push(voice);
    }
  }

  return suggestions;
}
