/**
 * Cadence Rules
 *
 * Validates and enforces cadence requirements for tonal styles.
 */

import { noteNameToPitchClass, noteNameToMidi } from '../../music-theory.js';
import { PHASES, CADENCE_TYPES } from '../plan-schema.js';

/**
 * Cadence requirements by family
 */
const CADENCE_REQUIREMENTS = {
  tonal: {
    required: true,
    atPhaseEnd: ['build', 'resolve'],
    preferredTypes: {
      build: ['half'],           // Half cadence at build end
      resolve: ['authentic']     // Authentic cadence at piece end
    }
  },
  modal: {
    required: false,
    atPhaseEnd: [],
    preferredTypes: {}
  },
  loop: {
    required: false,
    atPhaseEnd: [],
    preferredTypes: {}
  },
  experimental: {
    required: false,
    atPhaseEnd: [],
    preferredTypes: {}
  }
};

/**
 * Chord interval mappings from key root
 */
const CHORD_INTERVALS = {
  'I': 0, 'i': 0,
  'II': 2, 'ii': 2,
  'III': 4, 'iii': 4,
  'IV': 5, 'iv': 5,
  'V': 7, 'v': 7,
  'VI': 9, 'vi': 9,
  'VII': 11, 'vii': 11,
  'bIII': 3, 'bVI': 8, 'bVII': 10
};

/**
 * Parse Roman numeral to root pitch class
 * @param {string} numeral - Roman numeral (e.g., "V7", "iv", "bVI")
 * @param {string} keyRoot - Key root note
 * @returns {{ root: number, type: string }}
 */
function parseRomanNumeral(numeral, keyRoot) {
  const keyPc = noteNameToPitchClass(keyRoot);

  // Extract base numeral and quality
  const match = numeral.match(/^(b?)(I{1,3}|IV|V|VI{0,2}|VII?|i{1,3}|iv|v|vi{0,2}|vii?)(°|7|maj7|m7)?$/i);
  if (!match) return null;

  const flat = match[1] === 'b';
  const base = match[2].toUpperCase();
  const quality = match[3] || '';

  let interval = CHORD_INTERVALS[flat ? 'b' + base : base];
  if (interval === undefined) {
    interval = CHORD_INTERVALS[base] || 0;
  }

  const root = (keyPc + interval) % 12;
  const isMinor = match[2] === match[2].toLowerCase();

  return {
    root,
    type: quality || (isMinor ? 'minor' : 'major'),
    numeral: match[2]
  };
}

/**
 * Identify cadence type from two chords
 * @param {string} chord1 - First chord Roman numeral
 * @param {string} chord2 - Second chord Roman numeral
 * @param {string} keyRoot - Key root
 * @returns {string|null} Cadence type or null
 */
export function identifyCadenceType(chord1, chord2, keyRoot) {
  const c1 = parseRomanNumeral(chord1, keyRoot);
  const c2 = parseRomanNumeral(chord2, keyRoot);

  if (!c1 || !c2) return null;

  const keyPc = noteNameToPitchClass(keyRoot);

  // V -> I (Authentic)
  if (c1.root === (keyPc + 7) % 12 && c2.root === keyPc) {
    return 'authentic';
  }

  // IV -> I (Plagal)
  if (c1.root === (keyPc + 5) % 12 && c2.root === keyPc) {
    return 'plagal';
  }

  // ? -> V (Half)
  if (c2.root === (keyPc + 7) % 12) {
    return 'half';
  }

  // V -> vi (Deceptive)
  if (c1.root === (keyPc + 7) % 12 && c2.root === (keyPc + 9) % 12) {
    return 'deceptive';
  }

  return null;
}

/**
 * Validate cadences in a plan
 * @param {Object} plan - Compositional plan
 * @returns {{ valid: boolean, issues: Object[], cadences: Object[] }}
 */
export function validateCadences(plan) {
  const issues = [];
  const family = plan.metadata?.family || 'loop';
  const requirements = CADENCE_REQUIREMENTS[family];
  const keyRoot = plan.metadata?.key?.root || 'C';

  // If cadences not required for this family, return valid
  if (!requirements.required) {
    return { valid: true, issues: [], cadences: plan.form?.cadences || [] };
  }

  const planCadences = plan.form?.cadences || [];
  const phases = plan.form?.phases || [];

  // Check for cadences at required phase ends
  for (const requiredPhase of requirements.atPhaseEnd) {
    const phase = phases.find(p => p.name === requiredPhase);
    if (!phase) continue;

    const endBar = phase.bars[1];

    // Find cadence near this bar
    const cadenceAtEnd = planCadences.find(c =>
      Math.abs(c.bar - endBar) <= 2
    );

    if (!cadenceAtEnd) {
      const preferredType = requirements.preferredTypes[requiredPhase]?.[0] || 'authentic';
      issues.push({
        type: 'missing_cadence',
        phase: requiredPhase,
        bar: endBar,
        severity: 'warning',
        suggestion: {
          bar: endBar,
          type: preferredType,
          chords: preferredType === 'authentic' ? ['V7', 'I'] :
                  preferredType === 'half' ? ['iv', 'V'] :
                  preferredType === 'plagal' ? ['IV', 'I'] : ['V', 'vi']
        }
      });
    } else {
      // Validate the cadence type
      if (cadenceAtEnd.chords?.length >= 2) {
        const detectedType = identifyCadenceType(
          cadenceAtEnd.chords[0],
          cadenceAtEnd.chords[1],
          keyRoot
        );

        if (detectedType && detectedType !== cadenceAtEnd.type) {
          issues.push({
            type: 'cadence_type_mismatch',
            bar: cadenceAtEnd.bar,
            declared: cadenceAtEnd.type,
            actual: detectedType,
            severity: 'info'
          });
        }
      }
    }
  }

  // Check that final cadence resolves properly (for tonal)
  if (family === 'tonal' && phases.length > 0) {
    const resolvePhase = phases.find(p => p.name === 'resolve');
    if (resolvePhase) {
      const finalBar = resolvePhase.bars[1];
      const finalCadence = planCadences.find(c =>
        Math.abs(c.bar - finalBar) <= 2 && c.type === 'authentic'
      );

      if (!finalCadence) {
        issues.push({
          type: 'no_final_cadence',
          bar: finalBar,
          severity: 'warning',
          suggestion: {
            bar: finalBar,
            type: 'authentic',
            chords: ['V7', 'I']
          }
        });
      }
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    cadences: planCadences
  };
}

/**
 * Insert a cadence into the plan
 * @param {Object} plan - Compositional plan (will be modified)
 * @param {Object} cadence - Cadence to insert { bar, type, chords }
 * @returns {Object} Modified plan
 */
export function insertCadence(plan, cadence) {
  plan.form = plan.form || { phases: [], cadences: [] };
  plan.form.cadences = plan.form.cadences || [];

  // Check if cadence already exists at this bar
  const existing = plan.form.cadences.find(c => c.bar === cadence.bar);
  if (existing) {
    // Update existing
    existing.type = cadence.type;
    existing.chords = cadence.chords;
  } else {
    // Add new
    plan.form.cadences.push(cadence);
    // Sort by bar number
    plan.form.cadences.sort((a, b) => a.bar - b.bar);
  }

  return plan;
}

/**
 * Auto-fix missing cadences
 * @param {Object} plan - Compositional plan (will be modified)
 * @returns {Object} Modified plan
 */
export function autoFixCadences(plan) {
  const validation = validateCadences(plan);

  for (const issue of validation.issues) {
    if (issue.suggestion) {
      insertCadence(plan, issue.suggestion);
    }
  }

  return plan;
}

/**
 * Suggest cadence chords based on context
 * @param {string} type - Cadence type
 * @param {string} keyRoot - Key root
 * @param {string} mode - Key mode (major/minor)
 * @returns {string[]} Chord symbols
 */
export function suggestCadenceChords(type, keyRoot, mode = 'major') {
  const isMinor = mode === 'minor';

  switch (type) {
    case 'authentic':
      return isMinor ? ['V7', 'i'] : ['V7', 'I'];
    case 'plagal':
      return isMinor ? ['iv', 'i'] : ['IV', 'I'];
    case 'half':
      return isMinor ? ['iv', 'V'] : ['ii', 'V'];
    case 'deceptive':
      return isMinor ? ['V', 'VI'] : ['V', 'vi'];
    default:
      return ['V', 'I'];
  }
}
