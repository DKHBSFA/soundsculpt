/**
 * Export Module - WAV and MIDI export for SoundSculpt
 * Phase 7: Export & Polish
 */

import { eventBus, Events } from './event-bus.js';
import { state } from './state.js';
import { audioContext } from './audio/context-manager.js';
import { synthEngine, playDrum, playNote } from './audio/synth.js';

// ============================================
// WAV EXPORT
// ============================================

/**
 * Render project to audio buffer using OfflineAudioContext
 */
export async function renderToAudioBuffer(durationSeconds = null) {
  const voices = state.get('voices') || [];
  const tempo = state.get('transport.tempo') || 120;
  const loopEnd = state.get('transport.loopEnd') || 16;

  // Calculate duration if not specified
  const beatsPerSecond = tempo / 60;
  const totalBeats = durationSeconds ? durationSeconds * beatsPerSecond : loopEnd;
  const duration = durationSeconds || (loopEnd / beatsPerSecond);

  // Create offline context
  const sampleRate = 44100;
  const numChannels = 2;
  const offlineCtx = new OfflineAudioContext(
    numChannels,
    Math.ceil(duration * sampleRate),
    sampleRate
  );

  // Create master gain and limiter
  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = 0.8;

  const limiter = offlineCtx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;

  masterGain.connect(limiter);
  limiter.connect(offlineCtx.destination);

  // Schedule all voice events
  for (const voice of voices) {
    if (voice.muted) continue;

    const voiceGain = offlineCtx.createGain();
    voiceGain.gain.value = voice.volume ?? 1;
    voiceGain.connect(masterGain);

    // Schedule sequencer steps
    if (voice.content?.steps) {
      const stepDuration = 60 / tempo / 4; // Duration of one step in seconds

      voice.content.steps.forEach((active, stepIndex) => {
        if (!active) return;

        const startTime = stepIndex * stepDuration;
        if (startTime >= duration) return;

        // Create drum sound for this step
        scheduleOfflineDrum(offlineCtx, voiceGain, voice, startTime, stepDuration);
      });
    }

    // Schedule piano roll notes
    if (voice.content?.notes) {
      const beatDuration = 60 / tempo;

      for (const note of voice.content.notes) {
        const startTime = note.startBeat * beatDuration;
        const noteDuration = note.durationBeats * beatDuration;

        if (startTime >= duration) continue;

        scheduleOfflineNote(offlineCtx, voiceGain, voice, note, startTime, noteDuration);
      }
    }
  }

  // Render the audio
  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer;
}

/**
 * Schedule a drum sound in offline context
 */
function scheduleOfflineDrum(ctx, destination, voice, time, duration) {
  const voiceName = voice.name.toLowerCase();

  // Simple synthesis based on voice name
  if (voiceName.includes('kick') || voiceName.includes('bass') || voiceName.includes('bd')) {
    // Kick drum: sine wave with pitch envelope
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.15);

    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(time);
    osc.stop(time + 0.15);
  } else if (voiceName.includes('snare') || voiceName.includes('sd')) {
    // Snare: noise burst + tone
    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(destination);

    noise.start(time);
    noise.stop(time + 0.15);

    // Add tonal component
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.frequency.value = 180;
    oscGain.gain.setValueAtTime(0.3, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(oscGain);
    oscGain.connect(destination);
    osc.start(time);
    osc.stop(time + 0.1);
  } else if (voiceName.includes('hihat') || voiceName.includes('hh') || voiceName.includes('hat')) {
    // Hi-hat: filtered noise
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 8000;
    filter.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    noise.start(time);
    noise.stop(time + 0.05);
  } else {
    // Generic percussion: short tone burst
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = 200 + Math.random() * 200;
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(time);
    osc.stop(time + 0.1);
  }
}

/**
 * Schedule a melodic note in offline context
 */
function scheduleOfflineNote(ctx, destination, voice, note, time, duration) {
  const frequency = 440 * Math.pow(2, (note.pitch - 69) / 12);
  const velocity = (note.velocity || 100) / 127;

  // Create oscillator
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = frequency;

  // Create filter
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2000 + velocity * 3000;
  filter.Q.value = 1;

  // Create envelope
  const gain = ctx.createGain();
  const attack = 0.01;
  const decay = 0.1;
  const sustain = 0.7;
  const release = 0.2;

  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(velocity * 0.5, time + attack);
  gain.gain.linearRampToValueAtTime(velocity * 0.5 * sustain, time + attack + decay);
  gain.gain.setValueAtTime(velocity * 0.5 * sustain, time + duration - release);
  gain.gain.linearRampToValueAtTime(0, time + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  osc.start(time);
  osc.stop(time + duration + 0.1);
}

/**
 * Convert AudioBuffer to WAV Blob
 */
export function audioBufferToWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = audioBuffer.length * blockAlign;

  // Create buffer for WAV file
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channel data and write samples
  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Export project to WAV file
 */
export async function exportWAV() {
  const projectName = state.get('project.name') || 'Untitled';

  eventBus.emit(Events.TOAST_SHOW, {
    message: 'Rendering audio...',
    type: 'info',
  });

  try {
    // Render to audio buffer
    const audioBuffer = await renderToAudioBuffer();

    // Convert to WAV
    const wavBlob = audioBufferToWav(audioBuffer);

    // Download
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    eventBus.emit(Events.TOAST_SHOW, {
      message: 'WAV exported successfully',
      type: 'success',
    });
  } catch (error) {
    console.error('WAV export failed:', error);
    eventBus.emit(Events.TOAST_SHOW, {
      message: `Export failed: ${error.message}`,
      type: 'error',
    });
  }
}

// ============================================
// MIDI EXPORT
// ============================================

/**
 * Create a Standard MIDI File from project
 */
export function createMidiFile() {
  const voices = state.get('voices') || [];
  const tempo = state.get('transport.tempo') || 120;
  const ticksPerBeat = 480; // Standard MIDI resolution

  // MIDI file structure
  const chunks = [];

  // Header chunk
  const headerChunk = createMidiHeaderChunk(1, voices.length + 1, ticksPerBeat);
  chunks.push(headerChunk);

  // Tempo track (track 0)
  const tempoTrack = createTempoTrack(tempo, ticksPerBeat);
  chunks.push(tempoTrack);

  // Create a track for each voice
  for (let i = 0; i < voices.length; i++) {
    const voice = voices[i];
    const trackChunk = createVoiceTrack(voice, i, ticksPerBeat, tempo);
    chunks.push(trackChunk);
  }

  // Combine all chunks
  let totalLength = 0;
  chunks.forEach(chunk => totalLength += chunk.length);

  const midiFile = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach(chunk => {
    midiFile.set(chunk, offset);
    offset += chunk.length;
  });

  return midiFile;
}

/**
 * Create MIDI header chunk
 */
function createMidiHeaderChunk(format, numTracks, ticksPerBeat) {
  const chunk = new Uint8Array(14);
  const view = new DataView(chunk.buffer);

  // "MThd"
  chunk[0] = 0x4D; chunk[1] = 0x54; chunk[2] = 0x68; chunk[3] = 0x64;

  // Length (always 6)
  view.setUint32(4, 6, false);

  // Format
  view.setUint16(8, format, false);

  // Number of tracks
  view.setUint16(10, numTracks, false);

  // Ticks per beat
  view.setUint16(12, ticksPerBeat, false);

  return chunk;
}

/**
 * Create tempo track (track 0)
 */
function createTempoTrack(tempo, ticksPerBeat) {
  const events = [];

  // Tempo meta event
  const microsecondsPerBeat = Math.round(60000000 / tempo);
  events.push({
    delta: 0,
    data: [0xFF, 0x51, 0x03,
      (microsecondsPerBeat >> 16) & 0xFF,
      (microsecondsPerBeat >> 8) & 0xFF,
      microsecondsPerBeat & 0xFF]
  });

  // Time signature: 4/4
  events.push({
    delta: 0,
    data: [0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08]
  });

  // Track name
  const name = 'Tempo Track';
  events.push({
    delta: 0,
    data: [0xFF, 0x03, name.length, ...Array.from(name).map(c => c.charCodeAt(0))]
  });

  // End of track
  events.push({
    delta: 0,
    data: [0xFF, 0x2F, 0x00]
  });

  return createMidiTrackChunk(events);
}

/**
 * Create a MIDI track for a voice
 */
function createVoiceTrack(voice, channelIndex, ticksPerBeat, tempo) {
  const events = [];
  const channel = Math.min(channelIndex, 15); // MIDI channels 0-15

  // Track name
  events.push({
    delta: 0,
    data: [0xFF, 0x03, voice.name.length, ...Array.from(voice.name).map(c => c.charCodeAt(0))]
  });

  // Collect all note events from piano roll
  const noteEvents = [];

  if (voice.content?.notes) {
    for (const note of voice.content.notes) {
      const startTick = Math.round(note.startBeat * ticksPerBeat);
      const endTick = Math.round((note.startBeat + note.durationBeats) * ticksPerBeat);
      const velocity = note.velocity || 100;
      const pitch = note.pitch;

      noteEvents.push({ tick: startTick, type: 'on', pitch, velocity, channel });
      noteEvents.push({ tick: endTick, type: 'off', pitch, velocity: 0, channel });
    }
  }

  // Convert sequencer steps to MIDI notes (for drum tracks)
  if (voice.content?.steps) {
    const voiceName = voice.name.toLowerCase();
    let drumNote = 36; // Default: kick

    if (voiceName.includes('snare') || voiceName.includes('sd')) drumNote = 38;
    else if (voiceName.includes('hihat') || voiceName.includes('hh')) drumNote = 42;
    else if (voiceName.includes('clap')) drumNote = 39;
    else if (voiceName.includes('tom')) drumNote = 45;

    const stepDuration = ticksPerBeat / 4; // 16th notes

    voice.content.steps.forEach((active, stepIndex) => {
      if (!active) return;

      const startTick = Math.round(stepIndex * stepDuration);
      const endTick = Math.round(startTick + stepDuration * 0.8); // 80% gate

      noteEvents.push({ tick: startTick, type: 'on', pitch: drumNote, velocity: 100, channel: 9 }); // Channel 10 for drums
      noteEvents.push({ tick: endTick, type: 'off', pitch: drumNote, velocity: 0, channel: 9 });
    });
  }

  // Sort events by tick
  noteEvents.sort((a, b) => a.tick - b.tick);

  // Convert to MIDI events with delta times
  let lastTick = 0;
  for (const event of noteEvents) {
    const delta = event.tick - lastTick;
    lastTick = event.tick;

    if (event.type === 'on') {
      events.push({
        delta,
        data: [0x90 | event.channel, event.pitch, event.velocity]
      });
    } else {
      events.push({
        delta,
        data: [0x80 | event.channel, event.pitch, 0]
      });
    }
  }

  // End of track
  events.push({
    delta: 0,
    data: [0xFF, 0x2F, 0x00]
  });

  return createMidiTrackChunk(events);
}

/**
 * Create a MIDI track chunk from events
 */
function createMidiTrackChunk(events) {
  // Calculate track data size
  let dataSize = 0;
  for (const event of events) {
    dataSize += getVarLenBytes(event.delta).length;
    dataSize += event.data.length;
  }

  // Create chunk
  const chunk = new Uint8Array(8 + dataSize);
  const view = new DataView(chunk.buffer);

  // "MTrk"
  chunk[0] = 0x4D; chunk[1] = 0x54; chunk[2] = 0x72; chunk[3] = 0x6B;

  // Length
  view.setUint32(4, dataSize, false);

  // Write events
  let offset = 8;
  for (const event of events) {
    const deltaBytes = getVarLenBytes(event.delta);
    chunk.set(deltaBytes, offset);
    offset += deltaBytes.length;

    chunk.set(event.data, offset);
    offset += event.data.length;
  }

  return chunk;
}

/**
 * Convert number to variable-length quantity bytes
 */
function getVarLenBytes(value) {
  const bytes = [];
  bytes.push(value & 0x7F);
  value >>= 7;

  while (value > 0) {
    bytes.push((value & 0x7F) | 0x80);
    value >>= 7;
  }

  return new Uint8Array(bytes.reverse());
}

/**
 * Export project to MIDI file
 */
export function exportMIDI() {
  const projectName = state.get('project.name') || 'Untitled';

  try {
    const midiData = createMidiFile();
    const blob = new Blob([midiData], { type: 'audio/midi' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    eventBus.emit(Events.TOAST_SHOW, {
      message: 'MIDI exported successfully',
      type: 'success',
    });
  } catch (error) {
    console.error('MIDI export failed:', error);
    eventBus.emit(Events.TOAST_SHOW, {
      message: `Export failed: ${error.message}`,
      type: 'error',
    });
  }
}
