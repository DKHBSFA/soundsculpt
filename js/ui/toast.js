/**
 * Toast Notifications
 */

import { eventBus, Events } from '../event-bus.js';

const TOAST_DURATION = 3000;

/**
 * Show a toast notification
 */
export function showToast({ message, type = 'info', duration = TOAST_DURATION }) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}

// Listen for toast events
eventBus.on(Events.TOAST_SHOW, showToast);
