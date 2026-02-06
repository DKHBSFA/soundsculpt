/**
 * Session Player - Plays back recorded session data with automation
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { mixer } from '../audio/mixer.js';
import { audioContext } from '../audio/context-manager.js';
import {
  getValueAtTime,
  denormalizeValue,
  findSurroundingPoints,
  beatToMs,
  msToBeat
} from './automation.js';

/**
 * Session Player class
 */
export class SessionPlayer {
  constructor() {
    this.session = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.playhead = 0; // Current position in ms
    this.startTime = 0; // performance.now() when playback started
    this.eventIndex = 0; // Current position in events array

    // Update rate for automation (60fps)
    this.updateInterval = 1000 / 60;
    this.updateTimerId = null;

    // Scheduled audio events
    this.scheduledEvents = new Map();

    this._setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    // Sync with transport
    eventBus.on(Events.TRANSPORT_STOP, () => {
      if (this.isPlaying) {
        this.stop();
      }
    });

    eventBus.on(Events.TRANSPORT_PAUSE, () => {
      if (this.isPlaying) {
        this.pause();
      }
    });
  }

  /**
   * Load session data for playback
   * @param {Object} sessionData
   */
  loadSession(sessionData) {
    this.session = sessionData;
    this.playhead = 0;
    this.eventIndex = 0;

    // Sort events by time
    if (this.session?.events) {
      this.session.events.sort((a, b) => a.time - b.time);
    }

    eventBus.emit(Events.SESSION_LOAD, sessionData);
  }

  /**
   * Start playback
   */
  play() {
    if (!this.session) {
      console.warn('No session loaded');
      return;
    }

    if (this.isPlaying && !this.isPaused) return;

    this.isPlaying = true;
    this.isPaused = false;
    this.startTime = performance.now() - this.playhead;

    // Find event index for current playhead position
    this.eventIndex = this._findEventIndex(this.playhead);

    // Apply initial automation state
    this.applyAutomationAt(this.playhead);

    // Start update loop
    this._startUpdateLoop();

    eventBus.emit(Events.SESSION_PLAY, { playhead: this.playhead });
  }

  /**
   * Pause playback
   */
  pause() {
    if (!this.isPlaying) return;

    this.isPaused = true;
    this._stopUpdateLoop();

    eventBus.emit(Events.SESSION_PAUSE, { playhead: this.playhead });
  }

  /**
   * Resume paused playback
   */
  resume() {
    if (!this.isPaused) return;
    this.play();
  }

  /**
   * Stop playback and reset position
   */
  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this._stopUpdateLoop();

    this.playhead = 0;
    this.eventIndex = 0;

    // Cancel scheduled events
    this.scheduledEvents.clear();

    eventBus.emit(Events.SESSION_STOP);
  }

  /**
   * Seek to a position
   * @param {number} timeMs - Position in milliseconds
   */
  seek(timeMs) {
    this.playhead = Math.max(0, Math.min(timeMs, this.session?.duration || 0));

    if (this.isPlaying && !this.isPaused) {
      this.startTime = performance.now() - this.playhead;
    }

    this.eventIndex = this._findEventIndex(this.playhead);
    this.applyAutomationAt(this.playhead);

    eventBus.emit(Events.SESSION_SEEK, { playhead: this.playhead });
  }

  /**
   * Seek to a beat position
   * @param {number} beat - Beat position
   */
  seekToBeat(beat) {
    const bpm = state.get('transport.tempo') || 120;
    const timeMs = beatToMs(beat, bpm);
    this.seek(timeMs);
  }

  /**
   * Find the event index for a given time
   * @param {number} time
   * @returns {number}
   */
  _findEventIndex(time) {
    if (!this.session?.events) return 0;

    // Binary search
    let low = 0;
    let high = this.session.events.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.session.events[mid].time <= time) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }

  /**
   * Start the update loop
   */
  _startUpdateLoop() {
    if (this.updateTimerId) return;

    const update = () => {
      if (!this.isPlaying || this.isPaused) return;

      const currentTime = performance.now();
      this.playhead = currentTime - this.startTime;

      // Check for end of session
      if (this.session?.duration && this.playhead >= this.session.duration) {
        this.stop();
        return;
      }

      // Apply automation
      this.applyAutomationAt(this.playhead);

      // Trigger events
      this.triggerEventsUntil(this.playhead);

      // Emit playhead update
      eventBus.emit(Events.SESSION_PLAYHEAD_UPDATE, { playhead: this.playhead });

      // Schedule next update
      this.updateTimerId = requestAnimationFrame(update);
    };

    this.updateTimerId = requestAnimationFrame(update);
  }

  /**
   * Stop the update loop
   */
  _stopUpdateLoop() {
    if (this.updateTimerId) {
      cancelAnimationFrame(this.updateTimerId);
      this.updateTimerId = null;
    }
  }

  /**
   * Apply automation values at a specific time
   * @param {number} time - Time in milliseconds
   */
  applyAutomationAt(time) {
    if (!this.session?.automationLanes) return;

    for (const lane of this.session.automationLanes) {
      const normalizedValue = getValueAtTime(lane, time);
      if (normalizedValue !== null) {
        this.applyParameter(lane.voiceId, lane.param, normalizedValue);
      }
    }
  }

  /**
   * Apply a parameter value to a voice
   * @param {string} voiceId
   * @param {string} param
   * @param {number} normalizedValue - Normalized value (0-1)
   */
  applyParameter(voiceId, param, normalizedValue) {
    const rawValue = denormalizeValue(param, normalizedValue);

    // Apply to mixer/voice based on parameter type
    switch (param) {
      case 'volume': {
        const voice = state.getVoice(voiceId);
        if (voice) {
          voice.volume = rawValue;
          eventBus.emit(Events.VOICE_UPDATE, voice);
        }
        break;
      }

      case 'pan': {
        const voice = state.getVoice(voiceId);
        if (voice) {
          voice.pan = rawValue;
          eventBus.emit(Events.VOICE_UPDATE, voice);
        }
        break;
      }

      case 'mute': {
        const voice = state.getVoice(voiceId);
        if (voice) {
          const shouldMute = rawValue >= 0.5;
          if (voice.muted !== shouldMute) {
            voice.muted = shouldMute;
            eventBus.emit(Events.VOICE_MUTE, { voiceId, muted: shouldMute });
          }
        }
        break;
      }

      case 'spatialX':
      case 'spatialY':
      case 'spatialZ': {
        const voice = state.getVoice(voiceId);
        if (voice?.spatial?.enabled) {
          const axis = param.slice(-1).toLowerCase();
          voice.spatial.position[axis] = rawValue;
          mixer.setSpatialPosition(voiceId, voice.spatial.position);
        }
        break;
      }

      // Additional parameters can be added here
      default:
        // Emit generic automation event for other handlers
        eventBus.emit(Events.SESSION_AUTOMATION, { voiceId, param, value: rawValue });
    }
  }

  /**
   * Trigger events up to a given time
   * @param {number} time - Time in milliseconds
   */
  triggerEventsUntil(time) {
    if (!this.session?.events) return;

    while (this.eventIndex < this.session.events.length) {
      const event = this.session.events[this.eventIndex];

      if (event.time > time) break;

      this.triggerEvent(event);
      this.eventIndex++;
    }
  }

  /**
   * Trigger a single event
   * @param {Object} event - Event object
   */
  triggerEvent(event) {
    switch (event.type) {
      case 'note:trigger':
        eventBus.emit(Events.SESSION_NOTE_TRIGGER, event.data);
        break;

      case 'note:release':
        eventBus.emit(Events.SESSION_NOTE_RELEASE, event.data);
        break;

      case 'voice:mute':
        if (event.data.voiceId) {
          const voice = state.getVoice(event.data.voiceId);
          if (voice && voice.muted !== event.data.muted) {
            voice.muted = event.data.muted;
            eventBus.emit(Events.VOICE_MUTE, {
              voiceId: event.data.voiceId,
              muted: event.data.muted
            });
          }
        }
        break;

      case 'voice:solo':
        if (event.data.voiceId) {
          const voice = state.getVoice(event.data.voiceId);
          if (voice && voice.solo !== event.data.solo) {
            voice.solo = event.data.solo;
            eventBus.emit(Events.VOICE_SOLO, {
              voiceId: event.data.voiceId,
              solo: event.data.solo
            });
          }
        }
        break;

      case 'transport:tempo':
        if (event.data.bpm) {
          state.setTempo(event.data.bpm);
        }
        break;

      case 'transport:stop':
        // Don't actually stop, just emit event
        eventBus.emit(Events.SESSION_TRANSPORT_EVENT, event);
        break;

      case 'pattern:change':
        eventBus.emit(Events.SESSION_PATTERN_CHANGE, event.data);
        break;

      default:
        // Emit generic event for unknown types
        eventBus.emit(Events.SESSION_EVENT, event);
    }
  }

  /**
   * Get current playhead position in milliseconds
   * @returns {number}
   */
  getCurrentTime() {
    return this.playhead;
  }

  /**
   * Get current playhead position in beats
   * @returns {number}
   */
  getCurrentBeat() {
    const bpm = state.get('transport.tempo') || 120;
    return msToBeat(this.playhead, bpm);
  }

  /**
   * Get session duration in milliseconds
   * @returns {number}
   */
  getDuration() {
    return this.session?.duration || 0;
  }

  /**
   * Get session duration in beats
   * @returns {number}
   */
  getDurationBeats() {
    const bpm = state.get('transport.tempo') || 120;
    return msToBeat(this.getDuration(), bpm);
  }

  /**
   * Check if player has a session loaded
   * @returns {boolean}
   */
  hasSession() {
    return this.session !== null;
  }

  /**
   * Get automation value at current playhead for a specific parameter
   * @param {string} voiceId
   * @param {string} param
   * @returns {number|null}
   */
  getCurrentAutomationValue(voiceId, param) {
    if (!this.session?.automationLanes) return null;

    const laneId = `${voiceId}:${param}`;
    const lane = this.session.automationLanes.find(l => l.id === laneId);

    if (!lane) return null;

    return getValueAtTime(lane, this.playhead);
  }

  /**
   * Get all automation lanes for a voice
   * @param {string} voiceId
   * @returns {Array}
   */
  getVoiceAutomationLanes(voiceId) {
    if (!this.session?.automationLanes) return [];
    return this.session.automationLanes.filter(l => l.voiceId === voiceId);
  }
}

// Singleton instance
export const sessionPlayer = new SessionPlayer();
