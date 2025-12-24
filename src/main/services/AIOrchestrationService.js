const EventEmitter = require('events');
const Groq = require('groq-sdk');

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

    // Initialize Groq client
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      console.warn('[AIOrchestrationService] GROQ_API_KEY not found in environment variables');
    }
    this.groq = new Groq({
      apiKey: groqApiKey,
    });
    console.log('[AIOrchestrationService] Groq client initialized', { hasApiKey: !!groqApiKey });

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
      
      // If prompt is null, we don't have enough context yet
      if (!prompt) {
        console.log('[AIOrchestrationService] Not enough context to generate suggestions yet');
        return;
      }
      
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
      const { insights, suggestions: completeSuggestions } = this.processResponse(fullResponse, actionType);
      console.log('[AIOrchestrationService] Processed insights:', insights);
      console.log('[AIOrchestrationService] Processed suggestions:', JSON.stringify(completeSuggestions, null, 2));
      console.log('[AIOrchestrationService] Emitting complete response', { insightsCount: insights ? 1 : 0, suggestionsCount: completeSuggestions.length });
      this.emit('ai:response', {
        actionType,
        insights,
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
      // Check if we have meaningful context
      const hasContext = recentVerbatim && recentVerbatim.trim().length > 0;
      
      if (!hasContext) {
        // Don't generate suggestions if there's no context yet
        return null;
      }

      return `You are an AI assistant helping someone during a live conversation. The conversation transcript may contain minor transcription errors (e.g., "chat g b t" instead of "ChatGPT", partial words, etc.).

Your task:
1. Interpret the transcript in context - make educated guesses about what was likely said based on context
2. Correct common transcription errors by understanding the intended meaning
3. Generate LIVE INSIGHTS: Provide 2-3 bullet points (STRICTLY 30 words total maximum) that are short, concise, and provide deeper context about the current topic. Each bullet should be 8-12 words maximum. Focus on key insights that help the user understand the topic better.
4. Generate 3 VERY CONCISE talking points (max 10 words each) that would be helpful for the speaker to continue or enhance the conversation

Recent conversation transcript (may contain minor errors):
${recentVerbatim}

${summarizedHistory ? `Previous context:\n${summarizedHistory}\n\n` : ''}

CRITICAL: Base your insights and suggestions ONLY on what is actually discussed in the conversation transcript above. Do NOT use generic examples or topics not mentioned in the conversation.

Instructions:
- Use context clues to interpret unclear or incorrectly transcribed words
- If you see "g b t" or "g p t" in context of AI, interpret it as "GPT" or "ChatGPT"
- If you see partial words or unclear phrases, use the surrounding context to infer meaning
- Generate suggestions that reflect the CORRECTED/INTERPRETED understanding of the conversation
- Make suggestions that are relevant to what was ACTUALLY being discussed (not the raw transcription errors)
- ONLY generate insights about topics actually mentioned in the conversation

OUTPUT FORMAT:
Start with "INSIGHTS:" followed by 2-3 bullet points (STRICTLY 30 words total maximum). Each bullet should be 8-12 words maximum. Be concise and focus on key insights that provide deeper context. Use bullet format with "- " prefix.

Then provide "SUGGESTIONS:" followed by a numbered list of:
- Talking points: Phrase as conversational statements/questions the user can READ DIRECTLY from the screen and say in the conversation (with minimal changes). These should sound natural and fit right into the conversation flow. Examples: "What about the implementation details?" or "How does this compare to alternatives?"
- Follow-up actions: Phrase as explicit actions the user can take. Examples: "Get more info on pricing" or "Ask about use cases"

Example format (for a conversation about project management):
INSIGHTS:
- Project timelines depend on team size and complexity
- Budget constraints often impact feature scope
- Stakeholder communication is critical for success

SUGGESTIONS:
1. What about the timeline?
2. How does this affect the budget?
3. Get more info on stakeholder requirements`;
    }

    // Other action types can be added here
    return `Based on the conversation context (note: transcript may contain minor errors, interpret in context): ${fullContext}`;
  }

  async *_callLLM(prompt, options = {}) {
    const { signal, stream = true, actionType = 'suggestion' } = options;

    if (signal.aborted) {
      return;
    }

    if (!process.env.GROQ_API_KEY) {
      console.error('[AIOrchestrationService] GROQ_API_KEY not configured');
      throw new Error('Groq API key not configured. Please set GROQ_API_KEY in your .env file.');
    }

    try {
      console.log('[AIOrchestrationService] Calling Groq API', { promptLength: prompt.length, stream });

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: 'llama-3.1-8b-instant', // Fast model for real-time suggestions
        stream: stream,
        temperature: 0.7,
        max_tokens: 500,
      });

      if (stream) {
        // Handle streaming response
        for await (const chunk of completion) {
          if (signal.aborted) {
            console.log('[AIOrchestrationService] Stream aborted');
            break;
          }

          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
          }
        }
      } else {
        // Handle non-streaming response
        const content = completion.choices?.[0]?.message?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('[AIOrchestrationService] Groq API error:', error);
      if (error.status === 401) {
        throw new Error('Invalid Groq API key. Please check your GROQ_API_KEY in .env file.');
      } else if (error.status === 429) {
        throw new Error('Groq API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`Groq API error: ${error.message}`);
      }
    }
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
    // Format LLM response as insights and action items for UI
    console.log('[AIOrchestrationService] processResponse called', { responseLength: response.length, responsePreview: response.substring(0, 200) });
    
    let insights = null;
    const suggestions = [];
    
    // Extract insights section - now expects bullet points
    const insightsMatch = response.match(/INSIGHTS:\s*(.+?)(?=SUGGESTIONS:|$)/is);
    if (insightsMatch && insightsMatch[1]) {
      const insightsText = insightsMatch[1].trim();
      // Extract bullet points (lines starting with "- ", "• ", "* ", or numbered)
      const lines = insightsText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const bullets = [];
      
      for (const line of lines) {
        // Match bullet points: "- text", "• text", "* text", or "1. text"
        const bulletMatch = line.match(/^[-\*•]\s*(.+)$/) || line.match(/^\d+[\.\)]\s*(.+)$/);
        if (bulletMatch) {
          bullets.push(bulletMatch[1].trim());
        } else if (line && !line.match(/^(INSIGHTS|SUGGESTIONS):/i)) {
          // If no bullet prefix, treat the line as a bullet point
          bullets.push(line);
        }
      }
      
      if (bullets.length > 0) {
        insights = {
          bullets: bullets,
        };
      } else {
        // Fallback: if no bullets found, use the text as-is
        insights = {
          bullets: [insightsText],
        };
      }
      console.log('[AIOrchestrationService] Extracted insights', insights);
    }
    
    // Extract suggestions section
    const suggestionsMatch = response.match(/SUGGESTIONS:\s*(.+)/is);
    const suggestionsText = suggestionsMatch ? suggestionsMatch[1] : response;
    
    // First try splitting by newlines
    let lines = suggestionsText.split('\n').filter((l) => l.trim());
    
    // If we only have one line, try splitting by numbered patterns (e.g., "1. ...2. ...3. ...")
    if (lines.length === 1) {
      console.log('[AIOrchestrationService] Single line detected, attempting to split by numbered patterns');
      // Match pattern: number followed by period/space, then text, followed by another number
      // This regex finds: "1. text2. text3. text" and splits it
      const numberedPattern = /(\d+[\.\)]\s*[^\d]+?)(?=\d+[\.\)]|$)/g;
      const matches = lines[0].match(numberedPattern);
      if (matches && matches.length > 1) {
        console.log('[AIOrchestrationService] Split by numbered patterns', { matchCount: matches.length });
        lines = matches;
      }
    }
    
    console.log('[AIOrchestrationService] Processing lines', { lineCount: lines.length, lines });

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

    return { insights, suggestions };
  }
}

module.exports = AIOrchestrationService;

