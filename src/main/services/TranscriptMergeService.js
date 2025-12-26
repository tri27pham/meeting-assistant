const EventEmitter = require('events');
const audioConfig = require('../config/audioConfig');

class TranscriptMergeService extends EventEmitter {
  constructor() {
    super();
    this.micStreamStartTime = null;
    this.systemStreamStartTime = null;
    this.pendingTranscripts = []; // Buffer for out-of-order transcripts
    this.lastEmittedTimestamp = 0;
    this.bufferWindowMs = audioConfig.transcriptMerge?.bufferWindowMs || 2000; // 2 second buffer for out-of-order handling
    this.flushInterval = null;
    this.flushIntervalMs = audioConfig.transcriptMerge?.flushIntervalMs || 100; // Check every 100ms
  }

  /**
   * Set the absolute start time for a stream
   * @param {string} source - 'microphone' or 'system'
   * @param {number} startTime - Absolute timestamp in milliseconds
   */
  setStreamStartTime(source, startTime) {
    if (source === 'microphone') {
      this.micStreamStartTime = startTime;
      console.log('[TranscriptMergeService] Set microphone stream start time:', new Date(startTime).toISOString());
    } else if (source === 'system') {
      this.systemStreamStartTime = startTime;
      console.log('[TranscriptMergeService] Set system stream start time:', new Date(startTime).toISOString());
    } else {
      console.warn('[TranscriptMergeService] Unknown source:', source);
    }
  }

  /**
   * Add a transcript from a source
   * @param {string} source - 'microphone' or 'system'
   * @param {Object} transcriptData - Transcript data from Deepgram
   * @param {number} transcriptData.timestamp - Relative timestamp from Deepgram (in seconds)
   * @param {string} transcriptData.text - Transcript text
   * @param {number} transcriptData.confidence - Confidence score
   * @param {boolean} transcriptData.isFinal - Whether this is a final transcript
   * @param {number} streamStartTime - Absolute stream start time (from DeepgramService)
   */
  addTranscript(source, transcriptData, streamStartTime) {
    // Use provided streamStartTime or fall back to stored one
    const effectiveStartTime = streamStartTime || 
      (source === 'microphone' ? this.micStreamStartTime : this.systemStreamStartTime);
    
    if (!effectiveStartTime) {
      console.warn(`[TranscriptMergeService] Stream start time not set for ${source}, using current time`);
      // Fallback: use current time if stream start time not available
      const fallbackStartTime = Date.now();
      if (source === 'microphone') {
        this.micStreamStartTime = fallbackStartTime;
      } else {
        this.systemStreamStartTime = fallbackStartTime;
      }
    }

    // Deepgram timestamp is in seconds, convert to milliseconds
    // transcriptData.timestamp is the relative time from stream start
    const deepgramRelativeMs = (transcriptData.timestamp || 0) * 1000;
    const absoluteTimestamp = (effectiveStartTime || Date.now()) + deepgramRelativeMs;
    
    const mergedTranscript = {
      ...transcriptData,
      source, // 'microphone' or 'system'
      absoluteTimestamp,
      receivedAt: Date.now(), // For debugging
    };

    // Add to pending buffer
    this.pendingTranscripts.push(mergedTranscript);
    
    // Sort by absolute timestamp
    this.pendingTranscripts.sort((a, b) => a.absoluteTimestamp - b.absoluteTimestamp);
    
    // Try to emit in-order transcripts
    this._emitInOrder();
  }

  /**
   * Emit transcripts that are ready (older than buffer window)
   * @private
   */
  _emitInOrder() {
    const now = Date.now();
    
    // Emit all transcripts that are:
    // 1. Before the last emitted timestamp (shouldn't happen, but handle it)
    // 2. Or within the buffer window and older than bufferWindowMs
    while (this.pendingTranscripts.length > 0) {
      const next = this.pendingTranscripts[0];
      
      // If transcript is older than buffer window, emit it
      const age = now - next.absoluteTimestamp;
      
      if (age >= this.bufferWindowMs || next.absoluteTimestamp <= this.lastEmittedTimestamp) {
        this.pendingTranscripts.shift();
        
        // Only emit if it's newer than last emitted (handle duplicates)
        if (next.absoluteTimestamp > this.lastEmittedTimestamp) {
          this.lastEmittedTimestamp = next.absoluteTimestamp;
          this.emit('transcript:merged', next);
        }
      } else {
        // Too recent, wait for buffer window
        break;
      }
    }
  }

  /**
   * Start periodic flush timer to ensure transcripts are emitted
   */
  startFlushTimer() {
    this.stopFlushTimer(); // Clear any existing timer
    
    this.flushInterval = setInterval(() => {
      this._emitInOrder();
    }, this.flushIntervalMs);
    
    console.log('[TranscriptMergeService] Started flush timer', { 
      interval: this.flushIntervalMs,
      bufferWindow: this.bufferWindowMs 
    });
  }

  /**
   * Stop periodic flush timer
   */
  stopFlushTimer() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Clear all state
   */
  clear() {
    this.pendingTranscripts = [];
    this.lastEmittedTimestamp = 0;
    this.micStreamStartTime = null;
    this.systemStreamStartTime = null;
    this.stopFlushTimer();
    console.log('[TranscriptMergeService] Cleared state');
  }

  /**
   * Get current state for debugging
   */
  getState() {
    return {
      pendingCount: this.pendingTranscripts.length,
      lastEmittedTimestamp: this.lastEmittedTimestamp,
      micStreamStartTime: this.micStreamStartTime,
      systemStreamStartTime: this.systemStreamStartTime,
      bufferWindowMs: this.bufferWindowMs,
      flushIntervalMs: this.flushIntervalMs,
      hasFlushTimer: !!this.flushInterval,
    };
  }
}

module.exports = TranscriptMergeService;

