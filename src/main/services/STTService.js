/**
 * STTService.js
 * 
 * PURPOSE:
 * Speech-to-Text service that transcribes audio using either:
 * 1. Local Whisper (via Transformers.js) - Free, runs offline
 * 2. OpenAI Whisper API - Requires API key, better accuracy
 * 
 * ARCHITECTURE:
 * - Receives audio buffers from AudioCaptureService
 * - Accumulates audio until we have enough for transcription (~3-5 seconds)
 * - Transcribes using selected backend
 * - Emits transcription results
 * 
 * AUDIO FORMAT EXPECTED:
 * - 16-bit PCM or webm-opus
 * - 16000 Hz sample rate (preferred)
 * - Mono channel
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');

class STTService extends EventEmitter {
  constructor() {
    super();
    
    // Configuration
    this._mode = 'local'; // 'local' or 'api'
    this._apiKey = process.env.OPENAI_API_KEY || null;
    this._model = 'whisper-1'; // For API mode
    this._localModel = 'Xenova/whisper-base.en'; // base.en - small.en crashes on memory allocation
    this._language = 'en';
    
    // Common Whisper hallucinations to filter out (case-insensitive)
    this._hallucinationKeywords = [
      'music', 'sigh', 'singing', 'sings', 'laughing', 'laugh', 
      'applause', 'inaudible', 'blank_audio', 'clicking', 'noise',
      'clapping', 'coughing', 'silence', 'background', 'static'
    ];
    
    // Local model state
    this._pipeline = null;
    this._isLoadingModel = false;
    this._modelLoaded = false;
    
    // Audio buffering
    this._audioBuffer = [];
    this._bufferDurationMs = 0;
    this._minBufferDuration = 3000; // Min 3 seconds before transcribing
    this._maxBufferDuration = 8000; // Max 8 seconds, then force transcribe
    this._bufferCapMs = 10000; // Hard cap - discard old audio beyond this
    
    // Processing state
    this._isProcessing = false;
    this._isEnabled = false;
    
    // Transcription history
    this._transcriptions = [];
    this._maxHistoryLength = 100;
    
    // Temp file for audio
    this._tempDir = os.tmpdir();
    
    console.log('[STTService] Initialized (mode: local)');
  }

  /**
   * Set the transcription mode
   * @param {'local' | 'api'} mode
   */
  async setMode(mode) {
    this._mode = mode;
    console.log(`[STTService] Mode set to: ${mode}`);
    
    if (mode === 'local' && !this._modelLoaded) {
      // Pre-load the local model
      await this._loadLocalModel();
    }
  }

  /**
   * Get current mode
   */
  getMode() {
    return this._mode;
  }

  /**
   * Set the OpenAI API key (for API mode)
   */
  setApiKey(key) {
    this._apiKey = key;
    console.log('[STTService] API key updated');
  }

  /**
   * Set the local model to use
   * Options: 'Xenova/whisper-tiny.en', 'Xenova/whisper-base.en', 'Xenova/whisper-small.en'
   */
  setLocalModel(model) {
    this._localModel = model;
    this._modelLoaded = false;
    this._pipeline = null;
    console.log(`[STTService] Local model set to: ${model}`);
  }

  /**
   * Load the local Whisper model
   */
  async _loadLocalModel() {
    if (this._modelLoaded || this._isLoadingModel) {
      return;
    }

    this._isLoadingModel = true;
    console.log(`[STTService] Loading local model: ${this._localModel}...`);
    
    try {
      // Dynamic import for Transformers.js
      const { pipeline } = await import('@xenova/transformers');
      
      this._pipeline = await pipeline('automatic-speech-recognition', this._localModel, {
        quantized: true, // Use quantized model for faster inference
      });
      
      this._modelLoaded = true;
      console.log('[STTService] Local model loaded successfully');
      this.emit('model-loaded', { model: this._localModel });
    } catch (err) {
      console.error('[STTService] Failed to load local model:', err);
      this.emit('error', { message: `Failed to load model: ${err.message}` });
    } finally {
      this._isLoadingModel = false;
    }
  }

  /**
   * Enable/disable the STT service
   */
  async setEnabled(enabled) {
    this._isEnabled = enabled;
    
    if (enabled && this._mode === 'local' && !this._modelLoaded) {
      await this._loadLocalModel();
    }
    
    if (!enabled) {
      this._audioBuffer = [];
      this._bufferDurationMs = 0;
    }
    
    console.log('[STTService] Enabled:', enabled);
  }

  /**
   * Check if service is ready
   */
  isReady() {
    if (this._mode === 'api') {
      return !!this._apiKey;
    }
    return this._modelLoaded || this._mode === 'local'; // Local mode is always "ready" (will load on demand)
  }

  /**
   * Process incoming audio chunk from AudioCaptureService
   * Receives PCM data in buffer-ready events
   */
  async processAudioChunk(chunk) {
    if (!this._isEnabled) {
      return;
    }

    // For local mode, we don't need API key
    if (this._mode === 'api' && !this._apiKey) {
      return;
    }

    const { source, pcmData, durationMs, sampleRate } = chunk;
    
    // Only process mic audio for now
    if (source !== 'mic') {
      return;
    }

    if (!pcmData) return;

    // If currently processing, don't accumulate too much audio
    // This prevents huge backlogs during slow transcription
    if (this._isProcessing) {
      if (this._bufferDurationMs >= this._bufferCapMs) {
        console.log(`[STTService] Buffer at cap (${this._bufferDurationMs}ms), discarding audio while processing`);
        return;
      }
    }

    // Store sample rate for transcription
    this._currentSampleRate = sampleRate || 48000;

    this._audioBuffer.push(pcmData);
    this._bufferDurationMs += durationMs || 1000;

    // Transcribe when we have enough audio
    if (this._bufferDurationMs >= this._minBufferDuration && !this._isProcessing) {
      await this._transcribeBuffer();
    }
  }

  /**
   * Force transcription of current buffer
   */
  async flushBuffer() {
    if (this._audioBuffer.length > 0 && !this._isProcessing) {
      await this._transcribeBuffer();
    }
  }

  /**
   * Transcribe the accumulated audio buffer
   */
  async _transcribeBuffer() {
    if (this._audioBuffer.length === 0 || this._isProcessing) {
      return;
    }

    this._isProcessing = true;
    
    try {
      const totalLength = this._audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
      const combined = Buffer.concat(this._audioBuffer, totalLength);
      
      this._audioBuffer = [];
      const duration = this._bufferDurationMs;
      this._bufferDurationMs = 0;

      console.log(`[STTService] Transcribing ${duration}ms of audio (${combined.length} bytes, ${this._mode} mode)`);

      let transcription;
      
      if (this._mode === 'local') {
        transcription = await this._transcribeLocal(combined);
      } else {
        transcription = await this._transcribeAPI(combined);
      }
      
      console.log(`[STTService] Raw transcription result: "${transcription}"`);
      
      // Filter out hallucinations
      const filtered = this._filterHallucinations(transcription);
      
      if (filtered && filtered.trim()) {
        const result = {
          text: filtered.trim(),
          timestamp: Date.now(),
          duration,
          source: 'mic',
          mode: this._mode,
        };

        this._transcriptions.push(result);
        if (this._transcriptions.length > this._maxHistoryLength) {
          this._transcriptions.shift();
        }

        this.emit('transcription', result);
        console.log(`[STTService] Transcribed: "${result.text}"`);
      } else {
        console.log(`[STTService] Filtered/empty transcription, skipping (was: "${transcription?.substring(0, 50)}")`);
      }

    } catch (err) {
      console.error('[STTService] Transcription error:', err);
      this.emit('error', { message: err.message });
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Transcribe using local Whisper model
   * @param {Buffer} pcmBuffer - 16-bit PCM audio buffer
   */
  async _transcribeLocal(pcmBuffer) {
    // Ensure model is loaded
    if (!this._modelLoaded) {
      await this._loadLocalModel();
    }

    if (!this._pipeline) {
      throw new Error('Local model not loaded');
    }

    try {
      // Convert 16-bit PCM buffer to Float32Array for Whisper
      const audioData = this._pcmToFloat32(pcmBuffer);
      const inputSampleRate = this._currentSampleRate || 48000;
      const targetSampleRate = 16000; // Whisper expects 16kHz

      // Resample to 16kHz if needed
      let resampledAudio = audioData;
      if (inputSampleRate !== targetSampleRate) {
        console.log(`[STTService] Resampling from ${inputSampleRate}Hz to ${targetSampleRate}Hz`);
        resampledAudio = this._resampleAudio(audioData, inputSampleRate, targetSampleRate);
      }

      const audioDurationSec = resampledAudio.length / targetSampleRate;
      console.log(`[STTService] Processing ${resampledAudio.length} samples (${audioDurationSec.toFixed(1)}s) at ${targetSampleRate}Hz`);

      // Sanity check audio data
      let maxVal = 0, minVal = 0, nonZeroCount = 0;
      for (let i = 0; i < Math.min(resampledAudio.length, 1000); i++) {
        if (resampledAudio[i] > maxVal) maxVal = resampledAudio[i];
        if (resampledAudio[i] < minVal) minVal = resampledAudio[i];
        if (Math.abs(resampledAudio[i]) > 0.001) nonZeroCount++;
      }
      console.log(`[STTService] Audio stats (first 1000): min=${minVal.toFixed(4)}, max=${maxVal.toFixed(4)}, nonZero=${nonZeroCount}`);

      // Pass the resampled audio data to the pipeline
      // Whisper expects 16kHz mono audio
      console.log(`[STTService] Calling Whisper pipeline...`);
      const startTime = Date.now();
      
      const result = await this._pipeline(resampledAudio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: 'english',
        task: 'transcribe',
        sampling_rate: targetSampleRate,
        return_timestamps: false,
      });
      
      const elapsed = Date.now() - startTime;
      console.log(`[STTService] Pipeline completed in ${elapsed}ms, result:`, result?.text?.substring(0, 100));
      return result.text;
    } catch (err) {
      console.error('[STTService] Local transcription error:', err);
      throw err;
    }
  }

  /**
   * Filter out common Whisper hallucinations
   * Returns cleaned text or null if entirely hallucinated
   * @param {string} text - Raw transcription text
   * @returns {string|null} - Filtered text or null
   */
  _filterHallucinations(text) {
    if (!text) return null;
    
    // Normalize text for comparison
    const normalized = text.toLowerCase().trim();
    
    // Check if entire transcription is just a hallucinated tag like [Music] or *Sigh*
    // Pattern: optional whitespace, then [something] or *something*, then optional whitespace
    const tagPattern = /^[\s]*[\[\*]([^\]\*]+)[\]\*][\s]*$/;
    const match = normalized.match(tagPattern);
    if (match) {
      const tagContent = match[1].toLowerCase();
      // Check if the tag content is a known hallucination
      for (const keyword of this._hallucinationKeywords) {
        if (tagContent.includes(keyword)) {
          console.log(`[STTService] Filtered hallucination: "${text.trim()}"`);
          return null;
        }
      }
    }
    
    // Also filter if the normalized text matches common hallucination patterns
    for (const keyword of this._hallucinationKeywords) {
      // Check for *keyword* or [keyword] as the entire content
      if (normalized === `*${keyword}*` || 
          normalized === `[${keyword}]` ||
          normalized === keyword) {
        console.log(`[STTService] Filtered hallucination: "${text.trim()}"`);
        return null;
      }
    }
    
    // Remove inline hallucination tags but keep actual speech
    let cleaned = text
      .replace(/\[[\w\s]+\]/gi, '') // Remove all [bracketed] tags
      .replace(/\*[\w\s]+\*/gi, '') // Remove all *starred* tags
      .replace(/♪/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // If after cleaning we have very little content, skip it
    if (cleaned.length < 2) {
      return null;
    }
    
    return cleaned;
  }

  /**
   * Resample audio from one sample rate to another
   * Uses linear interpolation for simplicity
   * @param {Float32Array} audioData - Input audio samples
   * @param {number} inputRate - Input sample rate (e.g., 48000)
   * @param {number} outputRate - Output sample rate (e.g., 16000)
   * @returns {Float32Array} - Resampled audio
   */
  _resampleAudio(audioData, inputRate, outputRate) {
    const ratio = inputRate / outputRate;
    const outputLength = Math.floor(audioData.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
      const fraction = srcIndex - srcIndexFloor;
      
      // Linear interpolation between samples
      output[i] = audioData[srcIndexFloor] * (1 - fraction) + audioData[srcIndexCeil] * fraction;
    }

    return output;
  }

  /**
   * Convert 16-bit PCM buffer to Float32Array
   * Whisper expects audio samples in -1 to 1 range
   */
  _pcmToFloat32(pcmBuffer) {
    const samples = pcmBuffer.length / 2; // 16-bit = 2 bytes per sample
    const float32 = new Float32Array(samples);
    
    for (let i = 0; i < samples; i++) {
      // Read 16-bit signed integer (little-endian)
      const sample = pcmBuffer.readInt16LE(i * 2);
      // Convert to float in range -1 to 1
      float32[i] = sample / 32768;
    }
    
    return float32;
  }

  /**
   * Transcribe using OpenAI Whisper API
   */
  /**
   * Transcribe using OpenAI Whisper API
   * @param {Buffer} pcmBuffer - 16-bit PCM audio buffer
   */
  async _transcribeAPI(pcmBuffer) {
    // Convert PCM to WAV for API
    const wavBuffer = this._pcmToWav(pcmBuffer, 16000, 1, 16);
    const tempFile = path.join(this._tempDir, `stt_${Date.now()}.wav`);
    fs.writeFileSync(tempFile, wavBuffer);

    try {
      const FormData = require('form-data');
      const formData = new FormData();

      formData.append('file', fs.createReadStream(tempFile));
      formData.append('model', this._model);
      formData.append('language', this._language);
      formData.append('response_format', 'text');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._apiKey}`,
          ...formData.getHeaders(),
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Whisper API error: ${response.status} - ${error}`);
      }

      return await response.text();
    } finally {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {}
    }
  }

  /**
   * Convert raw PCM data to WAV format
   */
  _pcmToWav(pcmData, sampleRate, channels, bitsPerSample) {
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    const fileSize = 44 + dataSize;

    const buffer = Buffer.alloc(fileSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(fileSize - 8, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    pcmData.copy(buffer, 44);

    return buffer;
  }

  /**
   * Get recent transcriptions
   */
  getTranscriptions() {
    return [...this._transcriptions];
  }

  /**
   * Get full transcript as a single string
   */
  getFullTranscript() {
    return this._transcriptions.map(t => t.text).join(' ');
  }

  /**
   * Clear transcription history
   */
  clearTranscriptions() {
    this._transcriptions = [];
    this.emit('cleared');
  }

  /**
   * Get service state
   */
  getState() {
    return {
      mode: this._mode,
      isEnabled: this._isEnabled,
      isProcessing: this._isProcessing,
      isReady: this.isReady(),
      isModelLoaded: this._modelLoaded,
      isLoadingModel: this._isLoadingModel,
      localModel: this._localModel,
      bufferDuration: this._bufferDurationMs,
      transcriptionCount: this._transcriptions.length,
      hasApiKey: !!this._apiKey,
    };
  }
}

// Export singleton instance
module.exports = new STTService();
