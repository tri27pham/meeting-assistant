---
description: "Architecture and data flow patterns for Cluely application"
alwaysApply: true
---

# Architecture & Data Flow Rules

## Target Data Flow

1. **Session Start Flow**
   - User clicks "Start Session" → `OverlayUI` → `IPCBridge` → `SessionManager`
   - `SessionManager` coordinates: `PermissionsManager` → `AudioCaptureService` → `STTService`
   - Notifies `AIOrchestrator`/`TriggerEngine` that session is live

2. **Audio → Transcript Flow**
   - `AudioCaptureService`: Captures mic + system audio → sends frames to `STTService`
   - `STTService`: Emits partial transcripts to `OverlayUI` (via `IPCBridge`) for live captions
   - `STTService`: Emits final `TranscriptSegment`s to `ContextBuffer` and `TriggerEngine`

3. **Context → AI Flow**
   - `ContextBuffer`: Updates conversational context on each transcript segment
   - `TriggerEngine`: Re-evaluates triggers on context updates
   - Trigger conditions: Question detected + user silent for 1s → generate suggestions

4. **AI Generation Flow**
   - `TriggerEngine` → `PromptBuilder` → `ContextSnapshot` → `LLMRequest`
   - `InferenceRouter`: Routes to `LocalLLMClient` or `CloudLLMClient` based on mode
   - Streams tokens back: `LLMClient` → `InferenceRouter` → `TriggerEngine`

5. **UI Display Flow**
   - `SuggestionFormatter`: Raw model text → 2-3 `UISuggestion`s
   - `IPCBridge`: Delivers `UISuggestion`s to `OverlayUI`
   - `OverlayUI`: Renders suggestions above captions

## Service Responsibilities

### Implemented Services
- **AudioCaptureService** (`src/main/services/AudioCaptureService.js`)
  - Captures mic + system audio frames
  - Sends frames to STTService
  - Emits: `started`, `stopped`, `paused`, `resumed`, `audioChunk`, `audioLevels`, `error`

- **DeepgramService** (`src/main/services/DeepgramService.js`)
  - Handles STT via Deepgram API
  - Emits: `connected`, `disconnected`, `transcript`, `error`, `closed`
  - Note: Consider renaming to `STTService.js` or creating wrapper

- **PermissionService** (`src/main/services/PermissionService.js`)
  - Manages macOS permissions
  - Does not extend EventEmitter (synchronous permission checks)

### Services to Implement
- **SessionManager** - Coordinates session lifecycle, manages online/offline mode
- **ContextBuffer** - Maintains rolling conversational context
- **TriggerEngine** - Monitors transcript for trigger conditions
- **PromptBuilder** - Builds prompts from ContextSnapshot
- **InferenceRouter** - Routes LLM requests to local or cloud
- **LocalLLMClient / CloudLLMClient** - Streams tokens from LLM
- **SuggestionFormatter** - Formats model output into UISuggestions

## Implementation Priority
1. ContextBuffer (needed for context management)
2. TriggerEngine (needed for AI suggestions)
3. PromptBuilder (needed for LLM requests)
4. InferenceRouter + LLM Clients (needed for actual AI generation)
5. SuggestionFormatter (needed for UI display)

## Current Implementation Notes
- Transcript is currently stored in React state (`App.jsx`)
- AI features are placeholders (`ai:trigger-action` returns `{ success: true }`)
- No context management - just displays transcript segments as they arrive
- Services communicate via events, which is correct pattern

## Architecture Principles
- Services communicate via events, not direct method calls
- IPC is handled in main.js, services don't know about IPC
- Renderer is UI-only, business logic in main process services
- Use EventEmitter pattern for all services that need to emit events

