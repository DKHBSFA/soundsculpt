/**
 * State Management - Central state store for SoundSculpt
 */

import { eventBus, Events } from './event-bus.js';

// Voice colors from design system
const VOICE_COLORS = [
  'var(--color-voice-1)',
  'var(--color-voice-2)',
  'var(--color-voice-3)',
  'var(--color-voice-4)',
  'var(--color-voice-5)',
  'var(--color-voice-6)',
  'var(--color-voice-7)',
  'var(--color-voice-8)',
];

// Default voice icons
const VOICE_ICONS = ['🎹', '🎸', '🎷', '🎻', '🥁', '🎺', '🎤', '🔊'];

/**
 * Generate unique ID
 */
function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create initial state
 */
function createInitialState() {
  return {
    // Project metadata
    project: {
      id: generateId(),
      name: 'Untitled',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      schemaVersion: 1,
      appVersion: '0.1.0',
    },

    // Transport state
    transport: {
      playing: false,
      recording: false,
      tempo: 120,
      timeSignature: [4, 4],
      loop: false,
      loopStart: 0,
      loopEnd: 16,
      currentBeat: 0,
      // Punch recording (Fase 9)
      punchIn: null,   // Beat position to start recording
      punchOut: null,  // Beat position to stop recording
      punchMode: false,
      countIn: 0,      // Bars of count-in before recording (0 = off)
    },

    // Recording state (Fase 9)
    recording: {
      inputDeviceId: null,    // Selected input device
      latencyMs: 0,           // Input latency compensation
      inputGain: 1,           // Input gain (0-2)
      isArming: false,        // UI is in arm mode
    },

    // MIDI state (Fase 9)
    midi: {
      enabled: false,
      inputs: [],             // Available MIDI inputs
      selectedInputId: null,  // Currently selected input
      learning: false,        // MIDI learn mode active
      learnTarget: null,      // { voiceId, param } being learned
      mappings: {},           // { voiceId: { param: { cc, channel } } }
    },

    // Scale state (Fase 8)
    scale: {
      root: 'C',
      type: 'major',
      quantize: false,
    },

    // Arpeggiator state (Fase 8)
    arpeggiator: {
      enabled: false,
      pattern: 'up',     // up, down, updown, downup, random
      octaves: 1,        // 1-4
      rate: '1/8',       // Note division
      gate: 0.8,         // Note length as fraction
    },

    // Voices (tracks)
    voices: [],

    // Currently selected voice ID
    selectedVoiceId: null,

    // Current view
    currentView: 'sequencer',

    // UI state
    ui: {
      zoom: 1,
      scrollPosition: { x: 0, y: 0 },
    },

    // Project dirty flag (unsaved changes)
    isDirty: false,

    // Session mode (Fase 11b)
    session: {
      isRecording: false,
      isPunchIn: false,
      isPlaying: false,
      data: null,           // SessionData after recording
      playhead: 0,          // Current playhead position in ms
    },
  };
}

/**
 * State store
 */
class StateStore {
  constructor() {
    this.state = createInitialState();
    this.colorIndex = 0;
  }

  /**
   * Get current state (read-only copy)
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Get a specific part of state
   */
  get(path) {
    const keys = path.split('.');
    let value = this.state;
    for (const key of keys) {
      if (value === undefined) return undefined;
      value = value[key];
    }
    return value;
  }

  /**
   * Mark project as dirty (has unsaved changes)
   */
  markDirty() {
    if (!this.state.isDirty) {
      this.state.isDirty = true;
      this.state.project.modifiedAt = new Date().toISOString();
      eventBus.emit(Events.PROJECT_DIRTY);
    }
  }

  /**
   * Mark project as clean (saved)
   */
  markClean() {
    this.state.isDirty = false;
    eventBus.emit(Events.PROJECT_CLEAN);
  }

  // === Project ===

  /**
   * Create new project
   */
  newProject(name = 'Untitled') {
    this.state = createInitialState();
    this.state.project.name = name;
    this.colorIndex = 0;
    eventBus.emit(Events.PROJECT_NEW, this.state.project);
  }

  /**
   * Load project from data
   */
  loadProject(data) {
    this.state = {
      ...createInitialState(),
      ...data,
      isDirty: false,
    };
    this.colorIndex = this.state.voices.length % VOICE_COLORS.length;
    eventBus.emit(Events.PROJECT_LOAD, this.state.project);
  }

  /**
   * Get project data for saving
   */
  getProjectData() {
    const { isDirty, ...projectData } = this.state;
    return projectData;
  }

  /**
   * Set project name
   */
  setProjectName(name) {
    this.state.project.name = name;
    this.markDirty();
  }

  // === Transport ===

  /**
   * Set playing state
   */
  setPlaying(playing) {
    this.state.transport.playing = playing;
    eventBus.emit(playing ? Events.TRANSPORT_PLAY : Events.TRANSPORT_PAUSE);
  }

  /**
   * Set recording state
   */
  setRecording(recording) {
    this.state.transport.recording = recording;
  }

  /**
   * Stop transport (reset position)
   */
  stop() {
    this.state.transport.playing = false;
    this.state.transport.recording = false;
    this.state.transport.currentBeat = 0;
    eventBus.emit(Events.TRANSPORT_STOP);
  }

  /**
   * Set tempo (BPM)
   */
  setTempo(tempo) {
    this.state.transport.tempo = Math.max(20, Math.min(300, tempo));
    this.markDirty();
    eventBus.emit(Events.TRANSPORT_BPM_CHANGE, this.state.transport.tempo);
  }

  /**
   * Set time signature
   */
  setTimeSignature(numerator, denominator) {
    this.state.transport.timeSignature = [numerator, denominator];
    this.markDirty();
    eventBus.emit(Events.TRANSPORT_TIME_SIG_CHANGE, this.state.transport.timeSignature);
  }

  /**
   * Toggle loop
   */
  toggleLoop() {
    this.state.transport.loop = !this.state.transport.loop;
    eventBus.emit(Events.TRANSPORT_LOOP_TOGGLE, this.state.transport.loop);
  }

  /**
   * Seek to beat position
   */
  seek(beat) {
    this.state.transport.currentBeat = Math.max(0, beat);
    eventBus.emit(Events.TRANSPORT_SEEK, this.state.transport.currentBeat);
  }

  /**
   * Update current beat (called during playback)
   */
  updateCurrentBeat(beat) {
    this.state.transport.currentBeat = beat;
    eventBus.emit(Events.PLAYHEAD_UPDATE, beat);
  }

  // === Voices ===

  /**
   * Add a new voice
   */
  addVoice(voiceData = {}) {
    const color = VOICE_COLORS[this.colorIndex % VOICE_COLORS.length];
    const icon = VOICE_ICONS[this.colorIndex % VOICE_ICONS.length];
    this.colorIndex++;

    const voice = {
      id: generateId(),
      name: voiceData.name || `Voice ${this.state.voices.length + 1}`,
      type: voiceData.type || 'pattern',
      sourceType: voiceData.sourceType || 'synth', // synth, pattern, sample, patch
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
      color,
      icon,
      content: voiceData.content || { steps: new Array(16).fill(false), notes: [] },
      patternCode: voiceData.patternCode || '', // Strudel pattern code
      sampleData: voiceData.sampleData || null, // Base64 encoded sample
      // Recording (Fase 9)
      armed: false,       // Ready to record
      monitoring: false,  // Pass input to output
      ...voiceData,
    };

    this.state.voices.push(voice);

    // Select the new voice if none selected
    if (!this.state.selectedVoiceId) {
      this.state.selectedVoiceId = voice.id;
    }

    this.markDirty();
    eventBus.emit(Events.VOICE_ADD, voice);
    return voice;
  }

  /**
   * Remove a voice
   */
  removeVoice(voiceId) {
    const index = this.state.voices.findIndex(v => v.id === voiceId);
    if (index === -1) return null;

    const [removed] = this.state.voices.splice(index, 1);

    // Update selection if needed
    if (this.state.selectedVoiceId === voiceId) {
      this.state.selectedVoiceId = this.state.voices[0]?.id || null;
    }

    this.markDirty();
    eventBus.emit(Events.VOICE_REMOVE, removed);
    return removed;
  }

  /**
   * Get voice by ID
   */
  getVoice(voiceId) {
    return this.state.voices.find(v => v.id === voiceId);
  }

  /**
   * Update voice
   */
  updateVoice(voiceId, updates) {
    const voice = this.getVoice(voiceId);
    if (!voice) return null;

    Object.assign(voice, updates);
    this.markDirty();
    eventBus.emit(Events.VOICE_UPDATE, voice);
    return voice;
  }

  /**
   * Select voice
   */
  selectVoice(voiceId) {
    this.state.selectedVoiceId = voiceId;
    eventBus.emit(Events.VOICE_SELECT, voiceId);
  }

  /**
   * Toggle mute for voice
   */
  toggleMute(voiceId) {
    const voice = this.getVoice(voiceId);
    if (!voice) return;

    voice.muted = !voice.muted;
    this.markDirty();
    eventBus.emit(Events.VOICE_MUTE, { voiceId, muted: voice.muted });
  }

  /**
   * Toggle solo for voice
   */
  toggleSolo(voiceId) {
    const voice = this.getVoice(voiceId);
    if (!voice) return;

    voice.solo = !voice.solo;
    this.markDirty();
    eventBus.emit(Events.VOICE_SOLO, { voiceId, solo: voice.solo });
  }

  // === Steps (for sequencer) ===

  /**
   * Toggle step in voice
   */
  toggleStep(voiceId, stepIndex) {
    const voice = this.getVoice(voiceId);
    if (!voice || !voice.content.steps) return;

    voice.content.steps[stepIndex] = !voice.content.steps[stepIndex];
    this.markDirty();
    eventBus.emit(Events.NOTE_UPDATE, { voiceId, stepIndex, value: voice.content.steps[stepIndex] });
  }

  // === Notes (for piano roll) ===

  /**
   * Add a note to a voice
   */
  addNote(voiceId, noteData) {
    const voice = this.getVoice(voiceId);
    if (!voice) return null;

    // Ensure notes array exists
    if (!voice.content.notes) {
      voice.content.notes = [];
    }

    const note = {
      id: generateId(),
      pitch: noteData.pitch, // MIDI number (60 = C4)
      startBeat: noteData.startBeat,
      durationBeats: noteData.durationBeats || 1,
      velocity: noteData.velocity ?? 100,
      ...noteData,
    };

    voice.content.notes.push(note);
    this.markDirty();
    eventBus.emit(Events.NOTE_ADD, { voiceId, note });
    return note;
  }

  /**
   * Remove a note from a voice
   */
  removeNote(voiceId, noteId) {
    const voice = this.getVoice(voiceId);
    if (!voice || !voice.content.notes) return null;

    const index = voice.content.notes.findIndex(n => n.id === noteId);
    if (index === -1) return null;

    const [removed] = voice.content.notes.splice(index, 1);
    this.markDirty();
    eventBus.emit(Events.NOTE_REMOVE, { voiceId, note: removed });
    return removed;
  }

  /**
   * Update a note
   */
  updateNote(voiceId, noteId, updates) {
    const voice = this.getVoice(voiceId);
    if (!voice || !voice.content.notes) return null;

    const note = voice.content.notes.find(n => n.id === noteId);
    if (!note) return null;

    Object.assign(note, updates);
    this.markDirty();
    eventBus.emit(Events.NOTE_UPDATE, { voiceId, note });
    return note;
  }

  /**
   * Get a note by ID
   */
  getNote(voiceId, noteId) {
    const voice = this.getVoice(voiceId);
    if (!voice || !voice.content.notes) return null;
    return voice.content.notes.find(n => n.id === noteId);
  }

  /**
   * Get all notes for a voice
   */
  getNotes(voiceId) {
    const voice = this.getVoice(voiceId);
    if (!voice || !voice.content.notes) return [];
    return [...voice.content.notes];
  }

  // === Views ===

  /**
   * Change current view
   */
  setView(viewName) {
    this.state.currentView = viewName;
    eventBus.emit(Events.VIEW_CHANGE, viewName);
  }

  // === Scale (Fase 8) ===

  /**
   * Set scale root
   */
  setScaleRoot(root) {
    this.state.scale.root = root;
    this.markDirty();
    eventBus.emit(Events.SCALE_CHANGE, this.state.scale);
  }

  /**
   * Set scale type
   */
  setScaleType(type) {
    this.state.scale.type = type;
    this.markDirty();
    eventBus.emit(Events.SCALE_CHANGE, this.state.scale);
  }

  /**
   * Set scale (root and type together)
   */
  setScale(root, type) {
    this.state.scale.root = root;
    this.state.scale.type = type;
    this.markDirty();
    eventBus.emit(Events.SCALE_CHANGE, this.state.scale);
  }

  /**
   * Toggle scale quantization
   */
  toggleQuantize() {
    this.state.scale.quantize = !this.state.scale.quantize;
    eventBus.emit(Events.QUANTIZE_TOGGLE, this.state.scale.quantize);
  }

  /**
   * Set scale quantization
   */
  setQuantize(enabled) {
    this.state.scale.quantize = enabled;
    eventBus.emit(Events.QUANTIZE_TOGGLE, this.state.scale.quantize);
  }

  /**
   * Get current scale
   */
  getScale() {
    return { ...this.state.scale };
  }

  // === Arpeggiator (Fase 8) ===

  /**
   * Toggle arpeggiator
   */
  toggleArpeggiator() {
    this.state.arpeggiator.enabled = !this.state.arpeggiator.enabled;
    eventBus.emit(Events.ARPEGGIATOR_TOGGLE, this.state.arpeggiator.enabled);
  }

  /**
   * Set arpeggiator enabled
   */
  setArpeggiatorEnabled(enabled) {
    this.state.arpeggiator.enabled = enabled;
    eventBus.emit(Events.ARPEGGIATOR_TOGGLE, enabled);
  }

  /**
   * Set arpeggiator pattern
   */
  setArpPattern(pattern) {
    this.state.arpeggiator.pattern = pattern;
    eventBus.emit(Events.ARPEGGIATOR_CHANGE, this.state.arpeggiator);
  }

  /**
   * Set arpeggiator octaves
   */
  setArpOctaves(octaves) {
    this.state.arpeggiator.octaves = Math.max(1, Math.min(4, octaves));
    eventBus.emit(Events.ARPEGGIATOR_CHANGE, this.state.arpeggiator);
  }

  /**
   * Set arpeggiator rate
   */
  setArpRate(rate) {
    this.state.arpeggiator.rate = rate;
    eventBus.emit(Events.ARPEGGIATOR_CHANGE, this.state.arpeggiator);
  }

  /**
   * Set arpeggiator gate
   */
  setArpGate(gate) {
    this.state.arpeggiator.gate = Math.max(0.1, Math.min(1, gate));
    eventBus.emit(Events.ARPEGGIATOR_CHANGE, this.state.arpeggiator);
  }

  /**
   * Update full arpeggiator state
   */
  setArpeggiator(settings) {
    Object.assign(this.state.arpeggiator, settings);
    eventBus.emit(Events.ARPEGGIATOR_CHANGE, this.state.arpeggiator);
  }

  /**
   * Get current arpeggiator state
   */
  getArpeggiator() {
    return { ...this.state.arpeggiator };
  }

  // === Recording (Fase 9) ===

  /**
   * Arm a voice for recording
   */
  armVoice(voiceId) {
    const voice = this.getVoice(voiceId);
    if (!voice) return;

    voice.armed = true;
    eventBus.emit(Events.RECORDING_ARM, { voiceId });
  }

  /**
   * Disarm a voice
   */
  disarmVoice(voiceId) {
    const voice = this.getVoice(voiceId);
    if (!voice) return;

    voice.armed = false;
    eventBus.emit(Events.RECORDING_DISARM, { voiceId });
  }

  /**
   * Toggle arm for a voice
   */
  toggleArm(voiceId) {
    const voice = this.getVoice(voiceId);
    if (!voice) return;

    if (voice.armed) {
      this.disarmVoice(voiceId);
    } else {
      this.armVoice(voiceId);
    }
  }

  /**
   * Toggle input monitoring for a voice
   */
  toggleMonitoring(voiceId) {
    const voice = this.getVoice(voiceId);
    if (!voice) return;

    voice.monitoring = !voice.monitoring;
    eventBus.emit(Events.INPUT_MONITOR_TOGGLE, { voiceId, monitoring: voice.monitoring });
  }

  /**
   * Set input monitoring for a voice
   */
  setMonitoring(voiceId, enabled) {
    const voice = this.getVoice(voiceId);
    if (!voice) return;

    voice.monitoring = enabled;
    eventBus.emit(Events.INPUT_MONITOR_TOGGLE, { voiceId, monitoring: enabled });
  }

  /**
   * Get all armed voices
   */
  getArmedVoices() {
    return this.state.voices.filter(v => v.armed);
  }

  /**
   * Set punch-in point
   */
  setPunchIn(beat) {
    this.state.transport.punchIn = beat;
    eventBus.emit(Events.RECORDING_PUNCH_IN, beat);
  }

  /**
   * Set punch-out point
   */
  setPunchOut(beat) {
    this.state.transport.punchOut = beat;
    eventBus.emit(Events.RECORDING_PUNCH_OUT, beat);
  }

  /**
   * Toggle punch mode
   */
  togglePunchMode() {
    this.state.transport.punchMode = !this.state.transport.punchMode;
  }

  /**
   * Set count-in bars
   */
  setCountIn(bars) {
    this.state.transport.countIn = Math.max(0, Math.min(4, bars));
  }

  /**
   * Set input device
   */
  setInputDevice(deviceId) {
    this.state.recording.inputDeviceId = deviceId;
  }

  /**
   * Set input latency compensation
   */
  setInputLatency(ms) {
    this.state.recording.latencyMs = Math.max(0, ms);
  }

  /**
   * Set input gain
   */
  setInputGain(gain) {
    this.state.recording.inputGain = Math.max(0, Math.min(2, gain));
  }

  // === MIDI (Fase 9) ===

  /**
   * Set MIDI enabled
   */
  setMidiEnabled(enabled) {
    this.state.midi.enabled = enabled;
    eventBus.emit(Events.MIDI_ACCESS, { enabled });
  }

  /**
   * Set available MIDI inputs
   */
  setMidiInputs(inputs) {
    this.state.midi.inputs = inputs;
  }

  /**
   * Select MIDI input
   */
  selectMidiInput(inputId) {
    this.state.midi.selectedInputId = inputId;
    eventBus.emit(Events.MIDI_INPUT_CONNECT, { inputId });
  }

  /**
   * Start MIDI learn mode
   */
  startMidiLearn(voiceId, param) {
    this.state.midi.learning = true;
    this.state.midi.learnTarget = { voiceId, param };
    eventBus.emit(Events.MIDI_LEARN_START, { voiceId, param });
  }

  /**
   * Stop MIDI learn mode
   */
  stopMidiLearn() {
    this.state.midi.learning = false;
    this.state.midi.learnTarget = null;
    eventBus.emit(Events.MIDI_LEARN_STOP);
  }

  /**
   * Assign MIDI CC to parameter
   */
  assignMidiCC(voiceId, param, cc, channel = 0) {
    if (!this.state.midi.mappings[voiceId]) {
      this.state.midi.mappings[voiceId] = {};
    }
    this.state.midi.mappings[voiceId][param] = { cc, channel };
    this.markDirty();
    eventBus.emit(Events.MIDI_LEARN_ASSIGN, { voiceId, param, cc, channel });
  }

  /**
   * Remove MIDI CC assignment
   */
  removeMidiCC(voiceId, param) {
    if (this.state.midi.mappings[voiceId]) {
      delete this.state.midi.mappings[voiceId][param];
      if (Object.keys(this.state.midi.mappings[voiceId]).length === 0) {
        delete this.state.midi.mappings[voiceId];
      }
      this.markDirty();
    }
  }

  /**
   * Get MIDI mapping for a voice
   */
  getMidiMappings(voiceId) {
    return this.state.midi.mappings[voiceId] || {};
  }

  /**
   * Get all MIDI mappings
   */
  getAllMidiMappings() {
    return { ...this.state.midi.mappings };
  }

  /**
   * Load MIDI mappings (from project file)
   */
  loadMidiMappings(mappings) {
    this.state.midi.mappings = mappings || {};
  }

  // === Spatial Audio (Fase 11) ===

  /**
   * Enable/disable spatial audio for a voice
   */
  setSpatialEnabled(voiceId, enabled) {
    const voice = this.getVoice(voiceId);
    if (!voice) return;

    if (!voice.spatial) {
      voice.spatial = {
        enabled: false,
        position: { x: 0, y: 0, z: 0 },
        distanceModel: 'inverse',
        refDistance: 1,
        maxDistance: 10000,
        rolloffFactor: 1,
        cone: { innerAngle: 360, outerAngle: 360, outerGain: 0 },
      };
    }

    voice.spatial.enabled = enabled;
    this.markDirty();
    eventBus.emit(Events.VOICE_UPDATE, voice);
    eventBus.emit(Events.SPATIAL_UPDATE, { voiceId, spatial: voice.spatial });
  }

  /**
   * Set spatial position for a voice
   */
  setSpatialPosition(voiceId, x, y, z) {
    const voice = this.getVoice(voiceId);
    if (!voice) return;

    if (!voice.spatial) {
      voice.spatial = {
        enabled: false,
        position: { x: 0, y: 0, z: 0 },
        distanceModel: 'inverse',
        refDistance: 1,
        maxDistance: 10000,
        rolloffFactor: 1,
        cone: { innerAngle: 360, outerAngle: 360, outerGain: 0 },
      };
    }

    voice.spatial.position = { x, y, z };
    this.markDirty();
    eventBus.emit(Events.VOICE_UPDATE, voice);
    eventBus.emit(Events.SPATIAL_UPDATE, { voiceId, spatial: voice.spatial });
  }

  /**
   * Set full spatial settings for a voice
   */
  setSpatialSettings(voiceId, settings) {
    const voice = this.getVoice(voiceId);
    if (!voice) return;

    voice.spatial = {
      enabled: settings.enabled ?? false,
      position: settings.position ?? { x: 0, y: 0, z: 0 },
      distanceModel: settings.distanceModel ?? 'inverse',
      refDistance: settings.refDistance ?? 1,
      maxDistance: settings.maxDistance ?? 10000,
      rolloffFactor: settings.rolloffFactor ?? 1,
      cone: settings.cone ?? { innerAngle: 360, outerAngle: 360, outerGain: 0 },
    };

    this.markDirty();
    eventBus.emit(Events.VOICE_UPDATE, voice);
    eventBus.emit(Events.SPATIAL_UPDATE, { voiceId, spatial: voice.spatial });
  }

  /**
   * Get spatial settings for a voice
   */
  getSpatialSettings(voiceId) {
    const voice = this.getVoice(voiceId);
    return voice?.spatial ?? null;
  }

  // === Session Mode (Fase 11b) ===

  /**
   * Start session recording
   * @param {boolean} punchIn - If true, preserve existing data
   */
  startSessionRecording(punchIn = false) {
    this.state.session.isRecording = true;
    this.state.session.isPunchIn = punchIn;
    eventBus.emit(Events.SESSION_RECORD_START, { punchIn });
  }

  /**
   * Stop session recording
   */
  stopSessionRecording() {
    this.state.session.isRecording = false;
    this.state.session.isPunchIn = false;
    eventBus.emit(Events.SESSION_RECORD_STOP);
  }

  /**
   * Set session data (after recording or loading)
   * @param {Object} sessionData
   */
  setSessionData(sessionData) {
    this.state.session.data = sessionData;
    this.markDirty();
    eventBus.emit(Events.SESSION_LOAD, sessionData);
  }

  /**
   * Get current session data
   * @returns {Object|null}
   */
  getSessionData() {
    return this.state.session.data;
  }

  /**
   * Load session from project data
   * @param {Object} sessionData
   */
  loadSession(sessionData) {
    this.state.session.data = sessionData;
    this.state.session.playhead = 0;
    this.state.session.isPlaying = false;
    eventBus.emit(Events.SESSION_LOAD, sessionData);
  }

  /**
   * Clear session data
   */
  clearSession() {
    this.state.session.data = null;
    this.state.session.isRecording = false;
    this.state.session.isPunchIn = false;
    this.state.session.isPlaying = false;
    this.state.session.playhead = 0;
    this.markDirty();
    eventBus.emit(Events.SESSION_CLEAR);
  }

  /**
   * Set session playing state
   * @param {boolean} playing
   */
  setSessionPlaying(playing) {
    this.state.session.isPlaying = playing;
    eventBus.emit(playing ? Events.SESSION_PLAY : Events.SESSION_PAUSE);
  }

  /**
   * Update session playhead
   * @param {number} playhead - Position in ms
   */
  updateSessionPlayhead(playhead) {
    this.state.session.playhead = playhead;
    eventBus.emit(Events.SESSION_PLAYHEAD_UPDATE, { playhead });
  }

  /**
   * Check if session is recording
   * @returns {boolean}
   */
  isSessionRecording() {
    return this.state.session.isRecording;
  }

  /**
   * Check if session is playing
   * @returns {boolean}
   */
  isSessionPlaying() {
    return this.state.session.isPlaying;
  }

  /**
   * Check if session has data
   * @returns {boolean}
   */
  hasSessionData() {
    return this.state.session.data !== null;
  }
}

// Singleton instance
export const state = new StateStore();
