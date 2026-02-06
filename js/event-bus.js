/**
 * EventBus - Simple pub/sub for component communication
 */

class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Subscribe to an event (one time only)
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback(...args);
    };
    this.on(event, wrapper);
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for "${event}":`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event (or all events)
   * @param {string} [event] - Event name (optional)
   */
  clear(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

// Singleton instance
export const eventBus = new EventBus();

// Event names constants
export const Events = {
  // Transport
  TRANSPORT_PLAY: 'transport:play',
  TRANSPORT_STOP: 'transport:stop',
  TRANSPORT_PAUSE: 'transport:pause',
  TRANSPORT_SEEK: 'transport:seek',
  TRANSPORT_LOOP_TOGGLE: 'transport:loop:toggle',
  TRANSPORT_BPM_CHANGE: 'transport:bpm:change',
  TRANSPORT_TIME_SIG_CHANGE: 'transport:timeSig:change',

  // Playhead
  PLAYHEAD_UPDATE: 'playhead:update',

  // Voices
  VOICE_ADD: 'voice:add',
  VOICE_REMOVE: 'voice:remove',
  VOICE_SELECT: 'voice:select',
  VOICE_UPDATE: 'voice:update',
  VOICE_MUTE: 'voice:mute',
  VOICE_SOLO: 'voice:solo',

  // Notes
  NOTE_ADD: 'note:add',
  NOTE_REMOVE: 'note:remove',
  NOTE_UPDATE: 'note:update',

  // Views
  VIEW_CHANGE: 'view:change',

  // Project
  PROJECT_NEW: 'project:new',
  PROJECT_LOAD: 'project:load',
  PROJECT_SAVE: 'project:save',
  PROJECT_DIRTY: 'project:dirty',
  PROJECT_CLEAN: 'project:clean',

  // History
  HISTORY_PUSH: 'history:push',
  HISTORY_UNDO: 'history:undo',
  HISTORY_REDO: 'history:redo',

  // Audio
  AUDIO_CONTEXT_STATE: 'audio:context:state',
  AUDIO_METER_UPDATE: 'audio:meter:update',

  // Draft
  DRAFT_FOUND: 'draft:found',
  DRAFT_RECOVERED: 'draft:recovered',
  DRAFT_DISCARDED: 'draft:discarded',

  // UI
  TOAST_SHOW: 'toast:show',
  MODAL_OPEN: 'modal:open',
  MODAL_CLOSE: 'modal:close',
  DROPDOWN_OPEN: 'dropdown:open',
  DROPDOWN_CLOSE: 'dropdown:close',

  // Scale (Fase 8)
  SCALE_CHANGE: 'scale:change',
  QUANTIZE_TOGGLE: 'scale:quantize:toggle',

  // Arpeggiator (Fase 8)
  ARPEGGIATOR_TOGGLE: 'arpeggiator:toggle',
  ARPEGGIATOR_CHANGE: 'arpeggiator:change',

  // Chord Palette (Fase 8)
  CHORD_INSERT: 'chord:insert',

  // Recording (Fase 9)
  RECORDING_START: 'recording:start',
  RECORDING_STOP: 'recording:stop',
  RECORDING_ARM: 'recording:arm',
  RECORDING_DISARM: 'recording:disarm',
  RECORDING_PUNCH_IN: 'recording:punchIn',
  RECORDING_PUNCH_OUT: 'recording:punchOut',
  INPUT_MONITOR_TOGGLE: 'input:monitor:toggle',

  // MIDI (Fase 9)
  MIDI_ACCESS: 'midi:access',
  MIDI_INPUT_CONNECT: 'midi:input:connect',
  MIDI_INPUT_DISCONNECT: 'midi:input:disconnect',
  MIDI_NOTE_ON: 'midi:noteOn',
  MIDI_NOTE_OFF: 'midi:noteOff',
  MIDI_CC: 'midi:cc',
  MIDI_LEARN_START: 'midi:learn:start',
  MIDI_LEARN_STOP: 'midi:learn:stop',
  MIDI_LEARN_ASSIGN: 'midi:learn:assign',

  // Sample Analysis (Fase 10)
  SAMPLE_ANALYZED: 'sample:analyzed',
  SAMPLE_SLICED: 'sample:sliced',
  ANALYZER_OPEN: 'analyzer:open',
  ANALYZER_CLOSE: 'analyzer:close',
  ANALYZER_CONNECT: 'analyzer:connect',

  // Spatial Audio (Fase 11)
  SPATIAL_UPDATE: 'spatial:update',

  // Session Mode (Fase 11b)
  SESSION_RECORD_START: 'session:record:start',
  SESSION_RECORD_STOP: 'session:record:stop',
  SESSION_LOAD: 'session:load',
  SESSION_CLEAR: 'session:clear',
  SESSION_PLAY: 'session:play',
  SESSION_PAUSE: 'session:pause',
  SESSION_STOP: 'session:stop',
  SESSION_SEEK: 'session:seek',
  SESSION_PLAYHEAD_UPDATE: 'session:playhead:update',
  SESSION_AUTOMATION: 'session:automation',
  SESSION_NOTE_TRIGGER: 'session:note:trigger',
  SESSION_NOTE_RELEASE: 'session:note:release',
  SESSION_PATTERN_CHANGE: 'session:pattern:change',
  SESSION_TRANSPORT_EVENT: 'session:transport:event',
  SESSION_EVENT: 'session:event',
};
