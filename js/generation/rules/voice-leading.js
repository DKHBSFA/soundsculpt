/**
 * Voice Leading Rules
 *
 * Validates and fixes voice leading issues:
 * - Parallel fifths and octaves
 * - Voice crossings
 * - Large leaps
 */

import { noteNameToMidi, midiToNoteName } from '../../music-theory.js';

/**
 * Extract melodic line from voice content across phases
 * @param {Object} plan - Compositional plan
 * @param {string} voiceId - Voice identifier
 * @returns {number[]} Array of MIDI notes representing the melodic line
 */
function extractMelodicLine(plan, voiceId) {
  const content = plan.melodicContent?.voices?.[voiceId];
  if (!content) return [];

  const notes = [];
  for (const phase of ['intro', 'build', 'climax', 'resolve']) {
    const phaseContent = content[phase];
    if (!phaseContent?.notes) continue;

    for (const note of phaseContent.notes) {
      const midi = noteNameToMidi(note);
      if (midi) notes.push(midi);
    }
  }

  return notes;
}

/**
 * Detect parallel fifths between two voice lines
 * @param {number[]} voice1 - First voice MIDI notes
 * @param {number[]} voice2 - Second voice MIDI notes
 * @returns {{ detected: boolean, positions: number[] }}
 */
export function detectParallelFifths(voice1, voice2) {
  const positions = [];
  const minLen = Math.min(voice1.length, voice2.length);

  for (let i = 1; i < minLen; i++) {
    const prevInterval = Math.abs(voice1[i - 1] - voice2[i - 1]) % 12;
    const currInterval = Math.abs(voice1[i] - voice2[i]) % 12;

    // Both are perfect fifths (7 semitones)
    if (prevInterval === 7 && currInterval === 7) {
      const voice1Dir = Math.sign(voice1[i] - voice1[i - 1]);
      const voice2Dir = Math.sign(voice2[i] - voice2[i - 1]);

      // Moving in the same direction
      if (voice1Dir !== 0 && voice1Dir === voice2Dir) {
        positions.push(i);
      }
    }
  }

  return { detected: positions.length > 0, positions };
}

/**
 * Detect parallel octaves between two voice lines
 * @param {number[]} voice1 - First voice MIDI notes
 * @param {number[]} voice2 - Second voice MIDI notes
 * @returns {{ detected: boolean, positions: number[] }}
 */
export function detectParallelOctaves(voice1, voice2) {
  const positions = [];
  const minLen = Math.min(voice1.length, voice2.length);

  for (let i = 1; i < minLen; i++) {
    const prevInterval = Math.abs(voice1[i - 1] - voice2[i - 1]) % 12;
    const currInterval = Math.abs(voice1[i] - voice2[i]) % 12;

    // Both are unisons/octaves
    if (prevInterval === 0 && currInterval === 0) {
      const voice1Dir = Math.sign(voice1[i] - voice1[i - 1]);
      const voice2Dir = Math.sign(voice2[i] - voice2[i - 1]);

      if (voice1Dir !== 0 && voice1Dir === voice2Dir) {
        positions.push(i);
      }
    }
  }

  return { detected: positions.length > 0, positions };
}

/**
 * Detect voice crossings
 * @param {number[]} upperVoice - Upper voice MIDI notes
 * @param {number[]} lowerVoice - Lower voice MIDI notes
 * @returns {{ detected: boolean, positions: number[] }}
 */
export function detectVoiceCrossings(upperVoice, lowerVoice) {
  const positions = [];
  const minLen = Math.min(upperVoice.length, lowerVoice.length);

  for (let i = 0; i < minLen; i++) {
    if (upperVoice[i] < lowerVoice[i]) {
      positions.push(i);
    }
  }

  return { detected: positions.length > 0, positions };
}

/**
 * Detect large leaps (> octave)
 * @param {number[]} voice - Voice MIDI notes
 * @returns {{ detected: boolean, positions: number[] }}
 */
export function detectLargeLeaps(voice) {
  const positions = [];

  for (let i = 1; i < voice.length; i++) {
    if (Math.abs(voice[i] - voice[i - 1]) > 12) {
      positions.push(i);
    }
  }

  return { detected: positions.length > 0, positions };
}

/**
 * Check parallel motion between two voices in a plan
 * @param {Object} plan - Compositional plan
 * @param {Object} voice1Config - First voice configuration
 * @param {Object} voice2Config - Second voice configuration
 * @returns {{ detected: boolean, fifths: number[], octaves: number[] }}
 */
export function checkParallelMotion(plan, voice1Config, voice2Config) {
  const line1 = extractMelodicLine(plan, voice1Config.id);
  const line2 = extractMelodicLine(plan, voice2Config.id);

  if (line1.length < 2 || line2.length < 2) {
    return { detected: false, fifths: [], octaves: [] };
  }

  const fifths = detectParallelFifths(line1, line2);
  const octaves = detectParallelOctaves(line1, line2);

  return {
    detected: fifths.detected || octaves.detected,
    fifths: fifths.positions,
    octaves: octaves.positions
  };
}

/**
 * Validate voice leading in a plan
 * @param {Object} plan - Compositional plan
 * @returns {{ valid: boolean, issues: Object[] }}
 */
export function validateVoiceLeading(plan) {
  const issues = [];

  // Get melodic voices (non-percussion)
  const melodicVoices = (plan.orchestration?.voices || []).filter(
    v => v.instrument?.family !== 'percussion'
  );

  // Check each pair of melodic voices
  for (let i = 0; i < melodicVoices.length - 1; i++) {
    for (let j = i + 1; j < melodicVoices.length; j++) {
      const parallels = checkParallelMotion(plan, melodicVoices[i], melodicVoices[j]);

      if (parallels.fifths.length > 0) {
        issues.push({
          type: 'parallel_fifths',
          voices: [melodicVoices[i].id, melodicVoices[j].id],
          positions: parallels.fifths,
          severity: 'warning'
        });
      }

      if (parallels.octaves.length > 0) {
        issues.push({
          type: 'parallel_octaves',
          voices: [melodicVoices[i].id, melodicVoices[j].id],
          positions: parallels.octaves,
          severity: 'warning'
        });
      }
    }
  }

  // Check for large leaps in each voice
  for (const voice of melodicVoices) {
    const line = extractMelodicLine(plan, voice.id);
    const leaps = detectLargeLeaps(line);

    if (leaps.detected) {
      issues.push({
        type: 'large_leaps',
        voice: voice.id,
        positions: leaps.positions,
        severity: 'info'
      });
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues
  };
}

/**
 * Fix parallel fifths by adjusting the second voice
 * @param {Object} plan - Compositional plan (will be modified)
 * @param {string} voiceId - Voice ID to adjust
 * @returns {Object} Modified plan
 */
export function fixParallelFifths(plan, voiceId) {
  const content = plan.melodicContent?.voices?.[voiceId];
  if (!content) return plan;

  // Adjust notes by a semitone to break parallels
  for (const phase of ['intro', 'build', 'climax', 'resolve']) {
    if (content[phase]?.notes) {
      content[phase].notes = content[phase].notes.map((note, i) => {
        // Every other note, shift by a step to break parallel motion
        if (i % 2 === 1) {
          const midi = noteNameToMidi(note);
          return midiToNoteName(midi + 1); // Shift up by semitone
        }
        return note;
      });
    }
  }

  return plan;
}
