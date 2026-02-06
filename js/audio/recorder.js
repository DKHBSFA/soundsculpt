/**
 * Audio Recorder - Microphone recording with MediaRecorder API
 *
 * Features:
 * - Microphone input capture
 * - Input monitoring (with optional latency compensation)
 * - Punch-in/punch-out recording
 * - Count-in support
 * - Record to voice as sample
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';
import { audioContext } from './context-manager.js';
import { mixer } from './mixer.js';

/**
 * Audio Recorder Manager
 */
class AudioRecorder {
  constructor() {
    this.stream = null;          // MediaStream from microphone
    this.mediaRecorder = null;   // MediaRecorder instance
    this.chunks = [];            // Recorded audio chunks
    this.isRecording = false;
    this.isPaused = false;

    // Web Audio nodes for monitoring
    this.inputNode = null;       // MediaStreamSourceNode
    this.inputGain = null;       // Gain for input level
    this.monitorGain = null;     // Gain for monitoring (can be 0)
    this.analyser = null;        // For input metering
    this.analyserData = null;

    // Recording state
    this.recordingVoiceId = null;
    this.recordingStartBeat = 0;
    this.recordingStartTime = 0;

    // Device info
    this.devices = [];
    this.selectedDeviceId = null;

    // Monitoring state per voice
    this.monitoringVoices = new Set();

    this.setupEventListeners();
  }

  /**
   * Setup event bus listeners
   */
  setupEventListeners() {
    eventBus.on(Events.TRANSPORT_PLAY, () => this.onTransportPlay());
    eventBus.on(Events.TRANSPORT_STOP, () => this.onTransportStop());
    eventBus.on(Events.INPUT_MONITOR_TOGGLE, ({ voiceId, monitoring }) => {
      this.setMonitoring(voiceId, monitoring);
    });
    eventBus.on(Events.PLAYHEAD_UPDATE, (beat) => this.onPlayheadUpdate(beat));
  }

  /**
   * Get available audio input devices
   */
  async getInputDevices() {
    try {
      // Need to request permission first to see device labels
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices.filter(d => d.kind === 'audioinput');
      return this.devices;
    } catch (error) {
      console.error('Failed to get input devices:', error);
      return [];
    }
  }

  /**
   * Request microphone permission and setup input stream
   */
  async requestMicrophoneAccess(deviceId = null) {
    try {
      const constraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      };

      if (deviceId) {
        constraints.audio.deviceId = { exact: deviceId };
      }

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.selectedDeviceId = deviceId;

      // Setup Web Audio nodes for monitoring
      await this.setupAudioNodes();

      state.setInputDevice(deviceId);
      return true;
    } catch (error) {
      console.error('Microphone access denied:', error);
      return false;
    }
  }

  /**
   * Setup Web Audio nodes for input monitoring and analysis
   */
  async setupAudioNodes() {
    const ctx = audioContext.getContext();
    if (!ctx || !this.stream) return;

    // Create source node from stream
    this.inputNode = ctx.createMediaStreamSource(this.stream);

    // Create gain nodes
    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = state.get('recording.inputGain') || 1;

    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = 0; // Start with monitoring off

    // Create analyser for input metering
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.3;
    this.analyserData = new Float32Array(this.analyser.frequencyBinCount);

    // Connect: input -> inputGain -> analyser
    //                            -> monitorGain -> destination
    this.inputNode.connect(this.inputGain);
    this.inputGain.connect(this.analyser);
    this.inputGain.connect(this.monitorGain);

    // Monitor goes to master output
    if (mixer.isInitialized && mixer.masterInput) {
      this.monitorGain.connect(mixer.masterInput);
    }
  }

  /**
   * Set input gain (0-2)
   */
  setInputGain(gain) {
    if (this.inputGain) {
      const ctx = audioContext.getContext();
      this.inputGain.gain.setTargetAtTime(gain, ctx.currentTime, 0.02);
    }
    state.setInputGain(gain);
  }

  /**
   * Enable/disable monitoring for a voice
   */
  setMonitoring(voiceId, enabled) {
    if (enabled) {
      this.monitoringVoices.add(voiceId);
    } else {
      this.monitoringVoices.delete(voiceId);
    }

    // Update monitor gain based on whether any voice is monitoring
    this.updateMonitorGain();
  }

  /**
   * Update monitor gain based on monitoring state
   */
  updateMonitorGain() {
    if (!this.monitorGain) return;

    const ctx = audioContext.getContext();
    const shouldMonitor = this.monitoringVoices.size > 0;

    // Add small delay for latency compensation
    const latencyMs = state.get('recording.latencyMs') || 0;
    const latencySec = latencyMs / 1000;

    this.monitorGain.gain.setTargetAtTime(
      shouldMonitor ? 1 : 0,
      ctx.currentTime + latencySec,
      0.01
    );
  }

  /**
   * Get current input level in dB
   */
  getInputLevel() {
    if (!this.analyser || !this.analyserData) return -Infinity;

    this.analyser.getFloatTimeDomainData(this.analyserData);
    let sum = 0;
    for (let i = 0; i < this.analyserData.length; i++) {
      sum += this.analyserData[i] ** 2;
    }
    const rms = Math.sqrt(sum / this.analyserData.length);
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  }

  /**
   * Handle transport play - start recording if armed
   */
  onTransportPlay() {
    const armedVoices = state.getArmedVoices();
    if (armedVoices.length === 0) return;

    const transport = state.get('transport');

    // Check for count-in
    if (transport.countIn > 0) {
      this.startCountIn(transport.countIn, () => {
        this.startRecording(armedVoices[0].id);
      });
    } else {
      this.startRecording(armedVoices[0].id);
    }
  }

  /**
   * Handle transport stop - stop recording
   */
  onTransportStop() {
    if (this.isRecording) {
      this.stopRecording();
    }
  }

  /**
   * Handle playhead update for punch recording
   */
  onPlayheadUpdate(beat) {
    const transport = state.get('transport');

    if (!transport.punchMode) return;

    // Punch-in: start recording when we reach punchIn point
    if (transport.punchIn !== null && !this.isRecording) {
      if (beat >= transport.punchIn) {
        const armedVoices = state.getArmedVoices();
        if (armedVoices.length > 0) {
          this.startRecording(armedVoices[0].id);
        }
      }
    }

    // Punch-out: stop recording when we reach punchOut point
    if (transport.punchOut !== null && this.isRecording) {
      if (beat >= transport.punchOut) {
        this.stopRecording();
      }
    }
  }

  /**
   * Start count-in (metronome clicks before recording)
   */
  startCountIn(bars, callback) {
    const transport = state.get('transport');
    const beatsPerBar = transport.timeSignature[0];
    const totalBeats = bars * beatsPerBar;
    const msPerBeat = 60000 / transport.tempo;

    let beatCount = 0;

    const clickInterval = setInterval(() => {
      // Play click sound
      this.playClick(beatCount % beatsPerBar === 0);

      beatCount++;
      if (beatCount >= totalBeats) {
        clearInterval(clickInterval);
        callback();
      }
    }, msPerBeat);
  }

  /**
   * Play metronome click
   */
  playClick(isDownbeat) {
    const ctx = audioContext.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = isDownbeat ? 1000 : 800;

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  /**
   * Start recording to a voice
   */
  async startRecording(voiceId) {
    if (this.isRecording) return;
    if (!this.stream) {
      const success = await this.requestMicrophoneAccess();
      if (!success) return;
    }

    this.chunks = [];
    this.recordingVoiceId = voiceId;
    this.recordingStartBeat = state.get('transport.currentBeat');
    this.recordingStartTime = audioContext.getCurrentTime();

    // Create MediaRecorder
    const options = { mimeType: 'audio/webm;codecs=opus' };

    // Fallback for browsers that don't support webm
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'audio/ogg;codecs=opus';
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          delete options.mimeType; // Let browser choose
        }
      }
    }

    this.mediaRecorder = new MediaRecorder(this.stream, options);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.processRecording();
    };

    this.mediaRecorder.start(100); // Collect data every 100ms
    this.isRecording = true;

    state.setRecording(true);
    eventBus.emit(Events.RECORDING_START, { voiceId });
  }

  /**
   * Stop recording
   */
  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;

    this.mediaRecorder.stop();
    this.isRecording = false;

    state.setRecording(false);
    eventBus.emit(Events.RECORDING_STOP, { voiceId: this.recordingVoiceId });
  }

  /**
   * Process recorded audio and add to voice
   */
  async processRecording() {
    if (this.chunks.length === 0) return;

    // Create blob from chunks
    const blob = new Blob(this.chunks, { type: this.chunks[0].type || 'audio/webm' });

    // Convert to AudioBuffer for precise timing
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = audioContext.getContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    // Calculate duration in beats
    const transport = state.get('transport');
    const durationSec = audioBuffer.duration;
    const msPerBeat = 60000 / transport.tempo;
    const durationBeats = (durationSec * 1000) / msPerBeat;

    // Convert to Base64 for persistence
    const base64 = await this.audioBufferToBase64(audioBuffer);

    // Update voice with recorded sample
    const voice = state.getVoice(this.recordingVoiceId);
    if (voice) {
      state.updateVoice(this.recordingVoiceId, {
        sourceType: 'sample',
        sampleData: {
          data: base64,
          filename: `recording_${Date.now()}.wav`,
          mimeType: 'audio/wav',
          duration: durationSec,
          startBeat: this.recordingStartBeat,
          durationBeats: durationBeats,
        },
      });

      // Disarm the voice after recording
      state.disarmVoice(this.recordingVoiceId);
    }

    // Clear chunks
    this.chunks = [];
    this.recordingVoiceId = null;
  }

  /**
   * Convert AudioBuffer to Base64 WAV
   */
  async audioBufferToBase64(audioBuffer) {
    // Create WAV file
    const wav = this.encodeWAV(audioBuffer);

    // Convert to Base64
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.readAsDataURL(wav);
    });
  }

  /**
   * Encode AudioBuffer to WAV format
   */
  encodeWAV(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    // Interleave channels
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    const length = channels[0].length;
    const interleaved = new Float32Array(length * numChannels);

    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        interleaved[i * numChannels + ch] = channels[ch][i];
      }
    }

    // Create WAV buffer
    const dataLength = interleaved.length * (bitDepth / 8);
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // Write WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Write audio data
    let offset = 44;
    for (let i = 0; i < interleaved.length; i++) {
      const sample = Math.max(-1, Math.min(1, interleaved[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Set latency compensation in ms
   */
  setLatencyCompensation(ms) {
    state.setInputLatency(ms);
  }

  /**
   * Cleanup and release resources
   */
  dispose() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.inputNode) {
      this.inputNode.disconnect();
      this.inputNode = null;
    }

    if (this.inputGain) {
      this.inputGain.disconnect();
      this.inputGain = null;
    }

    if (this.monitorGain) {
      this.monitorGain.disconnect();
      this.monitorGain = null;
    }

    this.isRecording = false;
    this.chunks = [];
  }
}

// Singleton instance
export const recorder = new AudioRecorder();
