/**
 * Session Timeline View - Overview timeline for session events and automation
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { sessionPlayer } from '../session/player.js';
import { AutomationLaneView } from './automation-lane.js';
import { beatToMs, msToBeat } from '../session/automation.js';

/**
 * Format time for display
 * @param {number} ms
 * @returns {string}
 */
function formatTimeLabel(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Session Timeline class
 */
export class SessionTimeline {
  constructor() {
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.automationContainer = null;

    // Dimensions
    this.width = 800;
    this.height = 150;
    this.timelineHeight = 40;
    this.eventHeight = 30;

    // View state
    this.zoom = 1;
    this.scrollX = 0;
    this.duration = 0;
    this.session = null;

    // Automation lanes
    this.automationLanes = new Map();

    // Playhead
    this.playhead = 0;
    this.animationFrameId = null;
  }

  /**
   * Initialize the timeline
   * @param {HTMLElement} parentElement
   */
  init(parentElement) {
    this.container = document.createElement('div');
    this.container.className = 'session-timeline';

    // Timeline canvas (ruler + events)
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'session-timeline-canvas-container';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'session-timeline-canvas';
    this.canvas.width = this.width;
    this.canvas.height = this.timelineHeight + this.eventHeight;
    this.ctx = this.canvas.getContext('2d');

    canvasContainer.appendChild(this.canvas);
    this.container.appendChild(canvasContainer);

    // Automation lanes container
    this.automationContainer = document.createElement('div');
    this.automationContainer.className = 'session-timeline-automation';
    this.container.appendChild(this.automationContainer);

    parentElement.appendChild(this.container);

    this._bindEvents();
    this._setupEventListeners();
    this._startRenderLoop();
  }

  /**
   * Bind DOM events
   */
  _bindEvents() {
    this.canvas.addEventListener('click', (e) => this._handleClick(e));
    this.canvas.addEventListener('wheel', (e) => this._handleWheel(e));

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this.container) {
          this._handleResize();
        }
      }
    });
    resizeObserver.observe(this.container);
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    eventBus.on(Events.SESSION_LOAD, (data) => {
      this.session = data;
      this.duration = data?.duration || 0;
      this._buildAutomationLanes();
      this.render();
    });

    eventBus.on(Events.SESSION_CLEAR, () => {
      this.session = null;
      this.duration = 0;
      this._clearAutomationLanes();
      this.render();
    });

    eventBus.on(Events.SESSION_PLAYHEAD_UPDATE, ({ playhead }) => {
      this.playhead = playhead;
    });

    eventBus.on(Events.SESSION_STOP, () => {
      this.playhead = 0;
    });
  }

  /**
   * Build automation lane views
   */
  _buildAutomationLanes() {
    this._clearAutomationLanes();

    if (!this.session?.automationLanes) return;

    // Group lanes by voice
    const voiceLanes = new Map();
    for (const lane of this.session.automationLanes) {
      if (!voiceLanes.has(lane.voiceId)) {
        voiceLanes.set(lane.voiceId, []);
      }
      voiceLanes.get(lane.voiceId).push(lane);
    }

    // Create lane views
    for (const [voiceId, lanes] of voiceLanes) {
      const voice = state.getVoice(voiceId);
      if (!voice) continue;

      // Voice header
      const header = document.createElement('div');
      header.className = 'automation-voice-header';
      header.innerHTML = `<span class="voice-icon">${voice.icon || ''}</span> ${voice.name}`;
      this.automationContainer.appendChild(header);

      // Lanes
      for (const lane of lanes) {
        const laneContainer = document.createElement('div');
        laneContainer.className = 'automation-lane-container';
        laneContainer.setAttribute('data-lane-id', lane.id);
        this.automationContainer.appendChild(laneContainer);

        const laneView = new AutomationLaneView({
          voiceId: lane.voiceId,
          param: lane.param,
          container: laneContainer,
          width: this.width,
          height: 50
        });

        laneView.setLane(lane, this.duration);
        this.automationLanes.set(lane.id, laneView);
      }
    }
  }

  /**
   * Clear automation lane views
   */
  _clearAutomationLanes() {
    for (const view of this.automationLanes.values()) {
      view.dispose();
    }
    this.automationLanes.clear();
    this.automationContainer.innerHTML = '';
  }

  /**
   * Handle click on timeline (seek)
   * @param {MouseEvent} e
   */
  _handleClick(e) {
    if (!this.session) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = this._xToTime(x);

    sessionPlayer.seek(time);
    eventBus.emit(Events.SESSION_SEEK, { playhead: time });
  }

  /**
   * Handle wheel for zoom
   * @param {WheelEvent} e
   */
  _handleWheel(e) {
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.max(0.5, Math.min(10, this.zoom * delta));
      this._updateAutomationLanesZoom();
      this.render();
    } else {
      // Scroll
      this.scrollX = Math.max(0, this.scrollX + e.deltaX);
      this._updateAutomationLanesScroll();
      this.render();
    }
  }

  /**
   * Handle resize
   */
  _handleResize() {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.canvas.width = this.width;

    for (const view of this.automationLanes.values()) {
      view.resize(this.width, 50);
    }

    this.render();
  }

  /**
   * Update automation lanes zoom
   */
  _updateAutomationLanesZoom() {
    for (const view of this.automationLanes.values()) {
      view.setZoom(this.zoom);
    }
  }

  /**
   * Update automation lanes scroll
   */
  _updateAutomationLanesScroll() {
    for (const view of this.automationLanes.values()) {
      view.setScrollX(this.scrollX);
    }
  }

  /**
   * Convert X coordinate to time
   * @param {number} x
   * @returns {number}
   */
  _xToTime(x) {
    return ((x + this.scrollX) / (this.width * this.zoom)) * this.duration;
  }

  /**
   * Convert time to X coordinate
   * @param {number} time
   * @returns {number}
   */
  _timeToX(time) {
    return ((time / this.duration) * this.width * this.zoom) - this.scrollX;
  }

  /**
   * Start the render loop
   */
  _startRenderLoop() {
    const render = () => {
      this.render();
      this.animationFrameId = requestAnimationFrame(render);
    };
    this.animationFrameId = requestAnimationFrame(render);
  }

  /**
   * Render the timeline
   */
  render() {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const width = this.width;
    const height = this.timelineHeight + this.eventHeight;

    // Clear
    ctx.fillStyle = 'var(--color-surface-2, #1a1a1a)';
    ctx.fillRect(0, 0, width, height);

    if (!this.session || this.duration === 0) {
      // Empty state
      ctx.fillStyle = 'var(--color-text-tertiary, #666)';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No session recorded', width / 2, height / 2);
      return;
    }

    // Draw timeline ruler
    this._drawRuler(ctx);

    // Draw events
    this._drawEvents(ctx);

    // Draw playhead
    this._drawPlayhead(ctx);
  }

  /**
   * Draw the time ruler
   * @param {CanvasRenderingContext2D} ctx
   */
  _drawRuler(ctx) {
    const height = this.timelineHeight;

    // Background
    ctx.fillStyle = 'var(--color-surface-1, #252525)';
    ctx.fillRect(0, 0, this.width, height);

    // Calculate tick interval based on zoom
    const visibleDuration = this.duration / this.zoom;
    let interval = 1000; // 1 second

    if (visibleDuration > 60000) interval = 10000;
    else if (visibleDuration > 30000) interval = 5000;
    else if (visibleDuration > 10000) interval = 2000;
    else if (visibleDuration < 5000) interval = 500;

    // Draw ticks
    ctx.strokeStyle = 'var(--color-border, #333)';
    ctx.fillStyle = 'var(--color-text-secondary, #888)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';

    const startTime = Math.floor(this._xToTime(0) / interval) * interval;
    const endTime = this._xToTime(this.width);

    for (let time = startTime; time <= endTime; time += interval) {
      const x = this._timeToX(time);
      if (x < 0 || x > this.width) continue;

      // Tick line
      ctx.beginPath();
      ctx.moveTo(x, height - 10);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Label
      ctx.fillText(formatTimeLabel(time), x, height - 14);
    }

    // Minor ticks
    const minorInterval = interval / 4;
    ctx.strokeStyle = 'var(--color-border-dim, #2a2a2a)';

    for (let time = startTime; time <= endTime; time += minorInterval) {
      if (time % interval === 0) continue;
      const x = this._timeToX(time);
      if (x < 0 || x > this.width) continue;

      ctx.beginPath();
      ctx.moveTo(x, height - 5);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  /**
   * Draw session events
   * @param {CanvasRenderingContext2D} ctx
   */
  _drawEvents(ctx) {
    if (!this.session?.events) return;

    const y = this.timelineHeight + 15;

    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';

    for (const event of this.session.events) {
      const x = this._timeToX(event.time);
      if (x < -10 || x > this.width + 10) continue;

      // Event dot
      const color = this._getEventColor(event.type);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Get color for event type
   * @param {string} type
   * @returns {string}
   */
  _getEventColor(type) {
    const colors = {
      'note:trigger': 'var(--color-accent, #00a8ff)',
      'note:release': 'var(--color-accent-dim, #0080cc)',
      'voice:mute': 'var(--color-warning, #ffaa00)',
      'voice:solo': 'var(--color-success, #00cc66)',
      'transport:tempo': 'var(--color-error, #ff4444)',
      'pattern:change': 'var(--color-voice-3, #aa66ff)',
    };
    return colors[type] || 'var(--color-text-secondary, #888)';
  }

  /**
   * Draw playhead
   * @param {CanvasRenderingContext2D} ctx
   */
  _drawPlayhead(ctx) {
    const x = this._timeToX(this.playhead);
    if (x < 0 || x > this.width) return;

    ctx.strokeStyle = 'var(--color-playhead, #ff3366)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, this.timelineHeight + this.eventHeight);
    ctx.stroke();
    ctx.lineWidth = 1;

    // Playhead triangle
    ctx.fillStyle = 'var(--color-playhead, #ff3366)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 6, -8);
    ctx.lineTo(x + 6, -8);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Set zoom level
   * @param {number} zoom
   */
  setZoom(zoom) {
    this.zoom = Math.max(0.5, Math.min(10, zoom));
    this._updateAutomationLanesZoom();
    this.render();
  }

  /**
   * Dispose the timeline
   */
  dispose() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this._clearAutomationLanes();
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

// Singleton instance
export const sessionTimeline = new SessionTimeline();

/**
 * Initialize session timeline
 * @param {HTMLElement} parentElement
 */
export function initSessionTimeline(parentElement) {
  sessionTimeline.init(parentElement);
}
