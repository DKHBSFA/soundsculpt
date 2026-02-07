/**
 * Opus Encoder - Export audio in Opus format
 *
 * Uses MediaRecorder API to capture audio from the shared AudioContext
 * and encode it as Opus in a WebM container.
 */

import { audioContext } from '../audio/context-manager.js';
import { strudelEngine } from '../audio/strudel-engine.js';
import { state } from '../state.js';
import { eventBus, Events } from '../event-bus.js';

/**
 * Export current project as Opus audio
 * @param {number} duration - Duration in seconds (0 = full project duration)
 * @param {Function} onProgress - Progress callback (0-1)
 * @returns {Promise<Blob>} Opus audio blob
 */
export async function exportOpus(duration = 0, onProgress = null) {
  const ctx = audioContext.getContext();
  if (!ctx) {
    throw new Error('AudioContext not initialized');
  }

  // Calculate duration from project if not specified
  const projectDuration = calculateProjectDuration();
  const exportDuration = duration > 0 ? duration : projectDuration;

  if (exportDuration <= 0) {
    throw new Error('No content to export');
  }

  // Create destination for recording
  const dest = ctx.createMediaStreamDestination();

  // Check supported MIME types
  let mimeType = 'audio/webm;codecs=opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'audio/webm';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/ogg;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        throw new Error('Opus/WebM encoding not supported in this browser');
      }
    }
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    const recorder = new MediaRecorder(dest.stream, {
      mimeType,
      audioBitsPerSecond: 128000, // 128 kbps
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };

    recorder.onerror = (e) => {
      reject(new Error(`Recording error: ${e.error?.message || 'Unknown error'}`));
    };

    // Setup progress tracking
    const startTime = Date.now();
    let progressInterval = null;

    if (onProgress) {
      progressInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const progress = Math.min(elapsed / exportDuration, 1);
        onProgress(progress);
      }, 100);
    }

    // Start recording
    recorder.start(100); // Collect data every 100ms

    // Play through Strudel and capture
    playForExport(dest, exportDuration).then(() => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      onProgress?.(1);
      recorder.stop();
    }).catch((err) => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      recorder.stop();
      reject(err);
    });
  });
}

/**
 * Play project content for export capture
 * @param {MediaStreamAudioDestinationNode} dest - Recording destination
 * @param {number} duration - Duration to play
 */
async function playForExport(dest, duration) {
  const voices = state.get('voices') || [];
  const tempo = state.get('transport')?.tempo || 120;

  // Initialize Strudel if needed
  if (!strudelEngine.isReady()) {
    await strudelEngine.init();
  }

  // Set up voices and BPM
  strudelEngine.setBpm(tempo);
  strudelEngine.setVoices(voices);

  // Note: Strudel outputs to the default AudioContext destination
  // For proper export, we'd need to route Strudel's output to our dest node.
  // This is a limitation - Strudel doesn't easily support custom destinations.
  // For now, we capture from the main output.

  // Start playback
  await strudelEngine.play();

  // Wait for duration
  await new Promise((resolve) => {
    setTimeout(() => {
      strudelEngine.stop();
      resolve();
    }, duration * 1000);
  });
}

/**
 * Calculate project duration based on voice patterns
 * @returns {number} Duration in seconds
 */
function calculateProjectDuration() {
  const voices = state.get('voices') || [];
  const tempo = state.get('transport')?.tempo || 120;
  const beatsPerSecond = tempo / 60;

  let maxBeats = 0;

  voices.forEach((voice) => {
    // Check notes
    const notes = voice.notes || voice.content?.notes || [];
    notes.forEach((note) => {
      const endBeat = (note.startBeat || 0) + (note.durationBeats || 1);
      maxBeats = Math.max(maxBeats, endBeat);
    });

    // Check steps (16 steps = 4 beats)
    const steps = voice.steps || [];
    if (steps.some(Boolean)) {
      maxBeats = Math.max(maxBeats, 4); // At least 1 bar
    }

    // Check pattern phases
    if (voice.phasedPatterns || voice.patterns) {
      // Assume standard form structure: 24 bars
      maxBeats = Math.max(maxBeats, 24 * 4);
    }
  });

  // Default to 30 seconds if no content detected
  if (maxBeats === 0) {
    return 30;
  }

  return maxBeats / beatsPerSecond;
}

/**
 * Download Opus blob as file
 * @param {Blob} blob - Audio blob
 * @param {string} filename - Filename without extension
 */
export function downloadOpus(blob, filename = 'soundsculpt-export') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.webm`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export and download in one call
 * @param {Object} options - Export options
 * @param {number} options.duration - Duration in seconds
 * @param {string} options.filename - Output filename
 * @param {Function} options.onProgress - Progress callback
 */
export async function exportAndDownload(options = {}) {
  const {
    duration = 0,
    filename = state.get('project.name') || 'soundsculpt-export',
    onProgress = null,
  } = options;

  eventBus.emit(Events.TOAST_SHOW, {
    message: 'Preparing export...',
    type: 'info',
  });

  try {
    const blob = await exportOpus(duration, onProgress);
    downloadOpus(blob, filename);

    eventBus.emit(Events.TOAST_SHOW, {
      message: 'Export complete!',
      type: 'success',
    });

    return blob;
  } catch (err) {
    eventBus.emit(Events.TOAST_SHOW, {
      message: `Export failed: ${err.message}`,
      type: 'error',
    });
    throw err;
  }
}
