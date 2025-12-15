const { Deepgram } = require('@deepgram/sdk');
const EventEmitter = require('events');
const audioConfig = require('../config/audioConfig');

/**
 * Deepgram Service
 * 
 * Manages Deepgram WebSocket connection for real-time speech-to-text transcription
 * - Establishes WebSocket connection
 * - Streams audio chunks in real-time
 * - Receives transcription results
 * - Emits transcript events via IPC
 */
class DeepgramService extends EventEmitter {
  constructor() {
    super();
    this.deepgram = null;
    this.liveConnection = null;
    this.isConnected = false;
    this.isStreaming = false;

    // Initialize Deepgram client
    const apiKey = audioConfig.deepgram.apiKey;
    if (!apiKey) {
      console.warn('[DeepgramService] DEEPGRAM_API_KEY not configured');
    } else {
      this.deepgram = new Deepgram(apiKey);
    }
  }

  /**
   * Connect to Deepgram WebSocket API
   * @returns {Promise<boolean>} True if connected successfully
   */
  async connect() {
    if (!this.deepgram) {
      const error = new Error('Deepgram API key not configured');
      this.emit('error', error);
      throw error;
    }

    if (this.isConnected) {
      console.warn('[DeepgramService] Already connected');
      return true;
    }

    try {
      // Create live transcription connection
      this.liveConnection = this.deepgram.transcription.live({
        model: audioConfig.deepgram.model,
        language: audioConfig.deepgram.language,
        encoding: audioConfig.deepgram.encoding,
        sample_rate: audioConfig.deepgram.sampleRate,
        channels: audioConfig.deepgram.channels,
        interim_results: audioConfig.deepgram.interimResults,
        punctuate: audioConfig.deepgram.punctuate,
        diarize: audioConfig.deepgram.diarize,
        smart_format: audioConfig.deepgram.smartFormat,
        endpointing: audioConfig.deepgram.endpointing,
      });

      // Set up event listeners
      this._setupEventListeners();

      // Wait for connection to open
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.liveConnection.once('open', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.isStreaming = false;
          this.emit('connected');
          console.log('[DeepgramService] Connected to Deepgram');
          resolve();
        });

        this.liveConnection.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      return true;
    } catch (error) {
      console.error('[DeepgramService] Connection error:', error);
      this.isConnected = false;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect from Deepgram
   */
  async disconnect() {
    if (!this.isConnected || !this.liveConnection) {
      return;
    }

    try {
      // Finish the stream if streaming
      if (this.isStreaming) {
        this.liveConnection.finish();
        this.isStreaming = false;
      }

      // Close connection
      this.liveConnection = null;
      this.isConnected = false;

      this.emit('disconnected');
      console.log('[DeepgramService] Disconnected from Deepgram');
    } catch (error) {
      console.error('[DeepgramService] Error disconnecting:', error);
      this.emit('error', error);
    }
  }

  /**
   * Stream audio chunk to Deepgram
   * @param {Object} chunk - Audio chunk data
   * @param {Int16Array|Buffer} chunk.data - Audio data (16-bit PCM)
   * @param {Object} chunk.format - Audio format
   * @param {number} chunk.timestamp - Timestamp
   */
  streamAudio(chunk) {
    if (!this.isConnected || !this.liveConnection) {
      console.warn('[DeepgramService] Not connected, cannot stream audio');
      return;
    }

    try {
      // Convert Int16Array to Buffer if needed
      let audioBuffer;
      if (chunk.data instanceof Int16Array) {
        audioBuffer = Buffer.from(chunk.data.buffer);
      } else if (Buffer.isBuffer(chunk.data)) {
        audioBuffer = chunk.data;
      } else {
        console.error('[DeepgramService] Invalid audio data format');
        return;
      }

      // Send audio data to Deepgram
      this.liveConnection.send(audioBuffer);
      this.isStreaming = true;
    } catch (error) {
      console.error('[DeepgramService] Error streaming audio:', error);
      this.emit('error', error);
    }
  }

  /**
   * Set up Deepgram event listeners
   * @private
   */
  _setupEventListeners() {
    if (!this.liveConnection) return;

    // Handle transcript results
    this.liveConnection.on('transcriptReceived', (transcription) => {
      try {
        this._handleTranscript(transcription);
      } catch (error) {
        console.error('[DeepgramService] Error handling transcript:', error);
        this.emit('error', error);
      }
    });

    // Handle connection errors
    this.liveConnection.on('error', (error) => {
      console.error('[DeepgramService] Deepgram error:', error);
      this.isConnected = false;
      this.emit('error', error);
    });

    // Handle connection close
    this.liveConnection.on('close', () => {
      console.log('[DeepgramService] Connection closed');
      this.isConnected = false;
      this.isStreaming = false;
      this.emit('closed');
    });

    // Handle metadata
    this.liveConnection.on('metadata', (metadata) => {
      this.emit('metadata', metadata);
    });

    // Handle warning messages
    this.liveConnection.on('warning', (warning) => {
      console.warn('[DeepgramService] Warning:', warning);
      this.emit('warning', warning);
    });
  }

  /**
   * Handle transcript results from Deepgram
   * @private
   */
  _handleTranscript(transcription) {
    try {
      // Parse Deepgram response
      const result = JSON.parse(transcription);

      // Extract transcript data
      if (result.channel && result.channel.alternatives && result.channel.alternatives.length > 0) {
        const alternative = result.channel.alternatives[0];
        const transcript = alternative.transcript;
        const confidence = alternative.confidence || 0;
        const isFinal = result.is_final || false;

        // Only emit if there's actual transcript text
        if (transcript && transcript.trim().length > 0) {
          const transcriptData = {
            text: transcript,
            confidence: confidence,
            isFinal: isFinal,
            timestamp: result.start || Date.now(),
            duration: result.duration || 0,
          };

          // Emit transcript event (will be sent to renderer via IPC in main.js)
          this.emit('transcript', transcriptData);
        }
      }
    } catch (error) {
      console.error('[DeepgramService] Error parsing transcript:', error);
      console.error('[DeepgramService] Raw transcription:', transcription);
    }
  }

  /**
   * Get connection status
   * @returns {Object} Connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isStreaming: this.isStreaming,
      hasApiKey: !!audioConfig.deepgram.apiKey,
    };
  }

  /**
   * Check if service is ready (has API key and can connect)
   * @returns {boolean}
   */
  isReady() {
    return !!audioConfig.deepgram.apiKey;
  }
}

module.exports = DeepgramService;
