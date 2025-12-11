/**
 * AudioWorklet processor for capturing continuous audio samples
 * This runs in a separate audio thread for real-time processing
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    this._bufferSize = 4800; // 100ms at 48kHz
    this._buffer = new Float32Array(this._bufferSize);
    this._bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0]; // Mono channel

    // Add samples to buffer
    for (let i = 0; i < samples.length; i++) {
      this._buffer[this._bufferIndex++] = samples[i];

      // When buffer is full, send to main thread
      if (this._bufferIndex >= this._bufferSize) {
        this.port.postMessage({
          type: 'audio',
          samples: this._buffer.slice(), // Copy the buffer
        });
        this._bufferIndex = 0;
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('audio-processor', AudioProcessor);
