/**
 * MIDI Manager - WebMIDI input support
 *
 * Features:
 * - MIDI device enumeration and connection
 * - Note on/off message handling
 * - Control Change (CC) message handling
 * - MIDI learn functionality
 * - Route MIDI to selected voice
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';

/**
 * MIDI Manager
 */
class MIDIManager {
  constructor() {
    this.midiAccess = null;
    this.inputs = new Map();       // id -> MIDIInput
    this.outputs = new Map();      // id -> MIDIOutput
    this.activeInput = null;       // Currently selected input
    this.isSupported = 'requestMIDIAccess' in navigator;

    // Note tracking for note-off handling
    this.activeNotes = new Map();  // note -> { voiceId, startTime }

    // MIDI learn state
    this.learning = false;
    this.learnTarget = null;

    // Last CC values for MIDI learn detection
    this.lastCCValues = new Map(); // "channel:cc" -> value

    this.setupEventListeners();
  }

  /**
   * Setup event bus listeners
   */
  setupEventListeners() {
    eventBus.on(Events.PROJECT_LOAD, (project) => {
      // Restore MIDI mappings from project
      if (project?.midiMappings) {
        state.loadMidiMappings(project.midiMappings);
      }
    });
  }

  /**
   * Check if WebMIDI is supported
   */
  checkSupport() {
    return this.isSupported;
  }

  /**
   * Request MIDI access
   */
  async requestAccess() {
    if (!this.isSupported) {
      console.warn('WebMIDI is not supported in this browser');
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });

      // Setup device listeners
      this.midiAccess.onstatechange = (e) => this.onStateChange(e);

      // Initialize device maps
      this.updateDevices();

      state.setMidiEnabled(true);
      return true;
    } catch (error) {
      console.error('Failed to get MIDI access:', error);
      state.setMidiEnabled(false);
      return false;
    }
  }

  /**
   * Handle MIDI device state changes
   */
  onStateChange(event) {
    const port = event.port;

    if (port.type === 'input') {
      if (port.state === 'connected') {
        this.inputs.set(port.id, port);
        eventBus.emit(Events.MIDI_INPUT_CONNECT, { id: port.id, name: port.name });
      } else if (port.state === 'disconnected') {
        this.inputs.delete(port.id);
        if (this.activeInput?.id === port.id) {
          this.activeInput = null;
        }
        eventBus.emit(Events.MIDI_INPUT_DISCONNECT, { id: port.id, name: port.name });
      }
    } else if (port.type === 'output') {
      if (port.state === 'connected') {
        this.outputs.set(port.id, port);
      } else if (port.state === 'disconnected') {
        this.outputs.delete(port.id);
      }
    }

    // Update state with current inputs
    state.setMidiInputs(this.getInputList());
  }

  /**
   * Update device maps from MIDI access
   */
  updateDevices() {
    if (!this.midiAccess) return;

    this.inputs.clear();
    this.outputs.clear();

    for (const input of this.midiAccess.inputs.values()) {
      this.inputs.set(input.id, input);
    }

    for (const output of this.midiAccess.outputs.values()) {
      this.outputs.set(output.id, output);
    }

    state.setMidiInputs(this.getInputList());
  }

  /**
   * Get list of available inputs
   */
  getInputList() {
    return Array.from(this.inputs.values()).map(input => ({
      id: input.id,
      name: input.name,
      manufacturer: input.manufacturer,
      state: input.state,
    }));
  }

  /**
   * Get list of available outputs
   */
  getOutputList() {
    return Array.from(this.outputs.values()).map(output => ({
      id: output.id,
      name: output.name,
      manufacturer: output.manufacturer,
      state: output.state,
    }));
  }

  /**
   * Select a MIDI input
   */
  selectInput(inputId) {
    // Disconnect previous input
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
    }

    // Connect new input
    const input = this.inputs.get(inputId);
    if (input) {
      input.onmidimessage = (e) => this.onMIDIMessage(e);
      this.activeInput = input;
      state.selectMidiInput(inputId);
      return true;
    }

    return false;
  }

  /**
   * Disconnect current MIDI input
   */
  disconnectInput() {
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
      this.activeInput = null;
      state.selectMidiInput(null);
    }
  }

  /**
   * Handle incoming MIDI messages
   */
  onMIDIMessage(event) {
    const [status, data1, data2] = event.data;
    const channel = status & 0x0F;
    const messageType = status & 0xF0;

    switch (messageType) {
      case 0x90: // Note On
        if (data2 > 0) {
          this.handleNoteOn(channel, data1, data2);
        } else {
          // Velocity 0 is treated as Note Off
          this.handleNoteOff(channel, data1);
        }
        break;

      case 0x80: // Note Off
        this.handleNoteOff(channel, data1);
        break;

      case 0xB0: // Control Change
        this.handleCC(channel, data1, data2);
        break;

      case 0xE0: // Pitch Bend
        this.handlePitchBend(channel, data1 | (data2 << 7));
        break;

      case 0xD0: // Channel Pressure
        this.handleChannelPressure(channel, data1);
        break;

      case 0xA0: // Polyphonic Aftertouch
        this.handlePolyAftertouch(channel, data1, data2);
        break;

      case 0xC0: // Program Change
        this.handleProgramChange(channel, data1);
        break;
    }
  }

  /**
   * Handle Note On
   */
  handleNoteOn(channel, note, velocity) {
    // Get selected voice for MIDI input
    const selectedVoiceId = state.get('selectedVoiceId');
    if (!selectedVoiceId) return;

    // Store active note
    this.activeNotes.set(`${channel}:${note}`, {
      voiceId: selectedVoiceId,
      startTime: performance.now(),
    });

    eventBus.emit(Events.MIDI_NOTE_ON, {
      channel,
      note,
      velocity,
      voiceId: selectedVoiceId,
    });
  }

  /**
   * Handle Note Off
   */
  handleNoteOff(channel, note) {
    const key = `${channel}:${note}`;
    const noteInfo = this.activeNotes.get(key);

    if (noteInfo) {
      this.activeNotes.delete(key);

      eventBus.emit(Events.MIDI_NOTE_OFF, {
        channel,
        note,
        voiceId: noteInfo.voiceId,
        duration: performance.now() - noteInfo.startTime,
      });
    }
  }

  /**
   * Handle Control Change
   */
  handleCC(channel, cc, value) {
    const key = `${channel}:${cc}`;

    // Check if we're in MIDI learn mode
    if (this.learning && this.learnTarget) {
      // Only trigger on significant value change
      const lastValue = this.lastCCValues.get(key);
      if (lastValue === undefined || Math.abs(value - lastValue) > 5) {
        this.completeMIDILearn(cc, channel);
      }
    }

    this.lastCCValues.set(key, value);

    // Find parameter mappings for this CC
    const mappings = state.getAllMidiMappings();

    for (const [voiceId, voiceMappings] of Object.entries(mappings)) {
      for (const [param, mapping] of Object.entries(voiceMappings)) {
        if (mapping.cc === cc && mapping.channel === channel) {
          // Apply CC value to parameter
          this.applyCC(voiceId, param, value);
        }
      }
    }

    eventBus.emit(Events.MIDI_CC, { channel, cc, value });
  }

  /**
   * Apply CC value to a parameter
   */
  applyCC(voiceId, param, value) {
    const normalizedValue = value / 127;

    switch (param) {
      case 'volume':
        state.updateVoice(voiceId, { volume: normalizedValue });
        break;

      case 'pan':
        // Map 0-127 to -1 to 1
        state.updateVoice(voiceId, { pan: (normalizedValue * 2) - 1 });
        break;

      case 'mute':
        // Treat as toggle above threshold
        if (value > 63) {
          state.toggleMute(voiceId);
        }
        break;

      default:
        // Emit generic event for custom handling
        eventBus.emit(Events.MIDI_CC, {
          voiceId,
          param,
          value: normalizedValue,
          rawValue: value,
        });
    }
  }

  /**
   * Handle Pitch Bend
   */
  handlePitchBend(channel, value) {
    // value is 14-bit: 0 = -8192, 8192 = center, 16383 = +8191
    const normalized = (value - 8192) / 8192;

    eventBus.emit('midi:pitchBend', { channel, value: normalized });
  }

  /**
   * Handle Channel Pressure (aftertouch)
   */
  handleChannelPressure(channel, pressure) {
    eventBus.emit('midi:channelPressure', { channel, pressure });
  }

  /**
   * Handle Polyphonic Aftertouch
   */
  handlePolyAftertouch(channel, note, pressure) {
    eventBus.emit('midi:polyAftertouch', { channel, note, pressure });
  }

  /**
   * Handle Program Change
   */
  handleProgramChange(channel, program) {
    eventBus.emit('midi:programChange', { channel, program });
  }

  /**
   * Start MIDI learn mode
   */
  startMIDILearn(voiceId, param) {
    this.learning = true;
    this.learnTarget = { voiceId, param };
    state.startMidiLearn(voiceId, param);
  }

  /**
   * Cancel MIDI learn mode
   */
  cancelMIDILearn() {
    this.learning = false;
    this.learnTarget = null;
    state.stopMidiLearn();
  }

  /**
   * Complete MIDI learn with detected CC
   */
  completeMIDILearn(cc, channel) {
    if (!this.learnTarget) return;

    const { voiceId, param } = this.learnTarget;
    state.assignMidiCC(voiceId, param, cc, channel);

    this.learning = false;
    this.learnTarget = null;
    state.stopMidiLearn();
  }

  /**
   * Remove MIDI mapping
   */
  removeMIDIMapping(voiceId, param) {
    state.removeMidiCC(voiceId, param);
  }

  /**
   * Get MIDI mappings for a voice
   */
  getMappings(voiceId) {
    return state.getMidiMappings(voiceId);
  }

  /**
   * Send MIDI Note On (for output)
   */
  sendNoteOn(outputId, channel, note, velocity) {
    const output = this.outputs.get(outputId);
    if (!output) return;

    output.send([0x90 | channel, note, velocity]);
  }

  /**
   * Send MIDI Note Off (for output)
   */
  sendNoteOff(outputId, channel, note) {
    const output = this.outputs.get(outputId);
    if (!output) return;

    output.send([0x80 | channel, note, 0]);
  }

  /**
   * Send MIDI CC (for output)
   */
  sendCC(outputId, channel, cc, value) {
    const output = this.outputs.get(outputId);
    if (!output) return;

    output.send([0xB0 | channel, cc, value]);
  }

  /**
   * All notes off on all channels (panic)
   */
  panic() {
    // Clear active notes
    this.activeNotes.clear();

    // Send all notes off on all channels to all outputs
    for (const output of this.outputs.values()) {
      for (let channel = 0; channel < 16; channel++) {
        // All Notes Off (CC 123)
        output.send([0xB0 | channel, 123, 0]);
        // All Sound Off (CC 120)
        output.send([0xB0 | channel, 120, 0]);
      }
    }
  }

  /**
   * Cleanup
   */
  dispose() {
    this.disconnectInput();

    for (const input of this.inputs.values()) {
      input.onmidimessage = null;
    }

    this.inputs.clear();
    this.outputs.clear();
    this.activeNotes.clear();
    this.midiAccess = null;
  }
}

// Singleton instance
export const midiManager = new MIDIManager();
