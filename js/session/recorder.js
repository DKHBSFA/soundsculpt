/**
 * Session Recorder - Records live performance actions in real-time
 * Captures parameter changes, note triggers, and other events with timestamps
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { normalizeValue, denormalizeValue, AUTOMATABLE_PARAMS } from './automation.js';

/**
 * @typedef {Object} SessionEvent
 * @property {number} time - Timestamp in milliseconds
 * @property {string} type - Event type
 * @property {Object} data - Event-specific data
 */

/**
 * @typedef {Object} AutomationPoint
 * @property {number} time - Timestamp in ms
 * @property {number} value - Normalized value (0-1)
 * @property {string} curve - Curve type: 'linear' | 'exponential' | 'step'
 */

/**
 * @typedef {Object} AutomationLane
 * @property {string} id - Unique ID (voiceId:param)
 * @property {string} voiceId - Voice target
 * @property {string} param - Parameter name
 * @property {AutomationPoint[]} points - Control points sorted by time
 */

/**
 * @typedef {Object} SessionData
 * @property {number} duration - Total duration in ms
 * @property {string} recordedAt - ISO timestamp
 * @property {SessionEvent[]} events - Recorded events
 * @property {AutomationLane[]} automationLanes - Automation data
 */

/**
 * Session Recorder class
 */
export class SessionRecorder {
  constructor() {
    this.isRecording = false;
    this.isPunchIn = false;
    this.startTime = 0;
    this.events = [];
    this.automationLanes = new Map();
    this.lastValues = new Map(); // Track last value to avoid duplicates

    // Minimum time between automation points (ms) to avoid flooding
    this.minPointInterval = 16; // ~60fps
    this.lastPointTime = new Map();

    this._setupEventListeners();
  }

  /**
   * Setup event listeners to capture state changes
   */
  _setupEventListeners() {
    // Transport events
    eventBus.on(Events.TRANSPORT_BPM_CHANGE, (bpm) => {
      this.recordEvent('transport:tempo', { bpm });
    });

    eventBus.on(Events.TRANSPORT_STOP, () => {
      this.recordEvent('transport:stop', {});
    });

    // Voice events
    eventBus.on(Events.VOICE_MUTE, ({ voiceId, muted }) => {
      this.recordEvent('voice:mute', { voiceId, muted });
      this.recordParameter(voiceId, 'mute', muted ? 1 : 0);
    });

    eventBus.on(Events.VOICE_SOLO, ({ voiceId, solo }) => {
      this.recordEvent('voice:solo', { voiceId, solo });
    });

    eventBus.on(Events.VOICE_UPDATE, (voice) => {
      if (this.isRecording) {
        // Record volume/pan changes as automation
        this.recordParameter(voice.id, 'volume', voice.volume);
        this.recordParameter(voice.id, 'pan', voice.pan);

        // Record spatial position if enabled
        if (voice.spatial?.enabled) {
          this.recordParameter(voice.id, 'spatialX', voice.spatial.position.x);
          this.recordParameter(voice.id, 'spatialY', voice.spatial.position.y);
          this.recordParameter(voice.id, 'spatialZ', voice.spatial.position.z);
        }
      }
    });

    // MIDI events - note triggers
    eventBus.on(Events.MIDI_NOTE_ON, ({ note, velocity, voiceId }) => {
      this.recordEvent('note:trigger', { voiceId, note, velocity });
    });

    eventBus.on(Events.MIDI_NOTE_OFF, ({ note, voiceId }) => {
      this.recordEvent('note:release', { voiceId, note });
    });

    // MIDI CC for automation
    eventBus.on(Events.MIDI_CC, ({ cc, value, channel }) => {
      // Find mapped parameter and record automation
      const mappings = state.getAllMidiMappings();
      for (const [voiceId, voiceMappings] of Object.entries(mappings)) {
        for (const [param, mapping] of Object.entries(voiceMappings)) {
          if (mapping.cc === cc && mapping.channel === channel) {
            this.recordParameter(voiceId, param, value / 127);
          }
        }
      }
    });
  }

  /**
   * Start recording session
   * @param {boolean} punchIn - If true, preserve existing data and add to it
   */
  startRecording(punchIn = false) {
    this.isRecording = true;
    this.isPunchIn = punchIn;
    this.startTime = performance.now();

    if (!punchIn) {
      this.events = [];
      this.automationLanes.clear();
      this.lastValues.clear();
      this.lastPointTime.clear();
    }

    // Record initial state for all voices
    const voices = state.get('voices') || [];
    for (const voice of voices) {
      this._recordInitialState(voice);
    }

    eventBus.emit(Events.SESSION_RECORD_START, { punchIn });
  }

  /**
   * Stop recording and return session data
   * @returns {SessionData}
   */
  stopRecording() {
    this.isRecording = false;
    const sessionData = this.getSessionData();
    eventBus.emit(Events.SESSION_RECORD_STOP, sessionData);
    return sessionData;
  }

  /**
   * Record initial state of a voice
   * @param {Object} voice
   */
  _recordInitialState(voice) {
    // Only record if we're at the start (not punch-in)
    if (this.isPunchIn) return;

    const time = 0;

    // Volume and pan
    this._addAutomationPoint(voice.id, 'volume', time, voice.volume ?? 1);
    this._addAutomationPoint(voice.id, 'pan', time, voice.pan ?? 0);

    // Spatial if enabled
    if (voice.spatial?.enabled) {
      this._addAutomationPoint(voice.id, 'spatialX', time, voice.spatial.position.x ?? 0);
      this._addAutomationPoint(voice.id, 'spatialY', time, voice.spatial.position.y ?? 0);
      this._addAutomationPoint(voice.id, 'spatialZ', time, voice.spatial.position.z ?? 0);
    }
  }

  /**
   * Record a parameter change
   * @param {string} voiceId
   * @param {string} param - Parameter name
   * @param {number} value - Raw value (will be normalized)
   */
  recordParameter(voiceId, param, value) {
    if (!this.isRecording) return;

    const time = performance.now() - this.startTime;
    const laneId = `${voiceId}:${param}`;

    // Throttle points
    const lastTime = this.lastPointTime.get(laneId) || 0;
    if (time - lastTime < this.minPointInterval) return;

    // Skip if value hasn't changed significantly
    const lastValue = this.lastValues.get(laneId);
    const normalizedValue = normalizeValue(param, value);
    if (lastValue !== undefined && Math.abs(normalizedValue - lastValue) < 0.001) return;

    this._addAutomationPoint(voiceId, param, time, value);
    this.lastPointTime.set(laneId, time);
    this.lastValues.set(laneId, normalizedValue);
  }

  /**
   * Add an automation point to a lane
   * @param {string} voiceId
   * @param {string} param
   * @param {number} time
   * @param {number} rawValue
   * @param {string} curve
   */
  _addAutomationPoint(voiceId, param, time, rawValue, curve = 'linear') {
    const laneId = `${voiceId}:${param}`;

    if (!this.automationLanes.has(laneId)) {
      this.automationLanes.set(laneId, {
        id: laneId,
        voiceId,
        param,
        points: []
      });
    }

    const normalizedValue = normalizeValue(param, rawValue);

    this.automationLanes.get(laneId).points.push({
      time,
      value: normalizedValue,
      curve
    });
  }

  /**
   * Record a generic event
   * @param {string} type - Event type
   * @param {Object} data - Event data
   */
  recordEvent(type, data) {
    if (!this.isRecording) return;

    this.events.push({
      time: performance.now() - this.startTime,
      type,
      data
    });
  }

  /**
   * Get current session data
   * @returns {SessionData}
   */
  getSessionData() {
    // Optimize automation lanes (remove redundant points)
    const optimizedLanes = this._optimizeAutomationLanes();

    return {
      duration: performance.now() - this.startTime,
      recordedAt: new Date().toISOString(),
      events: [...this.events].sort((a, b) => a.time - b.time),
      automationLanes: optimizedLanes
    };
  }

  /**
   * Optimize automation lanes by removing redundant points
   * @returns {AutomationLane[]}
   */
  _optimizeAutomationLanes() {
    const lanes = [];

    for (const lane of this.automationLanes.values()) {
      if (lane.points.length === 0) continue;

      const optimizedPoints = [];
      let lastValue = null;
      let lastSlope = null;

      for (let i = 0; i < lane.points.length; i++) {
        const point = lane.points[i];
        const nextPoint = lane.points[i + 1];

        // Always keep first and last points
        if (i === 0 || i === lane.points.length - 1) {
          optimizedPoints.push(point);
          lastValue = point.value;
          continue;
        }

        // Keep points where value changes direction or curve changes
        const currentSlope = nextPoint ? (nextPoint.value - point.value) : 0;
        if (lastSlope !== null && Math.sign(currentSlope) !== Math.sign(lastSlope)) {
          optimizedPoints.push(point);
        }

        lastSlope = currentSlope;
        lastValue = point.value;
      }

      // Only include lanes with meaningful data
      if (optimizedPoints.length > 1 ||
          (optimizedPoints.length === 1 && optimizedPoints[0].value !== 0)) {
        lanes.push({
          ...lane,
          points: optimizedPoints
        });
      }
    }

    return lanes;
  }

  /**
   * Clear all recorded data
   */
  clear() {
    this.events = [];
    this.automationLanes.clear();
    this.lastValues.clear();
    this.lastPointTime.clear();
  }

  /**
   * Check if currently recording
   * @returns {boolean}
   */
  get recording() {
    return this.isRecording;
  }

  /**
   * Get current recording duration in ms
   * @returns {number}
   */
  get currentDuration() {
    if (!this.isRecording) return 0;
    return performance.now() - this.startTime;
  }
}

// Singleton instance
export const sessionRecorder = new SessionRecorder();
