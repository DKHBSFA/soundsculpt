/**
 * Session Controls - Toolbar UI for session recording/playback
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { sessionRecorder } from '../session/recorder.js';
import { sessionPlayer } from '../session/player.js';
import { showToast } from './toast.js';

/**
 * Format time in mm:ss:ff format
 * @param {number} ms - Time in milliseconds
 * @returns {string}
 */
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frames = Math.floor((ms % 1000) / (1000 / 30)); // 30fps

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

/**
 * Session Controls class
 */
class SessionControls {
  constructor() {
    this.container = null;
    this.recordBtn = null;
    this.punchBtn = null;
    this.playBtn = null;
    this.clearBtn = null;
    this.timeDisplay = null;

    this.blinkInterval = null;

    this._setupEventListeners();
  }

  /**
   * Initialize and render the session controls
   * @param {HTMLElement} parentElement - Container to append controls to
   */
  init(parentElement) {
    this.container = document.createElement('div');
    this.container.className = 'session-controls';
    this.container.innerHTML = this._getTemplate();

    parentElement.appendChild(this.container);

    // Get element references
    this.recordBtn = this.container.querySelector('.session-record-btn');
    this.punchBtn = this.container.querySelector('.session-punch-btn');
    this.playBtn = this.container.querySelector('.session-play-btn');
    this.clearBtn = this.container.querySelector('.session-clear-btn');
    this.timeDisplay = this.container.querySelector('.session-time');

    this._bindEvents();
    this._updateUI();
  }

  /**
   * Get the HTML template
   */
  _getTemplate() {
    return `
      <div class="session-controls-inner">
        <button class="session-record-btn" title="Record Session (R)" aria-label="Record session">
          <span class="record-icon"></span>
        </button>
        <button class="session-punch-btn" title="Punch-In Mode" aria-label="Toggle punch-in mode">
          <span class="punch-icon">P</span>
        </button>
        <button class="session-play-btn" title="Play Session" aria-label="Play session" disabled>
          <span class="play-icon"></span>
        </button>
        <button class="session-clear-btn" title="Clear Session" aria-label="Clear session" disabled>
          <span class="clear-icon">×</span>
        </button>
        <div class="session-time-display">
          <span class="session-time">00:00:00</span>
          <span class="session-duration">/ 00:00:00</span>
        </div>
      </div>
    `;
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    eventBus.on(Events.SESSION_RECORD_START, () => this._updateUI());
    eventBus.on(Events.SESSION_RECORD_STOP, (data) => {
      this._updateUI();
      if (data) {
        state.setSessionData(data);
        sessionPlayer.loadSession(data);
        showToast(`Session recorded: ${formatTime(data.duration)}`);
      }
    });
    eventBus.on(Events.SESSION_LOAD, () => this._updateUI());
    eventBus.on(Events.SESSION_CLEAR, () => this._updateUI());
    eventBus.on(Events.SESSION_PLAY, () => this._updateUI());
    eventBus.on(Events.SESSION_PAUSE, () => this._updateUI());
    eventBus.on(Events.SESSION_STOP, () => this._updateUI());
    eventBus.on(Events.SESSION_PLAYHEAD_UPDATE, ({ playhead }) => {
      this._updateTimeDisplay(playhead);
    });
  }

  /**
   * Bind button events
   */
  _bindEvents() {
    this.recordBtn.addEventListener('click', () => this._toggleRecording());
    this.punchBtn.addEventListener('click', () => this._togglePunch());
    this.playBtn.addEventListener('click', () => this._togglePlayback());
    this.clearBtn.addEventListener('click', () => this._clearSession());
  }

  /**
   * Toggle recording
   */
  _toggleRecording() {
    if (sessionRecorder.isRecording) {
      const data = sessionRecorder.stopRecording();
      state.stopSessionRecording();
      this._stopBlink();
    } else {
      const punchIn = this.punchBtn.classList.contains('active');
      sessionRecorder.startRecording(punchIn);
      state.startSessionRecording(punchIn);
      this._startBlink();
    }
    this._updateUI();
  }

  /**
   * Toggle punch-in mode
   */
  _togglePunch() {
    this.punchBtn.classList.toggle('active');
    this._updateUI();
  }

  /**
   * Toggle session playback
   */
  _togglePlayback() {
    if (!sessionPlayer.hasSession()) return;

    if (sessionPlayer.isPlaying) {
      sessionPlayer.pause();
      state.setSessionPlaying(false);
    } else {
      sessionPlayer.play();
      state.setSessionPlaying(true);
    }
    this._updateUI();
  }

  /**
   * Clear session data
   */
  _clearSession() {
    if (!state.hasSessionData()) return;

    sessionPlayer.stop();
    state.clearSession();
    sessionRecorder.clear();
    showToast('Session cleared');
    this._updateUI();
  }

  /**
   * Update UI state
   */
  _updateUI() {
    const isRecording = sessionRecorder.isRecording;
    const hasSession = state.hasSessionData();
    const isPlaying = sessionPlayer.isPlaying;
    const isPunchMode = this.punchBtn?.classList.contains('active');

    // Record button
    if (this.recordBtn) {
      this.recordBtn.classList.toggle('recording', isRecording);
      this.recordBtn.setAttribute('aria-pressed', isRecording);
    }

    // Punch button
    if (this.punchBtn) {
      this.punchBtn.disabled = isRecording;
      this.punchBtn.classList.toggle('active', isPunchMode && !isRecording);
    }

    // Play button
    if (this.playBtn) {
      this.playBtn.disabled = !hasSession || isRecording;
      this.playBtn.classList.toggle('playing', isPlaying);
      this.playBtn.setAttribute('aria-pressed', isPlaying);
    }

    // Clear button
    if (this.clearBtn) {
      this.clearBtn.disabled = !hasSession || isRecording;
    }

    // Time display
    this._updateTimeDisplay(sessionPlayer.getCurrentTime());

    // Duration display
    const durationEl = this.container?.querySelector('.session-duration');
    if (durationEl) {
      const duration = sessionPlayer.getDuration();
      durationEl.textContent = duration > 0 ? `/ ${formatTime(duration)}` : '/ --:--:--';
    }
  }

  /**
   * Update time display
   * @param {number} ms
   */
  _updateTimeDisplay(ms) {
    if (!this.timeDisplay) return;

    if (sessionRecorder.isRecording) {
      this.timeDisplay.textContent = formatTime(sessionRecorder.currentDuration);
    } else {
      this.timeDisplay.textContent = formatTime(ms);
    }
  }

  /**
   * Start recording indicator blink
   */
  _startBlink() {
    if (this.blinkInterval) return;

    this.blinkInterval = setInterval(() => {
      this.recordBtn?.classList.toggle('blink');
    }, 500);
  }

  /**
   * Stop recording indicator blink
   */
  _stopBlink() {
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
      this.blinkInterval = null;
    }
    this.recordBtn?.classList.remove('blink');
  }

  /**
   * Dispose of the controls
   */
  dispose() {
    this._stopBlink();
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

// Singleton instance
export const sessionControls = new SessionControls();

/**
 * Initialize session controls in the toolbar
 * @param {HTMLElement} toolbar - Toolbar element to add controls to
 */
export function initSessionControls(toolbar) {
  sessionControls.init(toolbar);
}
