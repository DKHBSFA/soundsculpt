/**
 * SoundSculpt - Main Application Entry Point
 * Fase 1: Sequencer View + Multi-Voice
 */

import { eventBus, Events } from './event-bus.js';
import { state } from './state.js';
import { history, ToggleStepCommand, AddVoiceCommand } from './history.js';
import { audioContext } from './audio/context-manager.js';
import { scheduler } from './audio/scheduler.js';
import { mixer } from './audio/mixer.js';
// Strudel engine for pattern playback (replaces synthEngine for playback)
import { strudelEngine, setSharedAudioContext, PhaseManager } from './audio/strudel-engine.js';
// Tone.js preview for real-time input (MIDI, musical typing)
import { tonePreview } from './audio/tone-preview.js';
import { createSequencerView } from './views/sequencer.js';
import { createPianoRollView } from './views/piano-roll.js';
import { createScoreView } from './views/score.js';
import { createPatchEditorView } from './views/patch-editor.js';
import { createCodeEditorView } from './views/code-editor.js';
import { patchManager } from './audio/patch-runtime.js';
import {
  saveProject,
  openFileDialog,
  setupDragDrop,
  setupBeforeUnload,
  getRecentProjects,
  loadRecentProject,
  addToRecent,
  copyShareUrl,
  checkUrlForProject,
} from './persistence.js';
import { exportWAV, exportMIDI } from './export.js';
import { exportAndDownload as exportOpus } from './export/opus-encoder.js';
import { draftManager } from './draft-manager.js';
import { keyboard, registerDefaultShortcuts, musicalTyping } from './keyboard.js';
import './ui/toast.js';
// Generation v2 engine (AI + Rules hybrid)
import { generate as generateEngineV2 } from './generation/index.js';
// Legacy generation for fallback (TODO: remove after full migration)
import {
  initGenerationUI,
  renderStyleGrid,
  renderTemplateGrid,
  renderModelSelector,
  generate as generateMusic,
  generateWithAI,
  resetOptions as resetGenerationOptions,
} from './generation.js';
import { chordPalette } from './ui/chord-palette.js';
import { apiKeyModal } from './ui/api-key-modal.js';
import { openRouterClient } from './ai/openrouter-client.js';
import { recorder } from './audio/recorder.js';
import { midiManager } from './midi/manager.js';
import { initA11yKeyboard } from './keyboard-a11y.js';
import { sessionRecorder } from './session/recorder.js';
import { sessionPlayer } from './session/player.js';
import { initSessionControls } from './ui/session-controls.js';
import { settingsModal } from './ui/settings.js';
import { voiceMenu } from './ui/voice-menu.js';
import { mixerWindow } from './ui/mixer-window.js';
import { llmResponseViewer } from './ui/llm-response-viewer.js';

// === DOM Elements ===
const elements = {
  // Screens
  welcomeScreen: document.getElementById('welcome-screen'),
  appScreen: document.getElementById('app-screen'),

  // Overlays
  audioOverlay: document.getElementById('audio-overlay'),
  enableAudioBtn: document.getElementById('enable-audio-btn'),

  // Welcome
  btnGenerate: document.getElementById('btn-generate'),
  btnNew: document.getElementById('btn-new'),
  btnLoad: document.getElementById('btn-load'),
  recentProjects: document.getElementById('recent-projects'),
  recentList: document.getElementById('recent-list'),

  // AI Composition Toggle (in generation modal)
  aiCompositionToggle: document.getElementById('ai-composition-toggle'),
  aiKeyStatus: document.getElementById('ai-key-status'),
  aiKeyStatusText: document.getElementById('ai-key-status-text'),
  btnConfigureApiKey: document.getElementById('btn-configure-api-key'),

  // Header
  projectName: document.getElementById('project-name'),
  transport: document.getElementById('transport'),
  btnPlay: document.getElementById('btn-play'),
  btnStop: document.getElementById('btn-stop'),
  btnRecord: document.getElementById('btn-record'),

  // View tabs
  viewTabs: document.querySelectorAll('.view-tab'),
  bpmInput: document.getElementById('bpm-input'),

  // Scale controls (Fase 8)
  scaleRoot: document.getElementById('scale-root'),
  scaleType: document.getElementById('scale-type'),
  btnQuantize: document.getElementById('btn-quantize'),
  btnChordPalette: document.getElementById('btn-chord-palette'),

  // Voice panel
  voiceList: document.getElementById('voice-list'),
  btnAddVoice: document.getElementById('btn-add-voice'),

  // Views
  viewContainer: document.getElementById('view-container'),
  views: {
    sequencer: document.getElementById('view-sequencer'),
    'piano-roll': document.getElementById('view-piano-roll'),
    score: document.getElementById('view-score'),
    patch: document.getElementById('view-patch'),
    code: document.getElementById('view-code'),
  },

  // Footer
  positionDisplay: document.getElementById('position-display'),
  timelineSlider: document.getElementById('timeline-slider'),
  loopCheckbox: document.getElementById('loop-checkbox'),
  masterMeterFill: document.getElementById('master-meter-fill'),
  unsavedIndicator: document.getElementById('unsaved-indicator'),

  // Modals
  recoveryModal: document.getElementById('recovery-modal'),
  btnRecover: document.getElementById('btn-recover'),
  btnDiscard: document.getElementById('btn-discard'),

  // Generation modal
  generationModal: document.getElementById('generation-modal'),
  btnCloseGeneration: document.getElementById('btn-close-generation'),
  btnCancelGeneration: document.getElementById('btn-cancel-generation'),
  btnGenerateMusic: document.getElementById('btn-generate-music'),
  styleGrid: document.getElementById('style-grid'),
  templateGrid: document.getElementById('template-grid'),
  modelSelector: document.getElementById('model-selector'),

  // Menus
  menuBtns: document.querySelectorAll('.menu-btn'),
  dropdownContainer: document.getElementById('dropdown-menus'),
  menuFile: document.getElementById('menu-file'),
  menuEdit: document.getElementById('menu-edit'),
  menuView: document.getElementById('menu-view'),
};

// === App State ===
let currentView = 'sequencer';
let sequencerView = null;
let pianoRollView = null;
let scoreView = null;
let patchEditorView = null;
let codeEditorView = null;
let meterAnimationId = null;

// Phase manager for automatic phase transitions (BUG-006 fix)
const phaseManager = new PhaseManager(strudelEngine);

// === Theme Toggle ===

/**
 * Initialize theme toggle functionality
 */
function initThemeToggle() {
  const toggle = document.querySelector('[data-theme-toggle]');
  if (!toggle) return;

  // Check saved preference or system preference
  const savedTheme = localStorage.getItem('soundsculpt-theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

  document.documentElement.setAttribute('data-theme', initialTheme);

  toggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('soundsculpt-theme', newTheme);
  });

  // Listen for system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('soundsculpt-theme')) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
}

// === Voice Panel Resize ===

/**
 * Initialize voice panel resizing
 */
function initVoicePanelResize() {
  const voicePanel = document.getElementById('voice-panel');
  const resizeHandle = document.getElementById('voice-panel-resize');

  if (!voicePanel || !resizeHandle) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = voicePanel.offsetWidth;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const deltaX = e.clientX - startX;
    const newWidth = Math.max(150, Math.min(400, startWidth + deltaX));
    voicePanel.style.width = `${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Save preference
      localStorage.setItem('soundsculpt-voice-panel-width', voicePanel.style.width);
    }
  });

  // Restore saved width
  const savedWidth = localStorage.getItem('soundsculpt-voice-panel-width');
  if (savedWidth) {
    voicePanel.style.width = savedWidth;
  }
}

// === Note Playback ===
// NOTE: Pattern playback is now handled by Strudel Engine.
// This section handles real-time preview via Tone.js for input feedback.

/**
 * Get default synth preset based on voice name/type
 */
function getDefaultPresetForVoice(voice) {
  const name = (voice.name || '').toLowerCase();
  if (name.includes('bass')) return 'bass';
  if (name.includes('lead')) return 'lead';
  if (name.includes('pad')) return 'pad';
  if (name.includes('arp')) return 'arp';
  if (name.includes('piano') || name.includes('keys')) return 'piano';
  if (name.includes('string')) return 'strings';
  if (name.includes('brass')) return 'brass';
  return 'default';
}

/**
 * Play a preview note via Tone.js (for MIDI input, musical typing)
 * @param {number} midiNote - MIDI note number
 * @param {number} velocity - Velocity 0-1
 * @param {string} preset - Synth preset name
 */
function playPreviewNote(midiNote, velocity = 0.8, preset = 'default') {
  if (tonePreview.isReady()) {
    tonePreview.setPreset(preset);
    tonePreview.noteOn(midiNote, velocity);
  }
}

/**
 * Stop a preview note
 * @param {number} midiNote - MIDI note number
 */
function stopPreviewNote(midiNote) {
  if (tonePreview.isReady()) {
    tonePreview.noteOff(midiNote);
  }
}

// === Audio Engine Initialization ===

/**
 * Initialize audio engines with shared AudioContext
 * Sets up Strudel for pattern playback and Tone.js for input preview
 */
async function initAudioEngines() {
  try {
    // Initialize the AudioContext manager
    await audioContext.init();
    const ctx = audioContext.getContext();

    if (!ctx) {
      console.error('Failed to create AudioContext');
      return false;
    }

    // Share context with Strudel engine
    setSharedAudioContext(ctx);

    // Initialize Tone.js preview with shared context (non-blocking)
    // Don't await - let it initialize in background to not block UI
    tonePreview.init(ctx).then((success) => {
      if (success) {
        console.log('Tone.js preview ready');
      }
    }).catch(err => {
      console.warn('Tone.js preview init failed:', err);
    });

    // Pre-initialize Strudel engine (will use shared context)
    // Don't await - let it initialize in background
    strudelEngine.init().then((success) => {
      if (success) {
        console.log('Strudel engine ready');
      }
    }).catch(err => {
      console.warn('Strudel engine init failed:', err);
    });

    console.log('Audio engines initialized with shared context');
    return true;
  } catch (err) {
    console.error('Failed to initialize audio engines:', err);
    return false;
  }
}

// === Initialization ===

/**
 * Initialize the application
 */
async function init() {
  console.log('SoundSculpt v2 initializing...');

  // Initialize theme toggle early to prevent flash
  initThemeToggle();

  // Initialize voice panel resizing
  initVoicePanelResize();

  // Setup persistence
  setupDragDrop();
  setupBeforeUnload();

  // Initialize shared AudioContext and audio engines
  await initAudioEngines();

  // Setup keyboard
  keyboard.init();
  registerDefaultShortcuts({
    play: togglePlay,
    stop: handleStop,
    toggleRecord: toggleRecord,
    undo: () => history.undo(),
    redo: () => history.redo(),
    save: saveProject,
    load: openFileDialog,
    newProject: () => showWelcome(),
    switchView: switchView,
    toggleLoop: toggleLoop,
    addVoice: () => addVoice(),
    // Session mode (Fase 11b)
    toggleSessionRecord: toggleSessionRecording,
    toggleSessionPunch: toggleSessionPunch,
    playSession: toggleSessionPlayback,
    clearSession: clearSessionData,
    // Mixer window
    toggleMixer: () => mixerWindow.toggle(),
    // AI Response viewer
    viewAIResponse: () => llmResponseViewer.show(),
  });

  // Setup event listeners
  setupEventListeners();

  // Setup event bus listeners
  setupEventBusListeners();

  // Initialize accessibility keyboard navigation
  initA11yKeyboard();

  // Initialize views
  if (elements.views.sequencer) {
    sequencerView = createSequencerView(elements.views.sequencer);
  }

  if (elements.views['piano-roll']) {
    pianoRollView = createPianoRollView(elements.views['piano-roll']);
  }

  if (elements.views.score) {
    scoreView = createScoreView(elements.views.score);
  }

  if (elements.views.patch) {
    patchEditorView = createPatchEditorView(elements.views.patch);
  }

  if (elements.views.code) {
    codeEditorView = createCodeEditorView(elements.views.code);
  }

  // Setup scheduler trigger callback
  // NOTE: Strudel handles pattern playback independently.
  // Scheduler is kept for step sequencer UI sync and patch voice triggers.
  scheduler.setTriggerCallback((stepIndex, time) => {
    // Trigger patch ADSR envelopes for patch voices (BUG-005 fix)
    if (sequencerView) {
      const activeVoices = sequencerView.getActiveStepsAtBeat(stepIndex);
      for (const { voiceId } of activeVoices) {
        const voice = state.getVoice(voiceId);
        if (voice?.sourceType === 'patch') {
          const runtime = patchManager.runtimes.get(voiceId);
          if (runtime) {
            runtime.triggerNote(time);
          }
        }
      }
    }
    // NOTE: Pattern/note playback is now handled by Strudel Engine
  });

  // Start metering
  mixer.startMetering(updateMeters, 50);

  // Setup musical typing to use Tone.js preview (low latency)
  musicalTyping.onNoteOn = (midiNote, velocity) => {
    const selectedVoiceId = state.get('selectedVoiceId');
    if (selectedVoiceId) {
      const voice = state.getVoice(selectedVoiceId);
      if (voice) {
        const preset = getDefaultPresetForVoice(voice);
        playPreviewNote(midiNote, velocity / 127, preset);
      }
    }
  };
  musicalTyping.onNoteOff = (midiNote) => {
    stopPreviewNote(midiNote);
  };
  musicalTyping.enable();

  // Initialize chord palette (Fase 8)
  chordPalette.init();

  // Initialize settings modal (BUG-006 fix)
  settingsModal.init();

  // Initialize API key modal, voice menu, and mixer window
  apiKeyModal.init();
  voiceMenu.init();
  mixerWindow.init();
  initAIToggle();

  // Initialize MIDI (Fase 9)
  if (midiManager.checkSupport()) {
    midiManager.requestAccess().then((success) => {
      if (success) {
        console.log('MIDI enabled');
      }
    });
  }

  // Check for project in URL hash first
  if (checkUrlForProject()) {
    enterApp();
  }
  // Otherwise check for draft recovery
  else if (draftManager.checkForDraft()) {
    showRecoveryModal();
  }

  // Show recent projects
  updateRecentProjects();

  console.log('SoundSculpt ready');
}

/**
 * Initialize AI Composition toggle in generation modal
 */
function initAIToggle() {
  const toggle = elements.aiCompositionToggle;
  if (!toggle) return;

  // Update status when toggle changes
  toggle.addEventListener('change', updateAIKeyStatus);

  // Configure API key button
  elements.btnConfigureApiKey?.addEventListener('click', () => {
    apiKeyModal.show(() => updateAIKeyStatus());
  });

  // Initial status update
  updateAIKeyStatus();
}

/**
 * Update AI key status display in generation modal
 */
function updateAIKeyStatus() {
  const toggle = elements.aiCompositionToggle;
  const statusEl = elements.aiKeyStatus;
  const statusText = elements.aiKeyStatusText;

  if (!statusEl || !statusText) return;

  // Only show status when AI is enabled
  if (toggle?.checked) {
    statusEl.classList.remove('hidden');
    const isDemo = openRouterClient.isUsingDefaultKey();
    if (isDemo) {
      statusText.textContent = 'Demo mode - limited generations';
    } else {
      statusText.textContent = 'Using your API key';
    }
  } else {
    statusEl.classList.add('hidden');
  }
}

/**
 * Check if AI composition is enabled
 */
function isAICompositionEnabled() {
  return elements.aiCompositionToggle?.checked ?? false;
}

/**
 * Setup DOM event listeners
 */
function setupEventListeners() {
  // Welcome screen buttons
  elements.btnGenerate?.addEventListener('click', handleGenerate);
  elements.btnNew?.addEventListener('click', handleNewProject);
  elements.btnLoad?.addEventListener('click', openFileDialog);

  // Audio overlay
  elements.enableAudioBtn?.addEventListener('click', enableAudio);

  // Transport
  elements.btnPlay?.addEventListener('click', togglePlay);
  elements.btnStop?.addEventListener('click', handleStop);
  elements.btnRecord?.addEventListener('click', toggleRecord);

  // View tabs
  elements.viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      if (view) switchView(view);
    });
  });

  // BPM input
  elements.bpmInput?.addEventListener('change', (e) => {
    const tempo = parseInt(e.target.value, 10);
    if (!isNaN(tempo)) {
      state.setTempo(tempo);
    }
  });

  // Scale controls (Fase 8)
  elements.scaleRoot?.addEventListener('change', (e) => {
    state.setScaleRoot(e.target.value);
    musicalTyping.setScale(e.target.value, state.getScale().type);
  });

  elements.scaleType?.addEventListener('change', (e) => {
    state.setScaleType(e.target.value);
    musicalTyping.setScale(state.getScale().root, e.target.value);
  });

  elements.btnQuantize?.addEventListener('click', () => {
    state.toggleQuantize();
    const quantize = state.getScale().quantize;
    elements.btnQuantize.classList.toggle('active', quantize);
    musicalTyping.setQuantize(quantize);
  });

  // Loop toggle
  elements.loopCheckbox?.addEventListener('change', toggleLoop);

  // Add voice button - show type picker
  elements.btnAddVoice?.addEventListener('click', () => showVoiceTypePicker());

  // Menu buttons
  elements.menuBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const menuName = btn.dataset.menu;
      toggleMenu(menuName, btn);
    });
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-btn') && !e.target.closest('.dropdown-menu')) {
      closeAllMenus();
    }
  });

  // Dropdown menu actions
  elements.dropdownContainer?.addEventListener('click', (e) => {
    const action = e.target.closest('button')?.dataset.action;
    if (action) {
      handleMenuAction(action);
      closeAllMenus();
    }
  });

  // Recovery modal
  elements.btnRecover?.addEventListener('click', () => {
    draftManager.recoverDraft();
    hideRecoveryModal();
    enterApp();
  });

  elements.btnDiscard?.addEventListener('click', () => {
    draftManager.discardDraft();
    hideRecoveryModal();
  });

  // Generation modal
  elements.btnCloseGeneration?.addEventListener('click', hideGenerationModal);
  elements.btnCancelGeneration?.addEventListener('click', hideGenerationModal);
  elements.btnGenerateMusic?.addEventListener('click', handleGenerateClick);
}

/**
 * Setup event bus listeners
 */
function setupEventBusListeners() {
  // Project dirty state
  eventBus.on(Events.PROJECT_DIRTY, () => {
    elements.unsavedIndicator?.classList.remove('hidden');
  });

  eventBus.on(Events.PROJECT_CLEAN, () => {
    elements.unsavedIndicator?.classList.add('hidden');
  });

  // Project loaded
  eventBus.on(Events.PROJECT_LOAD, (project) => {
    elements.projectName.textContent = project.name || 'Untitled';
    addToRecent(project.name);
    renderVoiceList();
    // Transition to app screen if still on welcome
    if (!elements.welcomeScreen?.classList.contains('hidden')) {
      enterApp();
    }
  });

  // View changes
  eventBus.on(Events.VIEW_CHANGE, (view) => {
    updateViewTabs(view);
  });

  // Voice changes
  eventBus.on(Events.VOICE_ADD, () => renderVoiceList());
  eventBus.on(Events.VOICE_REMOVE, () => renderVoiceList());
  eventBus.on(Events.VOICE_UPDATE, () => renderVoiceList());
  eventBus.on(Events.VOICE_MUTE, () => renderVoiceList());
  eventBus.on(Events.VOICE_SOLO, () => renderVoiceList());

  // Audio context state
  eventBus.on(Events.AUDIO_CONTEXT_STATE, (contextState) => {
    if (contextState === 'suspended') {
      elements.audioOverlay?.classList.remove('hidden');
    } else {
      elements.audioOverlay?.classList.add('hidden');
    }
  });

  // Transport changes
  eventBus.on(Events.TRANSPORT_BPM_CHANGE, (tempo) => {
    if (elements.bpmInput) {
      elements.bpmInput.value = tempo;
    }
  });

  // Playhead position updates
  eventBus.on(Events.PLAYHEAD_UPDATE, (beat) => {
    if (elements.positionDisplay) {
      // Format as bar.beat.tick (1-indexed)
      const bar = Math.floor(beat / 4) + 1;
      const beatInBar = Math.floor(beat % 4) + 1;
      const tick = Math.floor((beat % 1) * 4) + 1;
      elements.positionDisplay.textContent = `${bar}.${beatInBar}.${tick}`;
    }
  });

  // Recording events (Fase 9)
  eventBus.on(Events.RECORDING_ARM, () => renderVoiceList());
  eventBus.on(Events.RECORDING_DISARM, () => renderVoiceList());
  eventBus.on(Events.INPUT_MONITOR_TOGGLE, () => renderVoiceList());

  eventBus.on(Events.RECORDING_START, () => {
    elements.btnRecord?.classList.add('recording');
  });

  eventBus.on(Events.RECORDING_STOP, () => {
    elements.btnRecord?.classList.remove('recording');
    renderVoiceList(); // Update to show new sample in voice
  });

  // MIDI events (Fase 9) - use Tone.js preview for low latency
  eventBus.on(Events.MIDI_NOTE_ON, ({ note, velocity, voiceId }) => {
    if (voiceId) {
      const voice = state.getVoice(voiceId);
      const preset = voice ? getDefaultPresetForVoice(voice) : 'default';
      playPreviewNote(note, velocity / 127, preset);
    }
  });

  eventBus.on(Events.MIDI_NOTE_OFF, ({ note }) => {
    stopPreviewNote(note);
  });

  // === Patch Runtime Integration (BUG-005 fix) ===

  // Build patches when project loads
  eventBus.on(Events.PROJECT_LOAD, () => {
    buildVoicePatches();
  });

  // Rebuild patch when voice updates (patch changed in editor)
  eventBus.on(Events.VOICE_UPDATE, (voiceId) => {
    const voice = state.getVoice(voiceId);
    if (voice?.sourceType === 'patch' && voice.content?.patch) {
      patchManager.buildPatch(voiceId, voice.content.patch);
    }
  });

  // Start Strudel playback and patches on transport play
  eventBus.on(Events.TRANSPORT_PLAY, async () => {
    const voices = state.get('voices') || [];
    const tempo = state.get('transport')?.tempo || 120;

    // Start Strudel engine with current voices
    strudelEngine.setBpm(tempo);
    strudelEngine.setVoices(voices);
    await strudelEngine.play();

    // Start phase manager if voices have phased patterns (BUG-006 fix)
    const hasPhases = voices.some(v => v.phasedPatterns && Object.keys(v.phasedPatterns).length > 0);
    if (hasPhases) {
      // Standard form: intro (1-8), build (9-16), climax (17-20), resolve (21-24)
      const phases = state.get('generation.phases') || [
        { name: 'intro', bars: [1, 8] },
        { name: 'build', bars: [9, 16] },
        { name: 'climax', bars: [17, 20] },
        { name: 'resolve', bars: [21, 24] },
      ];
      phaseManager.setPhases(phases, tempo);
      phaseManager.start();
    }

    // Start patch voices
    for (const voice of voices) {
      if (voice.sourceType === 'patch' && voice.content?.patch) {
        patchManager.buildPatch(voice.id, voice.content.patch);
        patchManager.startPatch(voice.id);
      }
    }
  });

  // Stop Strudel and patches on transport stop
  eventBus.on(Events.TRANSPORT_STOP, () => {
    // Stop Strudel playback
    strudelEngine.stop();

    // Stop phase manager (BUG-006 fix)
    phaseManager.stop();

    // Stop patch voices
    const voices = state.get('voices') || [];
    for (const voice of voices) {
      if (voice.sourceType === 'patch') {
        patchManager.stopPatch(voice.id);
      }
    }
  });
}

// === Patch Integration (BUG-005 fix) ===

/**
 * Build patches for all voices with sourceType 'patch'
 */
function buildVoicePatches() {
  const voices = state.get('voices') || [];
  for (const voice of voices) {
    if (voice.sourceType === 'patch' && voice.content?.patch) {
      patchManager.buildPatch(voice.id, voice.content.patch);
    }
  }
}

// === Actions ===

/**
 * Enable audio (resume context)
 */
async function enableAudio() {
  try {
    await audioContext.resume();
    elements.audioOverlay?.classList.add('hidden');
  } catch (error) {
    console.error('Failed to enable audio:', error);
  }
}

/**
 * Toggle play/pause
 */
function togglePlay() {
  const isPlaying = state.get('transport.playing');
  if (isPlaying) {
    state.setPlaying(false);
    elements.btnPlay?.classList.remove('playing');
  } else {
    // Ensure audio context is running
    if (!audioContext.isRunning()) {
      audioContext.resume();
    }
    state.setPlaying(true);
    elements.btnPlay?.classList.add('playing');
  }
}

/**
 * Handle stop
 */
function handleStop() {
  state.stop();
  elements.btnPlay?.classList.remove('playing');
  elements.btnRecord?.classList.remove('recording');
}

/**
 * Toggle record
 */
function toggleRecord() {
  const isRecording = state.get('transport.recording');
  state.setRecording(!isRecording);
  if (!isRecording) {
    elements.btnRecord?.classList.add('recording');
  } else {
    elements.btnRecord?.classList.remove('recording');
  }
}

/**
 * Toggle loop
 */
function toggleLoop() {
  state.toggleLoop();
  const isLoop = state.get('transport.loop');
  if (elements.loopCheckbox) {
    elements.loopCheckbox.checked = isLoop;
  }
}

// === Session Mode (Fase 11b) ===

/**
 * Toggle session recording
 */
function toggleSessionRecording() {
  if (sessionRecorder.isRecording) {
    const data = sessionRecorder.stopRecording();
    state.stopSessionRecording();
    if (data) {
      state.setSessionData(data);
      sessionPlayer.loadSession(data);
    }
  } else {
    sessionRecorder.startRecording();
    state.startSessionRecording();

    // Also start transport if not playing
    if (!state.get('transport.playing')) {
      togglePlay();
    }
  }
}

/**
 * Toggle session punch-in mode
 */
function toggleSessionPunch() {
  // Toggle punch-in flag
  const currentPunch = sessionRecorder.isPunchIn;
  // Punch toggle is handled by the UI component
  // This is just a keyboard shortcut hook
  eventBus.emit('session:punch:toggle');
}

/**
 * Toggle session playback
 */
function toggleSessionPlayback() {
  if (!sessionPlayer.hasSession()) return;

  if (sessionPlayer.isPlaying) {
    sessionPlayer.pause();
    state.setSessionPlaying(false);
  } else {
    sessionPlayer.play();
    state.setSessionPlaying(true);
  }
}

/**
 * Clear session data
 */
function clearSessionData() {
  if (!state.hasSessionData()) return;

  sessionPlayer.stop();
  state.clearSession();
  sessionRecorder.clear();
}

/**
 * Switch view
 */
function switchView(viewName) {
  currentView = viewName;
  state.setView(viewName);

  // Update DOM
  Object.entries(elements.views).forEach(([name, el]) => {
    if (el) {
      el.classList.toggle('active', name === viewName);
      el.classList.toggle('hidden', name !== viewName);
    }
  });

  updateViewTabs(viewName);
}

/**
 * Update view tabs active state
 */
function updateViewTabs(viewName) {
  elements.viewTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });
}

// Voice type presets organized by category
const VOICE_CATEGORIES = [
  { id: 'drums', name: 'Drum Machines' },
  { id: 'synths', name: 'Synthesizers' },
  { id: 'instruments', name: 'Instruments' },
  { id: 'oscillators', name: 'Oscillators' },
  { id: 'noise', name: 'Noise' },
  { id: 'other', name: 'Other' },
];

const VOICE_TYPES = [
  // Drums
  { id: 'drums-808', name: 'TR-808', icon: '🥁', category: 'drums', sourceType: 'drum', drumKit: '808', description: 'Classic 808' },
  { id: 'drums-909', name: 'TR-909', icon: '🪘', category: 'drums', sourceType: 'drum', drumKit: '909', description: 'Classic 909' },
  { id: 'drums-606', name: 'TR-606', icon: '🎛️', category: 'drums', sourceType: 'drum', drumKit: '606', description: 'Analog 606' },
  { id: 'drums-jazz', name: 'Jazz Kit', icon: '🎷', category: 'drums', sourceType: 'drum', drumKit: 'jazz', description: 'Brush & ride' },
  // Synths
  { id: 'bass', name: 'Bass', icon: '🎸', category: 'synths', sourceType: 'synth', synthPreset: 'bass', description: 'Sub bass' },
  { id: 'lead', name: 'Lead', icon: '🎹', category: 'synths', sourceType: 'synth', synthPreset: 'lead', description: 'Melodic lead' },
  { id: 'pad', name: 'Pad', icon: '🌊', category: 'synths', sourceType: 'synth', synthPreset: 'pad', description: 'Atmospheric' },
  { id: 'arp', name: 'Arp', icon: '✨', category: 'synths', sourceType: 'synth', synthPreset: 'arp', description: 'Arpeggios' },
  { id: 'pluck', name: 'Pluck', icon: '🪕', category: 'synths', sourceType: 'synth', synthPreset: 'pluck', description: 'Plucked string' },
  // Instruments
  { id: 'piano', name: 'Piano', icon: '🎹', category: 'instruments', sourceType: 'synth', synthPreset: 'piano', description: 'Keys' },
  { id: 'strings', name: 'Strings', icon: '🎻', category: 'instruments', sourceType: 'synth', synthPreset: 'strings', description: 'Orchestra' },
  { id: 'brass', name: 'Brass', icon: '🎺', category: 'instruments', sourceType: 'synth', synthPreset: 'brass', description: 'Horns' },
  // Oscillators
  { id: 'sine', name: 'Sine', icon: '〰️', category: 'oscillators', sourceType: 'synth', synthPreset: 'sine', description: 'Pure tone' },
  { id: 'saw', name: 'Sawtooth', icon: '⚡', category: 'oscillators', sourceType: 'synth', synthPreset: 'sawtooth', description: 'Bright, buzzy' },
  { id: 'square', name: 'Square', icon: '⬜', category: 'oscillators', sourceType: 'synth', synthPreset: 'square', description: 'Hollow, retro' },
  { id: 'triangle', name: 'Triangle', icon: '🔺', category: 'oscillators', sourceType: 'synth', synthPreset: 'triangle', description: 'Soft, mellow' },
  // Noise
  { id: 'white-noise', name: 'White', icon: '📻', category: 'noise', sourceType: 'synth', synthPreset: 'white', description: 'White noise' },
  { id: 'pink-noise', name: 'Pink', icon: '🌸', category: 'noise', sourceType: 'synth', synthPreset: 'pink', description: 'Pink noise' },
  // Other
  { id: 'sample', name: 'Sample', icon: '🎧', category: 'other', sourceType: 'sample', description: 'Audio file' },
  { id: 'patch', name: 'Patch', icon: '🔌', category: 'other', sourceType: 'patch', description: 'Visual patching' },
];

let voicePickerEl = null;

/**
 * Render voice types grouped by category
 */
function renderVoicePickerSections() {
  return VOICE_CATEGORIES.map(cat => {
    const items = VOICE_TYPES.filter(t => t.category === cat.id);
    if (items.length === 0) return '';
    return `
      <div class="voice-picker-section">
        <div class="voice-picker-section-title">${cat.name}</div>
        <div class="voice-picker-grid">
          ${items.map(t => `
            <button class="voice-type-btn" data-type="${t.id}" data-source="${t.sourceType}">
              <span class="type-icon">${t.icon}</span>
              <span class="type-name">${t.name}</span>
              <span class="type-desc">${t.description}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Show voice type picker
 */
function showVoiceTypePicker() {
  // Create picker if it doesn't exist
  if (!voicePickerEl) {
    voicePickerEl = document.createElement('div');
    voicePickerEl.className = 'voice-type-picker';
    voicePickerEl.innerHTML = `
      <div class="voice-picker-backdrop"></div>
      <div class="voice-picker-content">
        <div class="voice-picker-header">Add Voice</div>
        ${renderVoicePickerSections()}
      </div>
    `;
    document.body.appendChild(voicePickerEl);

    // Handle clicks on backdrop (close) or buttons (select)
    voicePickerEl.addEventListener('click', (e) => {
      // Click on backdrop = close
      if (e.target.classList.contains('voice-picker-backdrop')) {
        hideVoiceTypePicker();
        return;
      }

      // Click on type button = create voice
      const btn = e.target.closest('.voice-type-btn');
      if (btn) {
        const typeId = btn.dataset.type;
        const sourceType = btn.dataset.source;
        const typeInfo = VOICE_TYPES.find(t => t.id === typeId);
        addVoice({
          name: typeInfo?.name || 'Voice',
          icon: typeInfo?.icon || '🎵',
          sourceType,
          drumKit: typeInfo?.drumKit,
          synthPreset: typeInfo?.synthPreset,
        });
        hideVoiceTypePicker();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && voicePickerEl.classList.contains('active')) {
        hideVoiceTypePicker();
      }
    });
  }

  voicePickerEl.classList.add('active');
}

/**
 * Hide voice type picker
 */
function hideVoiceTypePicker() {
  if (voicePickerEl) {
    voicePickerEl.classList.remove('active');
  }
}

/**
 * Add a new voice
 */
function addVoice(voiceData = {}) {
  const command = new AddVoiceCommand(state, voiceData);
  history.execute(command);
}

/**
 * Render voice list
 */
function renderVoiceList() {
  const voices = state.get('voices') || [];
  const selectedId = state.get('selectedVoiceId');

  if (!elements.voiceList) return;

  elements.voiceList.innerHTML = voices
    .map(
      (voice) => `
    <div class="voice-strip ${voice.id === selectedId ? 'selected' : ''}"
         style="border-left-color: ${voice.color}"
         data-voice-id="${voice.id}">
      <span class="voice-strip-icon">${voice.icon}</span>
      <span class="voice-strip-name">${voice.name}</span>
      <div class="voice-strip-meter">
        <div class="voice-meter" data-voice-meter="${voice.id}">
          <div class="voice-meter-fill"></div>
        </div>
      </div>
      <input type="range" class="voice-volume" min="0" max="100"
             value="${Math.round((voice.volume ?? 1) * 100)}"
             data-action="volume" title="Volume">
      <div class="voice-strip-controls">
        <button class="voice-btn voice-btn-arm ${voice.armed ? 'armed' : ''}" data-action="arm" title="Arm for Recording">R</button>
        <button class="voice-btn voice-btn-monitor ${voice.monitoring ? 'active' : ''}" data-action="monitor" title="Input Monitoring">I</button>
        <button class="voice-btn ${voice.solo ? 'active' : ''}" data-action="solo" title="Solo">S</button>
        <button class="voice-btn ${voice.muted ? 'muted' : ''}" data-action="mute" title="Mute">M</button>
        <button class="voice-btn voice-menu-btn" data-action="menu" title="More Actions" aria-haspopup="menu">&#8942;</button>
      </div>
    </div>
  `
    )
    .join('');

  // Add click listeners
  elements.voiceList.querySelectorAll('.voice-strip').forEach((strip) => {
    const voiceId = strip.dataset.voiceId;

    strip.addEventListener('click', (e) => {
      if (!e.target.closest('.voice-btn') && !e.target.closest('.voice-volume') && !e.target.closest('.voice-menu-btn')) {
        state.selectVoice(voiceId);
        renderVoiceList();
      }
    });

    strip.querySelector('[data-action="arm"]')?.addEventListener('click', () => {
      state.toggleArm(voiceId);
      renderVoiceList();
    });

    strip.querySelector('[data-action="monitor"]')?.addEventListener('click', async () => {
      const voice = state.getVoice(voiceId);
      if (!voice.monitoring) {
        // Request microphone access if not yet granted
        await recorder.requestMicrophoneAccess();
      }
      state.toggleMonitoring(voiceId);
      renderVoiceList();
    });

    strip.querySelector('[data-action="solo"]')?.addEventListener('click', () => {
      state.toggleSolo(voiceId);
      renderVoiceList();
    });

    strip.querySelector('[data-action="mute"]')?.addEventListener('click', () => {
      state.toggleMute(voiceId);
      renderVoiceList();
    });

    strip.querySelector('[data-action="volume"]')?.addEventListener('input', (e) => {
      const volume = parseInt(e.target.value, 10) / 100;
      state.updateVoice(voiceId, { volume });
    });

    strip.querySelector('[data-action="menu"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      voiceMenu.show(voiceId, e.currentTarget);
    });

    // Double-click on name to rename
    strip.querySelector('.voice-strip-name')?.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const nameSpan = e.target;
      const voice = state.getVoice(voiceId);
      const originalName = voice.name;

      // Create inline input
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'voice-rename-input';
      input.value = originalName;
      input.style.cssText = `
        width: 100%;
        padding: 2px 4px;
        font: inherit;
        background: var(--color-surface-elevated);
        border: 1px solid var(--color-accent);
        border-radius: 4px;
        color: inherit;
      `;

      // Replace span with input
      nameSpan.replaceWith(input);
      input.focus();
      input.select();

      const saveName = () => {
        const newName = input.value.trim() || originalName;
        if (newName !== originalName) {
          state.updateVoice(voiceId, { name: newName });
        }
        renderVoiceList();
      };

      input.addEventListener('blur', saveName);
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') {
          ke.preventDefault();
          saveName();
        } else if (ke.key === 'Escape') {
          ke.preventDefault();
          renderVoiceList(); // Cancel: just re-render
        }
      });
    });
  });
}

/**
 * Update VU meters
 */
function updateMeters(levels) {
  // Update voice meters
  for (const [voiceId, db] of Object.entries(levels.voices)) {
    const meter = document.querySelector(`[data-voice-meter="${voiceId}"] .voice-meter-fill`);
    if (meter) {
      const percent = dbToPercent(db);
      meter.style.height = `${percent}%`;
    }
  }

  // Update master meter
  if (elements.masterMeterFill) {
    const percent = dbToPercent(levels.master);
    elements.masterMeterFill.style.width = `${percent}%`;

    // Check for clipping
    const meterContainer = elements.masterMeterFill.closest('.meter');
    if (meterContainer) {
      meterContainer.classList.toggle('clipping', levels.master > -3);
    }
  }
}

/**
 * Convert dB to percentage (0-100)
 */
function dbToPercent(db) {
  if (db === -Infinity || db < -60) return 0;
  if (db >= 0) return 100;
  // Linear mapping from -60dB to 0dB -> 0% to 100%
  return Math.round(((db + 60) / 60) * 100);
}

// === Menus ===

/**
 * Toggle dropdown menu
 */
function toggleMenu(menuName, button) {
  const menu = document.getElementById(`menu-${menuName}`);
  if (!menu) return;

  const isOpen = !menu.classList.contains('hidden');

  closeAllMenus();

  if (!isOpen) {
    elements.dropdownContainer?.classList.remove('hidden');
    menu.classList.remove('hidden');

    // Position menu below button
    const rect = button.getBoundingClientRect();
    menu.style.top = `${rect.bottom}px`;
    menu.style.left = `${rect.left}px`;
  }
}

/**
 * Close all dropdown menus
 */
function closeAllMenus() {
  elements.dropdownContainer?.classList.add('hidden');
  [elements.menuFile, elements.menuEdit, elements.menuView].forEach((menu) => {
    menu?.classList.add('hidden');
  });
}

/**
 * Handle menu action
 */
function handleMenuAction(action) {
  switch (action) {
    case 'save':
      saveProject();
      break;
    case 'load':
      openFileDialog();
      break;
    case 'export-wav':
      exportWAV();
      break;
    case 'export-midi':
      exportMIDI();
      break;
    case 'export-opus':
      exportOpus();
      break;
    case 'share':
      copyShareUrl();
      break;
    case 'settings':
      settingsModal.show();
      break;
    case 'mixer':
      mixerWindow.toggle();
      break;
    case 'view-ai-response':
      llmResponseViewer.show();
      break;
    case 'undo':
      history.undo();
      break;
    case 'redo':
      history.redo();
      break;
    case 'view-sequencer':
    case 'view-piano-roll':
    case 'view-score':
    case 'view-patch':
    case 'view-code':
      switchView(action.replace('view-', ''));
      break;
    default:
      console.log('Unknown action:', action);
  }
}

// === Welcome Screen ===

/**
 * Handle "Generate Music" button
 */
function handleGenerate() {
  showGenerationModal();
}

/**
 * Show generation modal
 */
function showGenerationModal() {
  // Initialize generation UI if not already done
  initGenerationUI();
  resetGenerationOptions();

  // Re-render grids (in case options were changed)
  renderStyleGrid(elements.styleGrid);
  renderTemplateGrid(elements.templateGrid);
  renderModelSelector(elements.modelSelector);

  elements.generationModal?.classList.remove('hidden');
}

/**
 * Hide generation modal
 */
function hideGenerationModal() {
  elements.generationModal?.classList.add('hidden');
}

/**
 * Handle "Generate" button click in generation modal
 * Uses AI if toggle is on, otherwise procedural generation
 */
async function handleGenerateClick() {
  const useAI = isAICompositionEnabled();

  if (useAI) {
    // Get selected style for AI generation
    const selectedStyle = document.querySelector('.style-card.selected');
    const genre = selectedStyle?.dataset.style || 'electronic';

    // Disable button during generation
    const btn = elements.btnGenerateMusic;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generating...';
    }

    try {
      const result = await generateWithAI(genre);
      if (result) {
        hideGenerationModal();
        enterApp();
        eventBus.emit(Events.TOAST_SHOW, {
          message: 'Generated with AI',
          type: 'success',
        });
      }
    } catch (error) {
      console.error('AI generation error:', error);
      // Fallback to procedural
      eventBus.emit(Events.TOAST_SHOW, {
        message: 'AI failed, using procedural generation',
        type: 'warning',
      });
      const result = generateMusic();
      if (result) {
        hideGenerationModal();
        enterApp();
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Generate';
      }
    }
  } else {
    // Procedural generation
    const result = generateMusic();
    if (result) {
      hideGenerationModal();
      enterApp();
    }
  }
}

/**
 * Handle "New Project" button
 */
function handleNewProject() {
  state.newProject('Untitled');
  enterApp();
}

/**
 * Enter the main app (hide welcome, show app)
 */
function enterApp() {
  elements.welcomeScreen?.classList.add('hidden');
  elements.appScreen?.classList.remove('hidden');
  elements.projectName.textContent = state.get('project.name') || 'Untitled';
  renderVoiceList();
  draftManager.startAutoSave();

  // Initialize session controls (Fase 11b)
  const transportEl = elements.transport;
  if (transportEl && !transportEl.querySelector('.session-controls')) {
    initSessionControls(transportEl);
  }
}

/**
 * Show welcome screen
 */
function showWelcome() {
  elements.appScreen?.classList.add('hidden');
  elements.welcomeScreen?.classList.remove('hidden');
  draftManager.stopAutoSave();
}

/**
 * Update recent projects list
 */
function updateRecentProjects() {
  const recent = getRecentProjects();

  if (recent.length > 0 && elements.recentProjects && elements.recentList) {
    elements.recentProjects.classList.remove('hidden');
    elements.recentList.innerHTML = recent
      .map((r) => `<li class="recent-item" data-name="${r.name}">${r.name}</li>`)
      .join('');

    // Add click handlers
    elements.recentList.querySelectorAll('.recent-item').forEach(item => {
      item.addEventListener('click', () => {
        const name = item.dataset.name;
        const projectData = loadRecentProject(name);
        if (projectData) {
          state.loadProject(projectData);
          showApp();
          eventBus.emit(Events.TOAST_SHOW, {
            message: `Loaded "${name}"`,
            type: 'success',
          });
        } else {
          // Project data not in cache, prompt to load file
          eventBus.emit(Events.TOAST_SHOW, {
            message: 'Project not in cache. Please load the file from your computer.',
            type: 'info',
          });
          openFileDialog();
        }
      });
    });
  }
}

// === Recovery Modal ===

function showRecoveryModal() {
  elements.recoveryModal?.classList.remove('hidden');
}

function hideRecoveryModal() {
  elements.recoveryModal?.classList.add('hidden');
}

// === Start ===
// ES modules are deferred, so DOMContentLoaded may have already fired
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // DOM is already ready, call init directly
  init();
}
