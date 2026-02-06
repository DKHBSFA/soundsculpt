/**
 * Spatial Panner UI - Visual 3D positioning control
 *
 * Provides an XY pad for left/right and front/back positioning,
 * plus a vertical slider for height (up/down).
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { mixer } from '../audio/mixer.js';

/**
 * Create the spatial panner modal
 * @param {string} voiceId - Voice to control
 * @returns {HTMLElement}
 */
export function createSpatialModal(voiceId) {
  const voice = state.getVoice(voiceId);
  if (!voice) return null;

  const spatial = voice.spatial || {
    enabled: false,
    position: { x: 0, y: 0, z: 0 },
  };

  // Create modal container
  const modal = document.createElement('div');
  modal.className = 'modal-overlay spatial-modal';
  modal.innerHTML = `
    <div class="modal-content spatial-modal-content" role="dialog" aria-labelledby="spatial-title" aria-modal="true">
      <header class="modal-header">
        <h2 id="spatial-title">Spatial Panner - ${voice.name}</h2>
        <button class="modal-close" aria-label="Close">&times;</button>
      </header>

      <div class="modal-body">
        <div class="spatial-mode-toggle">
          <label class="toggle-label">
            <input type="radio" name="panning-mode" value="stereo" ${!spatial.enabled ? 'checked' : ''}>
            <span>Simple Stereo</span>
          </label>
          <label class="toggle-label">
            <input type="radio" name="panning-mode" value="spatial" ${spatial.enabled ? 'checked' : ''}>
            <span>3D HRTF</span>
          </label>
        </div>

        <div class="spatial-controls ${spatial.enabled ? '' : 'disabled'}">
          <div class="spatial-xy-container">
            <div class="spatial-labels">
              <span class="label-front">Front</span>
              <span class="label-left">L</span>
              <span class="label-right">R</span>
              <span class="label-back">Back</span>
            </div>
            <div class="spatial-xy-pad" tabindex="0" role="slider" aria-label="XY Position">
              <div class="spatial-crosshair-h"></div>
              <div class="spatial-crosshair-v"></div>
              <div class="spatial-puck" style="left: ${(spatial.position.x + 1) * 50}%; top: ${(spatial.position.z + 1) * 50}%;">
                <span class="puck-icon">🔊</span>
              </div>
            </div>
          </div>

          <div class="spatial-height-container">
            <label class="height-label">Height</label>
            <div class="spatial-height-slider">
              <input type="range" class="height-input" min="-1" max="1" step="0.01"
                value="${spatial.position.y}" orient="vertical">
              <div class="height-labels">
                <span>Up</span>
                <span>Down</span>
              </div>
            </div>
          </div>
        </div>

        <div class="spatial-values">
          <div class="value-display">
            <label>X (L/R):</label>
            <span class="value-x">${spatial.position.x.toFixed(2)}</span>
          </div>
          <div class="value-display">
            <label>Y (Height):</label>
            <span class="value-y">${spatial.position.y.toFixed(2)}</span>
          </div>
          <div class="value-display">
            <label>Z (F/B):</label>
            <span class="value-z">${spatial.position.z.toFixed(2)}</span>
          </div>
        </div>

        <details class="spatial-advanced">
          <summary>Advanced Settings</summary>
          <div class="advanced-controls">
            <div class="control-group">
              <label>Distance Model</label>
              <select class="distance-model-select">
                <option value="linear" ${spatial.distanceModel === 'linear' ? 'selected' : ''}>Linear</option>
                <option value="inverse" ${spatial.distanceModel === 'inverse' ? 'selected' : ''}>Inverse</option>
                <option value="exponential" ${spatial.distanceModel === 'exponential' ? 'selected' : ''}>Exponential</option>
              </select>
            </div>
            <div class="control-group">
              <label>Rolloff Factor</label>
              <input type="range" class="rolloff-input" min="0" max="10" step="0.1"
                value="${spatial.rolloffFactor ?? 1}">
              <span class="rolloff-value">${spatial.rolloffFactor ?? 1}</span>
            </div>
          </div>
        </details>
      </div>

      <footer class="modal-footer">
        <button class="btn btn-secondary reset-btn">Reset to Center</button>
        <button class="btn btn-primary close-btn">Done</button>
      </footer>
    </div>
  `;

  // Get elements
  const modeRadios = modal.querySelectorAll('input[name="panning-mode"]');
  const spatialControls = modal.querySelector('.spatial-controls');
  const xyPad = modal.querySelector('.spatial-xy-pad');
  const puck = modal.querySelector('.spatial-puck');
  const heightInput = modal.querySelector('.height-input');
  const valueX = modal.querySelector('.value-x');
  const valueY = modal.querySelector('.value-y');
  const valueZ = modal.querySelector('.value-z');
  const distanceSelect = modal.querySelector('.distance-model-select');
  const rolloffInput = modal.querySelector('.rolloff-input');
  const rolloffValue = modal.querySelector('.rolloff-value');
  const closeBtn = modal.querySelector('.close-btn');
  const closeBtnX = modal.querySelector('.modal-close');
  const resetBtn = modal.querySelector('.reset-btn');

  // Current position
  let position = { ...spatial.position };
  let isDragging = false;

  // Mode toggle
  modeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      const enabled = radio.value === 'spatial';
      state.setSpatialEnabled(voiceId, enabled);
      spatialControls.classList.toggle('disabled', !enabled);
    });
  });

  // XY Pad interaction
  function updateFromXY(clientX, clientY) {
    const rect = xyPad.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
    const z = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));

    position.x = x;
    position.z = z;

    // Update puck position
    puck.style.left = `${(x + 1) * 50}%`;
    puck.style.top = `${(z + 1) * 50}%`;

    // Update displays
    valueX.textContent = x.toFixed(2);
    valueZ.textContent = z.toFixed(2);

    // Update state
    state.setSpatialPosition(voiceId, position.x, position.y, position.z);
  }

  xyPad.addEventListener('mousedown', (e) => {
    isDragging = true;
    updateFromXY(e.clientX, e.clientY);
    xyPad.setPointerCapture(e.pointerId);
  });

  xyPad.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    updateFromXY(e.clientX, e.clientY);
  });

  xyPad.addEventListener('mouseup', () => {
    isDragging = false;
  });

  xyPad.addEventListener('mouseleave', () => {
    isDragging = false;
  });

  // Touch support
  xyPad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isDragging = true;
    const touch = e.touches[0];
    updateFromXY(touch.clientX, touch.clientY);
  });

  xyPad.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    updateFromXY(touch.clientX, touch.clientY);
  });

  xyPad.addEventListener('touchend', () => {
    isDragging = false;
  });

  // Keyboard navigation for XY pad
  xyPad.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.05;
    let moved = false;

    switch (e.key) {
      case 'ArrowLeft':
        position.x = Math.max(-1, position.x - step);
        moved = true;
        break;
      case 'ArrowRight':
        position.x = Math.min(1, position.x + step);
        moved = true;
        break;
      case 'ArrowUp':
        position.z = Math.max(-1, position.z - step);
        moved = true;
        break;
      case 'ArrowDown':
        position.z = Math.min(1, position.z + step);
        moved = true;
        break;
      case 'Home':
        position.x = 0;
        position.z = 0;
        moved = true;
        break;
    }

    if (moved) {
      e.preventDefault();
      puck.style.left = `${(position.x + 1) * 50}%`;
      puck.style.top = `${(position.z + 1) * 50}%`;
      valueX.textContent = position.x.toFixed(2);
      valueZ.textContent = position.z.toFixed(2);
      state.setSpatialPosition(voiceId, position.x, position.y, position.z);
    }
  });

  // Height slider
  heightInput.addEventListener('input', () => {
    position.y = parseFloat(heightInput.value);
    valueY.textContent = position.y.toFixed(2);
    state.setSpatialPosition(voiceId, position.x, position.y, position.z);
  });

  // Advanced settings
  distanceSelect.addEventListener('change', () => {
    const currentSettings = state.getSpatialSettings(voiceId) || {};
    state.setSpatialSettings(voiceId, {
      ...currentSettings,
      distanceModel: distanceSelect.value,
    });
  });

  rolloffInput.addEventListener('input', () => {
    rolloffValue.textContent = rolloffInput.value;
    const currentSettings = state.getSpatialSettings(voiceId) || {};
    state.setSpatialSettings(voiceId, {
      ...currentSettings,
      rolloffFactor: parseFloat(rolloffInput.value),
    });
  });

  // Reset button
  resetBtn.addEventListener('click', () => {
    position = { x: 0, y: 0, z: 0 };
    puck.style.left = '50%';
    puck.style.top = '50%';
    heightInput.value = 0;
    valueX.textContent = '0.00';
    valueY.textContent = '0.00';
    valueZ.textContent = '0.00';
    state.setSpatialPosition(voiceId, 0, 0, 0);
  });

  // Close handlers
  function closeModal() {
    modal.remove();
    eventBus.emit(Events.MODAL_CLOSE);
  }

  closeBtn.addEventListener('click', closeModal);
  closeBtnX.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Escape key
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  return modal;
}

/**
 * Open spatial panner modal for a voice
 * @param {string} voiceId
 */
export function openSpatialModal(voiceId) {
  const modal = createSpatialModal(voiceId);
  if (!modal) return;

  document.body.appendChild(modal);
  eventBus.emit(Events.MODAL_OPEN);

  // Focus the XY pad for keyboard control
  setTimeout(() => {
    modal.querySelector('.spatial-xy-pad')?.focus();
  }, 100);
}

/**
 * Create a small inline spatial indicator for the voice panel
 * @param {string} voiceId
 * @returns {HTMLElement}
 */
export function createSpatialIndicator(voiceId) {
  const indicator = document.createElement('button');
  indicator.className = 'spatial-indicator';
  indicator.title = '3D Spatial Panner';
  indicator.setAttribute('aria-label', 'Open spatial panner');

  const voice = state.getVoice(voiceId);
  const isEnabled = voice?.spatial?.enabled ?? false;
  indicator.innerHTML = isEnabled ? '🎧' : '🔊';
  indicator.classList.toggle('active', isEnabled);

  indicator.addEventListener('click', (e) => {
    e.stopPropagation();
    openSpatialModal(voiceId);
  });

  // Update on spatial changes
  const unsubscribe = eventBus.on(Events.SPATIAL_UPDATE, ({ voiceId: id, spatial }) => {
    if (id === voiceId) {
      indicator.innerHTML = spatial?.enabled ? '🎧' : '🔊';
      indicator.classList.toggle('active', spatial?.enabled);
    }
  });

  // Store cleanup function
  indicator._cleanup = unsubscribe;

  return indicator;
}
