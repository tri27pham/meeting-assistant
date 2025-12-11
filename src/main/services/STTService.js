const { EventEmitter } = require('events');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');

class STTService extends EventEmitter {
  constructor() {
    super();
    
    this._apiKey = process.env.DEEPGRAM_API_KEY || null;
    this._deepgram = null;
    this._connection = null;
    this._isEnabled = false;
    this._isConnected = false;
    this._audioQueue = []; // Queue audio until connected (first chunk has webm header)
    this._transcriptions = [];
    this._currentInterim = '';
    
    if (this._apiKey) {
      this._deepgram = createClient(this._apiKey);
      console.log('[STTService] Initialized with API key');
    } else {
      console.warn('[STTService] No DEEPGRAM_API_KEY found');
    }
  }

  async enable() {
    if (this._isEnabled) return;

    if (!this._deepgram) {
      this.emit('error', { message: 'No Deepgram API key configured' });
      return;
    }

    console.log('[STTService] Enabling...');
    this._isEnabled = true;

    try {
      await this._connect();
    } catch (error) {
      console.error('[STTService] Failed to connect:', error.message);
      this._isEnabled = false;
      this.emit('error', { message: error.message });
    }
  }

  disable() {
    if (!this._isEnabled) return;
    console.log('[STTService] Disabling...');
    this._isEnabled = false;
    this._disconnect();
  }

  async _connect() {
    if (this._isConnected) return;

    console.log('[STTService] Connecting to Deepgram...');

    // Let Deepgram auto-detect encoding from webm/opus MediaRecorder output
    this._connection = this._deepgram.listen.live({
      model: 'nova-2',
      language: 'en-US',
      smart_format: true,
      punctuate: true,
      interim_results: true,
      utterance_end_ms: 1000,
      vad_events: true,
    });

    this._setupEventListeners();
  }

  _setupEventListeners() {
    this._connection.on(LiveTranscriptionEvents.Open, () => {
      console.log('[STTService] ✓ Connected to Deepgram');
      this._isConnected = true;
      
      // Flush queued audio (first chunk has webm header)
      if (this._audioQueue.length > 0) {
        console.log(`[STTService] Flushing ${this._audioQueue.length} queued audio chunks`);
        for (const chunk of this._audioQueue) {
          try {
            this._connection.send(chunk);
          } catch (err) {
            console.error('[STTService] Failed to send queued chunk:', err.message);
          }
        }
        this._audioQueue = [];
      }
      
      this.emit('connected');
    });

    this._connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      this._handleTranscript(data);
    });

    this._connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
      console.log('[STTService] 🎤 Speech started');
      this.emit('speech-started');
    });

    this._connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      this.emit('utterance-end');
    });

    this._connection.on(LiveTranscriptionEvents.Metadata, (data) => {
      console.log('[STTService] Metadata:', data.request_id);
    });

    this._connection.on(LiveTranscriptionEvents.Close, (code, reason) => {
      console.log(`[STTService] Connection closed (code: ${code}, reason: ${reason || 'none'})`);
      this._isConnected = false;
      this.emit('disconnected');
      
      if (this._isEnabled) {
        console.log('[STTService] Reconnecting in 2 seconds...');
        setTimeout(() => this._connect(), 2000);
      }
    });

    this._connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error('[STTService] ❌ Error:', error);
      this.emit('error', { message: error.message || 'Deepgram error' });
    });
  }

  _handleTranscript(data) {
    const transcript = data?.channel?.alternatives?.[0]?.transcript || '';
    const confidence = data?.channel?.alternatives?.[0]?.confidence || 0;
    const isFinal = data?.is_final || false;
    const speechFinal = data?.speech_final || false;

    console.log(`[STTService] 📝 Transcript: "${transcript}" (conf: ${confidence.toFixed(2)}, final: ${isFinal}, speech_final: ${speechFinal})`);

    if (!transcript || transcript.trim() === '') return;

    if (isFinal) {
      const result = {
        text: transcript.trim(),
        confidence,
        timestamp: Date.now(),
        isFinal: true,
      };

      this._transcriptions.push(result);
      this._currentInterim = '';
      console.log(`[STTService] ✓ FINAL: "${result.text}"`);
      this.emit('transcription', result);
    } else {
      this._currentInterim = transcript;
      this.emit('interim', { text: transcript, timestamp: Date.now(), isFinal: false });
    }
  }

  _disconnect() {
    if (this._connection) {
      try {
        this._connection.finish();
      } catch (e) {}
      this._connection = null;
    }
    this._isConnected = false;
    console.log('[STTService] Disconnected');
  }

  sendAudio(audioData) {
    if (!this._isEnabled) return;

    // Queue audio if not connected (first chunk has webm header)
    if (!this._isConnected || !this._connection) {
      this._audioQueue.push(audioData);
      if (this._audioQueue.length > 20) {
        this._audioQueue.shift();
      }
      return;
    }

    try {
      this._connection.send(audioData);
    } catch (error) {
      console.error('[STTService] Failed to send audio:', error.message);
    }
  }

  getTranscriptions() {
    return [...this._transcriptions];
  }

  getFullTranscript() {
    return this._transcriptions.map(t => t.text).join(' ');
  }

  getInterimTranscript() {
    return this._currentInterim;
  }

  clearTranscriptions() {
    this._transcriptions = [];
    this._currentInterim = '';
  }

  getState() {
    return {
      isEnabled: this._isEnabled,
      isConnected: this._isConnected,
      hasApiKey: !!this._apiKey,
      transcriptionCount: this._transcriptions.length,
    };
  }

  isReady() {
    return !!this._apiKey && !!this._deepgram;
  }

  setApiKey(key) {
    this._apiKey = key;
    this._deepgram = createClient(key);
  }

  destroy() {
    this.disable();
    this.removeAllListeners();
  }
}

module.exports = new STTService();
