const EventEmitter = require('events');

class ContextService extends EventEmitter {
  constructor() {
    super();
    this.recentVerbatim = []; // Last 2-3 segments, ~30-60 seconds (exact transcription)
    this.summarizedHistory = []; // Older segments, summarized
    this.maxRecentSegments = 3; // Keep last 3 segments verbatim
    this.currentTopic = null;
    
    // Periodic emission settings
    this.periodicIntervalMs = 5000; // Emit every 5 seconds
    this.periodicTimer = null;
    this.lastEmissionTime = null;
    this.minSegmentsForEmission = 2; // Minimum segments before emitting
    this.pendingSnapshot = null; // Store snapshot for periodic emission
  }

  addSegment(segment) {
    try {
      console.log('[ContextService] addSegment called:', { text: segment.text?.substring(0, 50), timestamp: segment.timestamp });
      
      // Add to recent verbatim buffer
      this.recentVerbatim.push(segment);
      console.log('[ContextService] Recent verbatim count:', this.recentVerbatim.length);

      // If recent buffer exceeds limit, oldest goes to summarization queue
      if (this.recentVerbatim.length > this.maxRecentSegments) {
        const oldest = this.recentVerbatim.shift();
        // Queue for summarization (non-blocking)
        this._queueForSummarization(oldest);
      }

      // Detect topic change
      const previousTopic = this.currentTopic;
      const topicChanged = this._detectTopicChange(segment);
      console.log('[ContextService] Topic change detected:', topicChanged, { previousTopic, newSegment: segment.text?.substring(0, 30) });

      if (topicChanged) {
        this.currentTopic = this._extractTopic(segment);
        // Emit special event for topic change (immediate)
        const snapshot = this.getSnapshot();
        console.log('[ContextService] Emitting context:topic-changed', { previousTopic, newTopic: this.currentTopic });
        this.emit('context:topic-changed', {
          snapshot,
          previousTopic,
          newTopic: this.currentTopic,
        });
        // Reset periodic timer on topic change
        this._resetPeriodicTimer();
      } else {
        // Store snapshot for periodic emission (don't emit immediately)
        this.pendingSnapshot = this.getSnapshot();
        
        // Start periodic timer if not already running
        if (!this.periodicTimer) {
          this._startPeriodicTimer();
        }
      }
    } catch (error) {
      console.error('[ContextService] Error adding segment:', error);
      this.emit('error', error);
    }
  }

  getSnapshot() {
    const recentCount = this.recentVerbatim.length;
    const historyCount = this.summarizedHistory.length;
    const oldestTimestamp = recentCount > 0 ? this.recentVerbatim[0].timestamp : null;
    const newestTimestamp = recentCount > 0 ? this.recentVerbatim[recentCount - 1].timestamp : null;

    return {
      recentVerbatim: [...this.recentVerbatim],
      summarizedHistory: [...this.summarizedHistory],
      metadata: {
        recentCount,
        historySummaryCount: historyCount,
        oldestTimestamp,
        newestTimestamp,
      },
    };
  }

  getContextForLLM() {
    const recentText = this.recentVerbatim
      .map((s) => s.text)
      .join(' ')
      .trim();

    const historyText = this.summarizedHistory
      .map((s) => s.summary)
      .join('\n\n')
      .trim();

    const fullContext = historyText
      ? `${historyText}\n\n${recentText}`
      : recentText;

    console.log('[ContextService] getContextForLLM called', {
      recentTextLength: recentText.length,
      historyTextLength: historyText.length,
      fullContextLength: fullContext.length,
    });

    return {
      recentVerbatim: recentText,
      summarizedHistory: historyText,
      fullContext,
    };
  }

  markRecentAsProcessed() {
    // Mark recent segments for async summarization
    if (this.recentVerbatim.length > 0) {
      // For now, just move oldest to history (simplified)
      // TODO: Implement actual summarization
      const toSummarize = [...this.recentVerbatim];
      this.recentVerbatim = this.recentVerbatim.slice(-1); // Keep only the most recent
      
      // Simple summarization: just join text
      toSummarize.forEach((segment) => {
        this.summarizedHistory.push({
          summary: segment.text,
          timestamp: segment.timestamp,
        });
      });
    }
  }

  clear() {
    this.recentVerbatim = [];
    this.summarizedHistory = [];
    this.currentTopic = null;
    // Clear periodic timer
    if (this.periodicTimer) {
      clearTimeout(this.periodicTimer);
      this.periodicTimer = null;
    }
    this.pendingSnapshot = null;
    this.lastEmissionTime = null;
    console.log('[ContextService] Context cleared');
  }

  _startPeriodicTimer() {
    // Clear any existing timer
    if (this.periodicTimer) {
      clearTimeout(this.periodicTimer);
    }

    // Emit immediately if we have enough segments and enough time has passed
    const now = Date.now();
    const timeSinceLastEmission = this.lastEmissionTime ? now - this.lastEmissionTime : Infinity;
    
    if (this.pendingSnapshot && 
        this.pendingSnapshot.metadata.recentCount >= this.minSegmentsForEmission &&
        timeSinceLastEmission >= this.periodicIntervalMs) {
      this._emitPeriodicSnapshot();
    }

    // Set up periodic emission
    this.periodicTimer = setTimeout(() => {
      this._emitPeriodicSnapshot();
      // Continue periodic emissions
      this._startPeriodicTimer();
    }, this.periodicIntervalMs);
  }

  _resetPeriodicTimer() {
    if (this.periodicTimer) {
      clearTimeout(this.periodicTimer);
      this.periodicTimer = null;
    }
    this.lastEmissionTime = Date.now();
  }

  _emitPeriodicSnapshot() {
    if (this.pendingSnapshot && 
        this.pendingSnapshot.metadata.recentCount >= this.minSegmentsForEmission) {
      console.log('[ContextService] Emitting periodic context:snapshot', { 
        recentCount: this.pendingSnapshot.metadata.recentCount, 
        historyCount: this.pendingSnapshot.metadata.historySummaryCount 
      });
      this.emit('context:snapshot', this.pendingSnapshot);
      this.lastEmissionTime = Date.now();
      this.pendingSnapshot = null; // Clear pending snapshot
    }
  }

  _detectTopicChange(segment) {
    // Simple rule-based topic detection
    // TODO: Add semantic embeddings for better detection
    
    if (this.recentVerbatim.length < 2) {
      return true; // First or second segment is always a topic change
    }

    const previousText = this.recentVerbatim
      .slice(0, -1)
      .map((s) => s.text)
      .join(' ')
      .toLowerCase();

    const currentText = segment.text.toLowerCase();

    // Check for question words (indicates topic change)
    const questionWords = ['what', 'who', 'when', 'where', 'why', 'how', 'which'];
    const hasQuestion = questionWords.some((word) => currentText.includes(word));

    // Check for time gaps (if timestamps are available)
    if (this.recentVerbatim.length > 0) {
      const lastSegment = this.recentVerbatim[this.recentVerbatim.length - 1];
      const timeGap = segment.timestamp - lastSegment.timestamp;
      if (timeGap > 5) {
        // 5+ second gap suggests topic change
        return true;
      }
    }

    // Simple keyword overlap check
    const previousWords = new Set(previousText.split(/\s+/).filter((w) => w.length > 3));
    const currentWords = new Set(currentText.split(/\s+/).filter((w) => w.length > 3));
    const overlap = [...currentWords].filter((w) => previousWords.has(w)).length;
    const overlapRatio = overlap / Math.max(currentWords.size, 1);

    // Low overlap + question = likely topic change
    if (hasQuestion && overlapRatio < 0.2) {
      return true;
    }

    return false;
  }

  _extractTopic(segment) {
    // Extract a simple topic from the segment
    const words = segment.text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    return words.slice(0, 5).join(' ');
  }

  _queueForSummarization(segment) {
    // TODO: Implement async summarization
    // For now, just add to history
    this.summarizedHistory.push({
      summary: segment.text,
      timestamp: segment.timestamp,
    });
  }
}

module.exports = ContextService;

