/**
 * Audio Mixer - Voice routing, volume, pan, mute/solo
 * Supports both simple stereo panning and 3D spatial audio (HRTF)
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { audioContext } from './context-manager.js';
import { SpatialPanner, initSpatialListener, DEFAULT_SPATIAL_SETTINGS } from './spatial.js';

/**
 * Voice channel with gain, pan, and optional spatial audio
 */
class VoiceChannel {
  constructor(voiceId, mixer) {
    this.voiceId = voiceId;
    this.mixer = mixer;
    this.ctx = audioContext.getContext();

    // Create audio nodes
    this.inputGain = this.ctx.createGain();
    this.volumeGain = this.ctx.createGain();
    this.stereoPanner = this.ctx.createStereoPanner();
    this.analyser = this.ctx.createAnalyser();

    // Spatial audio (3D panning with HRTF)
    this.spatialPanner = new SpatialPanner(this.ctx);
    this.useSpatial = false;

    // Configure analyser for metering
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.3;
    this.analyserData = new Float32Array(this.analyser.frequencyBinCount);

    // Connect chain: input -> volume -> (stereo OR spatial) -> analyser -> master
    this.inputGain.connect(this.volumeGain);
    this._connectPanner();
    this.analyser.connect(mixer.masterInput);

    // Initial values
    this.updateFromState();
  }

  /**
   * Connect the appropriate panner based on mode
   */
  _connectPanner() {
    // Disconnect existing connections from volumeGain
    this.volumeGain.disconnect();

    if (this.useSpatial) {
      // Use 3D spatial panner
      this.volumeGain.connect(this.spatialPanner.getNode());
      this.spatialPanner.getNode().connect(this.analyser);
    } else {
      // Use simple stereo panner
      this.volumeGain.connect(this.stereoPanner);
      this.stereoPanner.connect(this.analyser);
    }
  }

  /**
   * Enable/disable spatial audio mode
   * @param {boolean} enabled
   */
  setSpatialMode(enabled) {
    if (this.useSpatial === enabled) return;

    this.useSpatial = enabled;
    this.spatialPanner.setEnabled(enabled);
    this._connectPanner();
  }

  /**
   * Update channel from state
   */
  updateFromState() {
    const voice = state.getVoice(this.voiceId);
    if (!voice) return;

    // Check mute/solo status
    const voices = state.get('voices') || [];
    const anySolo = voices.some(v => v.solo);
    const isAudible = !voice.muted && (!anySolo || voice.solo);

    // Update volume (0 if muted/not soloed)
    const volume = isAudible ? (voice.volume ?? 1) : 0;
    this.volumeGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);

    // Check for spatial audio settings
    const spatial = voice.spatial;
    if (spatial?.enabled) {
      this.setSpatialMode(true);
      this.spatialPanner.applySettings(spatial);
    } else {
      this.setSpatialMode(false);
      // Update stereo pan (-1 to 1)
      const pan = voice.pan ?? 0;
      this.stereoPanner.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Get spatial panner for direct control
   * @returns {SpatialPanner}
   */
  getSpatialPanner() {
    return this.spatialPanner;
  }

  /**
   * Get current level in dB
   */
  getLevel() {
    this.analyser.getFloatTimeDomainData(this.analyserData);
    let sum = 0;
    for (let i = 0; i < this.analyserData.length; i++) {
      sum += this.analyserData[i] ** 2;
    }
    const rms = Math.sqrt(sum / this.analyserData.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    return db;
  }

  /**
   * Get the input node for connecting audio sources
   */
  getInput() {
    return this.inputGain;
  }

  /**
   * Disconnect and cleanup
   */
  dispose() {
    this.inputGain.disconnect();
    this.volumeGain.disconnect();
    this.stereoPanner.disconnect();
    this.analyser.disconnect();
    this.spatialPanner.dispose();
  }
}

/**
 * Main mixer class
 */
class Mixer {
  constructor() {
    this.ctx = null;
    this.channels = new Map(); // voiceId -> VoiceChannel
    this.isInitialized = false;

    // Master bus (created lazily)
    this.masterInput = null;
    this.masterGain = null;
    this.masterAnalyser = null;
    this.limiter = null;
    this.masterAnalyserData = null;

    // Metering
    this.meterIntervalId = null;
    this.meterListeners = new Set();

    this.setupEventListeners();
  }

  /**
   * Initialize audio nodes (called lazily when AudioContext is ready)
   */
  init() {
    if (this.isInitialized) return;

    this.ctx = audioContext.getContext();
    if (!this.ctx) return; // AudioContext not ready yet

    // Master bus
    this.masterInput = this.ctx.createGain();
    this.masterGain = this.ctx.createGain();
    this.masterAnalyser = this.ctx.createAnalyser();
    this.limiter = this.ctx.createDynamicsCompressor();

    // Configure master analyser
    this.masterAnalyser.fftSize = 256;
    this.masterAnalyser.smoothingTimeConstant = 0.3;
    this.masterAnalyserData = new Float32Array(this.masterAnalyser.frequencyBinCount);

    // Configure limiter
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;

    // Connect master chain: input -> gain -> analyser -> limiter -> destination
    this.masterInput.connect(this.masterGain);
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    // Master volume
    this.masterGain.gain.value = 0.8;

    // Initialize spatial audio listener
    initSpatialListener(this.ctx);

    this.isInitialized = true;
  }

  /**
   * Ensure mixer is initialized before use
   */
  ensureInitialized() {
    if (!this.isInitialized) {
      this.init();
    }
    return this.isInitialized;
  }

  /**
   * Setup event bus listeners
   */
  setupEventListeners() {
    eventBus.on(Events.VOICE_ADD, (voice) => this.addChannel(voice.id));
    eventBus.on(Events.VOICE_REMOVE, (voice) => this.removeChannel(voice.id));
    eventBus.on(Events.VOICE_MUTE, () => this.updateAllChannels());
    eventBus.on(Events.VOICE_SOLO, () => this.updateAllChannels());
    eventBus.on(Events.VOICE_UPDATE, (voice) => this.updateChannel(voice.id));
    eventBus.on(Events.PROJECT_LOAD, () => this.syncWithState());
    eventBus.on(Events.PROJECT_NEW, () => this.syncWithState());
  }

  /**
   * Add a channel for a voice
   */
  addChannel(voiceId) {
    if (!this.ensureInitialized()) return;
    if (this.channels.has(voiceId)) return;

    const channel = new VoiceChannel(voiceId, this);
    this.channels.set(voiceId, channel);
  }

  /**
   * Remove a channel
   */
  removeChannel(voiceId) {
    const channel = this.channels.get(voiceId);
    if (channel) {
      channel.dispose();
      this.channels.delete(voiceId);
    }
  }

  /**
   * Update a specific channel
   */
  updateChannel(voiceId) {
    const channel = this.channels.get(voiceId);
    if (channel) {
      channel.updateFromState();
    }
  }

  /**
   * Update all channels (for mute/solo changes)
   */
  updateAllChannels() {
    this.channels.forEach(channel => channel.updateFromState());
  }

  /**
   * Sync mixer with current state
   */
  syncWithState() {
    // Remove channels that no longer exist
    const voiceIds = new Set((state.get('voices') || []).map(v => v.id));
    for (const id of this.channels.keys()) {
      if (!voiceIds.has(id)) {
        this.removeChannel(id);
      }
    }

    // Add channels for new voices
    (state.get('voices') || []).forEach(voice => {
      if (!this.channels.has(voice.id)) {
        this.addChannel(voice.id);
      } else {
        this.updateChannel(voice.id);
      }
    });
  }

  /**
   * Get input node for a voice
   */
  getVoiceInput(voiceId) {
    let channel = this.channels.get(voiceId);
    if (!channel) {
      this.addChannel(voiceId);
      channel = this.channels.get(voiceId);
    }
    return channel?.getInput();
  }

  /**
   * Get master level in dB
   */
  getMasterLevel() {
    if (!this.isInitialized || !this.masterAnalyser) return -Infinity;

    this.masterAnalyser.getFloatTimeDomainData(this.masterAnalyserData);
    let sum = 0;
    for (let i = 0; i < this.masterAnalyserData.length; i++) {
      sum += this.masterAnalyserData[i] ** 2;
    }
    const rms = Math.sqrt(sum / this.masterAnalyserData.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    return db;
  }

  /**
   * Get all meter levels
   */
  getAllLevels() {
    const levels = {
      master: this.getMasterLevel(),
      voices: {},
    };

    this.channels.forEach((channel, voiceId) => {
      levels.voices[voiceId] = channel.getLevel();
    });

    return levels;
  }

  /**
   * Start metering updates
   */
  startMetering(callback, interval = 50) {
    this.meterListeners.add(callback);

    if (!this.meterIntervalId) {
      this.meterIntervalId = setInterval(() => {
        const levels = this.getAllLevels();
        this.meterListeners.forEach(cb => cb(levels));
        eventBus.emit(Events.AUDIO_METER_UPDATE, levels);
      }, interval);
    }
  }

  /**
   * Stop metering updates
   */
  stopMetering(callback) {
    this.meterListeners.delete(callback);

    if (this.meterListeners.size === 0 && this.meterIntervalId) {
      clearInterval(this.meterIntervalId);
      this.meterIntervalId = null;
    }
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume) {
    if (!this.isInitialized || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
  }

  /**
   * Get spatial panner for a voice
   * @param {string} voiceId
   * @returns {SpatialPanner | null}
   */
  getSpatialPanner(voiceId) {
    const channel = this.channels.get(voiceId);
    return channel?.getSpatialPanner() ?? null;
  }

  /**
   * Enable/disable spatial audio for a voice
   * @param {string} voiceId
   * @param {boolean} enabled
   */
  setSpatialEnabled(voiceId, enabled) {
    const channel = this.channels.get(voiceId);
    if (channel) {
      channel.setSpatialMode(enabled);
    }
  }

  /**
   * Update spatial position for a voice
   * @param {string} voiceId
   * @param {{x: number, y: number, z: number}} position
   */
  setSpatialPosition(voiceId, position) {
    const panner = this.getSpatialPanner(voiceId);
    if (panner) {
      panner.setPosition(position.x, position.y, position.z);
    }
  }

  // === Automation Support (Fase 11b) ===

  /**
   * Apply automation value to a voice parameter
   * @param {string} voiceId
   * @param {string} param - Parameter name
   * @param {number} value - Raw parameter value
   */
  applyAutomation(voiceId, param, value) {
    const channel = this.channels.get(voiceId);
    if (!channel || !this.isInitialized) return;

    switch (param) {
      case 'volume':
        channel.volumeGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
        break;

      case 'pan':
        if (!channel.useSpatial) {
          channel.stereoPanner.pan.setTargetAtTime(value, this.ctx.currentTime, 0.01);
        }
        break;

      case 'spatialX':
      case 'spatialY':
      case 'spatialZ':
        if (channel.useSpatial) {
          const panner = channel.getSpatialPanner();
          const pos = panner.getPosition();
          const axis = param.slice(-1).toLowerCase();
          pos[axis] = value;
          panner.setPosition(pos.x, pos.y, pos.z);
        }
        break;

      // Future: filterFreq, filterQ, etc. when synth supports it
    }
  }

  /**
   * Get list of automatable parameters for a voice
   * @param {string} voiceId
   * @returns {string[]}
   */
  getAutomatableParams(voiceId) {
    const voice = state.getVoice(voiceId);
    const params = ['volume', 'pan'];

    // Add spatial params if spatial is enabled
    if (voice?.spatial?.enabled) {
      params.push('spatialX', 'spatialY', 'spatialZ');
    }

    return params;
  }

  /**
   * Get current value of an automatable parameter
   * @param {string} voiceId
   * @param {string} param
   * @returns {number|null}
   */
  getParameterValue(voiceId, param) {
    const voice = state.getVoice(voiceId);
    if (!voice) return null;

    switch (param) {
      case 'volume':
        return voice.volume ?? 1;
      case 'pan':
        return voice.pan ?? 0;
      case 'mute':
        return voice.muted ? 1 : 0;
      case 'spatialX':
        return voice.spatial?.position?.x ?? 0;
      case 'spatialY':
        return voice.spatial?.position?.y ?? 0;
      case 'spatialZ':
        return voice.spatial?.position?.z ?? 0;
      default:
        return null;
    }
  }
}

// Singleton instance
export const mixer = new Mixer();
