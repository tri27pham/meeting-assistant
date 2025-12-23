const EventEmitter = require('events');

class ContextService extends EventEmitter {
  constructor() {
    super();
    this.recentVerbatim = []; // Last 2-3 segments, ~30-60 seconds (exact transcription)
    this.summarizedHistory = []; // Older context - compressed summaries
    this.maxRecentSegments = 3; // Keep 3 segments verbatim
    this.maxHistorySummaries = 10; // Keep last 10 summaries
    this.pendingSummarization = false; // Track if summarization in progress
    this.currentTopic = null; // Current topic identifier
    this.previousEmbedding = null; // Previous segment embedding (for similarity)
    this.embeddingModel = null; // Lazy-loaded embedding model
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
        // Emit special event for topic change
        const snapshot = this.getSnapshot();
        console.log('[ContextService] Emitting context:topic-changed', { previousTopic, newTopic: this.currentTopic });
        this.emit('context:topic-changed', {
          snapshot,
          previousTopic,
          newTopic: this.currentTopic,
        });
      }

      // Always emit snapshot (for regular updates)
      const snapshot = this.getSnapshot();
      console.log('[ContextService] Emitting context:snapshot', { recentCount: snapshot.metadata.recentCount, historyCount: snapshot.metadata.historySummaryCount });
      this.emit('context:snapshot', snapshot);
    } catch (error) {
      console.error('[ContextService] Error adding segment:', error);
      this.emit('error', error);
    }
  }

  getSnapshot() {
    const recentCount = this.recentVerbatim.length;
    const historyCount = this.summarizedHistory.length;
    const oldestTimestamp = recentCount > 0
      ? this.recentVerbatim[0].timestamp
      : (historyCount > 0 ? this.summarizedHistory[0].timestamp : Date.now());
    const newestTimestamp = recentCount > 0
      ? this.recentVerbatim[recentCount - 1].timestamp
      : (historyCount > 0 ? this.summarizedHistory[historyCount - 1].timestamp : Date.now());

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
    // After LLM response, summarize recent buffer
    if (this.recentVerbatim.length > 0) {
      this._summarizeRecentAsync();
    }
  }

  clear() {
    this.recentVerbatim = [];
    this.summarizedHistory = [];
    this.currentTopic = null;
    this.previousEmbedding = null;
    this.pendingSummarization = false;
    this.emit('context:cleared');
  }

  // Private methods

  _detectTopicChange(newSegment) {
    if (this.recentVerbatim.length < 2) {
      return true; // First segments always indicate topic change
    }

    // Tier 1: Rule-based detection (fast, ~1ms)
    const ruleBasedResult = this._ruleBasedDetection(newSegment);
    if (ruleBasedResult.confidence === 'high') {
      return ruleBasedResult.changed;
    }

    // Tier 2: Semantic embeddings (accurate, ~20-50ms) - if available
    // For now, fallback to rule-based
    // TODO: Implement semantic embeddings in Phase 2
    return ruleBasedResult.changed;
  }

  _ruleBasedDetection(newSegment) {
    const indicators = [];

    // 1. Question words (strong indicator)
    const questionWords = ['what', 'why', 'how', 'when', 'where', 'who', 'which'];
    const startsWithQuestion = questionWords.some((q) =>
      newSegment.text.toLowerCase().trim().startsWith(q)
    );
    if (startsWithQuestion) {
      indicators.push('question');
    }

    // 2. Time gap (pause in conversation)
    if (this.recentVerbatim.length > 0) {
      const lastSegment = this.recentVerbatim[this.recentVerbatim.length - 1];
      const timeGap = (newSegment.timestamp - lastSegment.timestamp) / 1000;
      if (timeGap > 5) {
        indicators.push('pause');
      }
    }

    // 3. Keyword overlap (low overlap = topic change)
    const newKeywords = this._extractKeywords(newSegment.text);
    const previousText = this.recentVerbatim
      .slice(-3) // Last 3 segments
      .map((s) => s.text)
      .join(' ');
    const prevKeywords = this._extractKeywords(previousText);
    const overlap = this._calculateKeywordOverlap(newKeywords, prevKeywords);

    if (overlap < 0.2) {
      indicators.push('low_overlap');
    }

    // 4. Named entities / proper nouns (new person/place = topic change)
    const newEntities = this._extractEntities(newSegment.text);
    const prevEntities = this._extractEntities(previousText);
    const newEntityCount = newEntities.filter((e) => !prevEntities.includes(e)).length;
    if (newEntityCount > 2) {
      indicators.push('new_entities');
    }

    // 5. Sentence structure change (declarative -> question, etc.)
    const structureChange = this._detectStructureChange(newSegment.text, previousText);
    if (structureChange) {
      indicators.push('structure_change');
    }

    // Decision logic
    const strongIndicators = ['question', 'new_entities'];
    const hasStrongIndicator = strongIndicators.some((ind) => indicators.includes(ind));
    const indicatorCount = indicators.length;

    if (hasStrongIndicator || indicatorCount >= 2) {
      return { changed: true, confidence: 'high', indicators };
    } else if (indicatorCount === 1) {
      return { changed: true, confidence: 'medium', indicators };
    }

    return { changed: false, confidence: 'high', indicators: [] };
  }

  _extractKeywords(text) {
    // Remove stop words, extract meaningful terms
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can',
    ]);
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w));
    return [...new Set(words)]; // Unique keywords
  }

  _calculateKeywordOverlap(keywords1, keywords2) {
    if (keywords1.length === 0 || keywords2.length === 0) {
      return 0;
    }

    const intersection = keywords1.filter((k) => keywords2.includes(k));
    const union = [...new Set([...keywords1, ...keywords2])];

    return union.length > 0 ? intersection.length / union.length : 0;
  }

  _extractEntities(text) {
    // Simple entity extraction (can be enhanced with NER)
    // Look for capitalized words, common patterns
    const capitalized = text.match(/\b[A-Z][a-z]+\b/g) || [];
    return [...new Set(capitalized)];
  }

  _detectStructureChange(newText, prevText) {
    // Check if sentence type changed (question, exclamation, statement)
    const newIsQuestion = /[?]/.test(newText);
    const prevIsQuestion = /[?]/.test(prevText);

    return newIsQuestion !== prevIsQuestion;
  }

  _extractTopic(segment) {
    // Simple topic extraction (first few words or keywords)
    const words = segment.text.split(/\s+/).slice(0, 5);
    return words.join(' ').toLowerCase();
  }

  _queueForSummarization(segment) {
    // For now, just log - actual summarization happens in _summarizeRecentAsync
    // This is a placeholder for future enhancement
  }

  async _summarizeRecentAsync() {
    if (this.pendingSummarization) {
      return; // Already in progress
    }

    this.pendingSummarization = true;
    const toSummarize = [...this.recentVerbatim];

    // Keep only the newest 1 segment in recent buffer
    this.recentVerbatim = this.recentVerbatim.slice(-1);

    // Summarize asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        const summary = await this._createSummary(toSummarize);
        this._mergeSummaryIntoHistory(summary, toSummarize);
      } catch (error) {
        console.error('[ContextService] Error summarizing recent buffer:', error);
        this.emit('error', error);
      } finally {
        this.pendingSummarization = false;
      }
    });
  }

  async _createSummary(segments) {
    // Phase 1: Simple compression (fast, no additional LLM call)
    const text = segments.map((s) => s.text).join(' ');
    if (text.length < 200) {
      return text; // Short enough, no need to summarize
    }

    // Extract key points (simple heuristic)
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) {
      return text;
    }

    const keyPoints = sentences.slice(0, 2).join('. ') + (sentences.length > 2 ? '...' : '');

    // Phase 2: LLM-based summarization (future - can be async)
    // return await this._llmSummarize(text);

    return keyPoints;
  }

  _mergeSummaryIntoHistory(summary, originalSegments) {
    this.summarizedHistory.push({
      summary,
      timestamp: originalSegments[0].timestamp,
      segmentCount: originalSegments.length,
      duration: originalSegments.reduce((sum, s) => sum + (s.duration || 0), 0),
    });

    // Keep only last N summaries
    if (this.summarizedHistory.length > this.maxHistorySummaries) {
      this.summarizedHistory.shift();
    }
  }
}

module.exports = ContextService;

