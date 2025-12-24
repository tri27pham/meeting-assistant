const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const EventEmitter = require('events');
const { performance } = require('perf_hooks');
const audioConfig = require('../config/audioConfig');

class DeepgramService extends EventEmitter {
  constructor() {
    super();
    this.deepgram = null;
    this.liveConnection = null;
    this.isConnected = false;
    this.isStreaming = false;
    this.keepaliveInterval = null;
    this.healthCheckInterval = null;
    this.lastTranscriptTime = null;

    const apiKey = audioConfig.deepgram.apiKey;
    if (!apiKey) {
      console.warn('[DeepgramService] DEEPGRAM_API_KEY not configured');
    } else {
      this.deepgram = createClient(apiKey);
    }
  }

  async connect() {
    const connectStartTime = performance.now();
    if (!this.deepgram) {
      const error = new Error('Deepgram API key not configured');
      this.emit('error', error);
      throw error;
    }

    if (this.isConnected) {
      console.warn('[DeepgramService] Already connected, skipping reconnect');
      return true;
    }

    // Clean up any existing connection before creating a new one
    if (this.liveConnection) {
      console.log('[DeepgramService] Cleaning up existing connection before reconnecting');
      try {
        this.liveConnection.removeAllListeners();
        if (this.isStreaming) {
          this.liveConnection.requestClose();
        }
      } catch (e) {
        console.warn('[DeepgramService] Error cleaning up old connection:', e.message);
      }
      this.liveConnection = null;
    }

    try {
      const createStartTime = performance.now();
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
        filler_words: audioConfig.deepgram.filler_words,
        alternatives: audioConfig.deepgram.alternatives,
      });
      const createEndTime = performance.now();
      console.log(`[DeepgramService] Creating connection took ${(createEndTime - createStartTime).toFixed(2)}ms`);

      this._setupEventListeners();

      const waitStartTime = performance.now();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.liveConnection.once(LiveTranscriptionEvents.Open, () => {
          clearTimeout(timeout);
          const waitEndTime = performance.now();
          console.log(`[DeepgramService] Waiting for Open event took ${(waitEndTime - waitStartTime).toFixed(2)}ms`);
          this.isConnected = true;
          this.isStreaming = false;
          this.lastTranscriptTime = Date.now();
          this.emit('connected');
          console.log('[DeepgramService] Connected to Deepgram - connection is ready');
          this._startKeepalive();
          this._startHealthCheck();
          resolve();
        });

        this.liveConnection.once(LiveTranscriptionEvents.Error, (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      const totalTime = performance.now() - connectStartTime;
      console.log(`[DeepgramService] Total connect() took ${totalTime.toFixed(2)}ms`);
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
      this._stopKeepalive();
      this._stopHealthCheck();
      
      if (this.isStreaming) {
        this.liveConnection.requestClose();
        this.isStreaming = false;
      }

      this.liveConnection = null;
      this.isConnected = false;
      this.lastTranscriptTime = null;

      this.emit('disconnected');
      console.log('[DeepgramService] Disconnected from Deepgram');
    } catch (error) {
      console.error('[DeepgramService] Error disconnecting:', error);
      this.emit('error', error);
    }
  }

  _startKeepalive() {
    this._stopKeepalive();
    
    // Send silence packets every 100ms to keep connection alive until real audio arrives
    // Deepgram expects audio at ~16kHz, so 1600 samples = 100ms of silence
    const silenceChunk = new Int16Array(1600).fill(0); // 100ms of silence at 16kHz
    
    this.keepaliveInterval = setInterval(() => {
      if (this.isConnected && this.liveConnection && !this.isStreaming) {
        try {
          // Double-check connection is still valid before sending
          if (this.liveConnection && this.isConnected) {
            const audioBuffer = Buffer.from(silenceChunk.buffer);
            this.liveConnection.send(audioBuffer);
          } else {
            console.warn('[DeepgramService] Connection lost during keepalive, stopping');
            this._stopKeepalive();
            this.isConnected = false;
            this.emit('error', new Error('Connection lost during keepalive'));
          }
        } catch (error) {
          console.warn('[DeepgramService] Error sending keepalive:', error.message);
          this._stopKeepalive();
          this.isConnected = false;
          this.isStreaming = false;
          this.emit('error', error);
        }
      } else if (this.isStreaming) {
        // Real audio is flowing, stop keepalive
        this._stopKeepalive();
      }
    }, 100);
  }

  _stopKeepalive() {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  _startHealthCheck() {
    this._stopHealthCheck();
    
    // Check connection health every 10 seconds
    // Note: Deepgram SDK manages connection internally, so we can't check readyState
    // We rely on the event system (error/close events) to detect connection issues
    this.healthCheckInterval = setInterval(() => {
      if (!this.isConnected || !this.liveConnection) {
        this._stopHealthCheck();
        return;
      }

      // Check if we haven't received transcripts in a while but are streaming
      const timeSinceLastTranscript = this.lastTranscriptTime ? Date.now() - this.lastTranscriptTime : null;
      if (this.isStreaming && timeSinceLastTranscript && timeSinceLastTranscript > 30000) {
        // 30 seconds without transcripts while streaming suggests connection issue
        console.warn('[DeepgramService] Health check: No transcripts for 30s while streaming', {
          timeSinceLastTranscript,
          isStreaming: this.isStreaming
        });
        // Don't disconnect yet, but log the issue - Deepgram will emit error/close if connection is broken
      }
    }, 10000);
  }

  _stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  streamAudio(chunk) {
    if (!this.isConnected || !this.liveConnection) {
      console.warn('[DeepgramService] Not connected, cannot stream audio', { 
        isConnected: this.isConnected, 
        hasConnection: !!this.liveConnection 
      });
      this.emit('error', new Error('Cannot stream audio: not connected'));
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

      // Check if connection is still valid before sending
      if (!this.liveConnection || !this.isConnected) {
        console.warn('[DeepgramService] Connection lost while streaming, stopping');
        this.isStreaming = false;
        this.emit('error', new Error('Connection lost during streaming'));
        return;
      }

      try {
        // Deepgram SDK manages connection internally - just send if we think we're connected
        this.liveConnection.send(audioBuffer);
        
        if (!this.isStreaming) {
          console.log('[DeepgramService] Starting to stream audio to Deepgram');
          this._stopKeepalive(); // Stop keepalive once real audio starts
        }
        this.isStreaming = true;
      } catch (sendError) {
        console.error('[DeepgramService] Error sending audio buffer:', sendError);
        this.isConnected = false;
        this.isStreaming = false;
        this._stopKeepalive();
        this.emit('error', sendError);
      }
    } catch (error) {
      console.error('[DeepgramService] Error streaming audio:', error);
      // Connection might be broken, mark as disconnected
      this.isConnected = false;
      this.isStreaming = false;
      this._stopKeepalive();
      this.emit('error', error);
    }
  }

  _setupEventListeners() {
    if (!this.liveConnection) return;

    // Remove existing listeners to prevent duplicates
    this.liveConnection.removeAllListeners();

    this.liveConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
      try {
        this._handleTranscript(data);
      } catch (error) {
        console.error('[DeepgramService] Error handling transcript:', error);
        this.emit('error', error);
      }
    });

    this.liveConnection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error('[DeepgramService] Deepgram error:', error, {
        message: error?.message,
        type: error?.type,
        code: error?.code,
        readyState: this.liveConnection?.readyState
      });
      this._stopKeepalive();
      this._stopHealthCheck();
      this.isConnected = false;
      this.isStreaming = false;
      // Don't close connection here - let main.js handle reconnection
      this.emit('error', error);
    });

    this.liveConnection.on(LiveTranscriptionEvents.Close, (event) => {
      console.log('[DeepgramService] Connection closed by Deepgram', { 
        code: event?.code, 
        reason: event?.reason,
        wasClean: event?.wasClean 
      });
      this._stopKeepalive();
      this._stopHealthCheck();
      this.isConnected = false;
      this.isStreaming = false;
      this.lastTranscriptTime = null;
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

      // Try multiple data structure patterns
      if (data.channel?.alternatives?.length > 0) {
        const alternative = data.channel.alternatives[0];
        transcript = alternative.transcript || alternative.text || null;
        confidence = alternative.confidence || 0;
        isFinal = data.is_final || false;
        timestamp = data.start || data.channel.start || Date.now();
        duration = data.duration || data.channel.duration || 0;
      } else if (data.alternatives?.length > 0) {
        const alternative = data.alternatives[0];
        transcript = alternative.transcript || alternative.text || null;
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
      } else if (data.channel?.transcript) {
        transcript = data.channel.transcript;
        confidence = data.channel.confidence || 0;
        isFinal = data.is_final || false;
        timestamp = data.start || data.channel.start || Date.now();
        duration = data.duration || data.channel.duration || 0;
      }

      // Only emit if we have valid transcript text
      if (transcript && typeof transcript === 'string' && transcript.trim().length > 0) {
        const transcriptData = {
          text: transcript.trim(),
          confidence: confidence,
          isFinal: isFinal,
          timestamp: timestamp,
          duration: duration,
        };

        // Emit descriptive event names following service rules
        if (isFinal) {
          this.lastTranscriptTime = Date.now();
          console.log('[DeepgramService] Emitting transcript:final', { 
            text: transcriptData.text.substring(0, 50),
            confidence: transcriptData.confidence,
            connectionState: this.isConnected ? 'connected' : 'disconnected'
          });
          this.emit('transcript:final', transcriptData);
        } else {
          this.lastTranscriptTime = Date.now();
          this.emit('transcript:partial', transcriptData);
        }
      } else {
        // Log when we receive transcript events but no valid text
        console.log('[DeepgramService] Received transcript event but no valid text', {
          hasTranscript: !!transcript,
          transcriptType: typeof transcript,
          transcriptLength: transcript?.length,
          isFinal: isFinal
        });
      }
    } catch (error) {
      console.error('[DeepgramService] Error parsing transcript:', error);
      console.error('[DeepgramService] Raw transcription data:', JSON.stringify(data, null, 2).substring(0, 500));
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
