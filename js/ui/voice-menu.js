/**
 * Voice Menu - Dropdown context menu for voice actions including AI generation
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { generateVoiceWithAI } from '../generation.js';

class VoiceMenu {
  constructor() {
    this.menuEl = null;
    this.currentVoiceId = null;
    this.isOpen = false;
  }

  /**
   * Initialize the voice menu
   */
  init() {
    this.createMenu();
    this.setupGlobalListeners();
  }

  /**
   * Create the menu DOM (appended to body, positioned absolutely)
   */
  createMenu() {
    this.menuEl = document.createElement('div');
    this.menuEl.className = 'voice-menu dropdown glass-panel hidden';
    this.menuEl.setAttribute('role', 'menu');
    this.menuEl.setAttribute('aria-label', 'Voice actions');

    this.menuEl.innerHTML = `
      <button class="dropdown-item" data-action="generate-drum" role="menuitem">
        <span class="menu-icon" aria-hidden="true">🥁</span>
        <span>Generate Drum</span>
      </button>
      <button class="dropdown-item" data-action="generate-bass" role="menuitem">
        <span class="menu-icon" aria-hidden="true">🎸</span>
        <span>Generate Bass</span>
      </button>
      <button class="dropdown-item" data-action="generate-lead" role="menuitem">
        <span class="menu-icon" aria-hidden="true">🎹</span>
        <span>Generate Lead</span>
      </button>
      <button class="dropdown-item" data-action="generate-arp" role="menuitem">
        <span class="menu-icon" aria-hidden="true">🎵</span>
        <span>Generate Arp</span>
      </button>
      <button class="dropdown-item" data-action="generate-pad" role="menuitem">
        <span class="menu-icon" aria-hidden="true">🌊</span>
        <span>Generate Pad</span>
      </button>
      <hr class="menu-divider" role="separator">
      <button class="dropdown-item" data-action="clear" role="menuitem">
        <span class="menu-icon" aria-hidden="true">🗑️</span>
        <span>Clear Pattern</span>
      </button>
      <button class="dropdown-item" data-action="duplicate" role="menuitem">
        <span class="menu-icon" aria-hidden="true">📋</span>
        <span>Duplicate</span>
      </button>
      <hr class="menu-divider" role="separator">
      <button class="dropdown-item danger" data-action="delete" role="menuitem">
        <span class="menu-icon" aria-hidden="true">❌</span>
        <span>Delete Voice</span>
      </button>
    `;

    document.body.appendChild(this.menuEl);

    // Add click handlers for menu items
    this.menuEl.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleAction(item.dataset.action);
      });
    });
  }

  /**
   * Setup global listeners for closing menu
   */
  setupGlobalListeners() {
    // Close on click outside
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.menuEl.contains(e.target) && !e.target.closest('.voice-menu-btn')) {
        this.hide();
      }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.hide();
      }
    });
  }

  /**
   * Show menu at position for a voice
   * @param {string} voiceId - The voice ID
   * @param {HTMLElement} anchor - The button that triggered the menu
   */
  show(voiceId, anchor) {
    this.currentVoiceId = voiceId;

    // Position menu below the anchor
    const rect = anchor.getBoundingClientRect();
    this.menuEl.style.position = 'fixed';
    this.menuEl.style.top = `${rect.bottom + 4}px`;
    this.menuEl.style.left = `${rect.left}px`;

    // Ensure menu doesn't go off screen
    const menuRect = this.menuEl.getBoundingClientRect();
    if (rect.left + menuRect.width > window.innerWidth) {
      this.menuEl.style.left = `${window.innerWidth - menuRect.width - 8}px`;
    }

    this.menuEl.classList.remove('hidden');
    this.isOpen = true;

    // Focus first item
    this.menuEl.querySelector('.dropdown-item')?.focus();
  }

  /**
   * Hide the menu
   */
  hide() {
    this.menuEl.classList.add('hidden');
    this.isOpen = false;
    this.currentVoiceId = null;
  }

  /**
   * Handle menu action
   */
  async handleAction(action) {
    const voiceId = this.currentVoiceId;
    this.hide();

    if (!voiceId) return;

    const voice = state.getVoice(voiceId);
    if (!voice) return;

    switch (action) {
      case 'generate-drum':
        await this.generateForVoice(voiceId, 'drum');
        break;

      case 'generate-bass':
        await this.generateForVoice(voiceId, 'bass');
        break;

      case 'generate-lead':
        await this.generateForVoice(voiceId, 'melodic', 'lead');
        break;

      case 'generate-arp':
        await this.generateForVoice(voiceId, 'melodic', 'arp');
        break;

      case 'generate-pad':
        await this.generateForVoice(voiceId, 'melodic', 'pad');
        break;

      case 'clear':
        this.clearVoice(voiceId);
        break;

      case 'duplicate':
        this.duplicateVoice(voiceId);
        break;

      case 'delete':
        this.deleteVoice(voiceId);
        break;
    }
  }

  /**
   * Generate content for voice using AI
   */
  async generateForVoice(voiceId, voiceType, voiceRole = 'lead') {
    const voice = state.getVoice(voiceId);
    if (!voice) return;

    eventBus.emit(Events.TOAST_SHOW, { message: `AI generating ${voiceType}...`, type: 'info' });

    try {
      const generated = await generateVoiceWithAI(voiceType, voiceRole);

      if (!generated) {
        throw new Error('No data generated');
      }

      // Determine synth preset based on voice type/role
      const synthPresetMap = {
        drum: null, // drums don't use synth presets
        bass: 'bass',
        melodic: voiceRole === 'pad' ? 'pad' : voiceRole === 'arp' ? 'arp' : 'lead',
      };
      const synthPreset = synthPresetMap[voiceType] || 'default';

      // Get current content
      const currentContent = voice.content || { steps: [], notes: [] };

      // Update the voice with generated content
      const updates = {
        type: voiceType,
        sourceType: voiceType === 'drum' ? 'drum' : 'synth',
        sound: generated.sound || (voiceType === 'drum' ? 'kick' : 'sawtooth'),
        synthPreset,
      };

      let newContent = { ...currentContent };

      if (generated.steps) {
        newContent.steps = generated.steps;
      }

      if (generated.notes) {
        // Update both voice.notes AND voice.content.notes for consistency
        updates.notes = generated.notes;
        newContent.notes = generated.notes;
      }

      updates.content = newContent;

      if (generated.name) {
        updates.name = generated.name;
      }

      state.updateVoice(voiceId, updates);

      eventBus.emit(Events.TOAST_SHOW, { message: `Generated ${voiceType} pattern`, type: 'success' });
      eventBus.emit(Events.VOICE_UPDATE, { voiceId });

    } catch (error) {
      console.error('AI voice generation failed:', error);
      eventBus.emit(Events.TOAST_SHOW, { message: `Generation failed: ${error.message}`, type: 'error' });
    }
  }

  /**
   * Clear voice pattern
   */
  clearVoice(voiceId) {
    const voice = state.getVoice(voiceId);
    if (!voice) return;

    const updates = {
      steps: new Array(64).fill(false),
      notes: [],
    };

    state.updateVoice(voiceId, updates);
    eventBus.emit(Events.TOAST_SHOW, { message: 'Pattern cleared', type: 'success' });
    eventBus.emit(Events.VOICE_UPDATE, { voiceId });
  }

  /**
   * Duplicate voice
   */
  duplicateVoice(voiceId) {
    const voice = state.getVoice(voiceId);
    if (!voice) return;

    const newVoice = {
      ...voice,
      id: undefined, // Let state generate new ID
      name: `${voice.name} (copy)`,
    };

    state.addVoice(newVoice);
    eventBus.emit(Events.TOAST_SHOW, { message: 'Voice duplicated', type: 'success' });
  }

  /**
   * Delete voice
   */
  deleteVoice(voiceId) {
    state.removeVoice(voiceId);
    eventBus.emit(Events.TOAST_SHOW, { message: 'Voice deleted', type: 'success' });
  }
}

// Export singleton
export const voiceMenu = new VoiceMenu();
