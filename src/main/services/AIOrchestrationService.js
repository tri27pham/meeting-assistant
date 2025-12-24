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
    
    // Only cancel in-flight requests on topic changes (more important)
    // For periodic updates, let the current request finish if it's in progress
    if (isTopicChange && this.inFlightRequest) {
      console.log('[AIOrchestrationService] Topic change detected - canceling in-flight request');
      this._cancelInFlightRequest();
    } else if (this.inFlightRequest) {
      console.log('[AIOrchestrationService] Periodic update received, but request in progress - will wait for completion');
      // Don't cancel - let the current request finish
      // Clear debounce timer and return early
      clearTimeout(this.debounceTimer);
      return;
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
        // Check again if a request is in flight before starting a new one
        if (this.inFlightRequest) {
          console.log('[AIOrchestrationService] Debounce timer fired but request still in flight, skipping');
          return;
        }
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
3. Generate three distinct types of output based on the conversation

Recent conversation transcript (may contain minor errors):
${recentVerbatim}

${summarizedHistory ? `Previous context:\n${summarizedHistory}\n\n` : ''}

CRITICAL: Base your output ONLY on what is actually discussed in the conversation transcript above. Do NOT use generic examples or topics not mentioned in the conversation.

FOCUS REQUIREMENT:
- Your response MUST focus primarily on the NEWEST part of the transcript (the "Recent conversation transcript" section above)
- Only reference previous context when it is directly relevant to understanding or expanding on the current topic
- Do NOT generate insights, talking points, or actions about topics that are only mentioned in previous context unless they are actively being discussed in the recent transcript
- Prioritize what is being discussed RIGHT NOW in the conversation

Instructions:
- Use context clues to interpret unclear or incorrectly transcribed words
- If you see partial words or unclear phrases, use the surrounding context to infer meaning
- Generate output that reflects the CORRECTED/INTERPRETED understanding of the conversation
- ONLY generate insights about topics actually mentioned in the conversation
- Focus on the most recent discussion points

CRITICAL OUTPUT FORMAT REQUIREMENTS:
You MUST follow this EXACT format. Do NOT deviate. Do NOT add extra text before or after these sections. Do NOT use markdown formatting. Use ONLY the exact section headers and formatting shown below.

OUTPUT FORMAT (copy this structure exactly):

INSIGHTS:
- [First insight, 8-12 words max]
- [Second insight, 8-12 words max]
- [Third insight, 8-12 words max]

TALKING POINTS:
1. [First talking point, max 10 words]
2. [Second talking point, max 10 words]
3. [Third talking point, max 10 words]

FOLLOW-UP ACTIONS:
1. [First action, max 15 words]
2. [Second action, max 15 words]
3. [Third action, max 15 words]

FORMATTING RULES (STRICTLY ENFORCED):
1. Start with "INSIGHTS:" on its own line (no leading text)
2. Each insight MUST start with "- " (dash followed by space)
3. Each insight MUST be on its own line
4. After the last insight, add a blank line
5. Then "TALKING POINTS:" on its own line
6. Each talking point MUST start with a number followed by ". " (e.g., "1. ", "2. ", "3. ")
7. Each talking point MUST be on its own line
8. After the last talking point, add a blank line
9. Then "FOLLOW-UP ACTIONS:" on its own line
10. Each action MUST start with a number followed by ". " (e.g., "1. ", "2. ", "3. ")
11. Each action MUST be on its own line
12. Do NOT add any text after the last action
13. Do NOT use markdown, asterisks, or other formatting symbols
14. Do NOT include explanations or additional commentary

Example (copy this structure exactly):
INSIGHTS:
- Product launched in Q2 2023 with strong initial adoption
- Pricing strategy focuses on enterprise customers
- Key differentiator is real-time collaboration features

TALKING POINTS:
1. What about the pricing tiers?
2. How does this compare to competitors?
3. What's the adoption rate been like?

FOLLOW-UP ACTIONS:
1. Get more info on pricing structure
2. Find out when the product officially launched
3. Look up how much revenue they made last year`;
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
    // Extract suggestions from partial streaming response
    // Look for numbered list patterns in TALKING POINTS and FOLLOW-UP ACTIONS sections
    const suggestions = [];
    
    // Normalize text
    const normalized = partialText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Try to extract from TALKING POINTS section (strict format)
    const talkingPointsMatch = normalized.match(/TALKING POINTS:\s*\n((?:\d+\.\s+.+\n?)+)/m);
    if (talkingPointsMatch && talkingPointsMatch[1]) {
      const lines = talkingPointsMatch[1].split('\n').map(l => l.trim()).filter(l => l.length > 0);
      for (const line of lines) {
        const match = line.match(/^\d+\.\s+(.+)$/);
        if (match && match[1]) {
          suggestions.push({
            id: `partial-talking-${suggestions.length}`,
            type: 'suggest',
            label: match[1].trim(),
            icon: 'lightbulb',
          });
        }
      }
    }
    
    // Try to extract from FOLLOW-UP ACTIONS section (strict format)
    const actionsMatch = normalized.match(/FOLLOW-UP ACTIONS:\s*\n((?:\d+\.\s+.+\n?)+)/m);
    if (actionsMatch && actionsMatch[1]) {
      const lines = actionsMatch[1].split('\n').map(l => l.trim()).filter(l => l.length > 0);
      for (const line of lines) {
        const match = line.match(/^\d+\.\s+(.+)$/);
        if (match && match[1]) {
          suggestions.push({
            id: `partial-action-${suggestions.length}`,
            type: 'action',
            label: match[1].trim(),
            icon: 'lightbulb',
          });
        }
      }
    }
    
    // Return up to 6 partial suggestions (3 talking points + 3 actions)
    return suggestions.slice(0, 6);
  }

  processResponse(response, actionType) {
    // Format LLM response as insights and action items for UI
    console.log('[AIOrchestrationService] processResponse called', { responseLength: response.length, responsePreview: response.substring(0, 200) });
    
    let insights = null;
    const suggestions = [];
    
    // Normalize response: remove any leading/trailing whitespace and normalize line endings
    const normalizedResponse = response.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Extract INSIGHTS section - look for exact format
    const insightsMatch = normalizedResponse.match(/^INSIGHTS:\s*\n((?:-\s+.+\n?)+)/m);
    if (insightsMatch && insightsMatch[1]) {
      const insightsText = insightsMatch[1].trim();
      const bullets = [];
      
      // Split by lines and extract bullet points
      const lines = insightsText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      for (const line of lines) {
        // Match lines starting with "- " (dash-space)
        const bulletMatch = line.match(/^-\s+(.+)$/);
        if (bulletMatch && bulletMatch[1]) {
          bullets.push(bulletMatch[1].trim());
        }
      }
      
      if (bullets.length > 0) {
        insights = {
          bullets: bullets.slice(0, 3), // Limit to exactly 3 insights
        };
        console.log('[AIOrchestrationService] Extracted insights', insights);
      } else {
        console.warn('[AIOrchestrationService] No valid insights found in expected format');
      }
    } else {
      console.warn('[AIOrchestrationService] INSIGHTS section not found in expected format');
    }
    
    // Extract TALKING POINTS section - look for exact format
    const talkingPointsMatch = normalizedResponse.match(/TALKING POINTS:\s*\n((?:\d+\.\s+.+\n?)+)/m);
    const talkingPointsText = talkingPointsMatch ? talkingPointsMatch[1] : '';
    
    // Extract FOLLOW-UP ACTIONS section - look for exact format
    const actionsMatch = normalizedResponse.match(/FOLLOW-UP ACTIONS:\s*\n((?:\d+\.\s+.+\n?)+)/m);
    const actionsText = actionsMatch ? actionsMatch[1] : '';
    
    // Helper function to parse numbered list (strict format: "1. text")
    const parseNumberedList = (text, defaultType = 'suggest') => {
      if (!text || !text.trim()) return [];
      const items = [];
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      for (const line of lines) {
        // Match strict format: number followed by ". " then text
        const match = line.match(/^\d+\.\s+(.+)$/);
        if (match && match[1]) {
          const label = match[1].trim();
          if (label.length > 0) {
            items.push({
              id: `${defaultType}-${items.length}`,
              type: defaultType,
              label,
              icon: defaultType === 'action' ? 'lightbulb' : 'lightbulb',
            });
          }
        }
      }
      
      return items;
    };
    
    // Parse talking points (type: 'suggest' for talking points) - limit to exactly 3
    const talkingPoints = parseNumberedList(talkingPointsText, 'suggest').slice(0, 3);
    console.log('[AIOrchestrationService] Parsed talking points', { count: talkingPoints.length, items: talkingPoints });
    
    // Parse follow-up actions (type: 'action' for follow-up actions) - limit to exactly 3
    const followUpActions = parseNumberedList(actionsText, 'action').slice(0, 3);
    console.log('[AIOrchestrationService] Parsed follow-up actions', { count: followUpActions.length, items: followUpActions });
    
    // Combine all suggestions (talking points + actions)
    suggestions.push(...talkingPoints, ...followUpActions);

    // Validation: Log warnings if we didn't get expected counts
    if (!insights || !insights.bullets || insights.bullets.length < 3) {
      console.warn('[AIOrchestrationService] Warning: Expected 3 insights, got', insights?.bullets?.length || 0);
    }
    if (talkingPoints.length < 3) {
      console.warn('[AIOrchestrationService] Warning: Expected 3 talking points, got', talkingPoints.length);
    }
    if (followUpActions.length < 3) {
      console.warn('[AIOrchestrationService] Warning: Expected 3 follow-up actions, got', followUpActions.length);
    }

    // Fallback: Only add fallback if we have absolutely nothing
    if (suggestions.length === 0 && (!insights || !insights.bullets || insights.bullets.length === 0)) {
      console.warn('[AIOrchestrationService] No valid data extracted, adding fallback');
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

