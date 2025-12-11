/**
 * AudioCaptureService.js
 * 
 * PURPOSE:
 * Orchestrates audio capture from two sources:
 * 1. Microphone - User's voice (what you say)
 * 2. System Audio - Computer output (what others say in meetings)
 * 
 * ARCHITECTURE:
 * - Actual audio capture happens in the RENDERER process (React)
 *   because desktopCapturer and getUserMedia are renderer APIs
 * - This service in the MAIN process:
 *   - Coordinates start/stop commands
 *   - Receives audio chunks from renderer via IPC
 *   - Timestamps and labels audio by source
 *   - Forwards to STT service (when implemented)
 *   - Tracks capture state
 * 
 * AUDIO FORMAT (optimized for Whisper STT):
 * - Sample Rate: 16000 Hz
 * - Channels: 1 (mono)
 * - Bit Depth: 16-bit PCM
 * 
 * DATA FLOW:
 * ┌─────────────────┐     IPC      ┌─────────────────┐
 * │   Renderer      │ ──────────►  │   Main Process  │
 * │   (Capture)     │              │   (This Service)│
 * │                 │   chunks     │                 │
 * │ - Mic audio     │ ──────────►  │ - Timestamps    │
 * │ - System audio  │              │ - Routes to STT │
 * └─────────────────┘              └─────────────────┘
 */

const { EventEmitter } = require('events');

/**
 * Audio chunk structure sent from renderer
 * @typedef {Object} AudioChunk
 * @property {'mic' | 'system'} source - Audio source identifier
 * @property {number[]} data - Float32 audio samples (-1 to 1)
 * @property {number} sampleRate - Sample rate (should be 16000)
 * @property {number} timestamp - Client timestamp when captured
 */

/**
 * Processed audio chunk with server timestamp
 * @typedef {Object} ProcessedAudioChunk
 * @property {'mic' | 'system'} source
 * @property {Buffer} pcmData - 16-bit PCM buffer
 * @property {number} sampleRate
 * @property {number} clientTimestamp - When captured in renderer
 * @property {number} serverTimestamp - When received in main process
 */

class AudioCaptureService extends EventEmitter {
  constructor() {
    super();
    
    // Capture state
    this._isMicCapturing = false;
    this._isSystemCapturing = false;
    
    // Audio level tracking (for UI visualization)
    this._micLevel = 0;
    this._systemLevel = 0;
    
    // Reference to the overlay window (set by main.js)
    this._overlayWindow = null;
    
    // Buffer for accumulating audio (for STT which needs larger chunks)
    this._micBuffer = [];
    this._systemBuffer = [];
    this._bufferDuration = 0; // ms of audio accumulated
    this._targetBufferDuration = 1000; // Send to STT every 1 second
    
    console.log('[AudioCaptureService] Initialized');
  }

  /**
   * Set the overlay window reference
   * Needed to send IPC messages to renderer
   */
  setOverlayWindow(window) {
    this._overlayWindow = window;
  }

  /**
   * Start microphone capture
   * Sends command to renderer to begin capturing
   */
  startMicCapture() {
    if (this._isMicCapturing) {
      console.log('[AudioCaptureService] Mic capture already running');
      return { success: true, alreadyRunning: true };
    }

    if (!this._overlayWindow) {
      console.error('[AudioCaptureService] No overlay window set');
      return { success: false, error: 'No window available' };
    }

    console.log('[AudioCaptureService] Starting mic capture...');
    this._overlayWindow.webContents.send('audio:start-mic');
    this._isMicCapturing = true;
    
    this.emit('mic:started');
    return { success: true };
  }

  /**
   * Stop microphone capture
   */
  stopMicCapture() {
    if (!this._isMicCapturing) {
      return { success: true, alreadyStoped: true };
    }

    if (this._overlayWindow) {
      this._overlayWindow.webContents.send('audio:stop-mic');
    }
    
    this._isMicCapturing = false;
    this._micBuffer = [];
    
    console.log('[AudioCaptureService] Mic capture stopped');
    this.emit('mic:stopped');
    return { success: true };
  }

  /**
   * Start system audio capture
   * Uses desktopCapturer in renderer
   */
  startSystemCapture() {
    if (this._isSystemCapturing) {
      console.log('[AudioCaptureService] System capture already running');
      return { success: true, alreadyRunning: true };
    }

    if (!this._overlayWindow) {
      console.error('[AudioCaptureService] No overlay window set');
      return { success: false, error: 'No window available' };
    }

    console.log('[AudioCaptureService] Starting system audio capture...');
    this._overlayWindow.webContents.send('audio:start-system');
    this._isSystemCapturing = true;
    
    this.emit('system:started');
    return { success: true };
  }

  /**
   * Stop system audio capture
   */
  stopSystemCapture() {
    if (!this._isSystemCapturing) {
      return { success: true, alreadyStopped: true };
    }

    if (this._overlayWindow) {
      this._overlayWindow.webContents.send('audio:stop-system');
    }
    
    this._isSystemCapturing = false;
    this._systemBuffer = [];
    
    console.log('[AudioCaptureService] System capture stopped');
    this.emit('system:stopped');
    return { success: true };
  }

  /**
   * Start both mic and system audio capture
   */
  startAllCapture() {
    const micResult = this.startMicCapture();
    const systemResult = this.startSystemCapture();
    return {
      mic: micResult,
      system: systemResult,
    };
  }

  /**
   * Stop all audio capture
   */
  stopAllCapture() {
    const micResult = this.stopMicCapture();
    const systemResult = this.stopSystemCapture();
    return {
      mic: micResult,
      system: systemResult,
    };
  }

  /**
   * Process incoming audio chunk from renderer
   * Called via IPC when renderer sends audio data
   * 
   * @param {AudioChunk} chunk - Audio chunk from renderer
   */
  processAudioChunk(chunk) {
    const { source, data, sampleRate, timestamp } = chunk;
    
    // Store the sample rate for duration calculations
    this._sampleRate = sampleRate || 48000;
    
    // Add server timestamp
    const serverTimestamp = Date.now();
    
    // Convert Float32 samples to 16-bit PCM
    const pcmData = this._float32ToPCM16(data);
    
    // Calculate audio levels for visualization
    const rms = this._calculateRMS(data);
    const peak = this._calculatePeak(data);
    const dB = this._rmsToDecibels(rms);
    const peakdB = this._rmsToDecibels(peak);
    
    if (source === 'mic') {
      this._micLevel = rms;
      this._micBuffer.push(pcmData);
    } else if (source === 'system') {
      this._systemLevel = rms;
      this._systemBuffer.push(pcmData);
    }
    
    // Emit level update for UI visualization (includes dB levels)
    this.emit('audio:level', { 
      source, 
      level: rms, 
      peak,
      dB, 
      peakdB,
      sampleCount: data.length,
    });
    
    // Create processed chunk
    const processedChunk = {
      source,
      pcmData,
      sampleRate: this._sampleRate,
      clientTimestamp: timestamp,
      serverTimestamp,
    };
    
    // Emit for any listeners (e.g., STT service)
    this.emit('audio:chunk', processedChunk);
    
    // Check if we should flush buffer to STT
    this._checkBufferFlush(source);
  }

  /**
   * Check if buffer should be flushed to STT service
   * Accumulates ~1 second of audio before sending
   */
  _checkBufferFlush(source) {
    const buffer = source === 'mic' ? this._micBuffer : this._systemBuffer;
    const sampleRate = this._sampleRate || 48000;
    
    // Calculate total samples in buffer
    let totalSamples = 0;
    for (const chunk of buffer) {
      totalSamples += chunk.length / 2; // 16-bit = 2 bytes per sample
    }
    
    // Calculate duration using actual sample rate
    const durationMs = (totalSamples / sampleRate) * 1000;
    
    if (durationMs >= this._targetBufferDuration) {
      // Concatenate all chunks
      const totalLength = buffer.reduce((sum, chunk) => sum + chunk.length, 0);
      const combined = Buffer.concat(buffer, totalLength);
      
      // Clear buffer
      if (source === 'mic') {
        this._micBuffer = [];
      } else {
        this._systemBuffer = [];
      }
      
      // Emit combined chunk for STT processing with actual sample rate
      this.emit('audio:buffer-ready', {
        source,
        pcmData: combined,
        sampleRate, // Use actual sample rate
        durationMs,
        timestamp: Date.now(),
      });
      
      console.log(`[AudioCaptureService] Buffer ready: ${source}, ${durationMs.toFixed(0)}ms, ${combined.length} bytes, ${sampleRate}Hz`);
    }
  }

  /**
   * Convert Float32 audio samples to 16-bit PCM
   * Whisper and most STT engines expect 16-bit PCM
   * 
   * @param {number[]} float32Samples - Audio samples from -1 to 1
   * @returns {Buffer} - 16-bit PCM buffer
   */
  _float32ToPCM16(float32Samples) {
    const buffer = Buffer.alloc(float32Samples.length * 2);
    
    for (let i = 0; i < float32Samples.length; i++) {
      // Clamp to -1 to 1 range
      let sample = Math.max(-1, Math.min(1, float32Samples[i]));
      // Convert to 16-bit integer (-32768 to 32767)
      sample = Math.floor(sample * 32767);
      // Write as little-endian 16-bit
      buffer.writeInt16LE(sample, i * 2);
    }
    
    return buffer;
  }

  /**
   * Calculate RMS (Root Mean Square) level of audio
   * Used for visualizing audio levels in UI
   * 
   * @param {number[]} samples - Float32 audio samples
   * @returns {number} - RMS level from 0 to 1
   */
  _calculateRMS(samples) {
    if (!samples || samples.length === 0) return 0;
    
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    
    return Math.sqrt(sum / samples.length);
  }

  /**
   * Convert RMS level to decibels (dBFS - decibels relative to full scale)
   * 0 dBFS = maximum possible level (RMS = 1.0)
   * -infinity dBFS = silence
   * 
   * @param {number} rms - RMS level from 0 to 1
   * @returns {number} - dBFS value (typically -60 to 0)
   */
  _rmsToDecibels(rms) {
    if (rms <= 0) return -60; // Floor at -60 dB
    const db = 20 * Math.log10(rms);
    return Math.max(-60, Math.min(0, db)); // Clamp between -60 and 0
  }

  /**
   * Calculate peak level from samples
   * @param {number[]} samples - Float32 audio samples
   * @returns {number} - Peak level from 0 to 1
   */
  _calculatePeak(samples) {
    if (!samples || samples.length === 0) return 0;
    
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }
    return peak;
  }

  /**
   * Get current capture state
   */
  getState() {
    return {
      isMicCapturing: this._isMicCapturing,
      isSystemCapturing: this._isSystemCapturing,
      micLevel: this._micLevel,
      systemLevel: this._systemLevel,
    };
  }

  /**
   * Check if any capture is active
   */
  isCapturing() {
    return this._isMicCapturing || this._isSystemCapturing;
  }
}

// Export singleton instance
module.exports = new AudioCaptureService();
