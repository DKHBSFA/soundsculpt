/**
 * AudioContext Manager - Handles audio context lifecycle and suspended state
 */

import { eventBus, Events } from '../event-bus.js';

class AudioContextManager {
  constructor() {
    this.context = null;
    this.isInitialized = false;
  }

  /**
   * Initialize AudioContext (must be called after user gesture)
   */
  async init() {
    if (this.context) {
      return this.context;
    }

    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();

      // Listen for state changes
      this.context.onstatechange = () => {
        eventBus.emit(Events.AUDIO_CONTEXT_STATE, this.context.state);
      };

      // Resume if suspended
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      this.isInitialized = true;
      eventBus.emit(Events.AUDIO_CONTEXT_STATE, this.context.state);

      return this.context;
    } catch (error) {
      console.error('Failed to create AudioContext:', error);
      throw error;
    }
  }

  /**
   * Get AudioContext (may be null if not initialized)
   */
  getContext() {
    return this.context;
  }

  /**
   * Resume AudioContext (requires user gesture)
   */
  async resume() {
    if (!this.context) {
      return this.init();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    return this.context;
  }

  /**
   * Suspend AudioContext
   */
  async suspend() {
    if (this.context && this.context.state === 'running') {
      await this.context.suspend();
    }
  }

  /**
   * Close AudioContext
   */
  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.isInitialized = false;
    }
  }

  /**
   * Check if context is running
   */
  isRunning() {
    return this.context?.state === 'running';
  }

  /**
   * Check if context is suspended
   */
  isSuspended() {
    return this.context?.state === 'suspended';
  }

  /**
   * Get current state
   */
  getState() {
    return this.context?.state || 'closed';
  }

  /**
   * Get current time
   */
  getCurrentTime() {
    return this.context?.currentTime || 0;
  }

  /**
   * Get sample rate
   */
  getSampleRate() {
    return this.context?.sampleRate || 44100;
  }
}

// Singleton instance
export const audioContext = new AudioContextManager();
