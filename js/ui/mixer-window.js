/**
 * Mixer Window - Floating mixer with per-voice controls
 *
 * Features:
 * - Volume faders per voice
 * - Pan knobs
 * - Send levels (reverb, delay)
 * - 3-band EQ per voice
 * - VU metering
 * - Automation lane preview
 */

import { state } from '../state.js';
import { eventBus, Events } from '../event-bus.js';
import { mixer } from '../audio/mixer.js';
import { strudelEngine } from '../audio/strudel-engine.js';

class MixerWindow {
  constructor() {
    this.element = null;
    this.isOpen = false;
    this.channelStrips = new Map();
    this.meterAnimationId = null;
  }

  /**
   * Initialize mixer window
   */
  init() {
    this._createWindow();
    this._setupEventListeners();
  }

  /**
   * Create mixer window DOM
   */
  _createWindow() {
    this.element = document.createElement('div');
    this.element.className = 'mixer-window glass-panel hidden';
    this.element.innerHTML = `
      <header class="mixer-header">
        <h3 class="mixer-title">Mixer</h3>
        <div class="mixer-controls">
          <button class="btn-icon mixer-minimize" title="Minimize" aria-label="Minimize">_</button>
          <button class="btn-icon mixer-close" title="Close" aria-label="Close">&times;</button>
        </div>
      </header>
      <div class="mixer-body">
        <div class="mixer-channels" id="mixer-channels">
          <!-- Channel strips inserted here -->
        </div>
        <div class="mixer-master">
          <div class="channel-strip master-strip">
            <div class="strip-meter">
              <div class="meter-vertical">
                <div class="meter-fill-v" id="master-meter-v-l"></div>
              </div>
              <div class="meter-vertical">
                <div class="meter-fill-v" id="master-meter-v-r"></div>
              </div>
            </div>
            <div class="strip-fader">
              <input type="range" class="fader-vertical" id="master-fader"
                     min="0" max="100" value="80" orient="vertical"
                     aria-label="Master volume">
            </div>
            <div class="strip-label">Master</div>
          </div>
        </div>
      </div>
      <footer class="mixer-footer">
        <div class="mixer-sends-master">
          <label>
            <span>Reverb</span>
            <input type="range" id="master-reverb" min="0" max="100" value="40" class="send-slider">
          </label>
          <label>
            <span>Delay</span>
            <input type="range" id="master-delay" min="0" max="100" value="0" class="send-slider">
          </label>
        </div>
      </footer>
    `;

    document.body.appendChild(this.element);

    // Make draggable
    this._makeDraggable();
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    // Close button
    this.element.querySelector('.mixer-close')?.addEventListener('click', () => {
      this.close();
    });

    // Minimize button
    this.element.querySelector('.mixer-minimize')?.addEventListener('click', () => {
      this.element.classList.toggle('minimized');
    });

    // Master fader
    const masterFader = this.element.querySelector('#master-fader');
    masterFader?.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10) / 100;
      mixer.setMasterVolume(value);
    });

    // Master sends
    const masterReverb = this.element.querySelector('#master-reverb');
    masterReverb?.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10) / 100;
      mixer.setMasterEffect('reverb', value);
    });

    const masterDelay = this.element.querySelector('#master-delay');
    masterDelay?.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10) / 100;
      mixer.setMasterEffect('delay', value);
    });

    // Voice changes
    eventBus.on(Events.VOICE_ADD, () => this.render());
    eventBus.on(Events.VOICE_REMOVE, () => this.render());
    eventBus.on(Events.VOICE_UPDATE, () => this.render());
    eventBus.on(Events.PROJECT_LOAD, () => this.render());
  }

  /**
   * Make window draggable
   */
  _makeDraggable() {
    const header = this.element.querySelector('.mixer-header');
    let isDragging = false;
    let startX, startY, initialX, initialY;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.btn-icon')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.element.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.element.style.left = `${initialX + dx}px`;
      this.element.style.top = `${initialY + dy}px`;
      this.element.style.right = 'auto';
      this.element.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = '';
      }
    });
  }

  /**
   * Render channel strips for all voices
   */
  render() {
    const voices = state.get('voices') || [];
    const channelsEl = this.element.querySelector('#mixer-channels');
    if (!channelsEl) return;

    channelsEl.innerHTML = voices.map((voice) => this._createChannelStrip(voice)).join('');

    // Attach listeners to each strip
    voices.forEach((voice) => {
      this._attachStripListeners(voice.id);
    });
  }

  /**
   * Create channel strip HTML for a voice
   */
  _createChannelStrip(voice) {
    const volume = Math.round((voice.volume ?? 0.8) * 100);
    const pan = Math.round(((voice.pan ?? 0) + 1) * 50); // -1..1 -> 0..100
    const muted = voice.muted ? 'muted' : '';
    const solo = voice.solo ? 'active' : '';

    return `
      <div class="channel-strip" data-voice-id="${voice.id}" style="border-top-color: ${voice.color || '#666'}">
        <div class="strip-meter">
          <div class="meter-vertical">
            <div class="meter-fill-v" data-meter="${voice.id}"></div>
          </div>
        </div>
        <div class="strip-fader">
          <input type="range" class="fader-vertical" data-control="volume"
                 min="0" max="100" value="${volume}" orient="vertical"
                 aria-label="Volume for ${voice.name}">
        </div>
        <div class="strip-pan">
          <input type="range" class="pan-knob" data-control="pan"
                 min="0" max="100" value="${pan}"
                 aria-label="Pan for ${voice.name}">
          <span class="pan-label">Pan</span>
        </div>
        <div class="strip-sends">
          <div class="send-control">
            <label>R</label>
            <input type="range" class="send-mini" data-control="send-reverb"
                   min="0" max="100" value="${Math.round((voice.sends?.reverb ?? 0.3) * 100)}"
                   title="Reverb send">
          </div>
          <div class="send-control">
            <label>D</label>
            <input type="range" class="send-mini" data-control="send-delay"
                   min="0" max="100" value="${Math.round((voice.sends?.delay ?? 0) * 100)}"
                   title="Delay send">
          </div>
        </div>
        <div class="strip-eq">
          <input type="range" class="eq-slider" data-control="eq-high"
                 min="-12" max="12" value="0" orient="vertical" title="High">
          <input type="range" class="eq-slider" data-control="eq-mid"
                 min="-12" max="12" value="0" orient="vertical" title="Mid">
          <input type="range" class="eq-slider" data-control="eq-low"
                 min="-12" max="12" value="0" orient="vertical" title="Low">
        </div>
        <div class="strip-buttons">
          <button class="strip-btn ${muted}" data-action="mute" title="Mute">M</button>
          <button class="strip-btn ${solo}" data-action="solo" title="Solo">S</button>
        </div>
        <div class="strip-label">${voice.name}</div>
      </div>
    `;
  }

  /**
   * Attach event listeners to a channel strip
   */
  _attachStripListeners(voiceId) {
    const strip = this.element.querySelector(`.channel-strip[data-voice-id="${voiceId}"]`);
    if (!strip) return;

    // Volume fader
    strip.querySelector('[data-control="volume"]')?.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10) / 100;
      state.updateVoice(voiceId, { volume: value });
      mixer.setVoiceVolume(voiceId, value);
    });

    // Pan
    strip.querySelector('[data-control="pan"]')?.addEventListener('input', (e) => {
      const value = (parseInt(e.target.value, 10) / 50) - 1; // 0..100 -> -1..1
      state.updateVoice(voiceId, { pan: value });
      mixer.setVoicePan(voiceId, value);
    });

    // Sends
    strip.querySelector('[data-control="send-reverb"]')?.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10) / 100;
      const voice = state.getVoice(voiceId);
      const sends = { ...(voice.sends || {}), reverb: value };
      state.updateVoice(voiceId, { sends });
      mixer.setVoiceSend(voiceId, 'reverb', value);
    });

    strip.querySelector('[data-control="send-delay"]')?.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10) / 100;
      const voice = state.getVoice(voiceId);
      const sends = { ...(voice.sends || {}), delay: value };
      state.updateVoice(voiceId, { sends });
      mixer.setVoiceSend(voiceId, 'delay', value);
    });

    // EQ
    ['high', 'mid', 'low'].forEach((band) => {
      strip.querySelector(`[data-control="eq-${band}"]`)?.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        mixer.setVoiceEQ(voiceId, band, value);
      });
    });

    // Mute/Solo buttons
    strip.querySelector('[data-action="mute"]')?.addEventListener('click', () => {
      state.toggleMute(voiceId);
      strudelEngine.toggleMute(voiceId);
    });

    strip.querySelector('[data-action="solo"]')?.addEventListener('click', () => {
      state.toggleSolo(voiceId);
      strudelEngine.soloVoice(voiceId);
    });
  }

  /**
   * Start meter animation
   */
  _startMetering() {
    const updateMeters = () => {
      const levels = mixer.getAllLevels();
      if (!levels) {
        this.meterAnimationId = requestAnimationFrame(updateMeters);
        return;
      }

      // Update voice meters
      Object.entries(levels.voices).forEach(([voiceId, db]) => {
        const meter = this.element.querySelector(`[data-meter="${voiceId}"]`);
        if (meter) {
          const percent = this._dbToPercent(db);
          meter.style.height = `${percent}%`;
        }
      });

      // Update master meter
      const masterL = this.element.querySelector('#master-meter-v-l');
      const masterR = this.element.querySelector('#master-meter-v-r');
      if (masterL && masterR) {
        const percent = this._dbToPercent(levels.master);
        masterL.style.height = `${percent}%`;
        masterR.style.height = `${percent}%`;
      }

      this.meterAnimationId = requestAnimationFrame(updateMeters);
    };

    this.meterAnimationId = requestAnimationFrame(updateMeters);
  }

  /**
   * Stop meter animation
   */
  _stopMetering() {
    if (this.meterAnimationId) {
      cancelAnimationFrame(this.meterAnimationId);
      this.meterAnimationId = null;
    }
  }

  /**
   * Convert dB to percentage
   */
  _dbToPercent(db) {
    if (db === -Infinity || db < -60) return 0;
    if (db >= 0) return 100;
    return Math.round(((db + 60) / 60) * 100);
  }

  /**
   * Open mixer window
   */
  open() {
    if (!this.element) {
      this.init();
    }
    this.render();
    this.element.classList.remove('hidden');
    this.isOpen = true;
    this._startMetering();
  }

  /**
   * Close mixer window
   */
  close() {
    this.element?.classList.add('hidden');
    this.isOpen = false;
    this._stopMetering();
  }

  /**
   * Toggle mixer window
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Check if open
   */
  isVisible() {
    return this.isOpen;
  }
}

// Singleton instance
export const mixerWindow = new MixerWindow();
