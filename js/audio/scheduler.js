/**
 * Audio Scheduler - Precise timing for audio playback
 * Uses Web Audio API's scheduling with lookahead pattern
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { audioContext } from './context-manager.js';
import { sessionPlayer } from '../session/player.js';

// Scheduling constants
const LOOKAHEAD = 0.1; // seconds - how far ahead to schedule
const SCHEDULE_INTERVAL = 25; // ms - how often to call scheduler

/**
 * Scheduler class for precise audio timing
 */
class Scheduler {
  constructor() {
    this.isPlaying = false;
    this.startTime = 0;
    this.currentBeat = 0;
    this.scheduledUntil = 0;
    this.timerID = null;
    this.onTrigger = null; // Callback when a step should trigger

    this.setupEventListeners();
  }

  /**
   * Setup event bus listeners
   */
  setupEventListeners() {
    eventBus.on(Events.TRANSPORT_PLAY, () => this.start());
    eventBus.on(Events.TRANSPORT_STOP, () => this.stop());
    eventBus.on(Events.TRANSPORT_PAUSE, () => this.pause());
    eventBus.on(Events.TRANSPORT_SEEK, (beat) => this.seek(beat));
  }

  /**
   * Get current tempo in BPM
   */
  getTempo() {
    return state.get('transport.tempo') || 120;
  }

  /**
   * Get loop settings
   */
  getLoopSettings() {
    const transport = state.get('transport') || {};
    return {
      enabled: transport.loop || false,
      start: transport.loopStart || 0,
      end: transport.loopEnd || 16,
    };
  }

  /**
   * Convert beat to seconds
   */
  beatToSeconds(beat) {
    const tempo = this.getTempo();
    return (beat * 60) / tempo;
  }

  /**
   * Convert seconds to beat
   */
  secondsToBeat(seconds) {
    const tempo = this.getTempo();
    return (seconds * tempo) / 60;
  }

  /**
   * Start playback
   */
  start() {
    if (this.isPlaying) return;

    // Ensure audio context is running
    if (audioContext.context.state === 'suspended') {
      audioContext.resume();
    }

    this.isPlaying = true;
    this.currentBeat = state.get('transport.currentBeat') || 0;
    this.startTime = audioContext.context.currentTime - this.beatToSeconds(this.currentBeat);
    this.scheduledUntil = audioContext.context.currentTime;

    // Start scheduling loop
    this.schedule();
  }

  /**
   * Stop playback and reset position
   */
  stop() {
    this.pause();
    this.currentBeat = 0;
    state.updateCurrentBeat(0);
  }

  /**
   * Pause playback
   */
  pause() {
    this.isPlaying = false;
    if (this.timerID) {
      clearTimeout(this.timerID);
      this.timerID = null;
    }
  }

  /**
   * Seek to a specific beat
   */
  seek(beat) {
    this.currentBeat = beat;
    if (this.isPlaying) {
      this.startTime = audioContext.context.currentTime - this.beatToSeconds(beat);
      this.scheduledUntil = audioContext.context.currentTime;
    }
    state.updateCurrentBeat(beat);
  }

  /**
   * Main scheduling loop
   */
  schedule() {
    if (!this.isPlaying) return;

    const ctx = audioContext.context;
    const currentTime = ctx.currentTime;
    const loop = this.getLoopSettings();
    const tempo = this.getTempo();

    // Schedule notes from now until lookahead time
    while (this.scheduledUntil < currentTime + LOOKAHEAD) {
      // Calculate beat at scheduled time
      const beatAtTime = this.secondsToBeat(this.scheduledUntil - this.startTime);

      // Handle looping
      let effectiveBeat = beatAtTime;
      if (loop.enabled && effectiveBeat >= loop.end) {
        const loopLength = loop.end - loop.start;
        effectiveBeat = loop.start + ((effectiveBeat - loop.start) % loopLength);
        // Reset start time for loop
        this.startTime = currentTime - this.beatToSeconds(effectiveBeat);
      }

      // Check if we need to trigger something at this beat
      const stepIndex = Math.floor(effectiveBeat);
      if (stepIndex >= 0) {
        this.scheduleStep(stepIndex, this.scheduledUntil);
      }

      // Advance by one step (1 beat = 1 step in 16th note grid at this tempo)
      // For 16 steps per 4 beats, each step is 0.25 beats
      const stepDuration = 0.25;
      this.scheduledUntil += this.beatToSeconds(stepDuration);
    }

    // Update current beat for UI
    const currentBeat = this.secondsToBeat(currentTime - this.startTime);
    let displayBeat = currentBeat;
    if (loop.enabled) {
      const loopLength = loop.end - loop.start;
      displayBeat = loop.start + ((currentBeat - loop.start) % loopLength);
    }

    state.updateCurrentBeat(displayBeat);

    // Apply session automation if playing
    if (state.hasSessionData() && sessionPlayer.isPlaying) {
      const sessionTimeMs = this.beatToMs(displayBeat);
      sessionPlayer.applyAutomationAt(sessionTimeMs);
      sessionPlayer.triggerEventsUntil(sessionTimeMs);
    }

    // Schedule next check
    this.timerID = setTimeout(() => this.schedule(), SCHEDULE_INTERVAL);
  }

  /**
   * Convert beat to milliseconds
   * @param {number} beat
   * @returns {number}
   */
  beatToMs(beat) {
    const tempo = this.getTempo();
    return (beat / (tempo / 60)) * 1000;
  }

  /**
   * Schedule a step to trigger at a specific time
   */
  scheduleStep(stepIndex, time) {
    if (this.onTrigger) {
      this.onTrigger(stepIndex, time);
    }
  }

  /**
   * Set callback for when a step triggers
   */
  setTriggerCallback(callback) {
    this.onTrigger = callback;
  }

  /**
   * Get current playback position in beats
   */
  getCurrentBeat() {
    if (!this.isPlaying) {
      return this.currentBeat;
    }
    return this.secondsToBeat(audioContext.context.currentTime - this.startTime);
  }
}

// Singleton instance
export const scheduler = new Scheduler();
