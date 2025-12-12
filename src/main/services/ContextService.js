const { EventEmitter } = require('events');

class ContextService extends EventEmitter {
  constructor() {
    super();
    
    this._segments = [];
    this._keyPoints = [];
    this._sessionStartTime = null;
    this._isSessionActive = false;
    
    this._config = {
      maxSegments: 100,
      maxContextDuration: 30 * 60 * 1000, // 30 minutes
      maxTokenEstimate: 4000,
      summaryThreshold: 20,
    };

    // Auto-suggestion configuration
    this._autoSuggest = {
      enabled: true,
      minWordsBetweenSuggestions: 40,
      minTimeBetweenSuggestions: 15000, // 15 seconds
      pauseThreshold: 2000, // 2 second pause triggers suggestion
      questionDetection: true,
      topicChangeDetection: true,
    };

    // Auto-suggestion state
    this._suggestionState = {
      lastSuggestionTime: 0,
      lastSuggestionWordCount: 0,
      wordsSinceLastSuggestion: 0,
      pendingSuggestion: null,
      pauseTimer: null,
      isProcessing: false,
      lastTopics: [],
    };
  }

  setAutoSuggestEnabled(enabled) {
    this._autoSuggest.enabled = enabled;
    console.log(`[ContextService] Auto-suggest ${enabled ? 'enabled' : 'disabled'}`);
    
    if (!enabled && this._suggestionState.pauseTimer) {
      clearTimeout(this._suggestionState.pauseTimer);
      this._suggestionState.pauseTimer = null;
    }
  }

  setAutoSuggestConfig(config) {
    this._autoSuggest = { ...this._autoSuggest, ...config };
    console.log('[ContextService] Auto-suggest config updated:', this._autoSuggest);
  }

  getAutoSuggestState() {
    return {
      enabled: this._autoSuggest.enabled,
      config: { ...this._autoSuggest },
      wordsSinceLastSuggestion: this._suggestionState.wordsSinceLastSuggestion,
      timeSinceLastSuggestion: this._suggestionState.lastSuggestionTime 
        ? Date.now() - this._suggestionState.lastSuggestionTime 
        : null,
      isProcessing: this._suggestionState.isProcessing,
    };
  }

  startSession() {
    this._sessionStartTime = Date.now();
    this._isSessionActive = true;
    this._segments = [];
    this._keyPoints = [];
    
    // Reset suggestion state
    this._suggestionState = {
      lastSuggestionTime: 0,
      lastSuggestionWordCount: 0,
      wordsSinceLastSuggestion: 0,
      pendingSuggestion: null,
      pauseTimer: null,
      isProcessing: false,
      lastTopics: [],
    };
    
    this.emit('session-started', { timestamp: this._sessionStartTime });
    console.log('[ContextService] Session started');
  }

  endSession() {
    const summary = this.getSessionSummary();
    this._isSessionActive = false;
    
    // Clear pause timer
    if (this._suggestionState.pauseTimer) {
      clearTimeout(this._suggestionState.pauseTimer);
      this._suggestionState.pauseTimer = null;
    }
    
    this.emit('session-ended', { summary });
    console.log('[ContextService] Session ended');
    return summary;
  }

  addTranscriptSegment(segment) {
    const enrichedSegment = {
      id: `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: segment.text,
      confidence: segment.confidence || 1,
      timestamp: segment.timestamp || Date.now(),
      isFinal: segment.isFinal !== false,
      speaker: segment.speaker || 'unknown',
      wordCount: segment.text.split(/\s+/).length,
    };

    this._segments.push(enrichedSegment);
    this._pruneOldSegments();
    
    this.emit('segment-added', enrichedSegment);
    
    if (this._segments.length % this._config.summaryThreshold === 0) {
      this._extractKeyPoints();
    }

    // Auto-suggestion logic
    if (this._autoSuggest.enabled && this._isSessionActive) {
      this._suggestionState.wordsSinceLastSuggestion += enrichedSegment.wordCount;
      this._evaluateAutoSuggestion(enrichedSegment);
    }

    return enrichedSegment;
  }

  _evaluateAutoSuggestion(segment) {
    // Clear any existing pause timer
    if (this._suggestionState.pauseTimer) {
      clearTimeout(this._suggestionState.pauseTimer);
    }

    // Check if we're already processing a suggestion
    if (this._suggestionState.isProcessing) return;

    // Check rate limiting
    const timeSinceLastSuggestion = Date.now() - this._suggestionState.lastSuggestionTime;
    if (timeSinceLastSuggestion < this._autoSuggest.minTimeBetweenSuggestions) {
      this._schedulePauseSuggestion();
      return;
    }

    // Immediate triggers
    const shouldTriggerNow = this._checkImmediateTriggers(segment);
    if (shouldTriggerNow) {
      this._triggerAutoSuggestion(shouldTriggerNow.type, shouldTriggerNow.reason);
      return;
    }

    // Schedule pause-based suggestion
    this._schedulePauseSuggestion();
  }

  _checkImmediateTriggers(segment) {
    const text = segment.text.toLowerCase();

    // Question detection - someone asked a question
    if (this._autoSuggest.questionDetection) {
      const questionPatterns = [
        /\bwhat\s+(is|are|was|were|do|does|did)\b/i,
        /\bhow\s+(do|does|did|can|could|would|is|are)\b/i,
        /\bwhy\s+(is|are|do|does|did|would|should)\b/i,
        /\bwho\s+(is|are|was|were)\b/i,
        /\bwhen\s+(is|are|was|were|did|do|does)\b/i,
        /\bwhere\s+(is|are|was|were|do|does)\b/i,
        /\bcan\s+you\s+(tell|explain|help)\b/i,
        /\bdo\s+you\s+know\b/i,
        /\?$/,
      ];

      for (const pattern of questionPatterns) {
        if (pattern.test(text)) {
          return { type: 'question', reason: 'Question detected in conversation' };
        }
      }
    }

    // Word count threshold reached
    if (this._suggestionState.wordsSinceLastSuggestion >= this._autoSuggest.minWordsBetweenSuggestions) {
      return { type: 'word_threshold', reason: `${this._suggestionState.wordsSinceLastSuggestion} words accumulated` };
    }

    // Topic/keyword detection
    if (this._autoSuggest.topicChangeDetection) {
      const topicIndicators = [
        /\blet'?s\s+talk\s+about\b/i,
        /\bspeaking\s+of\b/i,
        /\bby\s+the\s+way\b/i,
        /\bchanging\s+topics?\b/i,
        /\bon\s+another\s+note\b/i,
        /\bmoving\s+on\b/i,
      ];

      for (const pattern of topicIndicators) {
        if (pattern.test(text)) {
          return { type: 'topic_change', reason: 'Topic change detected' };
        }
      }
    }

    return null;
  }

  _schedulePauseSuggestion() {
    // Schedule a suggestion after a pause in speech
    this._suggestionState.pauseTimer = setTimeout(() => {
      if (!this._suggestionState.isProcessing && 
          this._suggestionState.wordsSinceLastSuggestion >= 15) { // Minimum words for pause suggestion
        this._triggerAutoSuggestion('pause', 'Pause detected in conversation');
      }
    }, this._autoSuggest.pauseThreshold);
  }

  _triggerAutoSuggestion(triggerType, reason) {
    if (this._suggestionState.isProcessing) return;
    if (this._segments.length < 3) return; // Need enough context

    this._suggestionState.isProcessing = true;
    
    const suggestionRequest = {
      type: this._determineSuggestionType(triggerType),
      triggerType,
      reason,
      timestamp: Date.now(),
      wordCount: this._suggestionState.wordsSinceLastSuggestion,
      context: this.getContextSnapshot({ maxSegments: 20 }),
    };

    console.log(`[ContextService] 🎯 Auto-suggestion triggered: ${triggerType} - ${reason}`);
    this.emit('auto-suggest', suggestionRequest);
  }

  _determineSuggestionType(triggerType) {
    // Determine what kind of AI suggestion to request
    switch (triggerType) {
      case 'question':
        return 'help'; // Answer the question
      case 'topic_change':
        return 'help'; // Provide info on new topic
      case 'word_threshold':
      case 'pause':
      default:
        return 'talking_points'; // Suggest talking points
    }
  }

  markSuggestionComplete() {
    this._suggestionState.isProcessing = false;
    this._suggestionState.lastSuggestionTime = Date.now();
    this._suggestionState.wordsSinceLastSuggestion = 0;
  }

  markSuggestionFailed() {
    this._suggestionState.isProcessing = false;
  }

  // Called when utterance ends (from STT service)
  onUtteranceEnd() {
    if (!this._autoSuggest.enabled || !this._isSessionActive) return;
    
    // Utterance end is a good time for suggestions
    if (this._suggestionState.pauseTimer) {
      clearTimeout(this._suggestionState.pauseTimer);
    }

    // Trigger after short delay to allow for follow-up speech
    this._suggestionState.pauseTimer = setTimeout(() => {
      if (!this._suggestionState.isProcessing && 
          this._suggestionState.wordsSinceLastSuggestion >= 20) {
        const timeSinceLastSuggestion = Date.now() - this._suggestionState.lastSuggestionTime;
        if (timeSinceLastSuggestion >= this._autoSuggest.minTimeBetweenSuggestions) {
          this._triggerAutoSuggestion('utterance_end', 'Natural pause after utterance');
        }
      }
    }, 1500);
  }

  _pruneOldSegments() {
    const now = Date.now();
    const cutoffTime = now - this._config.maxContextDuration;
    
    this._segments = this._segments.filter(seg => seg.timestamp > cutoffTime);
    
    if (this._segments.length > this._config.maxSegments) {
      const removed = this._segments.splice(0, this._segments.length - this._config.maxSegments);
      console.log(`[ContextService] Pruned ${removed.length} old segments`);
    }
  }

  _extractKeyPoints() {
    const recentSegments = this._segments.slice(-this._config.summaryThreshold);
    const combinedText = recentSegments.map(s => s.text).join(' ');
    
    const keyPoint = {
      id: `kp_${Date.now()}`,
      timestamp: Date.now(),
      segmentRange: {
        start: recentSegments[0]?.id,
        end: recentSegments[recentSegments.length - 1]?.id,
      },
      preview: combinedText.substring(0, 200) + (combinedText.length > 200 ? '...' : ''),
    };
    
    this._keyPoints.push(keyPoint);
    this.emit('key-point-extracted', keyPoint);
  }

  getContextSnapshot(options = {}) {
    const {
      maxSegments = 50,
      maxTokens = this._config.maxTokenEstimate,
      includeKeyPoints = true,
      since = null,
    } = options;

    let segments = [...this._segments];
    
    if (since) {
      segments = segments.filter(seg => seg.timestamp > since);
    }
    
    segments = segments.slice(-maxSegments);
    
    let transcript = '';
    let tokenEstimate = 0;
    const selectedSegments = [];
    
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      const segTokens = Math.ceil(seg.wordCount * 1.3);
      
      if (tokenEstimate + segTokens > maxTokens) break;
      
      selectedSegments.unshift(seg);
      tokenEstimate += segTokens;
    }
    
    transcript = selectedSegments.map(seg => seg.text).join(' ');

    const snapshot = {
      transcript,
      segments: selectedSegments,
      segmentCount: selectedSegments.length,
      totalSegments: this._segments.length,
      tokenEstimate,
      timeRange: {
        start: selectedSegments[0]?.timestamp || null,
        end: selectedSegments[selectedSegments.length - 1]?.timestamp || null,
        duration: selectedSegments.length > 0 
          ? (selectedSegments[selectedSegments.length - 1].timestamp - selectedSegments[0].timestamp)
          : 0,
      },
      sessionActive: this._isSessionActive,
      sessionDuration: this._sessionStartTime 
        ? Date.now() - this._sessionStartTime 
        : 0,
    };

    if (includeKeyPoints) {
      snapshot.keyPoints = [...this._keyPoints];
    }

    return snapshot;
  }

  getRecentTranscript(maxSegments = 10) {
    return this._segments
      .slice(-maxSegments)
      .map(seg => seg.text)
      .join(' ');
  }

  getFullTranscript() {
    return this._segments.map(seg => seg.text).join(' ');
  }

  getSegments(options = {}) {
    const { limit = 50, since = null } = options;
    let segments = [...this._segments];
    
    if (since) {
      segments = segments.filter(seg => seg.timestamp > since);
    }
    
    return segments.slice(-limit);
  }

  getKeyPoints() {
    return [...this._keyPoints];
  }

  addKeyPoint(text, metadata = {}) {
    const keyPoint = {
      id: `kp_${Date.now()}`,
      text,
      timestamp: Date.now(),
      source: metadata.source || 'manual',
      ...metadata,
    };
    
    this._keyPoints.push(keyPoint);
    this.emit('key-point-added', keyPoint);
    return keyPoint;
  }

  getSessionSummary() {
    const duration = this._sessionStartTime 
      ? Date.now() - this._sessionStartTime 
      : 0;
    
    const totalWords = this._segments.reduce((sum, seg) => sum + seg.wordCount, 0);
    
    return {
      sessionStart: this._sessionStartTime,
      duration,
      segmentCount: this._segments.length,
      keyPointCount: this._keyPoints.length,
      totalWords,
      averageConfidence: this._segments.length > 0
        ? this._segments.reduce((sum, seg) => sum + seg.confidence, 0) / this._segments.length
        : 0,
    };
  }

  getState() {
    return {
      isSessionActive: this._isSessionActive,
      segmentCount: this._segments.length,
      keyPointCount: this._keyPoints.length,
      sessionDuration: this._sessionStartTime 
        ? Date.now() - this._sessionStartTime 
        : 0,
      config: { ...this._config },
      autoSuggest: this.getAutoSuggestState(),
    };
  }

  setConfig(config) {
    this._config = { ...this._config, ...config };
    console.log('[ContextService] Config updated:', this._config);
  }

  clearContext() {
    const summary = this.getSessionSummary();
    this._segments = [];
    this._keyPoints = [];
    this.emit('context-cleared', { summary });
    console.log('[ContextService] Context cleared');
    return summary;
  }

  destroy() {
    this.clearContext();
    this.removeAllListeners();
  }
}

module.exports = new ContextService();
