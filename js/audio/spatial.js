/**
 * Spatial Audio - 3D panning with HRTF
 *
 * Provides immersive 3D audio positioning using Web Audio API's PannerNode.
 * Supports HRTF (Head-Related Transfer Function) for realistic binaural rendering.
 */

import { audioContext } from './context-manager.js';

/**
 * Default spatial settings
 */
export const DEFAULT_SPATIAL_SETTINGS = {
  enabled: false,
  position: { x: 0, y: 0, z: 0 },
  distanceModel: 'inverse',
  refDistance: 1,
  maxDistance: 10000,
  rolloffFactor: 1,
  cone: {
    innerAngle: 360,
    outerAngle: 360,
    outerGain: 0,
  },
};

/**
 * Spatial panner for a single voice
 */
export class SpatialPanner {
  /**
   * @param {AudioContext} ctx - Audio context
   */
  constructor(ctx = null) {
    this.ctx = ctx || audioContext.getContext();
    this.panner = null;
    this.settings = { ...DEFAULT_SPATIAL_SETTINGS };
    this.isEnabled = false;

    // Create panner node
    this._createPanner();
  }

  /**
   * Create the PannerNode
   */
  _createPanner() {
    if (!this.ctx) return;

    this.panner = this.ctx.createPanner();

    // Use HRTF for realistic binaural rendering
    this.panner.panningModel = 'HRTF';

    // Set default distance model
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 1;
    this.panner.maxDistance = 10000;
    this.panner.rolloffFactor = 1;

    // Cone (directional audio)
    this.panner.coneInnerAngle = 360;
    this.panner.coneOuterAngle = 360;
    this.panner.coneOuterGain = 0;

    // Initial position at center
    this.setPosition(0, 0, 0);
  }

  /**
   * Get the panner node for connection
   * @returns {PannerNode}
   */
  getNode() {
    return this.panner;
  }

  /**
   * Set 3D position
   * @param {number} x - Left/right (-1 to 1)
   * @param {number} y - Up/down (-1 to 1)
   * @param {number} z - Front/back (-1 to 1, negative = in front)
   */
  setPosition(x, y, z) {
    if (!this.panner || !this.ctx) return;

    const now = this.ctx.currentTime;

    // Scale to reasonable 3D space (-10 to 10 units)
    const scale = 10;
    this.panner.positionX.setValueAtTime(x * scale, now);
    this.panner.positionY.setValueAtTime(y * scale, now);
    this.panner.positionZ.setValueAtTime(z * scale, now);

    this.settings.position = { x, y, z };
  }

  /**
   * Smoothly animate position
   * @param {{x: number, y: number, z: number}} endPos - Target position
   * @param {number} duration - Duration in seconds
   */
  animatePosition(endPos, duration) {
    if (!this.panner || !this.ctx) return;

    const now = this.ctx.currentTime;
    const scale = 10;

    this.panner.positionX.linearRampToValueAtTime(endPos.x * scale, now + duration);
    this.panner.positionY.linearRampToValueAtTime(endPos.y * scale, now + duration);
    this.panner.positionZ.linearRampToValueAtTime(endPos.z * scale, now + duration);

    this.settings.position = endPos;
  }

  /**
   * Set distance model
   * @param {'linear' | 'inverse' | 'exponential'} model
   */
  setDistanceModel(model) {
    if (!this.panner) return;
    this.panner.distanceModel = model;
    this.settings.distanceModel = model;
  }

  /**
   * Set distance parameters
   * @param {number} refDistance - Reference distance
   * @param {number} maxDistance - Maximum distance
   * @param {number} rolloffFactor - Rolloff factor
   */
  setDistanceParams(refDistance, maxDistance, rolloffFactor) {
    if (!this.panner) return;

    this.panner.refDistance = refDistance;
    this.panner.maxDistance = maxDistance;
    this.panner.rolloffFactor = rolloffFactor;

    this.settings.refDistance = refDistance;
    this.settings.maxDistance = maxDistance;
    this.settings.rolloffFactor = rolloffFactor;
  }

  /**
   * Set cone (directional audio) parameters
   * @param {number} innerAngle - Inner cone angle in degrees
   * @param {number} outerAngle - Outer cone angle in degrees
   * @param {number} outerGain - Gain outside outer cone (0-1)
   */
  setCone(innerAngle, outerAngle, outerGain) {
    if (!this.panner) return;

    this.panner.coneInnerAngle = innerAngle;
    this.panner.coneOuterAngle = outerAngle;
    this.panner.coneOuterGain = outerGain;

    this.settings.cone = { innerAngle, outerAngle, outerGain };
  }

  /**
   * Apply settings from object
   * @param {Object} settings - Spatial settings
   */
  applySettings(settings) {
    if (!settings) return;

    this.settings = { ...DEFAULT_SPATIAL_SETTINGS, ...settings };
    this.isEnabled = settings.enabled ?? false;

    if (settings.position) {
      this.setPosition(
        settings.position.x,
        settings.position.y,
        settings.position.z
      );
    }

    if (settings.distanceModel) {
      this.setDistanceModel(settings.distanceModel);
    }

    this.setDistanceParams(
      settings.refDistance ?? 1,
      settings.maxDistance ?? 10000,
      settings.rolloffFactor ?? 1
    );

    if (settings.cone) {
      this.setCone(
        settings.cone.innerAngle ?? 360,
        settings.cone.outerAngle ?? 360,
        settings.cone.outerGain ?? 0
      );
    }
  }

  /**
   * Get current settings
   * @returns {Object}
   */
  getSettings() {
    return { ...this.settings, enabled: this.isEnabled };
  }

  /**
   * Enable/disable spatial audio
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    this.settings.enabled = enabled;
  }

  /**
   * Check if enabled
   * @returns {boolean}
   */
  getEnabled() {
    return this.isEnabled;
  }

  /**
   * Dispose resources
   */
  dispose() {
    if (this.panner) {
      this.panner.disconnect();
      this.panner = null;
    }
  }
}

/**
 * Global listener manager for spatial audio
 * Controls the "ear" position in 3D space
 */
class SpatialListener {
  constructor() {
    this.ctx = null;
    this.listener = null;
  }

  /**
   * Initialize with audio context
   * @param {AudioContext} ctx
   */
  init(ctx) {
    this.ctx = ctx;
    this.listener = ctx.listener;

    // Set default listener position at origin, facing forward
    this.setPosition(0, 0, 0);
    this.setOrientation(0, 0, -1, 0, 1, 0);
  }

  /**
   * Set listener position
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  setPosition(x, y, z) {
    if (!this.listener || !this.ctx) return;

    const now = this.ctx.currentTime;

    // Use setValueAtTime for browser compatibility
    if (this.listener.positionX) {
      this.listener.positionX.setValueAtTime(x, now);
      this.listener.positionY.setValueAtTime(y, now);
      this.listener.positionZ.setValueAtTime(z, now);
    } else {
      // Fallback for older browsers
      this.listener.setPosition(x, y, z);
    }
  }

  /**
   * Set listener orientation
   * @param {number} forwardX - Forward vector X
   * @param {number} forwardY - Forward vector Y
   * @param {number} forwardZ - Forward vector Z
   * @param {number} upX - Up vector X
   * @param {number} upY - Up vector Y
   * @param {number} upZ - Up vector Z
   */
  setOrientation(forwardX, forwardY, forwardZ, upX, upY, upZ) {
    if (!this.listener || !this.ctx) return;

    const now = this.ctx.currentTime;

    // Use setValueAtTime for browser compatibility
    if (this.listener.forwardX) {
      this.listener.forwardX.setValueAtTime(forwardX, now);
      this.listener.forwardY.setValueAtTime(forwardY, now);
      this.listener.forwardZ.setValueAtTime(forwardZ, now);
      this.listener.upX.setValueAtTime(upX, now);
      this.listener.upY.setValueAtTime(upY, now);
      this.listener.upZ.setValueAtTime(upZ, now);
    } else {
      // Fallback for older browsers
      this.listener.setOrientation(forwardX, forwardY, forwardZ, upX, upY, upZ);
    }
  }
}

// Singleton listener instance
export const spatialListener = new SpatialListener();

/**
 * Initialize spatial listener when audio context is ready
 * @param {AudioContext} ctx
 */
export function initSpatialListener(ctx) {
  spatialListener.init(ctx);
}
