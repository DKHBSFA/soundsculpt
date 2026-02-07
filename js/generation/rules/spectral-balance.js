/**
 * Spectral Balance Rules
 *
 * Validates and enforces frequency spectrum coverage:
 * - Low frequencies (bass)
 * - Mid frequencies (body)
 * - High frequencies (brilliance)
 */

import { noteNameToMidi } from '../../music-theory.js';

/**
 * Frequency bands (MIDI note ranges)
 */
const FREQUENCY_BANDS = {
  sub: { low: 24, high: 36, name: 'Sub Bass', hz: '30-60Hz' },     // C0-C1
  bass: { low: 36, high: 48, name: 'Bass', hz: '60-120Hz' },       // C1-C2
  lowMid: { low: 48, high: 60, name: 'Low Mid', hz: '120-250Hz' }, // C2-C3
  mid: { low: 60, high: 72, name: 'Mid', hz: '250-500Hz' },        // C3-C4
  highMid: { low: 72, high: 84, name: 'High Mid', hz: '500Hz-2kHz' }, // C4-C5
  presence: { low: 84, high: 96, name: 'Presence', hz: '2-4kHz' }, // C5-C6
  brilliance: { low: 96, high: 120, name: 'Brilliance', hz: '4kHz+' } // C6+
};

/**
 * Simplified bands for spectral coverage
 */
const SPECTRAL_REGIONS = {
  low: { minMidi: 24, maxMidi: 60, label: 'Low frequencies' },      // Sub + Bass + Low Mid
  mid: { minMidi: 60, maxMidi: 84, label: 'Mid frequencies' },      // Mid + High Mid
  high: { minMidi: 84, maxMidi: 120, label: 'High frequencies' }    // Presence + Brilliance
};

/**
 * Get register from voice configuration
 * @param {Object} voice - Voice configuration
 * @returns {{ low: number, high: number } | null}
 */
function getVoiceRegister(voice) {
  if (voice.register?.low && voice.register?.high) {
    return {
      low: noteNameToMidi(voice.register.low),
      high: noteNameToMidi(voice.register.high)
    };
  }

  // Infer from instrument family
  const familyRegisters = {
    'synth': { low: 36, high: 96 },
    'strings': { low: 36, high: 96 },
    'brass': { low: 48, high: 84 },
    'woodwinds': { low: 60, high: 96 },
    'percussion': { low: 36, high: 72 },
    'choir': { low: 48, high: 84 }
  };

  const family = voice.instrument?.family;
  if (family && familyRegisters[family]) {
    return familyRegisters[family];
  }

  // Infer from role
  const roleRegisters = {
    'foundation': { low: 24, high: 48 },
    'harmonic-bed': { low: 48, high: 72 },
    'texture': { low: 72, high: 108 },
    'rhythmic-anchor': { low: 36, high: 72 },
    'accent': { low: 60, high: 96 },
    'climax-power': { low: 48, high: 84 }
  };

  const role = voice.role;
  if (role && roleRegisters[role]) {
    return roleRegisters[role];
  }

  return { low: 48, high: 84 }; // Default mid range
}

/**
 * Check if a voice covers a spectral region
 * @param {Object} voice - Voice configuration
 * @param {string} region - Region name ('low', 'mid', 'high')
 * @returns {boolean}
 */
function voiceCoversRegion(voice, region) {
  const register = getVoiceRegister(voice);
  if (!register) return false;

  const regionBounds = SPECTRAL_REGIONS[region];
  if (!regionBounds) return false;

  // Voice covers region if there's overlap
  return register.low < regionBounds.maxMidi && register.high > regionBounds.minMidi;
}

/**
 * Analyze spectral coverage of a plan
 * @param {Object} plan - Compositional plan
 * @returns {{ coverage: Object, issues: Object[] }}
 */
export function analyzeSpectralCoverage(plan) {
  const voices = plan.orchestration?.voices || [];
  const coverage = {
    low: { voices: [], covered: false },
    mid: { voices: [], covered: false },
    high: { voices: [], covered: false }
  };

  for (const voice of voices) {
    for (const region of ['low', 'mid', 'high']) {
      if (voiceCoversRegion(voice, region)) {
        coverage[region].voices.push(voice.id);
        coverage[region].covered = true;
      }
    }
  }

  return coverage;
}

/**
 * Validate spectral balance
 * @param {Object} plan - Compositional plan
 * @returns {{ valid: boolean, issues: Object[] }}
 */
export function validateSpectralBalance(plan) {
  const issues = [];
  const coverage = analyzeSpectralCoverage(plan);
  const style = plan.metadata?.style || '';
  const family = plan.metadata?.family || 'loop';

  // Low frequencies (bass) - always required
  if (!coverage.low.covered) {
    issues.push({
      type: 'spectral_imbalance',
      region: 'low',
      severity: 'warning',
      message: 'No voices covering low frequencies (bass)',
      fix: 'Add a bass or foundation voice'
    });
  }

  // Mid frequencies - usually required
  if (!coverage.mid.covered) {
    issues.push({
      type: 'spectral_imbalance',
      region: 'mid',
      severity: 'warning',
      message: 'No voices covering mid frequencies',
      fix: 'Add harmonic content in the mid range'
    });
  }

  // High frequencies - required for most styles except pure bass music
  if (!coverage.high.covered && !['trap', 'industrial'].includes(style)) {
    issues.push({
      type: 'spectral_imbalance',
      region: 'high',
      severity: 'info',
      message: 'No voices covering high frequencies (brightness)',
      fix: 'Add texture or high-register melodic content'
    });
  }

  // Check for balance issues (all voices in one region)
  const totalVoices = plan.orchestration?.voices?.length || 0;
  for (const [region, data] of Object.entries(coverage)) {
    if (data.voices.length === totalVoices && totalVoices > 1) {
      issues.push({
        type: 'spectral_clustering',
        region,
        severity: 'info',
        message: `All ${totalVoices} voices clustered in ${region} frequencies`,
        fix: 'Spread voices across different registers'
      });
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    coverage
  };
}

/**
 * Suggest voices to fill spectral gaps
 * @param {Object} plan - Compositional plan
 * @returns {Object[]} Suggested voices
 */
export function suggestVoicesForBalance(plan) {
  const suggestions = [];
  const coverage = analyzeSpectralCoverage(plan);
  const key = plan.metadata?.key || { root: 'C', mode: 'minor' };

  // Need low frequencies
  if (!coverage.low.covered) {
    suggestions.push({
      id: 'sub-bass-fill',
      instrument: { family: 'synth', type: 'sine', lpf: 120 },
      role: 'foundation',
      soundfont: null,
      activePhases: ['build', 'climax'],
      register: { low: 'C1', high: 'C3' },
      reason: 'Fill low frequency gap'
    });
  }

  // Need mid frequencies
  if (!coverage.mid.covered) {
    suggestions.push({
      id: 'strings-fill',
      instrument: { family: 'strings', type: 'cello', articulation: 'legato' },
      role: 'harmonic-bed',
      soundfont: 'cello',
      activePhases: ['intro', 'build', 'climax', 'resolve'],
      register: { low: 'C2', high: 'C4' },
      reason: 'Fill mid frequency gap'
    });
  }

  // Need high frequencies
  if (!coverage.high.covered) {
    suggestions.push({
      id: 'texture-fill',
      instrument: { family: 'strings', type: 'violin', articulation: 'tremolo' },
      role: 'texture',
      soundfont: 'tremolo_strings',
      activePhases: ['build', 'climax'],
      register: { low: 'G4', high: 'E6' },
      reason: 'Fill high frequency gap'
    });
  }

  return suggestions;
}

/**
 * Auto-fix spectral imbalance
 * @param {Object} plan - Compositional plan (will be modified)
 * @returns {Object} Modified plan
 */
export function autoFixSpectralBalance(plan) {
  const validation = validateSpectralBalance(plan);

  if (validation.valid) return plan;

  const suggestions = suggestVoicesForBalance(plan);

  // Add suggested voices
  plan.orchestration = plan.orchestration || { voices: [] };
  plan.melodicContent = plan.melodicContent || { voices: {} };

  const key = plan.metadata?.key || { root: 'C', mode: 'minor' };

  for (const voice of suggestions) {
    // Check if already exists
    if (plan.orchestration.voices.some(v => v.id === voice.id)) continue;

    plan.orchestration.voices.push(voice);

    // Add basic melodic content
    if (voice.role === 'foundation') {
      plan.melodicContent.voices[voice.id] = {
        build: { type: 'pedal', notes: [`${key.root}2`], dynamic: 'mp' },
        climax: { type: 'pedal', notes: [`${key.root}2`], dynamic: 'f' }
      };
    } else if (voice.role === 'harmonic-bed') {
      plan.melodicContent.voices[voice.id] = {
        intro: { type: 'sustained', notes: [`${key.root}3`], dynamic: 'pp' },
        build: { type: 'arpeggiated', pattern: 'up', rate: '1/2' },
        climax: { type: 'sustained', notes: [`${key.root}3`], dynamic: 'f' },
        resolve: { type: 'sustained', notes: [`${key.root}3`], dynamic: 'p' }
      };
    } else if (voice.role === 'texture') {
      plan.melodicContent.voices[voice.id] = {
        build: { type: 'sustained', notes: [`${key.root}5`], dynamic: 'pp' },
        climax: { type: 'ascending', notes: [`${key.root}5`, `${key.root}6`], dynamic: 'mf' }
      };
    }
  }

  return plan;
}

/**
 * Calculate spectral density score
 * @param {Object} plan - Compositional plan
 * @returns {number} Score from 0-100
 */
export function calculateSpectralScore(plan) {
  const coverage = analyzeSpectralCoverage(plan);

  let score = 0;
  const weights = { low: 35, mid: 35, high: 30 };

  for (const [region, weight] of Object.entries(weights)) {
    if (coverage[region].covered) {
      score += weight;
    }
  }

  // Bonus for multiple voices per region (better coverage)
  for (const region of ['low', 'mid', 'high']) {
    if (coverage[region].voices.length > 1) {
      score += 5;
    }
  }

  return Math.min(100, score);
}
