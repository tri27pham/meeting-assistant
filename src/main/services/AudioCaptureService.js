const EventEmitter = require('events');
const AudioConverter = require('./AudioConverter');
const audioConfig = require('../config/audioConfig');

class AudioCaptureService extends EventEmitter {
  constructor() {
    super();
    this.converter = new AudioConverter();
    this.isCapturing = false;
    this.isPaused = false;

    this.systemAudioStream = null;
    this.systemAudioBuffer = [];
    this.lastSystemAudioTimestamp = 0;

    this.microphoneBuffer = [];
    this.lastMicrophoneTimestamp = 0;

    this.outputBuffer = [];
    this.bufferSize = audioConfig.buffer.chunkSize;

    this.mixingMode = audioConfig.mixing.mode;
    this.systemVolume = audioConfig.mixing.systemVolume;
    this.microphoneVolume = audioConfig.mixing.microphoneVolume;

    this.audioLevels = {
      system: 0,
      microphone: 0,
      mixed: 0,
    };
    this.levelUpdateInterval = null;
  }

  async start(options = {}) {
    if (this.isCapturing) {
      console.warn('[AudioCaptureService] Already capturing');
      return;
    }

    const { systemAudio = true, microphone = true } = options;

    try {
      this.isCapturing = true;
      this.isPaused = false;

      if (systemAudio && audioConfig.systemAudio.enabled) {
        await this._startSystemAudio();
      }

      if (microphone && audioConfig.microphone.enabled) {
        this.microphoneBuffer = [];
        this.lastMicrophoneTimestamp = 0;
      }

      this.levelUpdateInterval = setInterval(() => {
        this.emit('audioLevels', { ...this.audioLevels });
      }, 100);

      this.emit('started');
      console.log('[AudioCaptureService] Audio capture started');
    } catch (error) {
      this.isCapturing = false;
      this.emit('error', error);
      throw error;
    }
  }

  async stop() {
    if (!this.isCapturing) {
      return;
    }

    try {
      // Stop system audio
      await this._stopSystemAudio();

      // Clear buffers
      this.systemAudioBuffer = [];
      this.microphoneBuffer = [];
      this.outputBuffer = [];

      // Stop level updates
      if (this.levelUpdateInterval) {
        clearInterval(this.levelUpdateInterval);
        this.levelUpdateInterval = null;
      }
      
      // Reset levels
      this.audioLevels = { system: 0, microphone: 0, mixed: 0 };

      this.isCapturing = false;
      this.isPaused = false;

      this.emit('stopped');
      console.log('[AudioCaptureService] Audio capture stopped');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Pause audio capture (keep streams open but don't process)
   */
  pause() {
    if (!this.isCapturing) return;
    this.isPaused = true;
    this.emit('paused');
  }

  resume() {
    if (!this.isCapturing) return;
    this.isPaused = false;
    this.emit('resumed');
  }

  /**
   * Handle microphone audio chunk from renderer process
   * @param {Object} chunkData - Audio chunk data from IPC
   * @param {Array} chunkData.data - Audio samples (Float32Array converted to array)
   * @param {number} chunkData.sampleRate - Sample rate (typically 48000)
   * @param {number} chunkData.channels - Channel count (1 or 2)
   * @param {string} chunkData.bitDepth - Bit depth ('float32')
   * @param {number} chunkData.timestamp - Timestamp
   */
  onMicrophoneData(chunkData) {
    if (!this.isCapturing || this.isPaused) return;

    try {
      const float32Data = new Float32Array(chunkData.data);
      
      // Debug: Log first chunk processing
      if (this.microphoneBuffer.length === 0) {
        console.log('[AudioCaptureService] Processing first microphone chunk:', {
          dataLength: float32Data.length,
          sampleRate: chunkData.sampleRate,
          timestamp: chunkData.timestamp,
          isCapturing: this.isCapturing,
          isPaused: this.isPaused
        });
      }

      this._calculateMicrophoneLevel(float32Data);

      this.microphoneBuffer.push({
        data: float32Data,
        format: {
          sampleRate: chunkData.sampleRate || 48000,
          channels: chunkData.channels || 1,
          bitDepth: chunkData.bitDepth || 'float32',
        },
        timestamp: chunkData.timestamp || Date.now(),
      });

      this.lastMicrophoneTimestamp = chunkData.timestamp || Date.now();

      this._calculateMicrophoneLevel(float32Data);

      this._processMicrophoneBuffers();
    } catch (error) {
      console.error('[AudioCaptureService] Error processing microphone data:', error);
      this.emit('error', error);
    }
  }

  /**
   * Handle system audio chunk from renderer process
   * @param {Object} chunkData - Audio chunk data from IPC
   * @param {Array} chunkData.data - Audio samples (Float32Array converted to array)
   * @param {number} chunkData.sampleRate - Sample rate (typically 48000)
   * @param {number} chunkData.channels - Channel count (1 or 2)
   * @param {string} chunkData.bitDepth - Bit depth ('float32')
   * @param {number} chunkData.timestamp - Timestamp
   */
  onSystemAudioData(chunkData) {
    if (!this.isCapturing || this.isPaused) return;

    try {
      const float32Data = new Float32Array(chunkData.data);
      
      // Debug: Log first chunk processing
      if (this.systemAudioBuffer.length === 0) {
        console.log('[AudioCaptureService] Processing first system audio chunk:', {
          dataLength: float32Data.length,
          sampleRate: chunkData.sampleRate,
          timestamp: chunkData.timestamp,
          isCapturing: this.isCapturing,
          isPaused: this.isPaused
        });
      }

      this._calculateSystemLevel(float32Data);

      this.systemAudioBuffer.push({
        data: float32Data,
        format: {
          sampleRate: chunkData.sampleRate || 48000,
          channels: chunkData.channels || 1,
          bitDepth: chunkData.bitDepth || 'float32',
        },
        timestamp: chunkData.timestamp || Date.now(),
      });

      this.lastSystemAudioTimestamp = chunkData.timestamp || Date.now();

      this._processSystemAudioBuffers();
    } catch (error) {
      console.error('[AudioCaptureService] Error processing system audio data:', error);
      this.emit('error', error);
    }
  }

  async _startSystemAudio() {
    try {
      // System audio capture happens in renderer process via electron-audio-loopback
      // We just mark it as active here - actual capture is handled via IPC
      this.systemAudioStream = true;
      this.systemAudioBuffer = [];
      this.lastSystemAudioTimestamp = 0;
      console.log('[AudioCaptureService] System audio capture marked as active (capture happens in renderer)');
    } catch (error) {
      console.error('[AudioCaptureService] Error starting system audio:', error);
      throw error;
    }
  }

  async _stopSystemAudio() {
    try {
      if (this.systemAudioStream) {
        this.systemAudioStream = null;
        this.systemAudioBuffer = [];
      }
    } catch (error) {
      console.error('[AudioCaptureService] Error stopping system audio:', error);
      throw error;
    }
  }

  _processMicrophoneBuffers() {
    if (this.isPaused) return;

    if (this.microphoneBuffer.length === 0) return;

    while (this.microphoneBuffer.length > 0) {
      const micChunk = this.microphoneBuffer.shift();

      const converted = this.converter.convert(micChunk.data, micChunk.format);

      if (this.microphoneVolume !== 1.0) {
        for (let i = 0; i < converted.length; i++) {
          converted[i] = Math.round(converted[i] * this.microphoneVolume);
          converted[i] = Math.max(-32768, Math.min(32767, converted[i]));
        }
      }

      this._calculateMixedLevel(converted);

      this.emit('microphoneAudioChunk', {
        data: converted,
        format: this.converter.getTargetFormat(),
        timestamp: micChunk.timestamp,
      });
    }
  }

  _processSystemAudioBuffers() {
    if (this.isPaused) return;

    if (this.systemAudioBuffer.length === 0) return;

    while (this.systemAudioBuffer.length > 0) {
      const systemChunk = this.systemAudioBuffer.shift();

      const converted = this.converter.convert(systemChunk.data, systemChunk.format);

      if (this.systemVolume !== 1.0) {
        for (let i = 0; i < converted.length; i++) {
          converted[i] = Math.round(converted[i] * this.systemVolume);
          converted[i] = Math.max(-32768, Math.min(32767, converted[i]));
        }
      }

      this._calculateSystemLevelFromInt16(converted);

      this.emit('systemAudioChunk', {
        data: converted,
        format: this.converter.getTargetFormat(),
        timestamp: systemChunk.timestamp,
      });
    }
  }

  _calculateMicrophoneLevel(float32Data) {
    let sum = 0;
    for (let i = 0; i < float32Data.length; i++) {
      sum += float32Data[i] * float32Data[i];
    }
    const rms = Math.sqrt(sum / float32Data.length);
    this.audioLevels.microphone = Math.min(1, rms * 2);
  }

  _calculateMixedLevel(int16Data) {
    let sum = 0;
    for (let i = 0; i < int16Data.length; i++) {
      const normalized = int16Data[i] / 32768; // Normalize to -1 to 1
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / int16Data.length);
    this.audioLevels.mixed = Math.min(1, rms * 1.5); // Normalize and boost
  }

  /**
   * Calculate system audio level from Float32Array
   * @private
   */
  _calculateSystemLevel(float32Data) {
    let sum = 0;
    for (let i = 0; i < float32Data.length; i++) {
      sum += float32Data[i] * float32Data[i];
    }
    const rms = Math.sqrt(sum / float32Data.length);
    this.audioLevels.system = Math.min(1, rms * 2);
  }

  /**
   * Calculate system audio level from Int16Array (after conversion)
   * @private
   */
  _calculateSystemLevelFromInt16(int16Data) {
    let sum = 0;
    for (let i = 0; i < int16Data.length; i++) {
      const normalized = int16Data[i] / 32768; // Normalize to -1 to 1
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / int16Data.length);
    this.audioLevels.system = Math.min(1, rms * 1.5); // Normalize and boost
  }

  /**
   * Get current capture state
   * @returns {Object} Capture state
   */
  getState() {
    return {
      isCapturing: this.isCapturing,
      isPaused: this.isPaused,
      hasSystemAudio: this.systemAudioStream !== null,
      microphoneBufferSize: this.microphoneBuffer.length,
      systemAudioBufferSize: this.systemAudioBuffer.length,
    };
  }

  /**
   * Update mixing configuration
   * @param {Object} config - Mixing configuration
   */
  updateMixingConfig(config) {
    if (config.mode) this.mixingMode = config.mode;
    if (config.systemVolume !== undefined) this.systemVolume = config.systemVolume;
    if (config.microphoneVolume !== undefined) this.microphoneVolume = config.microphoneVolume;
  }
}

module.exports = AudioCaptureService;
