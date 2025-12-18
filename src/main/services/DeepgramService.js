const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const EventEmitter = require('events');
const audioConfig = require('../config/audioConfig');

class DeepgramService extends EventEmitter {
  constructor() {
    super();
    this.deepgram = null;
    this.liveConnection = null;
    this.isConnected = false;
    this.isStreaming = false;

    const apiKey = audioConfig.deepgram.apiKey;
    if (!apiKey) {
      console.warn('[DeepgramService] DEEPGRAM_API_KEY not configured');
    } else {
      this.deepgram = createClient(apiKey);
    }
  }

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
      this.liveConnection = this.deepgram.listen.live({
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

      this._setupEventListeners();

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.liveConnection.once(LiveTranscriptionEvents.Open, () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.isStreaming = false;
          this.emit('connected');
          console.log('[DeepgramService] Connected to Deepgram');
          resolve();
        });

        this.liveConnection.once(LiveTranscriptionEvents.Error, (error) => {
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

  async disconnect() {
    if (!this.isConnected || !this.liveConnection) {
      return;
    }

    try {
      if (this.isStreaming) {
        this.liveConnection.requestClose();
        this.isStreaming = false;
      }

      this.liveConnection = null;
      this.isConnected = false;

      this.emit('disconnected');
      console.log('[DeepgramService] Disconnected from Deepgram');
    } catch (error) {
      console.error('[DeepgramService] Error disconnecting:', error);
      this.emit('error', error);
    }
  }

  streamAudio(chunk) {
    if (!this.isConnected || !this.liveConnection) {
      console.warn('[DeepgramService] Not connected, cannot stream audio');
      return;
    }

    try {
      let audioBuffer;
      if (chunk.data instanceof Int16Array) {
        audioBuffer = Buffer.from(chunk.data.buffer);
      } else if (Buffer.isBuffer(chunk.data)) {
        audioBuffer = chunk.data;
      } else {
        console.error('[DeepgramService] Invalid audio data format');
        return;
      }

      this.liveConnection.send(audioBuffer);
      this.isStreaming = true;
    } catch (error) {
      console.error('[DeepgramService] Error streaming audio:', error);
      this.emit('error', error);
    }
  }

  _setupEventListeners() {
    if (!this.liveConnection) return;

    this.liveConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
      try {
        this._handleTranscript(data);
      } catch (error) {
        console.error('[DeepgramService] Error handling transcript:', error);
        this.emit('error', error);
      }
    });

    this.liveConnection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error('[DeepgramService] Deepgram error:', error);
      this.isConnected = false;
      this.emit('error', error);
    });

    this.liveConnection.on(LiveTranscriptionEvents.Close, () => {
      this.isConnected = false;
      this.isStreaming = false;
      this.emit('closed');
    });

    this.liveConnection.on(LiveTranscriptionEvents.Metadata, (metadata) => {
      this.emit('metadata', metadata);
    });

    this.liveConnection.on(LiveTranscriptionEvents.UtteranceEnd, (data) => {
      this.emit('utteranceEnd', data);
    });
  }

  _handleTranscript(data) {
    try {
      let transcript = null;
      let confidence = 0;
      let isFinal = false;
      let timestamp = Date.now();
      let duration = 0;

      if (data.channel && data.channel.alternatives && data.channel.alternatives.length > 0) {
        const alternative = data.channel.alternatives[0];
        transcript = alternative.transcript;
        confidence = alternative.confidence || 0;
        isFinal = data.is_final || false;
        timestamp = data.start || Date.now();
        duration = data.duration || 0;
      } else if (data.alternatives && data.alternatives.length > 0) {
        const alternative = data.alternatives[0];
        transcript = alternative.transcript;
        confidence = alternative.confidence || 0;
        isFinal = data.is_final || false;
        timestamp = data.start || Date.now();
        duration = data.duration || 0;
      } else if (data.transcript) {
        transcript = data.transcript;
        confidence = data.confidence || 0;
        isFinal = data.is_final || false;
        timestamp = data.start || Date.now();
        duration = data.duration || 0;
      }

      if (transcript && transcript.trim().length > 0) {
        const transcriptData = {
          text: transcript,
          confidence: confidence,
          isFinal: isFinal,
          timestamp: timestamp,
          duration: duration,
        };

        this.emit('transcript', transcriptData);
      }
    } catch (error) {
      console.error('[DeepgramService] Error parsing transcript:', error);
      console.error('[DeepgramService] Raw transcription data:', data);
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      isStreaming: this.isStreaming,
      hasApiKey: !!audioConfig.deepgram.apiKey,
    };
  }

  isReady() {
    return !!audioConfig.deepgram.apiKey;
  }
}

module.exports = DeepgramService;
