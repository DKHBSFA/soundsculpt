/**
 * Patch Runtime - Maps visual patch nodes to Web Audio API
 *
 * This module takes a patch definition (nodes + connections) and creates
 * a corresponding Web Audio graph that can be played.
 */

import { audioContext } from './context-manager.js';
import { mixer } from './mixer.js';

/**
 * PatchRuntime class - manages a single patch's audio graph
 */
export class PatchRuntime {
  constructor(voiceId) {
    this.voiceId = voiceId;
    this.audioNodes = new Map(); // nodeId -> Web Audio node(s)
    this.controlNodes = new Map(); // nodeId -> control value/emitter
    this.isRunning = false;
    this.outputNode = null;
  }

  /**
   * Build the audio graph from patch definition
   */
  build(patchData) {
    this.dispose();

    if (!patchData || !patchData.nodes || patchData.nodes.length === 0) {
      return;
    }

    const ctx = audioContext.getContext();
    if (!ctx) return;

    // Create audio nodes
    for (const node of patchData.nodes) {
      this.createAudioNode(ctx, node);
    }

    // Create connections
    for (const conn of patchData.connections) {
      this.createConnection(conn);
    }

    // Connect dac~ nodes to mixer
    this.connectToMixer();
  }

  /**
   * Create a Web Audio node for a patch node
   */
  createAudioNode(ctx, node) {
    let audioNode = null;

    switch (node.type) {
      case 'osc~': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Set oscillator type
        const oscType = node.params.type || 'sine';
        osc.type = oscType;

        // Set frequency from inlet value
        const freqInlet = node.inlets.find(i => i.name === 'freq');
        osc.frequency.value = freqInlet?.value ?? 440;

        osc.connect(gain);

        audioNode = {
          node: gain,
          oscillator: osc,
          params: {
            freq: osc.frequency,
          },
        };
        break;
      }

      case 'noise~': {
        // Create noise generator using ScriptProcessorNode or AudioWorklet
        const bufferSize = 4096;
        const noiseNode = ctx.createScriptProcessor(bufferSize, 0, 1);
        const noiseType = node.params.type || 'white';

        let lastOut = 0;

        noiseNode.onaudioprocess = (e) => {
          const output = e.outputBuffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            if (noiseType === 'white') {
              output[i] = Math.random() * 2 - 1;
            } else if (noiseType === 'pink') {
              // Pink noise approximation
              const white = Math.random() * 2 - 1;
              output[i] = (lastOut + (0.02 * white)) / 1.02;
              lastOut = output[i];
              output[i] *= 3.5; // Compensate for volume
            } else if (noiseType === 'brown') {
              // Brown noise
              const white = Math.random() * 2 - 1;
              output[i] = (lastOut + (0.02 * white)) / 1.02;
              lastOut = output[i];
              output[i] *= 3.5;
            }
          }
        };

        audioNode = { node: noiseNode };
        break;
      }

      case 'phasor~': {
        // Phasor is a sawtooth oscillator normalized to 0-1
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';

        const freqInlet = node.inlets.find(i => i.name === 'freq');
        osc.frequency.value = freqInlet?.value ?? 1;

        // Normalize to 0-1 using gain and offset
        const gain = ctx.createGain();
        gain.gain.value = 0.5;

        const offset = ctx.createConstantSource();
        offset.offset.value = 0.5;

        const merger = ctx.createGain();

        osc.connect(gain);
        gain.connect(merger);
        offset.connect(merger);

        audioNode = {
          node: merger,
          oscillator: osc,
          offsetSource: offset,
          params: {
            freq: osc.frequency,
          },
        };
        break;
      }

      case 'lop~':
      case 'hip~':
      case 'bp~': {
        const filter = ctx.createBiquadFilter();

        if (node.type === 'lop~') {
          filter.type = 'lowpass';
        } else if (node.type === 'hip~') {
          filter.type = 'highpass';
        } else {
          filter.type = 'bandpass';
        }

        const freqInlet = node.inlets.find(i => i.name === 'cutoff' || i.name === 'center');
        filter.frequency.value = freqInlet?.value ?? 1000;

        if (node.type === 'bp~') {
          const qInlet = node.inlets.find(i => i.name === 'Q');
          filter.Q.value = qInlet?.value ?? 1;
        }

        audioNode = {
          node: filter,
          params: {
            freq: filter.frequency,
            q: filter.Q,
          },
        };
        break;
      }

      case '*~': {
        const gain = ctx.createGain();
        const multInlet = node.inlets.find(i => i.name === 'mult');
        gain.gain.value = multInlet?.value ?? 1;

        audioNode = {
          node: gain,
          params: {
            mult: gain.gain,
          },
        };
        break;
      }

      case '+~': {
        // Addition: just use a gain node as mixer
        const gain = ctx.createGain();
        gain.gain.value = 1;

        audioNode = { node: gain };
        break;
      }

      case 'adsr~': {
        // ADSR envelope - implemented as a gain node with scheduled changes
        const gain = ctx.createGain();
        gain.gain.value = 0;

        audioNode = {
          node: gain,
          params: {
            gate: gain.gain,
          },
          envelope: {
            attack: node.params.attack ?? 0.01,
            decay: node.params.decay ?? 0.1,
            sustain: node.params.sustain ?? 0.7,
            release: node.params.release ?? 0.3,
          },
          // Method to trigger envelope
          trigger: (time) => {
            const { attack, decay, sustain, release } = audioNode.envelope;
            gain.gain.cancelScheduledValues(time);
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(1, time + attack);
            gain.gain.linearRampToValueAtTime(sustain, time + attack + decay);
          },
          release: (time) => {
            const { release } = audioNode.envelope;
            gain.gain.cancelScheduledValues(time);
            gain.gain.setValueAtTime(gain.gain.value, time);
            gain.gain.linearRampToValueAtTime(0, time + release);
          },
        };
        break;
      }

      case 'line~': {
        const source = ctx.createConstantSource();
        const targetInlet = node.inlets.find(i => i.name === 'target');
        source.offset.value = targetInlet?.value ?? 0;

        audioNode = {
          node: source,
          params: {
            target: source.offset,
          },
          rampTime: node.params.time ?? 0.1,
          // Method to ramp to target
          rampTo: (value, time) => {
            source.offset.cancelScheduledValues(time);
            source.offset.setValueAtTime(source.offset.value, time);
            source.offset.linearRampToValueAtTime(value, time + audioNode.rampTime);
          },
        };
        break;
      }

      case 'delay~': {
        const delay = ctx.createDelay(node.params.maxTime ?? 2);
        const timeInlet = node.inlets.find(i => i.name === 'time');
        delay.delayTime.value = timeInlet?.value ?? 0.5;

        audioNode = {
          node: delay,
          params: {
            time: delay.delayTime,
          },
        };
        break;
      }

      case 'dac~': {
        // Output node - will be connected to mixer
        const gain = ctx.createGain();
        gain.gain.value = 1;

        audioNode = {
          node: gain,
          isOutput: true,
        };
        break;
      }

      case 'adc~': {
        // Input from microphone - needs getUserMedia
        // For now, create a dummy silent node
        const gain = ctx.createGain();
        gain.gain.value = 0;

        audioNode = {
          node: gain,
          isInput: true,
        };

        // Request microphone access async
        this.setupMicrophoneInput(ctx, audioNode);
        break;
      }

      case 'number':
      case 'slider': {
        // Control nodes - not audio, just value emitters
        const value = node.params.value ?? 0;

        audioNode = {
          isControl: true,
          value,
          min: node.params.min ?? 0,
          max: node.params.max ?? 1,
          subscribers: [],
          setValue: (v) => {
            audioNode.value = v;
            audioNode.subscribers.forEach(fn => fn(v));
          },
        };
        break;
      }

      default:
        console.warn(`Unknown patch node type: ${node.type}`);
        return;
    }

    if (audioNode) {
      this.audioNodes.set(node.id, audioNode);
    }
  }

  /**
   * Create a connection between two nodes
   */
  createConnection(conn) {
    const fromAudioNode = this.audioNodes.get(conn.from.nodeId);
    const toAudioNode = this.audioNodes.get(conn.to.nodeId);

    if (!fromAudioNode || !toAudioNode) {
      return;
    }

    // Handle control connections
    if (fromAudioNode.isControl) {
      // Find the target param
      const paramKey = this.getParamKey(conn.to.portId, toAudioNode);
      if (paramKey && toAudioNode.params?.[paramKey]) {
        // Subscribe to value changes
        fromAudioNode.subscribers.push((value) => {
          if (toAudioNode.params[paramKey] instanceof AudioParam) {
            toAudioNode.params[paramKey].value = value;
          }
        });
        // Set initial value
        if (toAudioNode.params[paramKey] instanceof AudioParam) {
          toAudioNode.params[paramKey].value = fromAudioNode.value;
        }
      }
      return;
    }

    // Audio connection
    if (fromAudioNode.node && toAudioNode.node) {
      try {
        fromAudioNode.node.connect(toAudioNode.node);
      } catch (e) {
        console.warn('Failed to connect audio nodes:', e);
      }
    }
  }

  /**
   * Get parameter key from port ID
   */
  getParamKey(portId, audioNode) {
    if (!audioNode.params) return null;

    // Port IDs often contain the param name
    for (const key of Object.keys(audioNode.params)) {
      if (portId.includes(key)) {
        return key;
      }
    }

    return null;
  }

  /**
   * Connect output nodes (dac~) to the mixer
   */
  connectToMixer() {
    const voiceInput = mixer.getVoiceInput(this.voiceId);
    if (!voiceInput) return;

    for (const [nodeId, audioNode] of this.audioNodes) {
      if (audioNode.isOutput) {
        audioNode.node.connect(voiceInput);
        this.outputNode = audioNode.node;
      }
    }
  }

  /**
   * Setup microphone input for adc~ nodes
   */
  async setupMicrophoneInput(ctx, audioNode) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = ctx.createMediaStreamSource(stream);

      // Replace the dummy node
      audioNode.node = source;
      audioNode.stream = stream;
    } catch (e) {
      console.warn('Could not access microphone:', e);
    }
  }

  /**
   * Start all oscillators and sources
   */
  start(time) {
    if (this.isRunning) return;

    const ctx = audioContext.getContext();
    const startTime = time ?? ctx?.currentTime ?? 0;

    for (const [nodeId, audioNode] of this.audioNodes) {
      // Start oscillators
      if (audioNode.oscillator) {
        try {
          audioNode.oscillator.start(startTime);
        } catch (e) {
          // Already started
        }
      }

      // Start constant sources
      if (audioNode.offsetSource) {
        try {
          audioNode.offsetSource.start(startTime);
        } catch (e) {
          // Already started
        }
      }

      if (audioNode.node instanceof ConstantSourceNode) {
        try {
          audioNode.node.start(startTime);
        } catch (e) {
          // Already started
        }
      }
    }

    this.isRunning = true;
  }

  /**
   * Stop all oscillators and sources
   */
  stop(time) {
    if (!this.isRunning) return;

    const ctx = audioContext.getContext();
    const stopTime = time ?? ctx?.currentTime ?? 0;

    for (const [nodeId, audioNode] of this.audioNodes) {
      if (audioNode.oscillator) {
        try {
          audioNode.oscillator.stop(stopTime);
        } catch (e) {
          // Already stopped
        }
      }

      if (audioNode.offsetSource) {
        try {
          audioNode.offsetSource.stop(stopTime);
        } catch (e) {
          // Already stopped
        }
      }
    }

    this.isRunning = false;
  }

  /**
   * Trigger a note (for ADSR envelopes)
   */
  triggerNote(time) {
    for (const [nodeId, audioNode] of this.audioNodes) {
      if (audioNode.trigger) {
        audioNode.trigger(time);
      }
    }
  }

  /**
   * Release a note (for ADSR envelopes)
   */
  releaseNote(time) {
    for (const [nodeId, audioNode] of this.audioNodes) {
      if (audioNode.release) {
        audioNode.release(time);
      }
    }
  }

  /**
   * Set a control value
   */
  setControl(nodeId, value) {
    const audioNode = this.audioNodes.get(nodeId);
    if (audioNode?.setValue) {
      audioNode.setValue(value);
    }
  }

  /**
   * Dispose of all audio nodes
   */
  dispose() {
    this.stop();

    for (const [nodeId, audioNode] of this.audioNodes) {
      try {
        // Disconnect node
        if (audioNode.node) {
          audioNode.node.disconnect();
        }

        // Stop and disconnect oscillator
        if (audioNode.oscillator) {
          audioNode.oscillator.disconnect();
        }

        // Stop media streams
        if (audioNode.stream) {
          audioNode.stream.getTracks().forEach(track => track.stop());
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
    }

    this.audioNodes.clear();
    this.controlNodes.clear();
    this.outputNode = null;
    this.isRunning = false;
  }
}

/**
 * PatchManager - manages patch runtimes for all voices
 */
class PatchManager {
  constructor() {
    this.runtimes = new Map(); // voiceId -> PatchRuntime
  }

  /**
   * Get or create a runtime for a voice
   */
  getRuntime(voiceId) {
    if (!this.runtimes.has(voiceId)) {
      this.runtimes.set(voiceId, new PatchRuntime(voiceId));
    }
    return this.runtimes.get(voiceId);
  }

  /**
   * Build patch for a voice
   */
  buildPatch(voiceId, patchData) {
    const runtime = this.getRuntime(voiceId);
    runtime.build(patchData);
    return runtime;
  }

  /**
   * Start a voice's patch
   */
  startPatch(voiceId, time) {
    const runtime = this.runtimes.get(voiceId);
    if (runtime) {
      runtime.start(time);
    }
  }

  /**
   * Stop a voice's patch
   */
  stopPatch(voiceId, time) {
    const runtime = this.runtimes.get(voiceId);
    if (runtime) {
      runtime.stop(time);
    }
  }

  /**
   * Dispose of a voice's patch
   */
  disposePatch(voiceId) {
    const runtime = this.runtimes.get(voiceId);
    if (runtime) {
      runtime.dispose();
      this.runtimes.delete(voiceId);
    }
  }

  /**
   * Dispose of all patches
   */
  disposeAll() {
    for (const [voiceId, runtime] of this.runtimes) {
      runtime.dispose();
    }
    this.runtimes.clear();
  }
}

// Singleton instance
export const patchManager = new PatchManager();
