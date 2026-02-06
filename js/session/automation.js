/**
 * Automation Utilities - Constants and helpers for parameter automation
 */

/**
 * Automatable parameter definitions
 * @type {Object<string, {min: number, max: number, default: number, unit: string}>}
 */
export const AUTOMATABLE_PARAMS = {
  // Mixer parameters
  volume: { min: 0, max: 1, default: 0.8, unit: '' },
  pan: { min: -1, max: 1, default: 0, unit: '' },
  mute: { min: 0, max: 1, default: 0, unit: '' },

  // Spatial parameters
  spatialX: { min: -10, max: 10, default: 0, unit: 'm' },
  spatialY: { min: -10, max: 10, default: 0, unit: 'm' },
  spatialZ: { min: -10, max: 10, default: 0, unit: 'm' },

  // Synth parameters
  filterFreq: { min: 20, max: 20000, default: 20000, unit: 'Hz' },
  filterQ: { min: 0.1, max: 20, default: 1, unit: '' },
  attack: { min: 0.001, max: 2, default: 0.01, unit: 's' },
  release: { min: 0.01, max: 5, default: 0.3, unit: 's' },
  decay: { min: 0.01, max: 5, default: 0.1, unit: 's' },
  sustain: { min: 0, max: 1, default: 0.7, unit: '' },
};

/**
 * Curve types for automation interpolation
 */
export const CurveTypes = {
  LINEAR: 'linear',
  EXPONENTIAL: 'exponential',
  STEP: 'step'
};

/**
 * Normalize a raw parameter value to 0-1 range
 * @param {string} param - Parameter name
 * @param {number} value - Raw value
 * @returns {number} Normalized value (0-1)
 */
export function normalizeValue(param, value) {
  const def = AUTOMATABLE_PARAMS[param];
  if (!def) return value; // Pass through unknown params

  // Handle logarithmic parameters (frequency)
  if (param === 'filterFreq') {
    const logMin = Math.log(def.min);
    const logMax = Math.log(def.max);
    const logValue = Math.log(Math.max(def.min, Math.min(def.max, value)));
    return (logValue - logMin) / (logMax - logMin);
  }

  // Linear normalization
  return (value - def.min) / (def.max - def.min);
}

/**
 * Denormalize a 0-1 value to raw parameter range
 * @param {string} param - Parameter name
 * @param {number} normalized - Normalized value (0-1)
 * @returns {number} Raw value
 */
export function denormalizeValue(param, normalized) {
  const def = AUTOMATABLE_PARAMS[param];
  if (!def) return normalized; // Pass through unknown params

  // Handle logarithmic parameters (frequency)
  if (param === 'filterFreq') {
    const logMin = Math.log(def.min);
    const logMax = Math.log(def.max);
    return Math.exp(logMin + normalized * (logMax - logMin));
  }

  // Linear denormalization
  return def.min + normalized * (def.max - def.min);
}

/**
 * Get parameter info
 * @param {string} param
 * @returns {Object|null}
 */
export function getParamInfo(param) {
  return AUTOMATABLE_PARAMS[param] || null;
}

/**
 * Get default value for a parameter
 * @param {string} param
 * @returns {number}
 */
export function getDefaultValue(param) {
  return AUTOMATABLE_PARAMS[param]?.default ?? 0;
}

/**
 * Check if a parameter is automatable
 * @param {string} param
 * @returns {boolean}
 */
export function isAutomatable(param) {
  return param in AUTOMATABLE_PARAMS;
}

/**
 * Get all automatable parameters for a category
 * @param {string} category - 'mixer' | 'spatial' | 'synth'
 * @returns {string[]}
 */
export function getParamsByCategory(category) {
  const categories = {
    mixer: ['volume', 'pan', 'mute'],
    spatial: ['spatialX', 'spatialY', 'spatialZ'],
    synth: ['filterFreq', 'filterQ', 'attack', 'release', 'decay', 'sustain']
  };
  return categories[category] || [];
}

/**
 * Interpolate between two automation points
 * @param {Object} before - Previous point {time, value, curve}
 * @param {Object} after - Next point {time, value}
 * @param {number} time - Target time
 * @returns {number} Interpolated value
 */
export function interpolateValue(before, after, time) {
  if (!before || !after) return before?.value ?? after?.value ?? 0;

  if (time <= before.time) return before.value;
  if (time >= after.time) return after.value;

  // Calculate interpolation factor (0-1)
  const t = (time - before.time) / (after.time - before.time);

  switch (before.curve) {
    case CurveTypes.STEP:
      return before.value;

    case CurveTypes.EXPONENTIAL:
      // Prevent division by zero and handle sign changes
      if (before.value === 0 || after.value === 0 ||
          Math.sign(before.value) !== Math.sign(after.value)) {
        // Fall back to linear for edge cases
        return before.value + (after.value - before.value) * t;
      }
      return before.value * Math.pow(after.value / before.value, t);

    case CurveTypes.LINEAR:
    default:
      return before.value + (after.value - before.value) * t;
  }
}

/**
 * Find the surrounding points for a given time
 * @param {Array} points - Array of automation points sorted by time
 * @param {number} time - Target time
 * @returns {{before: Object|null, after: Object|null, index: number}}
 */
export function findSurroundingPoints(points, time) {
  if (!points || points.length === 0) {
    return { before: null, after: null, index: 0 };
  }

  // Binary search for efficiency on large datasets
  let low = 0;
  let high = points.length - 1;

  // Handle edge cases
  if (time <= points[0].time) {
    return { before: null, after: points[0], index: 0 };
  }
  if (time >= points[high].time) {
    return { before: points[high], after: null, index: high };
  }

  // Binary search
  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].time <= time) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return {
    before: points[low],
    after: points[high],
    index: low
  };
}

/**
 * Get value at a specific time from an automation lane
 * @param {Object} lane - Automation lane with points array
 * @param {number} time - Target time in ms
 * @returns {number} Value at time
 */
export function getValueAtTime(lane, time) {
  if (!lane || !lane.points || lane.points.length === 0) {
    return getDefaultValue(lane?.param);
  }

  const { before, after } = findSurroundingPoints(lane.points, time);

  if (!before) return after.value;
  if (!after) return before.value;

  return interpolateValue(before, after, time);
}

/**
 * Convert beat time to milliseconds
 * @param {number} beat - Beat position
 * @param {number} bpm - Beats per minute
 * @returns {number} Time in milliseconds
 */
export function beatToMs(beat, bpm) {
  return (beat / (bpm / 60)) * 1000;
}

/**
 * Convert milliseconds to beat time
 * @param {number} ms - Time in milliseconds
 * @param {number} bpm - Beats per minute
 * @returns {number} Beat position
 */
export function msToBeat(ms, bpm) {
  return (ms / 1000) * (bpm / 60);
}

/**
 * Compress automation lane by removing redundant points
 * @param {Object} lane - Automation lane
 * @param {number} tolerance - Value tolerance for removal (default 0.001)
 * @returns {Object} Compressed lane
 */
export function compressLane(lane, tolerance = 0.001) {
  if (!lane || !lane.points || lane.points.length <= 2) {
    return lane;
  }

  const compressed = [lane.points[0]];

  for (let i = 1; i < lane.points.length - 1; i++) {
    const prev = compressed[compressed.length - 1];
    const curr = lane.points[i];
    const next = lane.points[i + 1];

    // Calculate what value would be at curr.time with linear interpolation
    const expectedValue = interpolateValue(prev, next, curr.time);

    // Keep point if it deviates from expected linear path
    if (Math.abs(curr.value - expectedValue) > tolerance) {
      compressed.push(curr);
    }
  }

  // Always keep last point
  compressed.push(lane.points[lane.points.length - 1]);

  return {
    ...lane,
    points: compressed
  };
}

/**
 * Merge two automation lanes
 * @param {Object} existing - Existing lane
 * @param {Object} newLane - New lane to merge (punch-in)
 * @param {number} punchInTime - Time where new data starts
 * @param {number} punchOutTime - Time where new data ends
 * @returns {Object} Merged lane
 */
export function mergeLanes(existing, newLane, punchInTime, punchOutTime) {
  if (!existing) return newLane;
  if (!newLane) return existing;

  // Get points before punch-in
  const beforePoints = existing.points.filter(p => p.time < punchInTime);

  // Get points after punch-out
  const afterPoints = existing.points.filter(p => p.time > punchOutTime);

  // Shift after points to account for new duration
  const durationDiff = (newLane.points[newLane.points.length - 1]?.time ?? punchInTime) -
                       (existing.points.find(p => p.time >= punchInTime)?.time ?? punchInTime);

  const shiftedAfterPoints = afterPoints.map(p => ({
    ...p,
    time: p.time + durationDiff
  }));

  return {
    ...existing,
    points: [...beforePoints, ...newLane.points, ...shiftedAfterPoints]
  };
}
