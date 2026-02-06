/**
 * Automation Lane View - SVG visualization of automation curves
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { sessionPlayer } from '../session/player.js';
import {
  getValueAtTime,
  denormalizeValue,
  AUTOMATABLE_PARAMS,
  CurveTypes
} from '../session/automation.js';

/**
 * AutomationLaneView - Renders and edits automation curves
 */
export class AutomationLaneView {
  /**
   * @param {Object} options
   * @param {string} options.voiceId - Voice this lane belongs to
   * @param {string} options.param - Parameter name
   * @param {HTMLElement} options.container - Container element
   * @param {number} options.width - Width in pixels
   * @param {number} options.height - Height in pixels
   */
  constructor(options) {
    this.voiceId = options.voiceId;
    this.param = options.param;
    this.container = options.container;
    this.width = options.width || 400;
    this.height = options.height || 60;

    // View state
    this.zoom = 1;
    this.scrollX = 0;
    this.duration = 0;

    // Interaction state
    this.selectedPointIndex = -1;
    this.isDragging = false;
    this.isCreatingPoint = false;

    // Elements
    this.svg = null;
    this.curvePath = null;
    this.pointsGroup = null;
    this.playheadLine = null;

    // Cached data
    this.lane = null;

    this._init();
    this._setupEventListeners();
  }

  /**
   * Initialize the SVG structure
   */
  _init() {
    // Create SVG element
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'automation-lane');
    this.svg.setAttribute('width', this.width);
    this.svg.setAttribute('height', this.height);
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);

    // Background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('class', 'automation-bg');
    bg.setAttribute('width', this.width);
    bg.setAttribute('height', this.height);
    this.svg.appendChild(bg);

    // Grid lines
    this._createGridLines();

    // Curve path
    this.curvePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.curvePath.setAttribute('class', 'automation-curve');
    this.curvePath.setAttribute('fill', 'none');
    this.svg.appendChild(this.curvePath);

    // Points group
    this.pointsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.pointsGroup.setAttribute('class', 'automation-points');
    this.svg.appendChild(this.pointsGroup);

    // Playhead
    this.playheadLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    this.playheadLine.setAttribute('class', 'automation-playhead');
    this.playheadLine.setAttribute('y1', 0);
    this.playheadLine.setAttribute('y2', this.height);
    this.playheadLine.setAttribute('x1', 0);
    this.playheadLine.setAttribute('x2', 0);
    this.svg.appendChild(this.playheadLine);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('class', 'automation-label');
    label.setAttribute('x', 4);
    label.setAttribute('y', 12);
    label.textContent = this.param;
    this.svg.appendChild(label);

    this.container.appendChild(this.svg);

    // Bind interaction events
    this._bindInteractionEvents();
  }

  /**
   * Create grid lines
   */
  _createGridLines() {
    const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gridGroup.setAttribute('class', 'automation-grid');

    // Horizontal center line
    const centerLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    centerLine.setAttribute('x1', 0);
    centerLine.setAttribute('x2', this.width);
    centerLine.setAttribute('y1', this.height / 2);
    centerLine.setAttribute('y2', this.height / 2);
    centerLine.setAttribute('class', 'grid-line-center');
    gridGroup.appendChild(centerLine);

    this.svg.appendChild(gridGroup);
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    eventBus.on(Events.SESSION_LOAD, (data) => {
      this._loadLaneFromSession(data);
    });

    eventBus.on(Events.SESSION_PLAYHEAD_UPDATE, ({ playhead }) => {
      this._updatePlayhead(playhead);
    });

    eventBus.on(Events.SESSION_CLEAR, () => {
      this.lane = null;
      this.render();
    });
  }

  /**
   * Bind mouse/touch interaction events
   */
  _bindInteractionEvents() {
    this.svg.addEventListener('mousedown', (e) => this._handleMouseDown(e));
    this.svg.addEventListener('mousemove', (e) => this._handleMouseMove(e));
    this.svg.addEventListener('mouseup', (e) => this._handleMouseUp(e));
    this.svg.addEventListener('mouseleave', (e) => this._handleMouseUp(e));
    this.svg.addEventListener('dblclick', (e) => this._handleDoubleClick(e));
  }

  /**
   * Load lane data from session
   * @param {Object} sessionData
   */
  _loadLaneFromSession(sessionData) {
    if (!sessionData?.automationLanes) {
      this.lane = null;
      this.render();
      return;
    }

    const laneId = `${this.voiceId}:${this.param}`;
    this.lane = sessionData.automationLanes.find(l => l.id === laneId);
    this.duration = sessionData.duration || 1000;
    this.render();
  }

  /**
   * Set lane data directly
   * @param {Object} lane
   * @param {number} duration
   */
  setLane(lane, duration) {
    this.lane = lane;
    this.duration = duration || 1000;
    this.render();
  }

  /**
   * Convert time to X coordinate
   * @param {number} time - Time in ms
   * @returns {number}
   */
  timeToX(time) {
    return ((time / this.duration) * this.width * this.zoom) - this.scrollX;
  }

  /**
   * Convert X coordinate to time
   * @param {number} x
   * @returns {number}
   */
  xToTime(x) {
    return ((x + this.scrollX) / (this.width * this.zoom)) * this.duration;
  }

  /**
   * Convert normalized value to Y coordinate
   * @param {number} value - Value 0-1
   * @returns {number}
   */
  valueToY(value) {
    return this.height - (value * this.height);
  }

  /**
   * Convert Y coordinate to normalized value
   * @param {number} y
   * @returns {number}
   */
  yToValue(y) {
    return Math.max(0, Math.min(1, 1 - (y / this.height)));
  }

  /**
   * Render the automation lane
   */
  render() {
    this._renderCurve();
    this._renderPoints();
  }

  /**
   * Render the automation curve
   */
  _renderCurve() {
    if (!this.lane || !this.lane.points || this.lane.points.length === 0) {
      this.curvePath.setAttribute('d', '');
      return;
    }

    const points = this.lane.points;
    let d = '';

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const x = this.timeToX(point.time);
      const y = this.valueToY(point.value);

      if (i === 0) {
        // Start with line from left edge
        d = `M 0 ${y} L ${x} ${y}`;
      } else {
        const prevPoint = points[i - 1];
        const prevX = this.timeToX(prevPoint.time);
        const prevY = this.valueToY(prevPoint.value);

        switch (prevPoint.curve) {
          case CurveTypes.STEP:
            // Step: horizontal then vertical
            d += ` L ${x} ${prevY} L ${x} ${y}`;
            break;

          case CurveTypes.EXPONENTIAL:
            // Exponential: use quadratic bezier
            const midX = (prevX + x) / 2;
            d += ` Q ${midX} ${prevY} ${x} ${y}`;
            break;

          case CurveTypes.LINEAR:
          default:
            // Linear: straight line
            d += ` L ${x} ${y}`;
        }
      }
    }

    // Extend to right edge
    const lastPoint = points[points.length - 1];
    const lastY = this.valueToY(lastPoint.value);
    d += ` L ${this.width} ${lastY}`;

    this.curvePath.setAttribute('d', d);
  }

  /**
   * Render control points
   */
  _renderPoints() {
    // Clear existing points
    while (this.pointsGroup.firstChild) {
      this.pointsGroup.removeChild(this.pointsGroup.firstChild);
    }

    if (!this.lane || !this.lane.points) return;

    this.lane.points.forEach((point, index) => {
      const x = this.timeToX(point.time);
      const y = this.valueToY(point.value);

      // Skip points outside view
      if (x < -10 || x > this.width + 10) return;

      // Point circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', 5);
      circle.setAttribute('class', 'automation-point');
      circle.setAttribute('data-index', index);

      if (index === this.selectedPointIndex) {
        circle.classList.add('selected');
      }

      this.pointsGroup.appendChild(circle);
    });
  }

  /**
   * Update playhead position
   * @param {number} time - Time in ms
   */
  _updatePlayhead(time) {
    const x = this.timeToX(time);
    this.playheadLine.setAttribute('x1', x);
    this.playheadLine.setAttribute('x2', x);
  }

  /**
   * Handle mouse down
   * @param {MouseEvent} e
   */
  _handleMouseDown(e) {
    const rect = this.svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on a point
    const target = e.target;
    if (target.classList.contains('automation-point')) {
      const index = parseInt(target.getAttribute('data-index'), 10);
      this.selectedPointIndex = index;
      this.isDragging = true;
      this.render();
      e.preventDefault();
      return;
    }

    // Deselect
    this.selectedPointIndex = -1;
    this.render();
  }

  /**
   * Handle mouse move
   * @param {MouseEvent} e
   */
  _handleMouseMove(e) {
    if (!this.isDragging || this.selectedPointIndex < 0) return;
    if (!this.lane || !this.lane.points) return;

    const rect = this.svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const point = this.lane.points[this.selectedPointIndex];
    if (!point) return;

    // Update point value (not time, to prevent reordering)
    point.value = this.yToValue(y);

    // Optionally update time if not first/last point
    if (this.selectedPointIndex > 0 && this.selectedPointIndex < this.lane.points.length - 1) {
      const newTime = this.xToTime(x);
      const prevTime = this.lane.points[this.selectedPointIndex - 1].time;
      const nextTime = this.lane.points[this.selectedPointIndex + 1].time;

      if (newTime > prevTime + 10 && newTime < nextTime - 10) {
        point.time = newTime;
      }
    }

    this.render();
    e.preventDefault();
  }

  /**
   * Handle mouse up
   * @param {MouseEvent} e
   */
  _handleMouseUp(e) {
    if (this.isDragging) {
      this.isDragging = false;
      // Emit change event
      eventBus.emit(Events.SESSION_AUTOMATION, {
        voiceId: this.voiceId,
        param: this.param,
        lane: this.lane
      });
    }
  }

  /**
   * Handle double click - add or remove point
   * @param {MouseEvent} e
   */
  _handleDoubleClick(e) {
    if (!this.lane) return;

    const target = e.target;

    // Double click on point = delete
    if (target.classList.contains('automation-point')) {
      const index = parseInt(target.getAttribute('data-index'), 10);

      // Don't delete first or last point
      if (index > 0 && index < this.lane.points.length - 1) {
        this.lane.points.splice(index, 1);
        this.selectedPointIndex = -1;
        this.render();
        eventBus.emit(Events.SESSION_AUTOMATION, {
          voiceId: this.voiceId,
          param: this.param,
          lane: this.lane
        });
      }
      return;
    }

    // Double click on empty space = add point
    const rect = this.svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = this.xToTime(x);
    const value = this.yToValue(y);

    // Find insertion index
    let insertIndex = this.lane.points.length;
    for (let i = 0; i < this.lane.points.length; i++) {
      if (this.lane.points[i].time > time) {
        insertIndex = i;
        break;
      }
    }

    // Insert new point
    this.lane.points.splice(insertIndex, 0, {
      time,
      value,
      curve: CurveTypes.LINEAR
    });

    this.selectedPointIndex = insertIndex;
    this.render();

    eventBus.emit(Events.SESSION_AUTOMATION, {
      voiceId: this.voiceId,
      param: this.param,
      lane: this.lane
    });
  }

  /**
   * Set zoom level
   * @param {number} zoom
   */
  setZoom(zoom) {
    this.zoom = Math.max(0.1, Math.min(10, zoom));
    this.render();
  }

  /**
   * Set scroll position
   * @param {number} scrollX
   */
  setScrollX(scrollX) {
    this.scrollX = Math.max(0, scrollX);
    this.render();
  }

  /**
   * Resize the view
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.svg.setAttribute('width', width);
    this.svg.setAttribute('height', height);
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.render();
  }

  /**
   * Dispose of the view
   */
  dispose() {
    if (this.svg) {
      this.svg.remove();
      this.svg = null;
    }
  }
}

/**
 * Create an automation lane view
 * @param {Object} options
 * @returns {AutomationLaneView}
 */
export function createAutomationLane(options) {
  return new AutomationLaneView(options);
}
