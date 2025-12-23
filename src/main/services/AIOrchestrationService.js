const EventEmitter = require('events');

class AIOrchestrationService extends EventEmitter {
  constructor(contextService) {
    super();
    this.contextService = contextService;
    this.debounceTimer = null;
    this.inFlightRequest = null; // Track in-flight requests
    this.requestAbortController = null; // For canceling requests
    this.minDebounceMs = 200; // 200ms minimum for 2+ segments
    this.singleSegmentDebounceMs = 500; // 500ms for single segment
    this.minSegmentsForImmediate = 2; // Trigger immediately if 2+ segments

    // Listen to both regular snapshots and topic changes
    contextService.on('context:snapshot', (snapshot) => {
      console.log('[AIOrchestrationService] Received context:snapshot event', { recentCount: snapshot.metadata?.recentCount });
      this._handleContextUpdate(snapshot, false);
    });

    contextService.on('context:topic-changed', ({ snapshot }) => {
      console.log('[AIOrchestrationService] Received context:topic-changed event', { recentCount: snapshot.metadata?.recentCount });
      // Immediate trigger on topic change
      this._handleContextUpdate(snapshot, true);
    });
  }

  triggerAction(actionType, metadata) {
    // Manual trigger via IPC
    return this._generateSuggestions(actionType, metadata);
  }

  _handleContextUpdate(snapshot, isTopicChange = false) {
    console.log('[AIOrchestrationService] _handleContextUpdate called', { isTopicChange, recentCount: snapshot.recentVerbatim?.length || 0 });
    
    // Cancel any in-flight request
    if (this.inFlightRequest) {
      console.log('[AIOrchestrationService] Canceling in-flight request');
      this._cancelInFlightRequest();
    }

    // Clear debounce timer
    clearTimeout(this.debounceTimer);

    if (isTopicChange) {
      // Immediate trigger for topic changes
      console.log('[AIOrchestrationService] Topic change - immediate trigger');
      this._generateSuggestions();
    } else {
      // Very short debounce for regular updates
      const recentCount = snapshot.recentVerbatim ? snapshot.recentVerbatim.length : 0;
      const debounceMs = recentCount >= this.minSegmentsForImmediate
        ? this.minDebounceMs
        : this.singleSegmentDebounceMs;

      console.log('[AIOrchestrationService] Setting debounce timer', { recentCount, debounceMs });
      this.debounceTimer = setTimeout(() => {
        console.log('[AIOrchestrationService] Debounce timer fired, generating suggestions');
        this._generateSuggestions();
      }, debounceMs);
    }
  }

  _cancelInFlightRequest() {
    if (this.requestAbortController) {
      this.requestAbortController.abort();
      this.requestAbortController = null;
    }
    this.inFlightRequest = null;
  }

  async _generateSuggestions(actionType = 'suggestion', metadata = {}) {
    // Normalize 'suggest' to 'suggestion' for consistency
    if (actionType === 'suggest') {
      actionType = 'suggestion';
    }
    
    console.log('[AIOrchestrationService] _generateSuggestions called', { actionType });
    
    // Cancel any previous request
    this._cancelInFlightRequest();

    // Create new abort controller
    this.requestAbortController = new AbortController();
    const signal = this.requestAbortController.signal;

    try {
      const contextForLLM = this.contextService.getContextForLLM();
      console.log('[AIOrchestrationService] Got context for LLM', { hasRecentText: !!contextForLLM.recentVerbatim, hasHistory: !!contextForLLM.summarizedHistory });

      // Mark as in-flight
      this.inFlightRequest = true;

      // Build prompt
      const prompt = this.buildPrompt(actionType, contextForLLM);
      console.log('[AIOrchestrationService] Built prompt', { promptLength: prompt.length });

      // Call LLM with streaming if available
      const response = await this._callLLM(prompt, {
        signal,
        stream: true, // Use streaming for faster initial response
        actionType,
      });

      // Handle streaming response
      let fullResponse = '';
      let suggestionsEmitted = false;

      console.log('[AIOrchestrationService] Starting to process streaming response');
      for await (const chunk of response) {
        if (signal.aborted) {
          console.log('[AIOrchestrationService] Response aborted during streaming');
          break; // Check if canceled
        }

        fullResponse += chunk;

        // Emit partial suggestions as they arrive (for ultra-fast UI updates)
        if (!suggestionsEmitted && fullResponse.length > 100) {
          const partialSuggestions = this._extractPartialSuggestions(fullResponse);
          if (partialSuggestions.length > 0) {
            console.log('[AIOrchestrationService] Emitting partial suggestions', { count: partialSuggestions.length });
            console.log('[AIOrchestrationService] Partial response so far:', fullResponse.substring(0, 200));
            console.log('[AIOrchestrationService] Partial suggestions:', JSON.stringify(partialSuggestions, null, 2));
            this.emit('ai:response', {
              actionType,
              suggestions: partialSuggestions,
              isPartial: true,
              timestamp: Date.now(),
            });
            suggestionsEmitted = true;
          }
        }
      }

      if (signal.aborted) {
        console.log('[AIOrchestrationService] Response was aborted');
        return;
      }

      // Emit complete response
      console.log('[AIOrchestrationService] Processing complete response', { responseLength: fullResponse.length });
      console.log('[AIOrchestrationService] Full response text:', fullResponse);
      const completeSuggestions = this.processResponse(fullResponse, actionType);
      console.log('[AIOrchestrationService] Processed suggestions:', JSON.stringify(completeSuggestions, null, 2));
      console.log('[AIOrchestrationService] Emitting complete suggestions', { count: completeSuggestions.length });
      this.emit('ai:response', {
        actionType,
        suggestions: completeSuggestions,
        isPartial: false,
        timestamp: Date.now(),
      });

      // Mark recent as processed (triggers async summarization)
      console.log('[AIOrchestrationService] Marking recent context as processed');
      this.contextService.markRecentAsProcessed();
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('[AIOrchestrationService] Error generating suggestions:', error);
      this.emit('ai:error', error);
    } finally {
      this.inFlightRequest = false;
      this.requestAbortController = null;
    }
  }

  buildPrompt(actionType, contextForLLM) {
    const { recentVerbatim, summarizedHistory, fullContext } = contextForLLM;

    if (actionType === 'suggestion') {
      return `Based on the following conversation context, generate 3-5 contextual talking points or suggestions that would be helpful for the speaker to continue or enhance the conversation.

Recent conversation:
${recentVerbatim || 'No recent conversation'}

${summarizedHistory ? `Previous context:\n${summarizedHistory}\n\n` : ''}

Generate suggestions as a numbered list. Each suggestion should be concise and actionable.`;
    }

    // Other action types can be added here
    return `Based on the conversation context: ${fullContext}`;
  }

  async *_callLLM(prompt, options = {}) {
    const { signal, stream = false, actionType = 'suggestion' } = options;

    // Initial implementation: Mock LLM response
    // TODO: Replace with actual LLM provider integration
    if (signal.aborted) {
      return;
    }

    // Simulate streaming response
    const mockSuggestions = this._generateMockSuggestions(prompt);
    const mockResponse = mockSuggestions.join('\n');

    if (stream) {
      // Simulate streaming by chunking the response
      // Preserve newlines by splitting on spaces but keeping newlines in chunks
      const chunks = mockResponse.match(/.{1,10}/g) || [mockResponse]; // Chunk by ~10 chars to preserve structure
      for (let i = 0; i < chunks.length; i++) {
        if (signal.aborted) {
          break;
        }
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 20));
        yield chunks[i];
      }
    } else {
      yield mockResponse;
    }
  }

  _generateMockSuggestions(prompt) {
    // Extract keywords from prompt to make suggestions more contextual
    const keywords = prompt
      .toLowerCase()
      .match(/\b\w{4,}\b/g)
      ?.slice(0, 5) || [];

    const baseSuggestions = [
      'Ask a clarifying question about the topic',
      'Provide a relevant example or analogy',
      'Share a related insight or perspective',
      'Propose next steps or action items',
      'Connect to a related concept or idea',
    ];

    // Return 3-5 suggestions
    return baseSuggestions.slice(0, 3 + Math.floor(Math.random() * 3)).map((suggestion, index) => {
      return `${index + 1}. ${suggestion}`;
    });
  }

  _extractPartialSuggestions(partialText) {
    // Extract suggestions from partial response
    // Look for numbered lists, bullet points, etc.
    const lines = partialText.split('\n').filter((l) => l.trim());
    const suggestions = [];

    for (const line of lines) {
      // Match patterns like "1. ", "- ", "* ", etc.
      const match = line.match(/^[\d\-\*•]\s*[\.\)]\s*(.+)/);
      if (match) {
        suggestions.push({
          id: `partial-${suggestions.length}`,
          type: 'suggest',
          label: match[1].trim(),
          icon: 'lightbulb',
        });
      }
    }

    return suggestions.slice(0, 3); // Return first 3 partial suggestions
  }

  processResponse(response, actionType) {
    // Format LLM response as action items for UI
    console.log('[AIOrchestrationService] processResponse called', { responseLength: response.length, responsePreview: response.substring(0, 200) });
    const lines = response.split('\n').filter((l) => l.trim());
    console.log('[AIOrchestrationService] Split into lines', { lineCount: lines.length, lines });
    const suggestions = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match patterns like "1. ", "1)", "- ", "* ", "• ", etc.
      // More flexible: match number/bullet, optional punctuation, then text
      const match = line.match(/^[\d\-\*•]\s*[\.\)]?\s*(.+)/) || line.match(/^[\d\-\*•]\s+(.+)/);
      console.log('[AIOrchestrationService] Processing line', { line, match: match ? match[1] : 'no match' });
      if (match && match[1]) {
        const label = match[1].trim();
        // Determine type based on content
        let type = 'suggest';
        if (label.toLowerCase().includes('question') || label.toLowerCase().includes('ask')) {
          type = 'question';
        } else if (label.toLowerCase().includes('define') || label.toLowerCase().includes('explain')) {
          type = 'define';
        }

        console.log('[AIOrchestrationService] Creating suggestion', { id: `suggestion-${i}`, type, label, icon: type === 'question' ? 'help-circle' : type === 'define' ? 'book' : 'lightbulb' });
        suggestions.push({
          id: `suggestion-${i}`,
          type,
          label,
          icon: type === 'question' ? 'help-circle' : type === 'define' ? 'book' : 'lightbulb',
        });
      }
    }

    // Ensure we have at least some suggestions
    if (suggestions.length === 0) {
      suggestions.push({
        id: 'suggestion-fallback',
        type: 'suggest',
        label: 'Continue the conversation',
        icon: 'lightbulb',
      });
    }

    return suggestions;
  }
}

module.exports = AIOrchestrationService;

