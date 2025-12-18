const audioConfig = require('../config/audioConfig');

class AudioConverter {
  constructor() {
    this.targetSampleRate = audioConfig.audioFormat.sampleRate;
    this.targetChannels = audioConfig.audioFormat.channels;
    this.targetBitDepth = audioConfig.audioFormat.bitDepth;
  }

  convert(audioData, inputFormat) {
    let float32Data = this._toFloat32Array(audioData, inputFormat.bitDepth);
    
    if (inputFormat.channels === 2) {
      float32Data = this._stereoToMono(float32Data);
    }

    if (inputFormat.sampleRate !== this.targetSampleRate) {
      float32Data = this._resample(
        float32Data,
        inputFormat.sampleRate,
        this.targetSampleRate
      );
    }

    const int16Data = this._float32ToInt16(float32Data);

    return int16Data;
  }

  _toFloat32Array(audioData, bitDepth) {
    if (audioData instanceof Float32Array) {
      return audioData;
    }

    if (bitDepth === 'int16' && audioData instanceof Int16Array) {
      // Convert Int16Array to Float32Array (-32768 to 32767 -> -1.0 to 1.0)
      const float32 = new Float32Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        float32[i] = audioData[i] / 32768.0;
      }
      return float32;
    }

    if (Buffer.isBuffer(audioData)) {
      // Assume 16-bit PCM if Buffer
      const int16 = new Int16Array(
        audioData.buffer,
        audioData.byteOffset,
        audioData.length / 2
      );
      return this._toFloat32Array(int16, 'int16');
    }

    // Default: try to create Float32Array
    return new Float32Array(audioData);
  }

  /**
   * Convert stereo to mono by averaging left and right channels
   * @private
   */
  _stereoToMono(stereoData) {
    const monoLength = stereoData.length / 2;
    const monoData = new Float32Array(monoLength);

    for (let i = 0; i < monoLength; i++) {
      const left = stereoData[i * 2];
      const right = stereoData[i * 2 + 1];
      monoData[i] = (left + right) / 2.0;
    }

    return monoData;
  }

  /**
   * Resample audio using linear interpolation
   * @private
   */
  _resample(audioData, sourceRate, targetRate) {
    if (sourceRate === targetRate) {
      return audioData;
    }

    const ratio = sourceRate / targetRate;
    const targetLength = Math.floor(audioData.length / ratio);
    const resampled = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
      const sourceIndex = i * ratio;
      const sourceIndexFloor = Math.floor(sourceIndex);
      const sourceIndexCeil = Math.min(sourceIndexFloor + 1, audioData.length - 1);
      const fraction = sourceIndex - sourceIndexFloor;

      // Linear interpolation
      resampled[i] =
        audioData[sourceIndexFloor] * (1 - fraction) +
        audioData[sourceIndexCeil] * fraction;
    }

    return resampled;
  }

  /**
   * Convert Float32Array to Int16Array
   * Float32 range: -1.0 to 1.0
   * Int16 range: -32768 to 32767
   * @private
   */
  _float32ToInt16(float32Data) {
    const int16Data = new Int16Array(float32Data.length);

    for (let i = 0; i < float32Data.length; i++) {
      // Clamp to [-1.0, 1.0] range
      const clamped = Math.max(-1.0, Math.min(1.0, float32Data[i]));
      
      // Scale to 16-bit integer range
      // Use symmetric scaling: -1.0 -> -32768, 1.0 -> 32767
      int16Data[i] = clamped < 0
        ? Math.round(clamped * 32768)
        : Math.round(clamped * 32767);
    }

    return int16Data;
  }

  /**
   * Convert Int16Array to Buffer (for streaming)
   * @param {Int16Array} int16Data - 16-bit PCM data
   * @returns {Buffer} Buffer containing the audio data
   */
  toBuffer(int16Data) {
    return Buffer.from(int16Data.buffer);
  }

  /**
   * Get target format specification
   * @returns {Object} Target format
   */
  getTargetFormat() {
    return {
      sampleRate: this.targetSampleRate,
      channels: this.targetChannels,
      bitDepth: this.targetBitDepth,
      format: audioConfig.audioFormat.format,
    };
  }

  /**
   * Validate input format
   * @param {Object} inputFormat - Input format to validate
   * @returns {boolean} True if format is valid
   */
  validateInputFormat(inputFormat) {
    return (
      inputFormat &&
      typeof inputFormat.sampleRate === 'number' &&
      inputFormat.sampleRate > 0 &&
      typeof inputFormat.channels === 'number' &&
      (inputFormat.channels === 1 || inputFormat.channels === 2) &&
      typeof inputFormat.bitDepth === 'string' &&
      (inputFormat.bitDepth === 'float32' || inputFormat.bitDepth === 'int16')
    );
  }
}

module.exports = AudioConverter;
