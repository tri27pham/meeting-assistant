/**
 * Audio and Deepgram Configuration
 * 
 * Audio format settings optimized for Deepgram STT
 * Deepgram recommended format: Linear PCM, 16-bit, 16kHz, mono
 */

// Load environment variables (optional - dotenv not required)
// process.env is available in Electron main process
// You can set DEEPGRAM_API_KEY in .env file or as environment variable
try {
  const dotenv = require('dotenv');
  const path = require('path');
  dotenv.config({ path: path.join(__dirname, '../../.env') });
} catch (e) {
  // dotenv is optional, continue without it
}

const audioConfig = {
  // Deepgram API Configuration
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY || '',
    apiUrl: 'wss://api.deepgram.com/v1/listen',
    
    // Deepgram model and language settings
    model: 'nova-2', // Options: nova-2, nova, base, enhanced
    language: 'en-US', // Language code
    encoding: 'linear16', // Audio encoding format
    sampleRate: 16000, // Must match audio format sample rate
    channels: 1, // Mono
    interimResults: true, // Get partial transcripts
    punctuate: true, // Add punctuation
    diarize: false, // Speaker diarization (optional)
    smartFormat: true, // Smart formatting
    endpointing: 300, // Endpointing timeout in ms
  },

  // Audio Format Settings (Deepgram compatible)
  audioFormat: {
    sampleRate: 16000, // 16kHz (Deepgram recommended, supports 8kHz-48kHz)
    channels: 1, // Mono
    bitDepth: 16, // 16-bit signed integer
    byteOrder: 'little-endian', // Little-endian byte order
    format: 'linear16', // Linear PCM
  },

  // Audio Buffer Settings
  buffer: {
    // Buffer size in samples (affects latency vs stability)
    // Smaller = lower latency but more processing overhead
    // Larger = higher latency but more stable
    chunkSize: 4096, // Samples per chunk
    bufferTime: 100, // Buffer time in milliseconds
  },

  // System Audio Capture Settings (electron-audio-loopback)
  systemAudio: {
    enabled: true,
    // electron-audio-loopback will handle format conversion
    // We'll convert to our target format in AudioConverter
  },

  // Microphone Capture Settings (Web Audio API)
  microphone: {
    enabled: true,
    // Web Audio API typically provides 48kHz, may be mono or stereo
    // We'll convert to our target format in AudioConverter
    constraints: {
      audio: {
        channelCount: 1, // Request mono if possible
        sampleRate: 48000, // Request 48kHz (will be resampled to 16kHz)
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    },
  },

  // Audio Mixing Settings
  mixing: {
    // How to combine system audio and microphone
    // 'mix' = add both together (default)
    // 'system-only' = only system audio
    // 'mic-only' = only microphone
    mode: 'mix',
    
    // Volume levels (0.0 to 1.0)
    systemVolume: 1.0,
    microphoneVolume: 1.0,
  },
};

// Validation
function validateConfig() {
  if (!audioConfig.deepgram.apiKey) {
    console.warn('[AudioConfig] DEEPGRAM_API_KEY not set. Set it in .env file or environment variable.');
  }

  if (audioConfig.audioFormat.sampleRate !== audioConfig.deepgram.sampleRate) {
    console.warn(
      `[AudioConfig] Audio format sample rate (${audioConfig.audioFormat.sampleRate}) ` +
      `does not match Deepgram sample rate (${audioConfig.deepgram.sampleRate})`
    );
  }
}

// Run validation on load
validateConfig();

module.exports = audioConfig;
