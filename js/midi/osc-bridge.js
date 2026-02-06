/**
 * OSC Bridge - Open Sound Control via WebSocket
 *
 * Connects to a local OSC-to-WebSocket bridge to receive OSC messages.
 * User must run a separate bridge server (e.g., osc-websocket-bridge).
 *
 * OSC Address patterns:
 *   /soundsculpt/transport/play         - Start playback
 *   /soundsculpt/transport/stop         - Stop playback
 *   /soundsculpt/transport/bpm [float]  - Set BPM
 *   /soundsculpt/voice/{id}/volume [0-1]
 *   /soundsculpt/voice/{id}/pan [-1,1]
 *   /soundsculpt/voice/{id}/mute [0,1]
 *   /soundsculpt/voice/{id}/solo [0,1]
 *   /soundsculpt/voice/{id}/spatial/x [-1,1]
 *   /soundsculpt/voice/{id}/spatial/y [-1,1]
 *   /soundsculpt/voice/{id}/spatial/z [-1,1]
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { mixer } from '../audio/mixer.js';

// localStorage key for settings
const STORAGE_KEY = 'soundsculpt-osc-settings';

// Default settings
const DEFAULT_SETTINGS = {
  enabled: false,
  host: 'localhost',
  port: 8080,
  autoReconnect: true,
  reconnectInterval: 5000,
};

/**
 * OSC Bridge Manager
 */
class OSCBridge {
  constructor() {
    this.socket = null;
    this.settings = this._loadSettings();
    this.isConnected = false;
    this.reconnectTimer = null;
    this.listeners = new Map();

    // Bind handlers
    this._onMessage = this._onMessage.bind(this);
    this._onOpen = this._onOpen.bind(this);
    this._onClose = this._onClose.bind(this);
    this._onError = this._onError.bind(this);
  }

  /**
   * Load settings from localStorage
   * @returns {Object}
   */
  _loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Save settings to localStorage
   */
  _saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
  }

  /**
   * Get current settings
   * @returns {Object}
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * Update settings
   * @param {Object} updates
   */
  updateSettings(updates) {
    this.settings = { ...this.settings, ...updates };
    this._saveSettings();

    // Reconnect if connection settings changed
    if (this.isConnected && (updates.host || updates.port)) {
      this.disconnect();
      this.connect();
    }
  }

  /**
   * Connect to WebSocket bridge
   */
  connect() {
    if (this.socket) {
      this.disconnect();
    }

    const url = `ws://${this.settings.host}:${this.settings.port}`;

    try {
      this.socket = new WebSocket(url);
      this.socket.addEventListener('open', this._onOpen);
      this.socket.addEventListener('close', this._onClose);
      this.socket.addEventListener('error', this._onError);
      this.socket.addEventListener('message', this._onMessage);
    } catch (e) {
      console.error('OSC Bridge: Failed to connect:', e);
      this._scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.removeEventListener('open', this._onOpen);
      this.socket.removeEventListener('close', this._onClose);
      this.socket.removeEventListener('error', this._onError);
      this.socket.removeEventListener('message', this._onMessage);
      this.socket.close();
      this.socket = null;
    }

    this.isConnected = false;
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  getIsConnected() {
    return this.isConnected;
  }

  /**
   * Send OSC message through WebSocket
   * @param {string} address
   * @param {*[]} args
   */
  send(address, ...args) {
    if (!this.isConnected || !this.socket) return;

    try {
      this.socket.send(JSON.stringify({ address, args }));
    } catch (e) {
      console.error('OSC Bridge: Failed to send:', e);
    }
  }

  /**
   * Register a custom handler for an address pattern
   * @param {string} pattern - OSC address pattern (supports * wildcard)
   * @param {Function} handler - Handler function(address, args)
   * @returns {Function} Unsubscribe function
   */
  on(pattern, handler) {
    if (!this.listeners.has(pattern)) {
      this.listeners.set(pattern, new Set());
    }
    this.listeners.get(pattern).add(handler);

    return () => this.listeners.get(pattern)?.delete(handler);
  }

  // === Private handlers ===

  _onOpen() {
    console.log('OSC Bridge: Connected');
    this.isConnected = true;
    eventBus.emit('osc:connect');
  }

  _onClose() {
    console.log('OSC Bridge: Disconnected');
    this.isConnected = false;
    eventBus.emit('osc:disconnect');

    if (this.settings.autoReconnect && this.settings.enabled) {
      this._scheduleReconnect();
    }
  }

  _onError(error) {
    console.error('OSC Bridge: Error:', error);
    eventBus.emit('osc:error', { error });
  }

  _onMessage(event) {
    try {
      const { address, args } = JSON.parse(event.data);
      this._handleOSCMessage(address, args || []);
    } catch (e) {
      console.warn('OSC Bridge: Invalid message:', event.data);
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.settings.enabled && !this.isConnected) {
        this.connect();
      }
    }, this.settings.reconnectInterval);
  }

  /**
   * Handle incoming OSC message
   * @param {string} address
   * @param {*[]} args
   */
  _handleOSCMessage(address, args) {
    eventBus.emit('osc:message', { address, args });

    // Check custom listeners
    for (const [pattern, handlers] of this.listeners) {
      if (this._matchPattern(address, pattern)) {
        handlers.forEach(h => h(address, args));
      }
    }

    // Built-in handlers
    this._handleBuiltinCommands(address, args);
  }

  /**
   * Match OSC address against pattern
   * @param {string} address
   * @param {string} pattern
   * @returns {boolean}
   */
  _matchPattern(address, pattern) {
    // Simple wildcard matching
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return regex.test(address);
  }

  /**
   * Handle built-in commands
   * @param {string} address
   * @param {*[]} args
   */
  _handleBuiltinCommands(address, args) {
    // Transport
    if (address === '/soundsculpt/transport/play') {
      eventBus.emit(Events.TRANSPORT_PLAY);
      return;
    }
    if (address === '/soundsculpt/transport/stop') {
      eventBus.emit(Events.TRANSPORT_STOP);
      return;
    }
    if (address === '/soundsculpt/transport/pause') {
      eventBus.emit(Events.TRANSPORT_PAUSE);
      return;
    }
    if (address === '/soundsculpt/transport/bpm' && args.length > 0) {
      const bpm = parseFloat(args[0]);
      if (!isNaN(bpm) && bpm >= 20 && bpm <= 300) {
        state.setTempo(bpm);
      }
      return;
    }

    // Voice commands: /soundsculpt/voice/{id}/...
    const voiceMatch = address.match(/^\/soundsculpt\/voice\/([^/]+)\/(.+)$/);
    if (voiceMatch) {
      const [, voiceIdOrIndex, command] = voiceMatch;
      this._handleVoiceCommand(voiceIdOrIndex, command, args);
      return;
    }

    // Master volume: /soundsculpt/master/volume
    if (address === '/soundsculpt/master/volume' && args.length > 0) {
      const volume = parseFloat(args[0]);
      if (!isNaN(volume)) {
        mixer.setMasterVolume(Math.max(0, Math.min(1, volume)));
      }
      return;
    }
  }

  /**
   * Handle voice-specific commands
   * @param {string} voiceIdOrIndex
   * @param {string} command
   * @param {*[]} args
   */
  _handleVoiceCommand(voiceIdOrIndex, command, args) {
    // Get voice (by ID or index)
    const voices = state.get('voices') || [];
    let voice;

    if (/^\d+$/.test(voiceIdOrIndex)) {
      voice = voices[parseInt(voiceIdOrIndex)];
    } else {
      voice = voices.find(v => v.id === voiceIdOrIndex);
    }

    if (!voice) return;

    const value = args[0];

    switch (command) {
      case 'volume':
        if (typeof value === 'number') {
          state.updateVoice(voice.id, { volume: Math.max(0, Math.min(1, value)) });
        }
        break;

      case 'pan':
        if (typeof value === 'number') {
          state.updateVoice(voice.id, { pan: Math.max(-1, Math.min(1, value)) });
        }
        break;

      case 'mute':
        if (value === 1 || value === true || value === 0 || value === false) {
          state.updateVoice(voice.id, { muted: !!value });
        } else if (value === undefined) {
          // Toggle
          state.toggleMute(voice.id);
        }
        break;

      case 'solo':
        if (value === 1 || value === true || value === 0 || value === false) {
          state.updateVoice(voice.id, { solo: !!value });
        } else if (value === undefined) {
          state.toggleSolo(voice.id);
        }
        break;

      case 'spatial/x':
      case 'spatial/y':
      case 'spatial/z':
        const axis = command.split('/')[1];
        const current = voice.spatial?.position || { x: 0, y: 0, z: 0 };
        if (typeof value === 'number') {
          const newPos = { ...current, [axis]: Math.max(-1, Math.min(1, value)) };
          state.setSpatialPosition(voice.id, newPos.x, newPos.y, newPos.z);
        }
        break;

      case 'spatial/enabled':
        if (value === 1 || value === true || value === 0 || value === false) {
          state.setSpatialEnabled(voice.id, !!value);
        }
        break;
    }
  }
}

// Singleton instance
export const oscBridge = new OSCBridge();

// Events
export const OSCEvents = {
  CONNECT: 'osc:connect',
  DISCONNECT: 'osc:disconnect',
  ERROR: 'osc:error',
  MESSAGE: 'osc:message',
};
