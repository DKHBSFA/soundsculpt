/**
 * SoundSculpt - AI Generation Prompts
 * Prompt templates for AI music generation using audiosculpt presets
 */

import { getPreset, getFamily, FAMILY_MAP } from '../presets/index.js';

/**
 * Family-specific musical rules
 */
const FAMILY_RULES = {
  tonal: `
## TONAL FAMILY RULES (functional harmony)
You are generating music in a TONAL style with functional harmony.

HARMONIC RULES:
- Use functional chord progressions: T (tonic) → SD (subdominant) → D (dominant) → T
- End phrases with proper cadences (authentic: V→I, half: →V, plagal: IV→I)
- Voice leading: minimize motion between chord tones
- Bass should emphasize roots on strong beats, fifths on weak beats
- Avoid parallel fifths and octaves between voices

MELODIC RULES:
- Melodies should resolve to tonic at phrase endings
- Use scale degrees 1, 3, 5 on strong beats
- Chromatic passing tones allowed but resolve stepwise
- Create melodic arc: tension builds, then resolves

RHYTHMIC RULES:
- Harmonic rhythm typically 1-2 bars per chord
- Bass and chords should align on downbeats
- Syncopation adds interest but anchor to grid
`,

  modal: `
## MODAL FAMILY RULES (static harmony)
You are generating music in a MODAL style with static harmonic fields.

HARMONIC RULES:
- Use modal interchange, not functional progressions
- Chord changes are color, not function
- Avoid traditional cadences (V→I)
- Pedal tones and drones are encouraged
- Parallel chord motion is acceptable

MELODIC RULES:
- Emphasize the characteristic interval of the mode
- Lydian: raised 4th, Dorian: raised 6th, etc.
- Melodies can be fragmentary, not goal-oriented
- Long sustained notes are effective

RHYTHMIC RULES:
- Harmonic rhythm can be very slow (4-8 bars per chord)
- Rhythm can be free, not strictly quantized
- Silence and space are important
`,

  loop: `
## LOOP FAMILY RULES (groove-based)
You are generating music in a LOOP style with repetitive, groove-based patterns.

HARMONIC RULES:
- Use ostinato patterns (repeating loops)
- Harmony is texture, not function
- 2-4 chord vamps are typical
- Tension built through layering, not harmony

MELODIC RULES:
- Short, repetitive motifs (1-2 bar loops)
- Riffs over chord changes
- Build/drop structure instead of development
- Arpeggiated patterns work well

RHYTHMIC RULES:
- Locked to grid (quantized)
- Kick/bass relationship is crucial
- Build density for climax, strip for resolve
- Euclidean rhythms work well
`,

  experimental: `
## EXPERIMENTAL FAMILY RULES (texture/timbral)
You are generating music in an EXPERIMENTAL style focusing on texture and timbre.

HARMONIC RULES:
- Tonality is optional, clusters allowed
- Dissonance is a tool, not to be avoided
- Non-functional chord relationships
- Extended techniques and unusual voicings

MELODIC RULES:
- Pitch can be secondary to rhythm/timbre
- Wide intervals, unpredictable contour
- Noise and texture elements welcome
- Can be atonal or polytonal

RHYTHMIC RULES:
- Polyrhythms and metric modulation
- Stuttering, glitching patterns
- Irregular phrase lengths
- Silence as structural element
`
};

/**
 * Base system prompt with music theory and output format
 */
export const SYSTEM_PROMPT_BASE = `You are a professional music composer AI for SoundSculpt DAW.
You generate original, genre-accurate music using Strudel pattern syntax.

## STRUDEL PATTERN SYNTAX (you must use this)

NOTES:
- note('<c4 e4 g4>') — sequence of notes
- chord('<Am7 Dm7 G7>') — chord sequence
- ~ = silence/rest in sequence

RHYTHM:
- .struct('t ~ t ~') — trigger pattern (t=trigger, ~=rest)
- .struct('t(3,8)') — euclidean rhythm (3 triggers in 8 slots)
- .slow(2) — half speed, .fast(2) — double speed

SOUND:
- .s('piano') — set sound/instrument
- .gain(0.8) — volume (0-1)
- .room(0.3) — reverb amount
- .lpf(800), .hpf(200) — filters
- .delay(0.25) — delay amount

CHORDS:
- .voicing() — apply voice leading (auto-selects voicing)

LAYERING:
- stack(pattern1, pattern2) — play patterns simultaneously
- 'silent' — no sound for this voice

## VOICE TYPES

| Type | Role | Strudel Pattern Style |
|------|------|----------------------|
| kick | Foundation beat | s('bd').struct('t ~ ~ ~ t ~ ~ ~') |
| snare | Backbeat | s('sd').struct('~ ~ t ~ ~ ~ t ~') |
| hihat | Time feel | s('hh').struct('t t t t t t t t') |
| bass | Low end, root movement | note('<a1 c2 e2 g1>').s('triangle').lpf(400) |
| pad | Harmonic bed | chord('<Am Dm>').voicing().s('sine').room(0.4) |
| lead | Melody | note('<e4 d4 c4 b3 a3>').s('sawtooth').lpf(2000) |
| arp | Rhythmic harmony | note('<a3 c4 e4 a4>(3,8)').s('square').delay(0.3) |

## OUTPUT FORMAT (strict JSON)

{
  "tempo": number (from preset range),
  "swing": number (0-0.67, from preset),
  "key": { "root": "C", "scale": "minor" },
  "timeSignature": [4, 4],
  "totalBars": number,
  "phases": {
    "intro": { "startBar": 0, "endBar": 2 },
    "build": { "startBar": 2, "endBar": 6 },
    "climax": { "startBar": 6, "endBar": 12 },
    "resolve": { "startBar": 12, "endBar": 16 }
  },
  "chordProgression": ["Am7", "Dm7", "G7", "Cmaj7"],
  "voices": [
    {
      "name": "Kick",
      "type": "drum",
      "sound": "bd",
      "patternCode": {
        "intro": "silent",
        "build": "s('bd').struct('t ~ ~ ~ t ~ ~ ~').gain(0.8)",
        "climax": "s('bd').struct('t ~ ~ ~ t ~ ~ ~').gain(0.9)",
        "resolve": "s('bd').struct('t ~ ~ ~').gain(0.6)"
      }
    },
    {
      "name": "Bass",
      "type": "bass",
      "sound": "triangle",
      "patternCode": {
        "intro": "silent",
        "build": "note('<a1 ~ c2 ~ d2 ~ e2 ~>').s('triangle').lpf(400).gain(0.75)",
        "climax": "note('<a1 c2 a1 ~ d2 c2 e2 ~>').s('triangle').lpf(500).gain(0.85)",
        "resolve": "note('a1').s('triangle').lpf(400).gain(0.5).slow(2)"
      }
    }
  ],
  "musicalIntent": "Description of the piece"
}

CRITICAL RULES:
1. Each voice has patternCode for EACH phase (intro, build, climax, resolve)
2. Use 'silent' for voices not playing in a phase
3. Follow the preset's orchestration_limits (max voices per phase)
4. Build up: intro is sparse, climax is full, resolve winds down
5. Use actual Strudel syntax, not boolean arrays
6. Drum voices use s('sound').struct(), melodic use note() or chord()
7. Match the preset's BPM range and swing value
`;

/**
 * Build complete system prompt with family rules
 * @param {string} family - Family type (tonal, modal, loop, experimental)
 * @returns {string} Complete system prompt
 */
export function buildSystemPrompt(family = 'loop') {
  const familyRules = FAMILY_RULES[family] || FAMILY_RULES.loop;
  return SYSTEM_PROMPT_BASE + '\n' + familyRules;
}

/**
 * Build user prompt from preset and parameters
 * @param {Object} preset - Full preset object
 * @param {Object} params - { duration, energy, template }
 * @returns {string} User prompt
 */
export function buildUserPrompt(preset, params = {}) {
  const { duration = 15, energy = 0.7 } = params;

  // Calculate bars from duration
  const bpm = preset.temporal?.bpm || 120;
  const beatsPerBar = preset.temporal?.timeSignature?.[0] || 4;
  const totalBars = Math.max(4, Math.round((duration * bpm / 60) / beatsPerBar));

  // Calculate phase boundaries
  const phases = calculatePhases(totalBars);

  // Build orchestration rules
  const orchLimits = preset.orchestration_limits || {};

  // Get voicing info if available
  const voicingInfo = preset.voiceLeading
    ? `\nVOICING PRESETS:\n${JSON.stringify(preset.voiceLeading.chords, null, 2)}`
    : '';

  // Build critical rules section with specific limits
  const criticalRules = `
## CRITICAL RULES — MUST FOLLOW

### Orchestration Limits (ENFORCED - violations will be auto-fixed)
- intro: MAXIMUM ${orchLimits.intro?.max_simultaneous_voices || 2} active voices — use 'silent' for others
- build: MAXIMUM ${orchLimits.build?.max_simultaneous_voices || 4} active voices
- climax: MAXIMUM ${orchLimits.climax?.max_simultaneous_voices || 6} active voices
- resolve: MAXIMUM ${orchLimits.resolve?.max_simultaneous_voices || 3} active voices

### Voice Selection by Phase (from preset arc)
- intro: ${preset.arc?.intro?.layers?.join(', ') || 'minimal — 1-2 instruments'}
- build: ${preset.arc?.build?.layers?.join(', ') || 'add rhythm section'}
- climax: ${preset.arc?.climax?.layers?.join(', ') || 'full ensemble'}
- resolve: ${preset.arc?.resolve?.layers?.join(', ') || 'wind down'}

### Velocity by Phase (REQUIRED in .gain())
- intro: .gain(${(preset.arc?.intro?.velocity || 0.35).toFixed(2)})
- build: .gain(${(preset.arc?.build?.velocity || 0.55).toFixed(2)})
- climax: .gain(${(preset.arc?.climax?.velocity || 0.8).toFixed(2)})
- resolve: .gain(${(preset.arc?.resolve?.velocity || 0.35).toFixed(2)})

### Spectral Balance
${orchLimits.spectral_rule || 'Avoid frequency masking — spread voices across spectrum'}
`;

  return `Generate a ${preset.style.toUpperCase()} piece.

## STYLE INFO
${preset.description}

## PRESET SETTINGS
- BPM: ${bpm} (range: ${preset.temporal?.range?.join('-') || bpm})
- Swing: ${preset.temporal?.swing || 0}
- Key: ${preset.key}
- Time Signature: ${preset.temporal?.timeSignature?.join('/') || '4/4'}
- Ending: ${preset.temporal?.endingBehavior?.type || 'fade_out'}

## CHORD PROGRESSION
${preset.progression?.chords?.join(' → ') || 'Use appropriate progression for style'}
Scale: ${preset.progression?.scale || 'natural_minor'}

## SOUND PALETTE (use these sounds)
${Object.entries(preset.sounds || {}).map(([name, cfg]) =>
  `- ${name}: source=${cfg.source}, ${cfg.lpf ? `lpf=${cfg.lpf}` : ''} ${cfg.room ? `room=${cfg.room}` : ''} gain=${cfg.gain || 0.7}`
).join('\n')}
${criticalRules}
## GENERATION PARAMETERS
- Duration: ~${duration} seconds
- Total bars: ${totalBars}
- Energy level: ${Math.round(energy * 100)}%
- Phases: intro=${phases.intro.startBar}-${phases.intro.endBar}, build=${phases.build.startBar}-${phases.build.endBar}, climax=${phases.climax.startBar}-${phases.climax.endBar}, resolve=${phases.resolve.startBar}-${phases.resolve.endBar}
${voicingInfo}

## EXAMPLE PATTERNS FROM PRESET
${getExamplePatterns(preset)}

Generate a complete piece following this structure. Return valid JSON only.`;
}

/**
 * Calculate phase boundaries based on total bars
 * @param {number} totalBars - Total bars
 * @returns {Object} Phase boundaries
 */
export function calculatePhases(totalBars) {
  // Standard phase ratios: intro 12%, build 25%, climax 38%, resolve 25%
  const introEnd = Math.max(1, Math.round(totalBars * 0.12));
  const buildEnd = Math.round(totalBars * 0.37);
  const climaxEnd = Math.round(totalBars * 0.75);

  return {
    intro: { startBar: 0, endBar: introEnd },
    build: { startBar: introEnd, endBar: buildEnd },
    climax: { startBar: buildEnd, endBar: climaxEnd },
    resolve: { startBar: climaxEnd, endBar: totalBars }
  };
}

/**
 * Extract example patterns from preset
 * @param {Object} preset - Preset object
 * @returns {string} Example patterns string
 */
function getExamplePatterns(preset) {
  if (!preset.patterns) return 'No example patterns available.';

  const examples = [];

  // Get one example from each pattern type
  for (const phase of ['climax', 'build']) {
    const phasePatterns = preset.patterns[phase];
    if (!phasePatterns) continue;

    for (const [role, pattern] of Object.entries(phasePatterns)) {
      if (pattern && pattern !== 'silent' && examples.length < 4) {
        examples.push(`${role} (${phase}): ${pattern}`);
      }
    }
  }

  return examples.join('\n') || 'No example patterns available.';
}

/**
 * Build prompt for single voice generation
 * @param {Object} projectState - Current project state
 * @param {Object} voiceContext - Voice context { type, role, name }
 * @param {Object} preset - Style preset
 * @returns {Object} { systemPrompt, userPrompt }
 */
export function buildVoicePrompt(projectState, voiceContext, preset) {
  const family = getFamily(preset?.style || 'electronic');
  const systemPrompt = buildSystemPrompt(family);

  const { tempo, swing, key, bars, voices, chordProgression } = projectState;

  const existingVoices = voices
    .map(v => `${v.name} (${v.type}): ${v.patternCode?.climax || v.patternCode || 'no pattern'}`)
    .join('\n') || 'none';

  const userPrompt = `Generate a single ${voiceContext.type.toUpperCase()} voice for an existing project.

## PROJECT CONTEXT
- Style: ${preset?.style || 'electronic'}
- Tempo: ${tempo || 120} BPM
- Swing: ${swing || 0}
- Key: ${key?.root || 'A'} ${key?.scale || 'minor'}
- Bars: ${bars || 4}
- Chord Progression: ${chordProgression?.join(' → ') || 'Am Dm G C'}

## EXISTING VOICES
${existingVoices}

## VOICE TO GENERATE
- Name: ${voiceContext.name || voiceContext.type}
- Type: ${voiceContext.type}
- Role: ${voiceContext.role || 'supporting'}

## TASK
Create a ${voiceContext.type} pattern that:
1. Complements existing voices (don't duplicate rhythms/frequencies)
2. Fits the style and tempo
3. Has variation between phases
4. Uses appropriate Strudel syntax

Return JSON with single voice:
{
  "name": "${voiceContext.name || voiceContext.type}",
  "type": "${voiceContext.type}",
  "sound": "appropriate_sound",
  "patternCode": {
    "intro": "pattern or silent",
    "build": "pattern",
    "climax": "pattern",
    "resolve": "pattern or silent"
  },
  "description": "what this voice adds"
}`;

  return { systemPrompt, userPrompt };
}

/**
 * Validate AI output structure
 * @param {Object} output - AI output
 * @param {Object} preset - Original preset for validation
 * @returns {{ valid: boolean, errors: string[], warnings: string[], fixes: Array }}
 */
export function validateAIOutput(output, preset = null) {
  const errors = [];
  const warnings = [];
  const fixes = [];

  // Required fields
  if (!output.tempo || typeof output.tempo !== 'number') {
    errors.push('Missing or invalid tempo');
  }
  if (!output.voices || !Array.isArray(output.voices)) {
    errors.push('Missing or invalid voices array');
  }
  if (!output.phases) {
    warnings.push('Missing phases object');
  }

  // Validate each voice
  if (Array.isArray(output.voices)) {
    output.voices.forEach((voice, i) => {
      if (!voice.name) {
        errors.push(`Voice ${i}: missing name`);
      }
      if (!voice.patternCode) {
        errors.push(`Voice ${i}: missing patternCode`);
      } else if (typeof voice.patternCode === 'object') {
        // Check phases
        const requiredPhases = ['intro', 'build', 'climax', 'resolve'];
        requiredPhases.forEach(phase => {
          if (voice.patternCode[phase] === undefined) {
            warnings.push(`Voice ${voice.name}: missing ${phase} pattern`);
          }
        });

        // Check for gain in patterns
        requiredPhases.forEach(phase => {
          const pattern = voice.patternCode[phase];
          if (pattern && pattern !== 'silent' && !pattern.includes('.gain(')) {
            warnings.push(`Voice ${voice.name} ${phase}: missing .gain() — will be auto-applied`);
          }
        });
      }
    });
  }

  // Validate against preset limits
  if (preset?.orchestration_limits) {
    const limits = preset.orchestration_limits;
    const voices = output.voices || [];

    ['intro', 'build', 'climax', 'resolve'].forEach(phase => {
      const activeVoices = voices.filter(v => {
        const pattern = v.patternCode?.[phase] || v.patternCode;
        return pattern && pattern !== 'silent' && pattern !== '~';
      }).length;

      const maxVoices = limits[phase]?.max_simultaneous_voices || 6;
      if (activeVoices > maxVoices) {
        warnings.push(`${phase}: ${activeVoices} voices exceeds limit of ${maxVoices} — will be enforced`);
        fixes.push({ type: 'orchestration', phase, excess: activeVoices - maxVoices });
      }
    });
  }

  // Validate cadence for tonal styles
  if (preset?.family === 'tonal' || preset?.harmonic_system?.type === 'functional_tonal') {
    const chords = output.chordProgression || [];
    if (chords.length > 0) {
      const lastChord = chords[chords.length - 1];
      const expectedCadence = preset.harmonic_system?.cadences?.primary || 'authentic';

      // Check if last chord is tonic (I, Imaj7, etc.)
      const isOnTonic = lastChord && (
        lastChord.match(/^I($|maj|6|7)/) ||
        lastChord.match(/^(C|D|E|F|G|A|B)(maj7?|6)?$/i)
      );

      if (expectedCadence === 'authentic' && !isOnTonic) {
        warnings.push(`Tonal style should end on tonic, got: ${lastChord}`);
        fixes.push({ type: 'cadence', suggested: 'End on I or Imaj7' });
      }
    }
  }

  // Spectral balance check
  if (preset?.orchestration_limits?.spectral_rule) {
    const voices = output.voices || [];
    const climaxVoices = voices.filter(v => {
      const p = v.patternCode?.climax;
      return p && p !== 'silent';
    });

    // Check if all voices are in the same register (simplified check)
    const hasLowVoice = climaxVoices.some(v =>
      v.type === 'bass' || v.name?.toLowerCase().includes('bass')
    );
    const hasHighVoice = climaxVoices.some(v =>
      v.type === 'lead' || v.type === 'arp' || v.name?.toLowerCase().match(/lead|arp|melody/)
    );

    if (climaxVoices.length >= 3 && (!hasLowVoice || !hasHighVoice)) {
      warnings.push('Climax may lack spectral balance — consider adding bass or high register voice');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fixes
  };
}

/**
 * Post-process and fix common AI output issues
 * @param {Object} output - AI output
 * @param {Object} preset - Original preset for orchestration limits
 * @returns {Object} Fixed output
 */
export function postProcessAIOutput(output, preset = null) {
  const fixed = { ...output };

  // Ensure voices array exists
  if (!fixed.voices) fixed.voices = [];

  // Process each voice
  fixed.voices = fixed.voices.map(voice => {
    const processed = { ...voice };

    // Ensure patternCode is an object with phases
    if (typeof processed.patternCode === 'string') {
      // Convert single pattern to all phases
      processed.patternCode = {
        intro: 'silent',
        build: processed.patternCode,
        climax: processed.patternCode,
        resolve: 'silent'
      };
    }

    // Ensure all phases exist
    if (processed.patternCode && typeof processed.patternCode === 'object') {
      ['intro', 'build', 'climax', 'resolve'].forEach(phase => {
        if (!processed.patternCode[phase]) {
          processed.patternCode[phase] = 'silent';
        }
      });
    }

    // Ensure type is set
    if (!processed.type) {
      if (processed.sound && ['bd', 'sd', 'hh', 'kick', 'snare', 'hihat'].includes(processed.sound)) {
        processed.type = 'drum';
      } else if (processed.name?.toLowerCase().includes('bass')) {
        processed.type = 'bass';
      } else {
        processed.type = 'melodic';
      }
    }

    return processed;
  });

  // Ensure phases exist
  if (!fixed.phases && fixed.totalBars) {
    fixed.phases = calculatePhases(fixed.totalBars);
  }

  // Enforce orchestration limits from preset
  if (preset?.orchestration_limits) {
    fixed.voices = enforceOrchestrationLimits(fixed.voices, preset.orchestration_limits);
  }

  // Apply arc velocity where missing
  if (preset?.arc) {
    fixed.voices = applyArcVelocity(fixed.voices, preset.arc);
  }

  return fixed;
}

/**
 * Enforce orchestration limits by silencing excess voices per phase
 * @param {Array} voices - Voice array
 * @param {Object} limits - Orchestration limits from preset
 * @returns {Array} Voices with limits enforced
 */
function enforceOrchestrationLimits(voices, limits) {
  const phases = ['intro', 'build', 'climax', 'resolve'];

  // Voice priority (keep these active when silencing)
  const priorityOrder = ['kick', 'bass', 'snare', 'lead', 'pad', 'hihat', 'arp', 'texture', 'fx'];

  phases.forEach(phase => {
    const maxVoices = limits[phase]?.max_simultaneous_voices || limits.hard_limit || 6;

    // Get active voices in this phase
    const activeVoices = voices.filter(v => {
      const pattern = v.patternCode?.[phase];
      return pattern && pattern !== 'silent' && pattern !== '~';
    });

    if (activeVoices.length > maxVoices) {
      // Sort by priority (higher priority = lower index = kept)
      activeVoices.sort((a, b) => {
        const aType = a.type?.toLowerCase() || a.name?.toLowerCase() || '';
        const bType = b.type?.toLowerCase() || b.name?.toLowerCase() || '';
        const aP = priorityOrder.findIndex(p => aType.includes(p));
        const bP = priorityOrder.findIndex(p => bType.includes(p));
        return (aP === -1 ? 99 : aP) - (bP === -1 ? 99 : bP);
      });

      // Silence voices beyond limit
      for (let i = maxVoices; i < activeVoices.length; i++) {
        const voice = activeVoices[i];
        if (voice.patternCode && typeof voice.patternCode === 'object') {
          voice.patternCode[phase] = 'silent';
        }
      }

      console.log(`Enforced ${phase} limit: silenced ${activeVoices.length - maxVoices} voices`);
    }
  });

  return voices;
}

/**
 * Apply arc velocity to patterns that don't have .gain()
 * @param {Array} voices - Voice array
 * @param {Object} arc - Arc definition from preset
 * @returns {Array} Voices with velocity applied
 */
function applyArcVelocity(voices, arc) {
  const phases = ['intro', 'build', 'climax', 'resolve'];

  return voices.map(voice => {
    const processed = { ...voice };

    if (!processed.patternCode || typeof processed.patternCode !== 'object') {
      return processed;
    }

    phases.forEach(phase => {
      const pattern = processed.patternCode[phase];
      if (pattern && pattern !== 'silent' && !pattern.includes('.gain(')) {
        const velocity = arc[phase]?.velocity || 0.7;
        processed.patternCode[phase] = `${pattern}.gain(${velocity.toFixed(2)})`;
      }
    });

    return processed;
  });
}

export default {
  SYSTEM_PROMPT_BASE,
  FAMILY_RULES,
  buildSystemPrompt,
  buildUserPrompt,
  buildVoicePrompt,
  calculatePhases,
  validateAIOutput,
  postProcessAIOutput
};
