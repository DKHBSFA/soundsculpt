/**
 * OSC Settings UI - Configure OSC WebSocket bridge
 */

import { eventBus, Events } from '../event-bus.js';
import { oscBridge, OSCEvents } from '../midi/osc-bridge.js';

/**
 * Create OSC settings modal
 * @returns {HTMLElement}
 */
export function createOSCSettings() {
  const settings = oscBridge.getSettings();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay osc-modal';

  modal.innerHTML = `
    <div class="modal-content osc-settings-content" role="dialog" aria-labelledby="osc-title" aria-modal="true">
      <header class="modal-header">
        <h2 id="osc-title">OSC Settings</h2>
        <button class="modal-close" aria-label="Close">&times;</button>
      </header>

      <div class="modal-body">
        <div class="osc-status">
          <span class="status-dot ${oscBridge.getIsConnected() ? 'connected' : ''}"></span>
          <span class="status-text">${oscBridge.getIsConnected() ? 'Connected' : 'Disconnected'}</span>
        </div>

        <div class="osc-info">
          <p>OSC control requires a WebSocket bridge running locally.</p>
          <p>Popular options:</p>
          <ul>
            <li><code>osc-websocket-bridge</code> (npm)</li>
            <li><code>oscws</code> (Python)</li>
            <li>TouchOSC with MIDI mode (no bridge needed)</li>
          </ul>
        </div>

        <div class="form-group">
          <label>
            <input type="checkbox" class="osc-enabled" ${settings.enabled ? 'checked' : ''}>
            Enable OSC
          </label>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Host</label>
            <input type="text" class="osc-host" value="${settings.host}" placeholder="localhost">
          </div>
          <div class="form-group">
            <label>Port</label>
            <input type="number" class="osc-port" value="${settings.port}" min="1" max="65535">
          </div>
        </div>

        <div class="form-group">
          <label>
            <input type="checkbox" class="osc-auto-reconnect" ${settings.autoReconnect ? 'checked' : ''}>
            Auto-reconnect
          </label>
        </div>

        <details class="osc-addresses">
          <summary>OSC Addresses</summary>
          <div class="address-list">
            <h4>Transport</h4>
            <code>/soundsculpt/transport/play</code>
            <code>/soundsculpt/transport/stop</code>
            <code>/soundsculpt/transport/bpm [20-300]</code>

            <h4>Master</h4>
            <code>/soundsculpt/master/volume [0-1]</code>

            <h4>Voice (by index or ID)</h4>
            <code>/soundsculpt/voice/0/volume [0-1]</code>
            <code>/soundsculpt/voice/0/pan [-1 to 1]</code>
            <code>/soundsculpt/voice/0/mute [0|1]</code>
            <code>/soundsculpt/voice/0/solo [0|1]</code>
            <code>/soundsculpt/voice/0/spatial/x [-1 to 1]</code>
            <code>/soundsculpt/voice/0/spatial/y [-1 to 1]</code>
            <code>/soundsculpt/voice/0/spatial/z [-1 to 1]</code>
          </div>
        </details>

        <div class="osc-log-container">
          <h4>Message Log</h4>
          <div class="osc-log"></div>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn btn-secondary close-btn">Close</button>
        <button class="btn btn-primary connect-btn">
          ${oscBridge.getIsConnected() ? 'Disconnect' : 'Connect'}
        </button>
      </footer>
    </div>
  `;

  // Elements
  const enabledCheckbox = modal.querySelector('.osc-enabled');
  const hostInput = modal.querySelector('.osc-host');
  const portInput = modal.querySelector('.osc-port');
  const autoReconnectCheckbox = modal.querySelector('.osc-auto-reconnect');
  const connectBtn = modal.querySelector('.connect-btn');
  const statusDot = modal.querySelector('.status-dot');
  const statusText = modal.querySelector('.status-text');
  const oscLog = modal.querySelector('.osc-log');

  // Update status display
  function updateStatus() {
    const connected = oscBridge.getIsConnected();
    statusDot.classList.toggle('connected', connected);
    statusText.textContent = connected ? 'Connected' : 'Disconnected';
    connectBtn.textContent = connected ? 'Disconnect' : 'Connect';
  }

  // Log message
  function logMessage(msg) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
    oscLog.insertBefore(div, oscLog.firstChild);

    // Keep only last 50 entries
    while (oscLog.children.length > 50) {
      oscLog.removeChild(oscLog.lastChild);
    }
  }

  // Save settings on change
  function saveSettings() {
    oscBridge.updateSettings({
      enabled: enabledCheckbox.checked,
      host: hostInput.value || 'localhost',
      port: parseInt(portInput.value) || 8080,
      autoReconnect: autoReconnectCheckbox.checked,
    });
  }

  enabledCheckbox.addEventListener('change', () => {
    saveSettings();
    if (enabledCheckbox.checked && !oscBridge.getIsConnected()) {
      oscBridge.connect();
    } else if (!enabledCheckbox.checked && oscBridge.getIsConnected()) {
      oscBridge.disconnect();
    }
  });

  hostInput.addEventListener('change', saveSettings);
  portInput.addEventListener('change', saveSettings);
  autoReconnectCheckbox.addEventListener('change', saveSettings);

  connectBtn.addEventListener('click', () => {
    if (oscBridge.getIsConnected()) {
      oscBridge.disconnect();
    } else {
      saveSettings();
      oscBridge.connect();
    }
  });

  // Listen for events
  const unsubConnect = eventBus.on(OSCEvents.CONNECT, () => {
    updateStatus();
    logMessage('Connected to WebSocket bridge');
  });

  const unsubDisconnect = eventBus.on(OSCEvents.DISCONNECT, () => {
    updateStatus();
    logMessage('Disconnected from WebSocket bridge');
  });

  const unsubError = eventBus.on(OSCEvents.ERROR, ({ error }) => {
    logMessage(`Error: ${error?.message || 'Unknown error'}`);
  });

  const unsubMessage = eventBus.on(OSCEvents.MESSAGE, ({ address, args }) => {
    logMessage(`${address} ${args.join(' ')}`);
  });

  // Close handlers
  function closeModal() {
    unsubConnect();
    unsubDisconnect();
    unsubError();
    unsubMessage();
    modal.remove();
    eventBus.emit(Events.MODAL_CLOSE);
  }

  modal.querySelector('.close-btn').addEventListener('click', closeModal);
  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  return modal;
}

/**
 * Open OSC settings modal
 */
export function openOSCSettings() {
  const modal = createOSCSettings();
  document.body.appendChild(modal);
  eventBus.emit(Events.MODAL_OPEN);
}
