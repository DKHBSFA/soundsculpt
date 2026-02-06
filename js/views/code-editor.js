/**
 * Code Editor View - Strudel pattern editing with CodeMirror 6
 * Phase 5: Code Editor + Samples
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { history } from '../history.js';
import { audioContext } from '../audio/context-manager.js';
import { sampleManager, createSampleUploader, renderWaveform, SamplePlayer } from '../audio/sample-manager.js';

// === Strudel-like Pattern DSL ===

/**
 * Mini pattern parser for SoundSculpt
 * Inspired by Strudel/Tidal Cycles mini-notation
 */
class PatternEngine {
  constructor() {
    this.patterns = new Map();
    this.isPlaying = false;
    this.currentVoiceId = null;
  }

  /**
   * Parse and validate pattern code
   */
  parse(code) {
    const errors = [];
    let ast = null;

    try {
      // Basic syntax validation
      // Check for balanced brackets
      const brackets = { '[': 0, ']': 0, '(': 0, ')': 0, '{': 0, '}': 0 };
      for (const char of code) {
        if (brackets.hasOwnProperty(char)) {
          brackets[char]++;
        }
      }

      if (brackets['['] !== brackets[']']) {
        errors.push({ line: 1, message: 'Unbalanced square brackets' });
      }
      if (brackets['('] !== brackets[')']) {
        errors.push({ line: 1, message: 'Unbalanced parentheses' });
      }
      if (brackets['{'] !== brackets['}']) {
        errors.push({ line: 1, message: 'Unbalanced curly braces' });
      }

      // Parse the pattern
      ast = this.parsePattern(code);
    } catch (e) {
      errors.push({ line: 1, message: e.message });
    }

    return { ast, errors, valid: errors.length === 0 };
  }

  /**
   * Simple pattern parser
   * Supports: s("bd sd hh"), note("c3 e3 g3"), stack(), etc.
   */
  parsePattern(code) {
    // Extract function calls
    const functionPattern = /(\w+)\s*\(/g;
    const functions = [];
    let match;

    while ((match = functionPattern.exec(code)) !== null) {
      functions.push({
        name: match[1],
        index: match.index,
      });
    }

    return {
      type: 'pattern',
      code,
      functions,
    };
  }

  /**
   * Evaluate pattern for a voice
   * Returns trigger information for the scheduler
   */
  evaluate(code, voiceId) {
    const result = this.parse(code);

    if (!result.valid) {
      return { success: false, errors: result.errors };
    }

    // Store the pattern for this voice
    this.patterns.set(voiceId, {
      code,
      ast: result.ast,
      compiled: this.compilePattern(result.ast),
    });

    return { success: true, pattern: this.patterns.get(voiceId) };
  }

  /**
   * Compile pattern to trigger schedule
   */
  compilePattern(ast) {
    // Extract note/sound events from the code
    const events = [];

    // Parse s("...") - sound patterns
    const soundMatch = ast.code.match(/s\s*\(\s*["']([^"']+)["']\s*\)/);
    if (soundMatch) {
      const sounds = this.parseSequence(soundMatch[1]);
      sounds.forEach((sound, i) => {
        if (sound !== '~') {
          events.push({
            type: 'sound',
            sound,
            time: i / sounds.length,
            duration: 1 / sounds.length,
          });
        }
      });
    }

    // Parse note("...") - note patterns
    const noteMatch = ast.code.match(/note\s*\(\s*["']([^"']+)["']\s*\)/);
    if (noteMatch) {
      const notes = this.parseSequence(noteMatch[1]);
      notes.forEach((note, i) => {
        if (note !== '~') {
          events.push({
            type: 'note',
            note: this.noteToMidi(note),
            time: i / notes.length,
            duration: 1 / notes.length,
          });
        }
      });
    }

    return { events, duration: 1 }; // duration in cycles
  }

  /**
   * Parse a space-separated sequence, supporting [] for subdivisions
   */
  parseSequence(str) {
    const result = [];
    let current = '';
    let depth = 0;

    for (const char of str) {
      if (char === '[') {
        depth++;
        if (depth === 1 && current.trim()) {
          result.push(current.trim());
          current = '';
        }
        current += char;
      } else if (char === ']') {
        current += char;
        depth--;
        if (depth === 0) {
          // Parse subdivision
          const inner = current.slice(1, -1);
          const subdivs = this.parseSequence(inner);
          result.push(...subdivs);
          current = '';
        }
      } else if (char === ' ' && depth === 0) {
        if (current.trim()) {
          result.push(current.trim());
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      result.push(current.trim());
    }

    return result;
  }

  /**
   * Convert note name to MIDI number
   */
  noteToMidi(note) {
    const noteMap = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
    const match = note.toLowerCase().match(/^([a-g])([#b]?)(\d)?$/);

    if (!match) return 60; // Default to middle C

    let midi = noteMap[match[1]];
    if (match[2] === '#') midi++;
    if (match[2] === 'b') midi--;

    const octave = match[3] ? parseInt(match[3]) : 4;
    return midi + (octave + 1) * 12;
  }

  /**
   * Get triggers for a specific beat position
   */
  getTriggersAtBeat(voiceId, beat, beatsPerCycle = 4) {
    const pattern = this.patterns.get(voiceId);
    if (!pattern || !pattern.compiled) return [];

    const cyclePosition = (beat % beatsPerCycle) / beatsPerCycle;
    const triggers = [];

    for (const event of pattern.compiled.events) {
      // Check if this event should trigger at this position
      const eventStart = event.time;
      const eventEnd = event.time + event.duration;

      // Simple check: does this beat fall within the event?
      if (Math.abs(cyclePosition - eventStart) < 0.01) {
        triggers.push(event);
      }
    }

    return triggers;
  }
}

// Singleton pattern engine
const patternEngine = new PatternEngine();

// === Code Editor View ===

/**
 * Simple syntax highlighter for pattern code
 * (Fallback when CodeMirror fails to load)
 */
function highlightCode(code) {
  return code
    .replace(/\b(s|note|stack|sequence|gain|speed|room|lpf|hpf|delay)\b/g, '<span class="cm-function">$1</span>')
    .replace(/"([^"]*)"/g, '<span class="cm-string">"$1"</span>')
    .replace(/'([^']*)'/g, '<span class="cm-string">\'$1\'</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="cm-number">$1</span>')
    .replace(/\/\/.*$/gm, '<span class="cm-comment">$&</span>')
    .replace(/\/\*[\s\S]*?\*\//g, '<span class="cm-comment">$&</span>');
}

/**
 * Create the Code Editor view
 */
export function createCodeEditorView(container) {
  // State
  let currentVoiceId = null;
  let editor = null;
  let editorElement = null;
  let isEditorReady = false;

  // === DOM Setup ===

  container.innerHTML = `
    <div class="code-editor-view">
      <div class="code-editor-header">
        <div class="code-header-left">
          <span class="code-voice-label">Code:</span>
          <span class="code-voice-name" id="code-voice-name">No voice selected</span>
        </div>
        <div class="code-header-right">
          <button class="btn btn-sm" id="btn-eval" title="Evaluate pattern (Ctrl+Enter)">
            <span class="btn-icon">▶</span> Eval
          </button>
          <button class="btn btn-sm btn-ghost" id="btn-docs" title="Open documentation">
            <span class="btn-icon">?</span> Docs
          </button>
        </div>
      </div>

      <div class="code-editor-main">
        <div class="code-editor-split">
          <div class="code-editor-left">
            <div class="code-editor-container">
              <div class="code-line-numbers" id="code-line-numbers">1</div>
              <div class="code-editor-wrapper" id="code-editor-wrapper">
                <textarea id="code-textarea" class="code-textarea" spellcheck="false" placeholder="// Write your pattern here...
// Example:
s(&quot;bd sd [hh hh] sd&quot;)
  .gain(0.8)"></textarea>
              </div>
            </div>

            <div class="code-output-panel">
              <div class="code-output-header">
                <span class="output-label">Output</span>
                <span class="output-status" id="code-status"></span>
              </div>
              <div class="code-output" id="code-output">
                <span class="output-hint">Press Eval or Ctrl+Enter to run pattern</span>
              </div>
            </div>
          </div>

          <div class="code-editor-right">
            <div class="sample-panel">
              <div class="sample-panel-header">
                <span class="sample-panel-title">Sample</span>
                <button class="btn btn-sm btn-ghost" id="btn-load-sample" title="Load audio file">
                  <span class="btn-icon">+</span> Load
                </button>
              </div>
              <div class="sample-panel-content" id="sample-content">
                <div class="sample-empty">
                  <p>No sample loaded</p>
                  <span class="hint">Click "Load" to add audio</span>
                </div>
              </div>
              <div class="sample-waveform-container hidden" id="sample-waveform-container">
                <canvas id="sample-waveform" class="sample-waveform"></canvas>
                <div class="sample-info" id="sample-info">
                  <span class="sample-filename" id="sample-filename">--</span>
                  <span class="sample-duration" id="sample-duration">0:00</span>
                </div>
                <div class="sample-controls">
                  <button class="btn-icon-sm" id="btn-sample-play" title="Play sample">▶</button>
                  <button class="btn-icon-sm" id="btn-sample-stop" title="Stop">■</button>
                  <button class="btn-icon-sm" id="btn-sample-remove" title="Remove sample">✕</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="code-editor-footer">
        <div class="code-examples">
          <span class="examples-label">Examples:</span>
          <button class="btn-link" data-example="drums">Drums</button>
          <button class="btn-link" data-example="bass">Bass</button>
          <button class="btn-link" data-example="melody">Melody</button>
          <button class="btn-link" data-example="chord">Chords</button>
        </div>
        <div class="code-info">
          <span class="shortcut-hint">Ctrl+Enter to eval</span>
        </div>
      </div>
    </div>
  `;

  // Get DOM elements
  const elements = {
    voiceName: container.querySelector('#code-voice-name'),
    btnEval: container.querySelector('#btn-eval'),
    btnDocs: container.querySelector('#btn-docs'),
    textarea: container.querySelector('#code-textarea'),
    lineNumbers: container.querySelector('#code-line-numbers'),
    output: container.querySelector('#code-output'),
    status: container.querySelector('#code-status'),
    exampleBtns: container.querySelectorAll('[data-example]'),
    // Sample elements
    btnLoadSample: container.querySelector('#btn-load-sample'),
    sampleContent: container.querySelector('#sample-content'),
    sampleWaveformContainer: container.querySelector('#sample-waveform-container'),
    sampleWaveform: container.querySelector('#sample-waveform'),
    sampleFilename: container.querySelector('#sample-filename'),
    sampleDuration: container.querySelector('#sample-duration'),
    btnSamplePlay: container.querySelector('#btn-sample-play'),
    btnSampleStop: container.querySelector('#btn-sample-stop'),
    btnSampleRemove: container.querySelector('#btn-sample-remove'),
  };

  // Sample state
  let currentSampleId = null;
  let samplePlayer = null;
  let sampleFileInput = null;

  // === Example Patterns ===

  const examples = {
    drums: `// Drum pattern
s("bd sd [hh hh] sd")
  .gain(0.8)
  .speed(1)`,

    bass: `// Bass line
note("c2 ~ e2 ~ g2 ~ e2 ~")
  .gain(0.7)
  .lpf(400)`,

    melody: `// Simple melody
note("c4 e4 g4 e4 c5 g4 e4 c4")
  .gain(0.6)
  .speed("<1 1.5 2>")`,

    chord: `// Chord progression
stack(
  note("c3 f3 g3 c3"),
  note("e3 a3 b3 e3"),
  note("g3 c4 d4 g3")
).gain(0.5)`,
  };

  // === Editor Functions ===

  /**
   * Initialize simple textarea editor
   */
  function initSimpleEditor() {
    const textarea = elements.textarea;

    // Update line numbers on input
    textarea.addEventListener('input', () => {
      updateLineNumbers();
      saveCodeToVoice();
    });

    // Handle tab key
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        updateLineNumbers();
      }

      // Ctrl+Enter to eval
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        evaluatePattern();
      }
    });

    // Sync scroll with line numbers
    textarea.addEventListener('scroll', () => {
      elements.lineNumbers.scrollTop = textarea.scrollTop;
    });

    updateLineNumbers();
    isEditorReady = true;
  }

  /**
   * Update line numbers
   */
  function updateLineNumbers() {
    const lines = elements.textarea.value.split('\n').length;
    elements.lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
  }

  /**
   * Get editor value
   */
  function getValue() {
    return elements.textarea.value;
  }

  /**
   * Set editor value
   */
  function setValue(code) {
    elements.textarea.value = code;
    updateLineNumbers();
  }

  /**
   * Evaluate the current pattern
   */
  function evaluatePattern() {
    const code = getValue();

    if (!code.trim()) {
      showOutput('Empty pattern', 'warning');
      return;
    }

    if (!currentVoiceId) {
      showOutput('No voice selected. Select a voice first.', 'error');
      return;
    }

    // Parse and evaluate
    const result = patternEngine.evaluate(code, currentVoiceId);

    if (result.success) {
      showOutput(`Pattern valid - ${result.pattern.compiled.events.length} events per cycle`, 'success');
      setStatus('valid');

      // Update voice with pattern code
      state.updateVoice(currentVoiceId, {
        patternCode: code,
        sourceType: 'pattern',
      });

      // Emit event for scheduler to pick up
      eventBus.emit('pattern:update', {
        voiceId: currentVoiceId,
        pattern: result.pattern,
      });

      eventBus.emit(Events.TOAST_SHOW, {
        message: 'Pattern evaluated',
        type: 'success',
      });
    } else {
      const errorMsg = result.errors.map(e => `Line ${e.line}: ${e.message}`).join('\n');
      showOutput(errorMsg, 'error');
      setStatus('error');
    }
  }

  /**
   * Show output message
   */
  function showOutput(message, type = 'info') {
    elements.output.innerHTML = `<span class="output-${type}">${message}</span>`;
  }

  /**
   * Set status indicator
   */
  function setStatus(status) {
    elements.status.className = 'output-status status-' + status;
    elements.status.textContent = status === 'valid' ? '✓' : status === 'error' ? '✗' : '';
  }

  /**
   * Save current code to voice state
   */
  function saveCodeToVoice() {
    if (currentVoiceId) {
      state.updateVoice(currentVoiceId, {
        patternCode: getValue(),
      });
    }
  }

  /**
   * Load code from voice state
   */
  function loadCodeFromVoice(voiceId) {
    const voice = state.getVoice(voiceId);
    if (voice) {
      currentVoiceId = voiceId;
      elements.voiceName.textContent = voice.name;
      setValue(voice.patternCode || getDefaultPattern(voice));
      showOutput('Ready', 'info');
      setStatus('');
    }
  }

  /**
   * Get default pattern for a voice based on its type
   */
  function getDefaultPattern(voice) {
    if (voice.name.toLowerCase().includes('drum') || voice.name.toLowerCase().includes('kick')) {
      return examples.drums;
    }
    if (voice.name.toLowerCase().includes('bass')) {
      return examples.bass;
    }
    return `// Pattern for ${voice.name}
note("c4 e4 g4 c5")
  .gain(0.6)`;
  }

  // === Sample Functions ===

  /**
   * Initialize sample file input
   */
  function initSampleUploader() {
    sampleFileInput = createSampleUploader(handleSampleLoaded);
  }

  /**
   * Handle loaded sample
   */
  function handleSampleLoaded(sampleData) {
    currentSampleId = sampleData.id;

    // Update voice with sample data
    if (currentVoiceId) {
      state.updateVoice(currentVoiceId, {
        sampleData: sampleData,
        sourceType: 'sample',
      });
    }

    // Show waveform
    showSampleWaveform(sampleData);

    eventBus.emit(Events.TOAST_SHOW, {
      message: `Loaded: ${sampleData.filename}`,
      type: 'success',
    });
  }

  /**
   * Show sample waveform
   */
  function showSampleWaveform(sampleData) {
    // Hide empty state
    elements.sampleContent.classList.add('hidden');
    elements.sampleWaveformContainer.classList.remove('hidden');

    // Update info
    elements.sampleFilename.textContent = sampleData.filename;
    elements.sampleDuration.textContent = sampleManager.formatDuration(sampleData.duration);

    // Render waveform
    const canvas = elements.sampleWaveform;
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;

    const waveformData = sampleManager.getWaveformData(sampleData.id, Math.floor(canvas.width / 2));
    if (waveformData) {
      renderWaveform(canvas, waveformData, {
        color: 'var(--color-primary, #4a9eff)',
        lineWidth: window.devicePixelRatio,
      });
    }
  }

  /**
   * Hide sample waveform
   */
  function hideSampleWaveform() {
    elements.sampleContent.classList.remove('hidden');
    elements.sampleWaveformContainer.classList.add('hidden');
    currentSampleId = null;
  }

  /**
   * Play current sample
   */
  function playSample() {
    if (!currentSampleId) return;

    // Stop existing
    if (samplePlayer) {
      samplePlayer.stop();
    }

    samplePlayer = new SamplePlayer(currentSampleId);
    samplePlayer.play();

    elements.btnSamplePlay.textContent = '⏸';
  }

  /**
   * Stop sample playback
   */
  function stopSample() {
    if (samplePlayer) {
      samplePlayer.stop();
      samplePlayer = null;
    }
    elements.btnSamplePlay.textContent = '▶';
  }

  /**
   * Remove current sample
   */
  function removeSample() {
    if (currentSampleId) {
      sampleManager.removeSample(currentSampleId);

      if (currentVoiceId) {
        state.updateVoice(currentVoiceId, {
          sampleData: null,
          sourceType: 'synth',
        });
      }

      hideSampleWaveform();
      stopSample();

      eventBus.emit(Events.TOAST_SHOW, {
        message: 'Sample removed',
        type: 'info',
      });
    }
  }

  /**
   * Load sample from voice
   */
  function loadSampleFromVoice(voiceId) {
    const voice = state.getVoice(voiceId);
    if (voice && voice.sampleData) {
      currentSampleId = voice.sampleData.id;

      // Restore from project if needed
      if (!sampleManager.getBuffer(currentSampleId)) {
        sampleManager.loadFromBase64(voice.sampleData).then(() => {
          showSampleWaveform(voice.sampleData);
        });
      } else {
        showSampleWaveform(voice.sampleData);
      }
    } else {
      hideSampleWaveform();
    }
  }

  // === Event Listeners ===

  // Eval button
  elements.btnEval.addEventListener('click', evaluatePattern);

  // Docs button
  elements.btnDocs.addEventListener('click', () => {
    eventBus.emit(Events.TOAST_SHOW, {
      message: 'Documentation coming soon',
      type: 'info',
    });
  });

  // Example buttons
  elements.exampleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const example = btn.dataset.example;
      if (examples[example]) {
        setValue(examples[example]);
        eventBus.emit(Events.TOAST_SHOW, {
          message: `Loaded ${example} example`,
          type: 'info',
        });
      }
    });
  });

  // Sample controls
  elements.btnLoadSample?.addEventListener('click', () => {
    sampleFileInput?.click();
  });

  elements.btnSamplePlay?.addEventListener('click', () => {
    if (samplePlayer?.isPlaying) {
      stopSample();
    } else {
      playSample();
    }
  });

  elements.btnSampleStop?.addEventListener('click', stopSample);
  elements.btnSampleRemove?.addEventListener('click', removeSample);

  // Voice selection
  eventBus.on(Events.VOICE_SELECT, (voiceId) => {
    loadCodeFromVoice(voiceId);
    loadSampleFromVoice(voiceId);
  });

  // Voice update (might need to refresh)
  eventBus.on(Events.VOICE_UPDATE, () => {
    if (currentVoiceId) {
      const voice = state.getVoice(currentVoiceId);
      if (voice) {
        elements.voiceName.textContent = voice.name;
      }
    }
  });

  // Project load - reload voice code and samples
  eventBus.on(Events.PROJECT_LOAD, () => {
    const selectedId = state.get('selectedVoiceId');
    if (selectedId) {
      loadCodeFromVoice(selectedId);
      loadSampleFromVoice(selectedId);
    } else {
      currentVoiceId = null;
      elements.voiceName.textContent = 'No voice selected';
      setValue('');
      hideSampleWaveform();
    }
  });

  // === Initialization ===

  initSimpleEditor();
  initSampleUploader();

  // Load initial voice if selected
  const selectedId = state.get('selectedVoiceId');
  if (selectedId) {
    loadCodeFromVoice(selectedId);
    loadSampleFromVoice(selectedId);
  }

  // === Public API ===

  return {
    /**
     * Get current pattern code
     */
    getCode() {
      return getValue();
    },

    /**
     * Set pattern code
     */
    setCode(code) {
      setValue(code);
    },

    /**
     * Evaluate current pattern
     */
    evaluate() {
      evaluatePattern();
    },

    /**
     * Get pattern engine
     */
    getPatternEngine() {
      return patternEngine;
    },

    /**
     * Load voice into editor
     */
    loadVoice(voiceId) {
      loadCodeFromVoice(voiceId);
    },

    /**
     * Cleanup
     */
    destroy() {
      // Remove event listeners if needed
    },
  };
}

// Export pattern engine for use by scheduler
export { patternEngine };
