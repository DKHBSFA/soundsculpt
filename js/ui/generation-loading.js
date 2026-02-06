/**
 * SoundSculpt - Generation Loading UI
 * Shows loading state during AI generation with abort capability
 */

import { eventBus, Events } from '../event-bus.js';

let overlay = null;
let abortController = null;
let currentPhase = 'connecting';

const LOADING_MESSAGES = {
  connecting: 'Connecting to AI...',
  composing: 'AI is composing music...',
  processing: 'Processing patterns...',
  building: 'Building voices...',
  fallback: 'Using preset patterns...'
};

/**
 * Create the loading overlay element
 */
function createOverlay() {
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.className = 'generation-loading-overlay';
  overlay.innerHTML = `
    <div class="generation-loading-content">
      <div class="generation-loading-spinner">
        <div class="spinner-ring"></div>
        <div class="spinner-ring"></div>
        <div class="spinner-ring"></div>
      </div>
      <div class="generation-loading-message">Connecting to AI...</div>
      <div class="generation-loading-progress">
        <div class="progress-bar"></div>
      </div>
      <button class="generation-loading-abort">Cancel</button>
    </div>
  `;

  // Add styles if not already present
  if (!document.getElementById('generation-loading-styles')) {
    const style = document.createElement('style');
    style.id = 'generation-loading-styles';
    style.textContent = `
      .generation-loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .generation-loading-overlay.visible {
        opacity: 1;
      }

      .generation-loading-content {
        text-align: center;
        color: var(--text-primary, #fff);
        padding: 2rem;
      }

      .generation-loading-spinner {
        position: relative;
        width: 80px;
        height: 80px;
        margin: 0 auto 1.5rem;
      }

      .spinner-ring {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 3px solid transparent;
        animation: spin 1.5s linear infinite;
      }

      .spinner-ring:nth-child(1) {
        border-top-color: var(--accent-color, #6366f1);
        animation-delay: 0s;
      }

      .spinner-ring:nth-child(2) {
        border-right-color: var(--accent-secondary, #8b5cf6);
        animation-delay: 0.15s;
        transform: scale(0.85);
      }

      .spinner-ring:nth-child(3) {
        border-bottom-color: var(--accent-tertiary, #a78bfa);
        animation-delay: 0.3s;
        transform: scale(0.7);
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .generation-loading-message {
        font-size: 1.25rem;
        font-weight: 500;
        margin-bottom: 1rem;
        min-height: 2rem;
      }

      .generation-loading-progress {
        width: 200px;
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        margin: 0 auto 1.5rem;
        overflow: hidden;
      }

      .progress-bar {
        height: 100%;
        background: linear-gradient(90deg, var(--accent-color, #6366f1), var(--accent-secondary, #8b5cf6));
        border-radius: 2px;
        width: 0%;
        transition: width 0.3s ease;
        animation: progress-indeterminate 2s ease-in-out infinite;
      }

      @keyframes progress-indeterminate {
        0% { width: 0%; margin-left: 0; }
        50% { width: 60%; margin-left: 20%; }
        100% { width: 0%; margin-left: 100%; }
      }

      .generation-loading-abort {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: var(--text-secondary, #a1a1aa);
        padding: 0.5rem 1.5rem;
        border-radius: 0.5rem;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.2s ease;
      }

      .generation-loading-abort:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.5);
        color: var(--text-primary, #fff);
      }
    `;
    document.head.appendChild(style);
  }

  // Abort button handler
  const abortBtn = overlay.querySelector('.generation-loading-abort');
  abortBtn.addEventListener('click', () => {
    if (abortController) {
      abortController.abort();
    }
    hide();
    eventBus.emit(Events.TOAST_SHOW, {
      message: 'Generation cancelled',
      type: 'info'
    });
  });

  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Show the loading overlay
 * @param {string} phase - Initial phase
 * @returns {AbortController} Controller to abort the operation
 */
export function show(phase = 'connecting') {
  const el = createOverlay();
  currentPhase = phase;
  updateMessage(phase);

  // Create new abort controller
  abortController = new AbortController();

  // Show with animation
  requestAnimationFrame(() => {
    el.classList.add('visible');
  });

  return abortController;
}

/**
 * Hide the loading overlay
 */
export function hide() {
  if (!overlay) return;

  overlay.classList.remove('visible');

  // Remove after animation
  setTimeout(() => {
    if (overlay && !overlay.classList.contains('visible')) {
      overlay.remove();
      overlay = null;
    }
  }, 300);

  abortController = null;
}

/**
 * Update the loading message
 * @param {string} phase - Phase name
 */
export function updateMessage(phase) {
  if (!overlay) return;

  currentPhase = phase;
  const message = LOADING_MESSAGES[phase] || phase;
  const msgEl = overlay.querySelector('.generation-loading-message');
  if (msgEl) {
    msgEl.textContent = message;
  }
}

/**
 * Set determinate progress
 * @param {number} percent - Progress percentage (0-100)
 */
export function setProgress(percent) {
  if (!overlay) return;

  const progressBar = overlay.querySelector('.progress-bar');
  if (progressBar) {
    progressBar.style.animation = 'none';
    progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    progressBar.style.marginLeft = '0';
  }
}

/**
 * Get the current abort controller
 * @returns {AbortController|null}
 */
export function getAbortController() {
  return abortController;
}

/**
 * Check if currently showing
 * @returns {boolean}
 */
export function isShowing() {
  return overlay && overlay.classList.contains('visible');
}

// Export as singleton
export default {
  show,
  hide,
  updateMessage,
  setProgress,
  getAbortController,
  isShowing
};
