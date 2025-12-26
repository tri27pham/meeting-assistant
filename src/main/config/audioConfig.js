const audioConfig = {
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY || '',
    apiUrl: 'wss://api.deepgram.com/v1/listen',
    model: 'nova-2-general', // Better accuracy model
    language: 'en-US',
    encoding: 'linear16',
    sampleRate: 16000,
    channels: 1,
    interimResults: true,
    punctuate: true,
    diarize: false,
    smartFormat: true,
    endpointing: 300, // Balance between responsiveness and accuracy
    filler_words: true, // Include filler words for better context
    multichannel: false,
    alternatives: 1, // Get alternative transcriptions for better accuracy
  },

  audioFormat: {
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
    byteOrder: 'little-endian',
    format: 'linear16',
  },

  buffer: {
    chunkSize: 1024, // 64ms latency at 16kHz
    bufferTime: 100,
  },

  systemAudio: {
    enabled: true,
  },

  microphone: {
    enabled: true,
    constraints: {
      audio: {
        channelCount: 1,
        sampleRate: 48000, // Resampled to 16kHz
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    },
  },

  mixing: {
    mode: 'mix', // 'mix', 'system-only', or 'mic-only'
    systemVolume: 1.0,
    microphoneVolume: 1.0,
  },

  transcriptMerge: {
    bufferWindowMs: 2000, // 2 second buffer for out-of-order handling
    flushIntervalMs: 100, // Check every 100ms for transcripts ready to emit
  },
};

function validateConfig() {
  if (!audioConfig.deepgram.apiKey) {
    console.warn('[AudioConfig] DEEPGRAM_API_KEY not set.');
  }

  if (audioConfig.audioFormat.sampleRate !== audioConfig.deepgram.sampleRate) {
    console.warn(
      `[AudioConfig] Sample rate mismatch: ${audioConfig.audioFormat.sampleRate} !== ${audioConfig.deepgram.sampleRate}`
    );
  }
}

validateConfig();

module.exports = audioConfig;
