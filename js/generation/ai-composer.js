/**
 * SoundSculpt Engine v2 - AI Composer
 *
 * Generates compositional plans using OpenRouter API.
 * The AI outputs JSON plans, NOT Strudel code.
 */

import { openRouterClient } from '../ai/openrouter-client.js';
import { buildSystemPrompt, buildUserPrompt } from './prompts/system-prompt.js';
import { getStyleDefinition, buildStyleSection } from './prompts/style-prompts.js';
import { validatePlanStructure, createMinimalPlan, getStyleFamily } from './plan-schema.js';

/**
 * AI Composer class for generating compositional plans
 */
export class AIComposer {
  constructor() {
    this.lastError = null;
    this.lastPlan = null;
    this.abortController = null;
  }

  /**
   * Generate a compositional plan
   * @param {Object} options - Generation options
   * @param {string} options.style - Musical style
   * @param {number} options.duration - Duration in seconds
   * @param {number} options.energy - Energy level (0-100)
   * @param {string} options.key - Key (e.g., "D minor")
   * @param {Object} options.preset - Style preset
   * @param {AbortSignal} options.signal - Abort signal
   * @returns {Promise<Object>} Compositional plan
   */
  async generate(options) {
    const {
      style = 'cinematic',
      duration = 30,
      energy = 70,
      key = 'D minor',
      preset = {},
      signal = null
    } = options;

    this.lastError = null;

    // Build prompts
    const styleDef = getStyleDefinition(style);
    const family = styleDef?.family || getStyleFamily(style);

    const enrichedPreset = {
      ...preset,
      family,
      style,
      temporal: { bpm: styleDef?.tempo?.default || 72 }
    };

    const systemPrompt = this._buildFullSystemPrompt(enrichedPreset, style);
    const userPrompt = buildUserPrompt({
      style,
      duration,
      energy,
      key,
      preset: enrichedPreset
    });

    try {
      const response = await openRouterClient.generate(
        systemPrompt,
        userPrompt,
        {
          signal,
          temperature: 0.8,  // Slightly creative
          max_tokens: 4096
        }
      );

      const plan = response.data;

      // Validate structure
      const validation = validatePlanStructure(plan);
      if (!validation.valid) {
        console.warn('AI generated invalid plan structure:', validation.errors);
        // Try to fix by merging with minimal plan
        const fixed = this._fixInvalidPlan(plan, options);
        this.lastPlan = fixed;
        return fixed;
      }

      this.lastPlan = plan;
      return plan;

    } catch (error) {
      this.lastError = error.message;

      // If aborted, re-throw
      if (error.name === 'AbortError') {
        throw error;
      }

      // Fallback to rule-based generation
      console.warn('AI generation failed, using fallback:', error.message);
      return this._generateFallback(options);
    }
  }

  /**
   * Build the full system prompt with style context
   * @param {Object} preset - Enriched preset
   * @param {string} style - Style name
   * @returns {string}
   */
  _buildFullSystemPrompt(preset, style) {
    let prompt = buildSystemPrompt(preset);

    // Add style-specific section
    const styleSection = buildStyleSection(style);
    if (styleSection) {
      prompt += '\n' + styleSection;
    }

    return prompt;
  }

  /**
   * Fix an invalid plan by merging with minimal valid structure
   * @param {Object} plan - Invalid plan
   * @param {Object} options - Generation options
   * @returns {Object}
   */
  _fixInvalidPlan(plan, options) {
    const minimal = createMinimalPlan(options);

    // Merge, preferring plan values where valid
    const fixed = {
      ...minimal,
      metadata: {
        ...minimal.metadata,
        ...(plan.metadata || {}),
        key: {
          ...minimal.metadata.key,
          ...(plan.metadata?.key || {})
        },
        tempo: {
          ...minimal.metadata.tempo,
          ...(plan.metadata?.tempo || {})
        }
      },
      form: plan.form?.phases?.length > 0 ? plan.form : minimal.form,
      harmony: plan.harmony || minimal.harmony,
      orchestration: plan.orchestration?.voices?.length > 0 ? plan.orchestration : minimal.orchestration,
      melodicContent: plan.melodicContent || minimal.melodicContent,
      rhythmicContent: plan.rhythmicContent || minimal.rhythmicContent,
      transitions: plan.transitions || minimal.transitions,
      effects: plan.effects || minimal.effects
    };

    return fixed;
  }

  /**
   * Generate fallback plan using rules only (no AI)
   * @param {Object} options - Generation options
   * @returns {Object}
   */
  _generateFallback(options) {
    const { style = 'cinematic', duration = 30, energy = 70, key = 'D minor' } = options;

    const styleDef = getStyleDefinition(style);
    const family = styleDef?.family || 'tonal';
    const bpm = styleDef?.tempo?.default || 72;
    const totalBars = Math.ceil(duration / ((60 / bpm) * 4));

    const [root, mode] = key.split(' ');

    // Phase boundaries
    const introEnd = Math.floor(totalBars * 0.15);
    const buildEnd = Math.floor(totalBars * 0.5);
    const climaxEnd = Math.floor(totalBars * 0.85);

    // Generate voices based on style and energy
    const voices = this._generateFallbackVoices(style, energy, root, mode);

    return {
      metadata: {
        style,
        family,
        intent: `${style} piece with ${energy}% energy`,
        key: { root: root || 'D', mode: mode || 'minor', modulatesTo: [] },
        tempo: { bpm },
        timeSignature: [4, 4],
        totalBars
      },
      form: {
        phases: [
          { name: 'intro', bars: [0, introEnd], dynamic: 'pp', texture: 'sparse' },
          { name: 'build', bars: [introEnd, buildEnd], dynamic: 'mf', texture: 'layered' },
          { name: 'climax', bars: [buildEnd, climaxEnd], dynamic: 'ff', texture: 'tutti' },
          { name: 'resolve', bars: [climaxEnd, totalBars], dynamic: 'p', texture: 'sparse' }
        ],
        cadences: family === 'tonal' ? [
          { bar: buildEnd, type: 'half', chords: ['iv', 'V'] },
          { bar: totalBars, type: 'authentic', chords: ['V7', 'i'] }
        ] : []
      },
      harmony: {
        progression: [
          { bar: 0, chord: 'i', duration: 4, function: 'T' },
          { bar: 4, chord: 'VI', duration: 4, function: 'SD' },
          { bar: 8, chord: 'III', duration: 4, function: 'T' },
          { bar: 12, chord: 'VII', duration: 4, function: 'D' }
        ],
        voicings: { intro: 'spread', build: 'drop2', climax: 'close', resolve: 'spread' }
      },
      orchestration: { voices },
      melodicContent: { voices: this._generateFallbackMelodicContent(voices, root, mode) },
      rhythmicContent: { voices: this._generateFallbackRhythmicContent(voices) },
      transitions: {
        intro_to_build: { type: 'crescendo', bars: 2 },
        build_to_climax: { type: 'riser', bars: 4 },
        climax_to_resolve: { type: 'subito-piano', bars: 1 }
      },
      effects: {
        global: { reverb: 0.4 },
        perVoice: {}
      }
    };
  }

  /**
   * Generate fallback voices based on style
   * @param {string} style - Style name
   * @param {number} energy - Energy level
   * @param {string} root - Key root
   * @param {string} mode - Key mode
   * @returns {Object[]}
   */
  _generateFallbackVoices(style, energy, root, mode) {
    const styleDef = getStyleDefinition(style);
    const voices = [];

    // Always add foundation
    voices.push({
      id: 'sub-bass',
      instrument: { family: 'synth', type: 'sine', lpf: 120 },
      role: 'foundation',
      soundfont: null,
      activePhases: ['build', 'climax'],
      register: { low: 'C1', high: 'C3' }
    });

    // Style-specific voices
    if (['cinematic', 'orchestral', 'dramatic'].includes(style)) {
      voices.push(
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
        }
      );

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
            id: 'brass-fanfare',
            instrument: { family: 'brass', type: 'french-horn', articulation: 'marcato' },
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
    } else if (['jazz', 'lo-fi'].includes(style)) {
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
          instrument: { family: 'strings', type: 'bass', articulation: 'pizzicato' },
          role: 'foundation',
          soundfont: 'contrabass',
          activePhases: ['build', 'climax', 'resolve']
        }
      );
    } else {
      // Electronic default
      voices.push(
        {
          id: 'pad',
          instrument: { family: 'synth', type: 'sawtooth', lpf: 2000 },
          role: 'harmonic-bed',
          soundfont: null,
          activePhases: ['intro', 'build', 'climax', 'resolve']
        },
        {
          id: 'lead',
          instrument: { family: 'synth', type: 'square', lpf: 4000 },
          role: 'accent',
          soundfont: null,
          activePhases: ['build', 'climax']
        }
      );
    }

    return voices;
  }

  /**
   * Generate fallback melodic content
   * @param {Object[]} voices - Voice configurations
   * @param {string} root - Key root
   * @param {string} mode - Key mode
   * @returns {Object}
   */
  _generateFallbackMelodicContent(voices, root, mode) {
    const content = {};

    // Generate proper chord notes for the key (BUG-002/BUG-005 fix)
    const chordNotes = this._getTriadNotes(root, mode, 3); // Root triad at octave 3
    const highChordNotes = this._getTriadNotes(root, mode, 4); // Root triad at octave 4

    for (const voice of voices) {
      if (voice.instrument?.family === 'percussion') continue;

      content[voice.id] = {};

      for (const phase of voice.activePhases) {
        if (voice.role === 'foundation') {
          content[voice.id][phase] = {
            type: 'pedal',
            notes: [`${root}2`],
            dynamic: phase === 'climax' ? 'f' : 'mp'
          };
        } else if (voice.role === 'harmonic-bed') {
          // Use full chord notes for arpeggiated patterns (BUG-005 fix)
          content[voice.id][phase] = {
            type: phase === 'intro' ? 'sustained' : 'arpeggiated',
            notes: phase === 'intro' ? [`${root}3`] : chordNotes,
            pattern: 'up',
            rate: phase === 'climax' ? '1/8' : '1/4',
            dynamic: phase === 'climax' ? 'f' : 'mp'
          };
        } else if (voice.role === 'texture') {
          // Add more notes for texture voices
          content[voice.id][phase] = {
            type: 'sustained',
            notes: highChordNotes.slice(0, 2), // Use 2 notes for texture
            dynamic: phase === 'climax' ? 'mf' : 'pp'
          };
        } else if (voice.role === 'accent') {
          // Create a more interesting melodic motif
          content[voice.id][phase] = {
            type: 'motif',
            notes: this._generateMotif(root, mode, phase),
            rhythm: [1, 0.5, 0.5, 2],
            dynamic: 'ff'
          };
        } else if (voice.role === 'climax-power') {
          content[voice.id][phase] = {
            type: 'sustained',
            notes: highChordNotes,
            dynamic: 'ff'
          };
        }
      }
    }

    return content;
  }

  /**
   * Get triad notes for a key
   * @param {string} root - Root note
   * @param {string} mode - 'minor' or 'major'
   * @param {number} octave - Octave number
   * @returns {string[]} Array of note names with octave
   */
  _getTriadNotes(root, mode, octave) {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const rootIdx = notes.indexOf(root.toUpperCase());
    if (rootIdx === -1) return [`${root}${octave}`];

    const third = mode === 'minor' ? 3 : 4; // Minor 3rd or Major 3rd
    const fifth = 7; // Perfect 5th

    return [
      `${root}${octave}`,
      `${notes[(rootIdx + third) % 12]}${octave}`,
      `${notes[(rootIdx + fifth) % 12]}${octave}`
    ];
  }

  /**
   * Generate a melodic motif for accent voices
   * @param {string} root - Root note
   * @param {string} mode - Key mode
   * @param {string} phase - Current phase
   * @returns {string[]} Array of note names
   */
  _generateMotif(root, mode, phase) {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const rootIdx = notes.indexOf(root.toUpperCase());
    if (rootIdx === -1) return [`${root}4`, `${root}4`, `${root}5`];

    const third = mode === 'minor' ? 3 : 4;
    const fifth = 7;

    // Create ascending motif for climax, descending for others
    if (phase === 'climax') {
      return [
        `${root}4`,
        `${notes[(rootIdx + third) % 12]}4`,
        `${notes[(rootIdx + fifth) % 12]}4`,
        `${root}5`
      ];
    } else {
      return [
        `${notes[(rootIdx + fifth) % 12]}4`,
        `${notes[(rootIdx + third) % 12]}4`,
        `${root}4`,
        `${root}4`
      ];
    }
  }

  /**
   * Generate fallback rhythmic content
   * @param {Object[]} voices - Voice configurations
   * @returns {Object}
   */
  _generateFallbackRhythmicContent(voices) {
    const content = {};

    for (const voice of voices) {
      if (voice.instrument?.family !== 'percussion') continue;

      content[voice.id] = {};

      for (const phase of voice.activePhases) {
        content[voice.id][phase] = {
          pattern: phase === 'climax' ? 'driving' : 'downbeats',
          density: phase === 'climax' ? 0.5 : 0.25,
          fills: phase === 'climax'
        };
      }
    }

    return content;
  }

  /**
   * Abort current generation
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Get last error message
   * @returns {string|null}
   */
  getLastError() {
    return this.lastError;
  }

  /**
   * Get last generated plan
   * @returns {Object|null}
   */
  getLastPlan() {
    return this.lastPlan;
  }
}

// Export singleton instance
export const aiComposer = new AIComposer();
