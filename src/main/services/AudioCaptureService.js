const { EventEmitter } = require('events');

class AudioCaptureService extends EventEmitter {
  constructor() {
    super();
    this._isMicCapturing = false;
    this._isSystemCapturing = false;
    this._micLevel = 0;
    this._systemLevel = 0;
    this._overlayWindow = null;
    this._micBuffer = [];
    this._systemBuffer = [];
    this._bufferDuration = 0;
    this._targetBufferDuration = 100;
    console.log('[AudioCaptureService] Initialized');
  }

  setOverlayWindow(window) {
    this._overlayWindow = window;
  }

  startMicCapture() {
    if (this._isMicCapturing) return { success: true, alreadyRunning: true };
    if (!this._overlayWindow) return { success: false, error: 'No window available' };

    this._overlayWindow.webContents.send('audio:start-mic');
    this._isMicCapturing = true;
    this.emit('mic:started');
    return { success: true };
  }

  stopMicCapture() {
    if (!this._isMicCapturing) return { success: true, alreadyStopped: true };

    if (this._overlayWindow) {
      this._overlayWindow.webContents.send('audio:stop-mic');
    }
    this._isMicCapturing = false;
    this._micBuffer = [];
    this.emit('mic:stopped');
    return { success: true };
  }

  startSystemCapture() {
    if (this._isSystemCapturing) return { success: true, alreadyRunning: true };
    if (!this._overlayWindow) return { success: false, error: 'No window available' };

    this._overlayWindow.webContents.send('audio:start-system');
    this._isSystemCapturing = true;
    this.emit('system:started');
    return { success: true };
  }

  stopSystemCapture() {
    if (!this._isSystemCapturing) return { success: true, alreadyStopped: true };

    if (this._overlayWindow) {
      this._overlayWindow.webContents.send('audio:stop-system');
    }
    this._isSystemCapturing = false;
    this._systemBuffer = [];
    this.emit('system:stopped');
    return { success: true };
  }

  startAllCapture() {
    return { mic: this.startMicCapture(), system: this.startSystemCapture() };
  }

  stopAllCapture() {
    return { mic: this.stopMicCapture(), system: this.stopSystemCapture() };
  }

  processAudioChunk(chunk) {
    const { source, data, sampleRate, timestamp } = chunk;
    this._sampleRate = sampleRate || 48000;
    
    const pcmData = this._float32ToPCM16(data);
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
    
    this.emit('audio:level', { source, level: rms, peak, dB, peakdB, sampleCount: data.length });
    this.emit('audio:chunk', { source, pcmData, sampleRate: this._sampleRate, clientTimestamp: timestamp, serverTimestamp: Date.now() });
    this._checkBufferFlush(source);
  }

  _checkBufferFlush(source) {
    const buffer = source === 'mic' ? this._micBuffer : this._systemBuffer;
    const sampleRate = this._sampleRate || 48000;
    
    let totalSamples = 0;
    for (const chunk of buffer) {
      totalSamples += chunk.length / 2;
    }
    
    const durationMs = (totalSamples / sampleRate) * 1000;
    
    if (durationMs >= this._targetBufferDuration) {
      const totalLength = buffer.reduce((sum, chunk) => sum + chunk.length, 0);
      const combined = Buffer.concat(buffer, totalLength);
      
      if (source === 'mic') {
        this._micBuffer = [];
      } else {
        this._systemBuffer = [];
      }
      
      this.emit('audio:buffer-ready', { source, pcmData: combined, sampleRate, durationMs, timestamp: Date.now() });
    }
  }

  _float32ToPCM16(float32Samples) {
    const AUDIO_GAIN = 50;
    const buffer = Buffer.alloc(float32Samples.length * 2);
    
    for (let i = 0; i < float32Samples.length; i++) {
      let sample = Math.max(-1, Math.min(1, float32Samples[i] * AUDIO_GAIN));
      sample = Math.floor(sample * 32767);
      buffer.writeInt16LE(sample, i * 2);
    }
    
    return buffer;
  }

  _calculateRMS(samples) {
    if (!samples || samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  _rmsToDecibels(rms) {
    if (rms <= 0) return -60;
    const db = 20 * Math.log10(rms);
    return Math.max(-60, Math.min(0, db));
  }

  _calculatePeak(samples) {
    if (!samples || samples.length === 0) return 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }
    return peak;
  }

  getState() {
    return {
      isMicCapturing: this._isMicCapturing,
      isSystemCapturing: this._isSystemCapturing,
      micLevel: this._micLevel,
      systemLevel: this._systemLevel,
    };
  }

  isCapturing() {
    return this._isMicCapturing || this._isSystemCapturing;
  }
}

module.exports = new AudioCaptureService();
