# Testing Guide for AI Integration

## Quick Start

1. **Start the development server:**
   ```bash
   npm run dev
   ```
   This will start both the Vite dev server (renderer) and Electron app.

2. **Check console logs:**
   - Main process logs appear in the terminal where you ran `npm run dev`
   - Renderer process logs appear in the Electron DevTools console (View → Toggle Developer Tools)

## Testing Checklist

### 1. ContextService Testing

**What to verify:**
- Context is maintained as transcripts arrive
- Topic change detection works
- Summarization happens after AI responses

**How to test:**

1. **Start a session** (click Start or use hotkey)
2. **Speak or play audio** that gets transcribed
3. **Check console logs** for:
   ```
   [ContextService] Context snapshot emitted
   [ContextService] Topic change detected
   ```

4. **Verify context accumulation:**
   - Speak 2-3 sentences about one topic
   - Then switch to a completely different topic (e.g., ask a question)
   - Check logs for `context:topic-changed` event

5. **Test context clearing:**
   - Stop the session
   - Check logs for `[ContextService] Context cleared`

### 2. AIOrchestrationService Testing

**What to verify:**
- Suggestions are generated automatically
- Debouncing works (200-500ms delay)
- Topic changes trigger immediate suggestions
- Request cancellation works

**How to test:**

1. **Automatic suggestion generation:**
   - Start a session
   - Speak 2-3 sentences
   - Wait 200-500ms
   - Check the AI Response Panel for suggestions
   - Check console for:
     ```
     [AIOrchestrationService] Generating suggestions
     [AIOrchestrationService] AI response emitted
     ```

2. **Topic change immediate trigger:**
   - Speak about one topic
   - Then ask a question (e.g., "What is...")
   - Suggestions should appear almost immediately (within 1-2 seconds)
   - Check console for immediate trigger (no debounce delay)

3. **Request cancellation:**
   - Speak rapidly (multiple sentences quickly)
   - Check console for:
     ```
     [AIOrchestrationService] Request canceled due to new segment
     ```
   - Only the latest suggestions should appear

4. **Partial vs Complete responses:**
   - Watch the AI Response Panel
   - You should see suggestions appear incrementally (partial)
   - Then final suggestions replace them (complete)
   - Check console for both `isPartial: true` and `isPartial: false` events

### 3. Integration Testing

**What to verify:**
- Full flow from transcript → context → AI suggestions → UI

**How to test:**

1. **End-to-end flow:**
   ```
   Speak → Transcript appears → Context updated → AI suggestions appear
   ```

2. **Test the flow:**
   - Start session
   - Say: "I'm working on a React project. It uses TypeScript."
   - Wait 2-3 seconds
   - Check AI Response Panel for suggestions related to React/TypeScript
   - Say: "What should we have for dinner?"
   - Check that new suggestions appear quickly (topic change)

3. **Check console logs for the full flow:**
   ```
   [DeepgramService] transcript:final emitted
   [ContextService] addSegment called
   [ContextService] context:snapshot emitted
   [AIOrchestrationService] Handling context update
   [AIOrchestrationService] Generating suggestions
   [AIOrchestrationService] AI response emitted
   [Main] Forwarding ai:response to renderer
   ```

### 4. UI Testing

**What to verify:**
- AI suggestions appear in the UI
- Partial suggestions show immediately
- Complete suggestions replace partial ones
- Actions are clickable

**How to test:**

1. **Visual verification:**
   - Start session
   - Speak a few sentences
   - Watch the AI Response Panel (top right)
   - Suggestions should appear within 1-2 seconds

2. **Partial response handling:**
   - Suggestions may appear one by one (partial)
   - Then all suggestions appear together (complete)

3. **Action interaction:**
   - Click on a suggestion
   - Verify it triggers the action (currently mock, but should log)

### 5. Manual Trigger Testing

**What to verify:**
- Manual AI trigger via IPC works

**How to test:**

1. **Use hotkey:**
   - Press `Cmd+Return` (or `Ctrl+Return`)
   - Check console for:
     ```
     [Main] AI action triggered
     [AIOrchestrationService] triggerAction called
     ```

2. **Or trigger programmatically:**
   - Open DevTools console
   - Run:
     ```javascript
     window.cluely.ai.triggerAction('suggestion', {})
     ```
   - Check for suggestions in UI

## Console Log Patterns to Look For

### Successful Flow:
```
[ContextService] addSegment called
[ContextService] context:snapshot emitted
[AIOrchestrationService] Handling context update
[AIOrchestrationService] Generating suggestions
[AIOrchestrationService] AI response emitted (isPartial: true)
[AIOrchestrationService] AI response emitted (isPartial: false)
[Main] Forwarding ai:response to renderer
[ContextService] markRecentAsProcessed called
[ContextService] Summarizing recent buffer
```

### Topic Change:
```
[ContextService] Topic change detected
[ContextService] context:topic-changed emitted
[AIOrchestrationService] Immediate trigger (topic change)
```

### Request Cancellation:
```
[AIOrchestrationService] Request canceled due to new segment
[AIOrchestrationService] Canceling in-flight request
```

## Common Issues & Debugging

### Issue: No suggestions appearing

**Check:**
1. Are transcripts being generated? (Check transcript panel)
2. Are `context:snapshot` events being emitted? (Check console)
3. Is AIOrchestrationService receiving events? (Check console)
4. Are there any errors in console?

**Debug:**
- Add breakpoints in:
  - `ContextService.addSegment()`
  - `AIOrchestrationService._handleContextUpdate()`
  - `AIOrchestrationService._generateSuggestions()`

### Issue: Suggestions appear too slowly

**Check:**
1. Debounce timing (should be 200-500ms)
2. Mock LLM delay (currently 50ms per word chunk)
3. Network latency (if using real LLM later)

### Issue: Topic change not detected

**Check:**
1. Rule-based detection heuristics
2. Console logs for topic change detection
3. Try speaking a question (starts with "what", "why", etc.)

## Advanced Testing

### Test Rolling Summarization

1. Speak many sentences (10+)
2. Wait for AI suggestions
3. Check console for:
   ```
   [ContextService] Summarizing recent buffer
   [ContextService] Merging summary into history
   ```
4. Verify `summarizedHistory` grows while `recentVerbatim` stays small (max 3)

### Test Two-Tier Context

1. Speak about topic A (5+ sentences)
2. Wait for summarization
3. Speak about topic B
4. Check that AI suggestions use both:
   - Recent verbatim (topic B)
   - Summarized history (topic A)

### Test Request Cancellation

1. Speak sentence 1
2. Immediately speak sentence 2 (before suggestions appear)
3. Check console for cancellation
4. Verify only suggestions for sentence 2 appear

## Performance Testing

**Measure:**
- Time from transcript to suggestion: Should be 200-500ms + LLM latency
- Topic change trigger: Should be immediate (<50ms)
- Context snapshot emission: Should be <1ms

**Check console for timing logs:**
```
[AIOrchestrationService] Generating suggestions took Xms
[ContextService] Topic detection took Xms
```

## Next Steps

Once basic testing passes:
1. Integrate real LLM provider (OpenAI, Anthropic, etc.)
2. Test with real conversations
3. Measure actual latency
4. Tune debounce timings based on real usage
5. Add semantic embeddings for better topic detection

