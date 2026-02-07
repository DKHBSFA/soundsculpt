/**
 * SoundSculpt Engine v2 - Plan Validator
 *
 * Validates and auto-fixes compositional plans using music theory rules.
 * Combines all validation rules: voice leading, orchestration, cadences, spectral balance.
 */

import { validatePlanStructure, getStyleFamily, PHASES } from './plan-schema.js';
import { validateVoiceLeading, fixParallelFifths } from './rules/voice-leading.js';
import {
  validateOrchestration,
  validateRoleCoverage,
  silenceExcessVoices,
  addFoundationVoice,
  addTextureVoice,
  ORCHESTRATION_LIMITS
} from './rules/orchestration.js';
import { validateCadences, insertCadence, autoFixCadences } from './rules/cadence-rules.js';
import {
  validateSpectralBalance,
  autoFixSpectralBalance,
  calculateSpectralScore
} from './rules/spectral-balance.js';

/**
 * Validation result structure
 */
const createValidationResult = () => ({
  valid: true,
  issues: [],
  warnings: [],
  info: [],
  fixes: []
});

/**
 * Validate a compositional plan
 * @param {Object} plan - The compositional plan to validate
 * @param {Object} preset - Style preset with constraints
 * @returns {{ valid: boolean, issues: Object[], warnings: Object[], fixes: string[] }}
 */
export function validatePlan(plan, preset = {}) {
  const result = createValidationResult();

  // 1. Structural validation
  const structureResult = validatePlanStructure(plan);
  if (!structureResult.valid) {
    result.valid = false;
    result.issues.push(...structureResult.errors.map(e => ({
      type: 'structure',
      message: e,
      severity: 'error'
    })));
    // Can't continue validation if structure is invalid
    return result;
  }

  const family = plan.metadata?.family || getStyleFamily(plan.metadata?.style || 'electronic');
  const energy = preset.energy || 50;

  // 2. Voice leading validation (for tonal/modal families)
  if (['tonal', 'modal'].includes(family)) {
    const vlResult = validateVoiceLeading(plan);
    for (const issue of vlResult.issues) {
      if (issue.severity === 'error') {
        result.issues.push(issue);
        result.valid = false;
      } else if (issue.severity === 'warning') {
        result.warnings.push(issue);
      } else {
        result.info.push(issue);
      }
    }
  }

  // 3. Orchestration validation
  const orchResult = validateOrchestration(plan, preset);
  for (const issue of orchResult.issues) {
    if (issue.severity === 'error') {
      result.issues.push(issue);
      result.valid = false;
    } else {
      result.warnings.push(issue);
    }
  }

  // 4. Role coverage validation
  const roleResult = validateRoleCoverage(plan, energy);
  result.warnings.push(...roleResult.issues);

  // 5. Cadence validation (for tonal family)
  if (family === 'tonal') {
    const cadResult = validateCadences(plan);
    for (const issue of cadResult.issues) {
      if (issue.severity === 'error') {
        result.issues.push(issue);
        result.valid = false;
      } else {
        result.warnings.push(issue);
      }
    }
  }

  // 6. Spectral balance validation
  const spectralResult = validateSpectralBalance(plan);
  result.warnings.push(...spectralResult.issues.filter(i => i.severity === 'warning'));
  result.info.push(...spectralResult.issues.filter(i => i.severity === 'info'));

  // Add spectral score
  result.spectralScore = calculateSpectralScore(plan);

  return result;
}

/**
 * Auto-fix issues in a compositional plan
 * @param {Object} plan - The plan to fix (will be deep-cloned)
 * @param {Object[]} issues - Array of issues from validation
 * @param {Object} preset - Style preset
 * @returns {{ plan: Object, fixes: string[] }}
 */
export function autoFix(plan, issues, preset = {}) {
  // Deep clone to avoid mutating original
  const fixed = JSON.parse(JSON.stringify(plan));
  const fixes = [];

  for (const issue of issues) {
    switch (issue.type) {
      case 'orchestration_overflow':
        silenceExcessVoices(fixed, issue.phase, issue.count - issue.limit);
        fixes.push(`Reduced voices in ${issue.phase} from ${issue.count} to ${issue.limit}`);
        break;

      case 'missing_cadence':
        if (issue.suggestion) {
          insertCadence(fixed, issue.suggestion);
          fixes.push(`Added ${issue.suggestion.type} cadence at bar ${issue.suggestion.bar}`);
        }
        break;

      case 'no_final_cadence':
        if (issue.suggestion) {
          insertCadence(fixed, issue.suggestion);
          fixes.push(`Added final authentic cadence at bar ${issue.suggestion.bar}`);
        }
        break;

      case 'parallel_fifths':
        if (issue.voices?.[1]) {
          fixParallelFifths(fixed, issue.voices[1]);
          fixes.push(`Adjusted voice ${issue.voices[1]} to fix parallel fifths`);
        }
        break;

      case 'parallel_octaves':
        if (issue.voices?.[1]) {
          fixParallelFifths(fixed, issue.voices[1]); // Same fix works
          fixes.push(`Adjusted voice ${issue.voices[1]} to fix parallel octaves`);
        }
        break;

      case 'spectral_imbalance':
        if (issue.region === 'low') {
          addFoundationVoice(fixed);
          fixes.push('Added foundation bass voice');
        } else if (issue.region === 'high') {
          addTextureVoice(fixed);
          fixes.push('Added texture voice for high frequencies');
        }
        break;

      case 'missing_role':
        if (issue.role === 'foundation') {
          addFoundationVoice(fixed);
          fixes.push('Added foundation voice');
        } else if (issue.role === 'texture') {
          addTextureVoice(fixed);
          fixes.push('Added texture voice');
        }
        break;
    }
  }

  return { plan: fixed, fixes };
}

/**
 * Full validation and auto-fix pipeline
 * @param {Object} plan - The compositional plan
 * @param {Object} preset - Style preset
 * @returns {{ plan: Object, validation: Object, fixes: string[] }}
 */
export function validateAndFix(plan, preset = {}) {
  // First validation pass
  const validation = validatePlan(plan, preset);

  if (validation.valid && validation.warnings.length === 0) {
    return {
      plan,
      validation,
      fixes: []
    };
  }

  // Auto-fix issues and warnings
  const allIssues = [...validation.issues, ...validation.warnings];
  const { plan: fixedPlan, fixes } = autoFix(plan, allIssues, preset);

  // Re-validate
  const revalidation = validatePlan(fixedPlan, preset);

  return {
    plan: fixedPlan,
    validation: revalidation,
    fixes
  };
}

/**
 * Quick validation check (structure only)
 * @param {Object} plan - The plan to check
 * @returns {boolean}
 */
export function isValidPlan(plan) {
  const result = validatePlanStructure(plan);
  return result.valid;
}

/**
 * Get validation summary for display
 * @param {Object} validation - Validation result
 * @returns {string}
 */
export function getValidationSummary(validation) {
  if (validation.valid && validation.warnings.length === 0) {
    return '✓ Plan is valid';
  }

  const parts = [];

  if (validation.issues.length > 0) {
    parts.push(`${validation.issues.length} error(s)`);
  }

  if (validation.warnings.length > 0) {
    parts.push(`${validation.warnings.length} warning(s)`);
  }

  if (validation.spectralScore !== undefined) {
    parts.push(`Spectral coverage: ${validation.spectralScore}%`);
  }

  return parts.join(', ');
}

/**
 * Validate dynamics progression across phases
 * @param {Object} plan - Compositional plan
 * @returns {{ valid: boolean, issues: Object[] }}
 */
export function validateDynamicsProgression(plan) {
  const issues = [];
  const phases = plan.form?.phases || [];

  const dynamicOrder = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];

  // Find climax phase
  const climaxPhase = phases.find(p => p.name === 'climax');
  const introPhase = phases.find(p => p.name === 'intro');

  if (climaxPhase && introPhase) {
    const climaxDynIdx = dynamicOrder.indexOf(climaxPhase.dynamic);
    const introDynIdx = dynamicOrder.indexOf(introPhase.dynamic);

    if (climaxDynIdx <= introDynIdx) {
      issues.push({
        type: 'dynamics_flat',
        message: 'Climax should be louder than intro',
        severity: 'warning',
        suggestion: {
          phase: 'climax',
          dynamic: 'ff'
        }
      });
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues
  };
}

/**
 * Get orchestration limits for a style
 * @param {string} style - Style name
 * @returns {Object} Limits per phase
 */
export function getOrchestrationLimits(style) {
  const family = getStyleFamily(style);
  return ORCHESTRATION_LIMITS[family] || ORCHESTRATION_LIMITS.loop;
}
