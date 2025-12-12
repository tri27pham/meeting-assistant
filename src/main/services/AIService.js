const { EventEmitter } = require('events');
const Groq = require('groq-sdk');

class AIService extends EventEmitter {
  constructor() {
    super();
    this._apiKey = process.env.GROQ_API_KEY || null;
    this._client = null;
    this._model = 'llama-3.3-70b-versatile';
    this._isStreaming = false;
    
    if (this._apiKey) {
      this._client = new Groq({ apiKey: this._apiKey });
      console.log('[AIService] Initialized with Groq API key');
    } else {
      console.warn('[AIService] No GROQ_API_KEY found in environment');
    }
  }

  setApiKey(key) {
    this._apiKey = key;
    this._client = new Groq({ apiKey: key });
    console.log('[AIService] API key updated');
  }

  isReady() {
    return !!this._client;
  }

  getState() {
    return {
      hasApiKey: !!this._apiKey,
      isReady: this.isReady(),
      model: this._model,
      isStreaming: this._isStreaming,
    };
  }

  _buildSystemPrompt(actionType) {
    const basePrompt = `You are an intelligent AI assistant integrated into a desktop overlay app. You help users during their conversations and work by providing relevant information, definitions, and suggestions.

CRITICAL RULES:
- Always provide actual, useful information. Never ask the user for more context or information.
- If the conversation transcript is short or empty, provide general helpful information related to the topic or action requested.
- Never respond with phrases like "To provide relevant assistance, it would be helpful to know..." or "Please provide more context..."
- Start directly with the information, answer, or suggestions requested.
- Be concise and helpful. Format responses clearly with line breaks for readability.
- Avoid unnecessary preamble or meta-commentary about needing more information.`;

    const actionPrompts = {
      define: `${basePrompt}

Your task is to define or explain a term or concept. Be clear and educational.`,
      
      search: `${basePrompt}

Your task is to provide information as if you searched the web. Give factual, up-to-date information. If you're uncertain about recent events, say so.`,
      
      followup: `${basePrompt}

Your task is to suggest follow-up questions the user could ask to deepen the conversation.`,
      
      help: `${basePrompt}

Your task is to provide helpful information related to the conversation context. If context is limited, provide general helpful information. Always provide actual information - never ask for more context.`,

      summarize: `${basePrompt}

Your task is to summarize the conversation. Extract key points, decisions made, action items, and important topics discussed. Be concise but comprehensive.`,

      talking_points: `You are providing talking points for the user to say NEXT in their conversation.

CRITICAL RULES:
- Output ONLY 2-3 bullet points. Nothing else.
- Each bullet point must start with "•" (bullet character)
- Each point should be 5-15 words - something the user could actually say
- These are conversation starters/continuations, NOT general advice or information
- NO sections, NO headers, NO explanations, NO introductions
- NO formatting beyond the bullet points themselves

FORMAT (follow exactly - this is the ONLY format allowed):
• [first thing user could say]
• [second thing user could say]
• [third thing user could say]

EXAMPLES OF CORRECT OUTPUT:
• That's a great point about productivity - I've found the Pomodoro Technique really helps me focus
• Speaking of time management, have you tried using a task management app?
• I'm curious about your experience with remote collaboration tools

EXAMPLES OF INCORRECT OUTPUT (DO NOT DO THIS):
❌ **Productivity Tips:** (NO sections/headers)
❌ 1. Set clear goals... (NO numbered lists)
❌ Here are some talking points: (NO introductions)
❌ For those looking to improve... (NO explanations or general advice)`,
      
      manual: `${basePrompt}

Respond to the user's request directly and helpfully. If the conversation context is limited, provide general but useful information related to the request. Never ask for more context - always provide value.`,
    };

    return actionPrompts[actionType] || actionPrompts.manual;
  }

  _buildUserPrompt(actionType, context, metadata) {
    const { label = '' } = metadata || {};
    
    let prompt = '';
    
    // Use structured context snapshot if available
    if (context && context.transcript && context.transcript.trim()) {
      const durationMin = context.timeRange?.duration 
        ? Math.round(context.timeRange.duration / 60000) 
        : 0;
      
      prompt += `Here is the recent conversation transcript`;
      if (durationMin > 0) {
        prompt += ` (last ${durationMin} minute${durationMin !== 1 ? 's' : ''})`;
      }
      prompt += `:\n"""\n${context.transcript}\n"""\n\n`;
      
      // Include key points if available
      if (context.keyPoints && context.keyPoints.length > 0) {
        prompt += `Key points from the conversation:\n`;
        context.keyPoints.forEach((kp, i) => {
          prompt += `${i + 1}. ${kp.preview || kp.text}\n`;
        });
        prompt += '\n';
      }
    }
    
    switch (actionType) {
      case 'define':
        prompt += `Please define or explain: ${label || 'the main topic from the transcript'}`;
        break;
      case 'search':
        prompt += `Please provide information about: ${label || 'the main topic from the transcript'}`;
        break;
      case 'followup':
        prompt += `Based on this conversation, suggest 3-5 follow-up questions that could deepen the discussion.`;
        break;
      case 'help':
        prompt += `Provide helpful information related to this conversation.`;
        break;
      case 'summarize':
        prompt += `Please provide a concise summary of the key points discussed in this conversation.`;
        break;
      case 'talking_points':
        if (context && context.transcript && context.transcript.trim()) {
          prompt += `Based on the conversation above, provide 2-3 bullet points of things the user could say next to continue or deepen the conversation. Each point should be something the user could actually say (5-15 words). Output ONLY the bullet points, nothing else.`;
        } else {
          prompt += `Provide 2-3 bullet points of things the user could say to start a conversation. Each point should be something the user could actually say (5-15 words). Output ONLY the bullet points, nothing else.`;
        }
        break;
      case 'manual':
      default:
        if (label) {
          prompt += label;
        } else if (context && context.transcript && context.transcript.trim()) {
          prompt += 'Based on the conversation above, provide helpful insights, key points, or relevant information.';
        } else {
          prompt += 'Provide helpful information or suggestions. If you need to make assumptions, state them clearly and proceed with useful information.';
        }
        break;
    }
    
    return prompt;
  }

  async generateResponse(actionType, context = {}, metadata = {}) {
    if (!this._client) {
      throw new Error('AI service not initialized - missing API key');
    }

    const systemPrompt = this._buildSystemPrompt(actionType);
    const userPrompt = this._buildUserPrompt(actionType, context, metadata);

    try {
      const completion = await this._client.chat.completions.create({
        model: this._model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      });

      return {
        content: completion.choices[0]?.message?.content || '',
        model: this._model,
        usage: completion.usage,
      };
    } catch (error) {
      console.error('[AIService] Generation error:', error.message);
      throw error;
    }
  }

  async *streamResponse(actionType, context = {}, metadata = {}) {
    if (!this._client) {
      throw new Error('AI service not initialized - missing API key');
    }

    const systemPrompt = this._buildSystemPrompt(actionType);
    const userPrompt = this._buildUserPrompt(actionType, context, metadata);
    
    // Use fewer tokens for concise responses - talking points should be very short
    const maxTokens = actionType === 'talking_points' ? 80 : 1024;

    this._isStreaming = true;
    this.emit('stream-start', { actionType });

    try {
      const stream = await this._client.chat.completions.create({
        model: this._model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
        stream: true,
      });

      let fullContent = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          this.emit('stream-chunk', { content, fullContent });
          yield { chunk: content, fullContent };
        }
      }

      this._isStreaming = false;
      this.emit('stream-end', { fullContent });
      
      return { content: fullContent, model: this._model };
    } catch (error) {
      this._isStreaming = false;
      this.emit('stream-error', { error: error.message });
      console.error('[AIService] Stream error:', error.message);
      throw error;
    }
  }

  async triggerAction(actionType, transcript = '', metadata = {}) {
    const context = { transcript };
    const fullMetadata = { ...metadata, transcript };
    
    console.log(`[AIService] Triggering action: ${actionType}`);
    
    const chunks = [];
    for await (const data of this.streamResponse(actionType, context, fullMetadata)) {
      chunks.push(data.chunk);
    }
    
    return chunks.join('');
  }

  cancelStream() {
    this._isStreaming = false;
    this.emit('stream-cancelled');
  }

  destroy() {
    this.cancelStream();
    this.removeAllListeners();
  }
}

module.exports = new AIService();
