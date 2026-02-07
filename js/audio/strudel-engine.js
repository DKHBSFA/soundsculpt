/**
 * SoundSculpt Engine v2 - Strudel Playback Engine
 *
 * Wrapper for @strudel/web with soundfonts support.
 * Handles pattern playback, phase transitions, and voice control.
 */

/**
 * Strudel Engine class for audio playback
 */
class StrudelEngine {
  constructor() {
    this.initialized = false;
    this.repl = null;
    this.currentPatterns = new Map();
    this.isPlaying = false;
    this.currentPhase = 'intro';
    this.bpm = 72;
    this.mutedVoices = new Set();
    this.soloVoices = new Set();
    this.initPromise = null;
  }

  /**
   * Initialize Strudel with soundfonts
   * @returns {Promise<boolean>} Success status
   */
  async init() {
    if (this.initialized) return true;

    // Prevent multiple concurrent init calls
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInit();
    return this.initPromise;
  }

  /**
   * Internal initialization
   * @returns {Promise<boolean>}
   */
  async _doInit() {
    try {
      // Load Strudel from CDN
      const { initStrudel, repl } = await import('https://unpkg.com/@strudel/web@1.0.3/dist/index.mjs');

      // Load soundfonts
      await import('https://unpkg.com/@strudel/soundfonts@1.0.0/dist/index.mjs');

      // Initialize
      await initStrudel();

      this.repl = repl;
      this.initialized = true;

      console.log('Strudel engine initialized with soundfonts');
      return true;

    } catch (err) {
      console.error('Strudel init failed:', err);
      this.initialized = false;
      this.initPromise = null;
      return false;
    }
  }

  /**
   * Check if engine is ready
   * @returns {boolean}
   */
  isReady() {
    return this.initialized;
  }

  /**
   * Set voices for playback
   * @param {Object[]} voices - Array of voice objects with patternCode
   */
  setVoices(voices) {
    this.currentPatterns.clear();

    for (const voice of voices) {
      this.currentPatterns.set(voice.id, {
        ...voice,
        muted: this.mutedVoices.has(voice.id)
      });
    }
  }

  /**
   * Set BPM
   * @param {number} bpm - Beats per minute
   */
  setBpm(bpm) {
    this.bpm = bpm;
  }

  /**
   * Start playback
   * @param {Object[]} voices - Optional voices to set
   * @returns {Promise<boolean>}
   */
  async play(voices = null) {
    if (!this.initialized) {
      const ready = await this.init();
      if (!ready) return false;
    }

    if (voices) {
      this.setVoices(voices);
    }

    const code = this._buildPlaybackCode();

    if (!code || code === 'silence') {
      console.log('No patterns to play');
      return false;
    }

    try {
      await this.repl({ code }).start();
      this.isPlaying = true;
      console.log('Strudel playback started');
      return true;

    } catch (err) {
      console.error('Strudel play error:', err);
      return false;
    }
  }

  /**
   * Stop playback
   */
  stop() {
    // Strudel global stop function
    if (typeof window !== 'undefined' && window.hush) {
      window.hush();
    }
    this.isPlaying = false;
    console.log('Strudel playback stopped');
  }

  /**
   * Update current phase and hot-reload patterns
   * @param {string} phase - Phase name
   * @returns {Promise<void>}
   */
  async updatePhase(phase) {
    if (this.currentPhase === phase) return;

    this.currentPhase = phase;
    console.log('Phase changed to:', phase);

    if (this.isPlaying) {
      await this.play();
    }
  }

  /**
   * Mute a voice
   * @param {string} voiceId - Voice ID
   */
  muteVoice(voiceId) {
    this.mutedVoices.add(voiceId);

    if (this.currentPatterns.has(voiceId)) {
      const voice = this.currentPatterns.get(voiceId);
      voice.muted = true;
    }

    if (this.isPlaying) {
      this.play();
    }
  }

  /**
   * Unmute a voice
   * @param {string} voiceId - Voice ID
   */
  unmuteVoice(voiceId) {
    this.mutedVoices.delete(voiceId);

    if (this.currentPatterns.has(voiceId)) {
      const voice = this.currentPatterns.get(voiceId);
      voice.muted = false;
    }

    if (this.isPlaying) {
      this.play();
    }
  }

  /**
   * Toggle voice mute
   * @param {string} voiceId - Voice ID
   * @returns {boolean} New mute state
   */
  toggleMute(voiceId) {
    if (this.mutedVoices.has(voiceId)) {
      this.unmuteVoice(voiceId);
      return false;
    } else {
      this.muteVoice(voiceId);
      return true;
    }
  }

  /**
   * Solo a voice (mute all others)
   * @param {string} voiceId - Voice ID
   */
  soloVoice(voiceId) {
    if (this.soloVoices.has(voiceId)) {
      // Remove solo
      this.soloVoices.delete(voiceId);
    } else {
      // Add solo
      this.soloVoices.add(voiceId);
    }

    if (this.isPlaying) {
      this.play();
    }
  }

  /**
   * Clear all solos
   */
  clearSolos() {
    this.soloVoices.clear();

    if (this.isPlaying) {
      this.play();
    }
  }

  /**
   * Build Strudel code for current patterns
   * @returns {string} Strudel code
   */
  _buildPlaybackCode() {
    const activePatterns = [];
    const hasSolos = this.soloVoices.size > 0;

    this.currentPatterns.forEach((voice, voiceId) => {
      // Check if should play
      const shouldPlay = hasSolos
        ? this.soloVoices.has(voiceId)
        : !voice.muted;

      if (!shouldPlay) return;

      // Get pattern for current phase
      let pattern;
      if (voice.phasedPatterns) {
        pattern = voice.phasedPatterns[this.currentPhase];
      } else {
        pattern = voice.patternCode;
      }

      if (!pattern || pattern === 'silence') return;

      activePatterns.push({
        id: voiceId,
        name: voice.name || voiceId,
        code: pattern
      });
    });

    if (activePatterns.length === 0) {
      return 'silence';
    }

    // Build stack of patterns
    const patternLines = activePatterns.map(p =>
      `  // ${p.name}\n  ${p.code}`
    );

    return `// SoundSculpt Engine v2 - Phase: ${this.currentPhase}
// BPM: ${this.bpm}
setcps(${this.bpm / 60 / 4})

stack(
${patternLines.join(',\n')}
)`;
  }

  /**
   * Get pattern code for a voice in current phase
   * @param {string} voiceId - Voice ID
   * @returns {string|null} Pattern code
   */
  getVoicePattern(voiceId) {
    const voice = this.currentPatterns.get(voiceId);
    if (!voice) return null;

    if (voice.phasedPatterns) {
      return voice.phasedPatterns[this.currentPhase];
    }
    return voice.patternCode;
  }

  /**
   * Update a single voice's pattern
   * @param {string} voiceId - Voice ID
   * @param {string} pattern - New pattern code
   * @param {string} phase - Phase to update (or null for all)
   */
  updateVoicePattern(voiceId, pattern, phase = null) {
    const voice = this.currentPatterns.get(voiceId);
    if (!voice) return;

    if (phase && voice.phasedPatterns) {
      voice.phasedPatterns[phase] = pattern;
    } else {
      voice.patternCode = pattern;
    }

    if (this.isPlaying) {
      this.play();
    }
  }

  /**
   * Get full Strudel code for export/display
   * @returns {string}
   */
  getFullCode() {
    return this._buildPlaybackCode();
  }

  /**
   * Evaluate raw Strudel code
   * @param {string} code - Strudel code
   * @returns {Promise<boolean>}
   */
  async evaluateCode(code) {
    if (!this.initialized) {
      const ready = await this.init();
      if (!ready) return false;
    }

    try {
      await this.repl({ code }).start();
      this.isPlaying = true;
      return true;
    } catch (err) {
      console.error('Strudel eval error:', err);
      return false;
    }
  }

  /**
   * Get playback state
   * @returns {Object}
   */
  getState() {
    return {
      initialized: this.initialized,
      isPlaying: this.isPlaying,
      currentPhase: this.currentPhase,
      bpm: this.bpm,
      voiceCount: this.currentPatterns.size,
      mutedCount: this.mutedVoices.size,
      soloCount: this.soloVoices.size
    };
  }

  /**
   * Cleanup engine
   */
  dispose() {
    this.stop();
    this.currentPatterns.clear();
    this.mutedVoices.clear();
    this.soloVoices.clear();
    this.initialized = false;
    this.initPromise = null;
  }
}

// Export singleton instance
export const strudelEngine = new StrudelEngine();

/**
 * Phase manager for automatic phase transitions
 */
export class PhaseManager {
  constructor(engine = strudelEngine) {
    this.engine = engine;
    this.phases = [];
    this.currentPhaseIndex = 0;
    this.phaseStartTime = 0;
    this.isRunning = false;
    this.intervalId = null;
  }

  /**
   * Set phases from a plan
   * @param {Object[]} phases - Phase configurations
   * @param {number} bpm - Beats per minute
   */
  setPhases(phases, bpm) {
    this.phases = phases.map(phase => ({
      name: phase.name,
      startBar: phase.bars[0],
      endBar: phase.bars[1],
      duration: (phase.bars[1] - phase.bars[0]) * (60 / bpm) * 4 * 1000 // ms
    }));
    this.currentPhaseIndex = 0;
  }

  /**
   * Start automatic phase progression
   */
  start() {
    if (this.phases.length === 0) return;

    this.isRunning = true;
    this.currentPhaseIndex = 0;
    this.phaseStartTime = Date.now();

    // Set initial phase
    this.engine.updatePhase(this.phases[0].name);

    // Start phase check interval
    this.intervalId = setInterval(() => this._checkPhase(), 100);
  }

  /**
   * Stop phase progression
   */
  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check and advance phase if needed
   */
  _checkPhase() {
    if (!this.isRunning || this.phases.length === 0) return;

    const elapsed = Date.now() - this.phaseStartTime;
    const currentPhase = this.phases[this.currentPhaseIndex];

    if (elapsed >= currentPhase.duration) {
      // Advance to next phase
      this.currentPhaseIndex++;

      if (this.currentPhaseIndex >= this.phases.length) {
        // Loop back to beginning or stop
        this.currentPhaseIndex = 0;
        // Optionally: this.stop();
      }

      this.phaseStartTime = Date.now();
      this.engine.updatePhase(this.phases[this.currentPhaseIndex].name);
    }
  }

  /**
   * Jump to specific phase
   * @param {string} phaseName - Phase name
   */
  jumpToPhase(phaseName) {
    const index = this.phases.findIndex(p => p.name === phaseName);
    if (index >= 0) {
      this.currentPhaseIndex = index;
      this.phaseStartTime = Date.now();
      this.engine.updatePhase(phaseName);
    }
  }

  /**
   * Get current phase info
   * @returns {Object}
   */
  getCurrentPhase() {
    if (this.phases.length === 0) return null;
    return this.phases[this.currentPhaseIndex];
  }
}
