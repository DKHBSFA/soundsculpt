/**
 * SoundSculpt Engine v2 - Rules Index
 *
 * Re-exports all validation rules for convenient importing.
 */

// Voice Leading Rules
export {
  detectParallelFifths,
  detectParallelOctaves,
  detectVoiceCrossings,
  detectLargeLeaps,
  checkParallelMotion,
  validateVoiceLeading,
  fixParallelFifths
} from './voice-leading.js';

// Orchestration Rules
export {
  ORCHESTRATION_LIMITS,
  getVoicesInPhase,
  validateOrchestration,
  validateRoleCoverage,
  silenceExcessVoices,
  addFoundationVoice,
  addTextureVoice,
  suggestCinematicVoices
} from './orchestration.js';

// Cadence Rules
export {
  identifyCadenceType,
  validateCadences,
  insertCadence,
  autoFixCadences,
  suggestCadenceChords
} from './cadence-rules.js';

// Spectral Balance Rules
export {
  analyzeSpectralCoverage,
  validateSpectralBalance,
  suggestVoicesForBalance,
  autoFixSpectralBalance,
  calculateSpectralScore
} from './spectral-balance.js';
