/**
 * SoundSculpt Engine v2 - Main Entry Point
 *
 * Orchestrates the AI + Rules hybrid generation pipeline:
 * 1. AI Composer generates JSON Compositional Plan
 * 2. Plan Validator enforces music theory rules
 * 3. Strudel Translator converts to patterns
 * 4. Strudel Engine plays back
 */

import { aiComposer } from './ai-composer.js';
import { validatePlan, autoFix, validateAndFix, getValidationSummary } from './plan-validator.js';
import { translateToStrudel, generateSoundSculptVoices, generatePhaseCode } from './strudel-translator.js';
import { getStyleFamily, createMinimalPlan, PHASES } from './plan-schema.js';
import { getStyleDefinition, getDefaultTempo } from './prompts/style-prompts.js';
import { strudelEngine, PhaseManager } from '../audio/strudel-engine.js';

// Re-export components for direct access
export { aiComposer } from './ai-composer.js';
export { validatePlan, autoFix, validateAndFix } from './plan-validator.js';
export { translateToStrudel, generatePhaseCode } from './strudel-translator.js';
export { strudelEngine, PhaseManager } from '../audio/strudel-engine.js';

/**
 * Main generation function - Full AI + Rules pipeline
 *
 * @param {Object} options - Generation options
 * @param {string} options.style - Musical style (e.g., "cinematic", "jazz")
 * @param {number} options.duration - Duration in seconds
 * @param {number} options.energy - Energy level (0-100)
 * @param {string} options.key - Key (e.g., "D minor")
 * @param {AbortSignal} options.signal - Optional abort signal
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Object>} Generation result
 */
export async function generate(options) {
  const {
    style = 'cinematic',
    duration = 30,
    energy = 70,
    key = 'D minor',
    signal = null,
    onProgress = () => {}
  } = options;

  const result = {
    success: false,
    voices: [],
    plan: null,
    validation: null,
    fixes: [],
    preset: null,
    error: null
  };

  try {
    // Step 1: Build preset from style
    onProgress({ step: 'preset', message: 'Loading style preset...' });

    const styleDef = getStyleDefinition(style);
    const family = styleDef?.family || getStyleFamily(style);
    const bpm = styleDef?.tempo?.default || getDefaultTempo(style);

    const preset = {
      style,
      family,
      energy,
      temporal: { bpm }
    };

    // Step 2: AI generates compositional plan
    onProgress({ step: 'compose', message: 'AI composing music plan...' });

    let rawPlan;
    try {
      rawPlan = await aiComposer.generate({
        style,
        duration,
        energy,
        key,
        preset,
        signal
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        result.error = 'Generation cancelled';
        return result;
      }
      console.warn('AI generation failed, using fallback');
      rawPlan = createMinimalPlan({ style, duration, energy, key });
    }

    // Step 3: Validate and fix plan
    onProgress({ step: 'validate', message: 'Validating music theory...' });

    const { plan: validatedPlan, validation, fixes } = validateAndFix(rawPlan, preset);

    result.plan = validatedPlan;
    result.validation = validation;
    result.fixes = fixes;

    // Log validation results
    console.log('Validation:', getValidationSummary(validation));
    if (fixes.length > 0) {
      console.log('Fixes applied:', fixes);
    }

    // Step 4: Translate to Strudel patterns
    onProgress({ step: 'translate', message: 'Translating to audio patterns...' });

    const translatedVoices = translateToStrudel(validatedPlan, preset);

    // Step 5: Generate SoundSculpt voice format
    const soundsculptVoices = generateSoundSculptVoices(validatedPlan, translatedVoices);

    result.voices = soundsculptVoices;
    result.preset = {
      style: preset.style,
      bpm: validatedPlan.metadata?.tempo?.bpm || bpm,
      key: `${validatedPlan.metadata?.key?.root || 'C'} ${validatedPlan.metadata?.key?.mode || 'minor'}`,
      family,
      voiceCount: soundsculptVoices.length
    };
    result.success = true;

    onProgress({ step: 'complete', message: 'Generation complete!' });

    return result;

  } catch (error) {
    result.error = error.message;
    console.error('Generation error:', error);
    return result;
  }
}

/**
 * Quick generation using rules only (no AI)
 *
 * @param {Object} options - Generation options
 * @returns {Object} Generation result
 */
export function generateRulesOnly(options) {
  const {
    style = 'cinematic',
    duration = 30,
    energy = 70,
    key = 'D minor'
  } = options;

  const styleDef = getStyleDefinition(style);
  const family = styleDef?.family || getStyleFamily(style);
  const bpm = styleDef?.tempo?.default || 72;

  const preset = { style, family, energy, temporal: { bpm } };

  // Create minimal plan
  const plan = createMinimalPlan({ style, duration, energy, key });

  // Add voices based on style
  plan.orchestration.voices = buildDefaultVoices(style, energy, key);
  plan.melodicContent.voices = buildDefaultMelodicContent(plan.orchestration.voices, key);

  // Validate and fix
  const { plan: validatedPlan, validation, fixes } = validateAndFix(plan, preset);

  // Translate to Strudel
  const translatedVoices = translateToStrudel(validatedPlan, preset);
  const soundsculptVoices = generateSoundSculptVoices(validatedPlan, translatedVoices);

  return {
    success: true,
    voices: soundsculptVoices,
    plan: validatedPlan,
    validation,
    fixes,
    preset: {
      style,
      bpm,
      key,
      family,
      voiceCount: soundsculptVoices.length
    },
    error: null
  };
}

/**
 * Build default voices based on style and energy
 */
function buildDefaultVoices(style, energy, key) {
  const [root] = key.split(' ');
  const voices = [];

  // Foundation (always)
  voices.push({
    id: 'sub-bass',
    instrument: { family: 'synth', type: 'sine', lpf: 120 },
    role: 'foundation',
    soundfont: null,
    activePhases: ['build', 'climax'],
    register: { low: 'C1', high: 'C3' }
  });

  // Cinematic/orchestral voices
  if (['cinematic', 'orchestral', 'dramatic', 'neo-classical'].includes(style)) {
    voices.push({
      id: 'strings-cello',
      instrument: { family: 'strings', type: 'cello', articulation: 'legato' },
      role: 'harmonic-bed',
      soundfont: 'cello',
      activePhases: ['intro', 'build', 'climax', 'resolve']
    });

    if (energy > 40) {
      voices.push({
        id: 'strings-tremolo',
        instrument: { family: 'strings', type: 'violin', articulation: 'tremolo' },
        role: 'texture',
        soundfont: 'tremolo_strings',
        activePhases: ['build', 'climax']
      });
    }

    if (energy > 60) {
      voices.push(
        {
          id: 'timpani',
          instrument: { family: 'percussion', type: 'timpani' },
          role: 'rhythmic-anchor',
          soundfont: 'timpani',
          activePhases: ['build', 'climax']
        },
        {
          id: 'brass-horn',
          instrument: { family: 'brass', type: 'french-horn' },
          role: 'accent',
          soundfont: 'french_horn',
          activePhases: ['climax']
        }
      );
    }

    if (energy > 80) {
      voices.push({
        id: 'choir',
        instrument: { family: 'choir', type: 'aah' },
        role: 'climax-power',
        soundfont: 'choir_aahs',
        activePhases: ['climax']
      });
    }
  }
  // Jazz voices
  else if (['jazz', 'lo-fi'].includes(style)) {
    voices.push(
      {
        id: 'piano',
        instrument: { family: 'keys', type: 'piano' },
        role: 'harmonic-bed',
        soundfont: 'acoustic_grand_piano',
        activePhases: ['intro', 'build', 'climax', 'resolve']
      },
      {
        id: 'bass',
        instrument: { family: 'strings', type: 'contrabass' },
        role: 'foundation',
        soundfont: 'contrabass',
        activePhases: ['build', 'climax', 'resolve']
      }
    );
  }
  // Electronic default
  else {
    voices.push(
      {
        id: 'pad',
        instrument: { family: 'synth', type: 'sawtooth', lpf: 2000 },
        role: 'harmonic-bed',
        soundfont: null,
        activePhases: ['intro', 'build', 'climax', 'resolve']
      }
    );

    if (energy > 50) {
      voices.push({
        id: 'lead',
        instrument: { family: 'synth', type: 'square', lpf: 4000 },
        role: 'accent',
        soundfont: null,
        activePhases: ['build', 'climax']
      });
    }
  }

  return voices;
}

/**
 * Build default melodic content for voices
 */
function buildDefaultMelodicContent(voices, key) {
  const [root] = key.split(' ');
  const content = {};

  for (const voice of voices) {
    if (voice.instrument?.family === 'percussion') continue;

    content[voice.id] = {};

    for (const phase of voice.activePhases || []) {
      if (voice.role === 'foundation') {
        content[voice.id][phase] = {
          type: 'pedal',
          notes: [`${root}2`],
          dynamic: phase === 'climax' ? 'f' : 'mp'
        };
      } else if (voice.role === 'harmonic-bed') {
        content[voice.id][phase] = {
          type: phase === 'intro' ? 'sustained' : 'arpeggiated',
          notes: [`${root}3`],
          pattern: 'up',
          dynamic: phase === 'climax' ? 'f' : phase === 'intro' ? 'pp' : 'mp'
        };
      } else if (voice.role === 'texture') {
        content[voice.id][phase] = {
          type: 'sustained',
          notes: [`${root}5`],
          dynamic: phase === 'climax' ? 'mf' : 'pp'
        };
      } else if (voice.role === 'accent') {
        content[voice.id][phase] = {
          type: 'motif',
          notes: [`${root}4`, `${root}5`],
          dynamic: 'ff'
        };
      } else if (voice.role === 'climax-power') {
        content[voice.id][phase] = {
          type: 'sustained',
          notes: [`${root}4`],
          dynamic: 'ff'
        };
      }
    }
  }

  return content;
}

/**
 * Play generated voices using Strudel engine
 *
 * @param {Object[]} voices - Generated voices
 * @param {Object} options - Playback options
 * @returns {Promise<boolean>}
 */
export async function playGeneration(voices, options = {}) {
  const { bpm = 72, phase = 'intro' } = options;

  strudelEngine.setBpm(bpm);
  strudelEngine.currentPhase = phase;

  return strudelEngine.play(voices);
}

/**
 * Stop playback
 */
export function stopPlayback() {
  strudelEngine.stop();
}

/**
 * Get generation status
 * @returns {Object}
 */
export function getStatus() {
  return {
    engineReady: strudelEngine.isReady(),
    isPlaying: strudelEngine.isPlaying,
    currentPhase: strudelEngine.currentPhase,
    ...strudelEngine.getState()
  };
}

/**
 * Export generation as JSON
 * @param {Object} result - Generation result
 * @returns {string}
 */
export function exportAsJSON(result) {
  return JSON.stringify({
    version: 'soundsculpt-v2',
    generatedAt: new Date().toISOString(),
    plan: result.plan,
    preset: result.preset,
    validation: result.validation
  }, null, 2);
}

/**
 * Export Strudel code for all phases
 * @param {Object[]} voices - Generated voices
 * @returns {Object} Code per phase
 */
export function exportStrudelCode(voices) {
  const code = {};

  for (const phase of PHASES) {
    code[phase] = generatePhaseCode(voices, phase);
  }

  return code;
}
