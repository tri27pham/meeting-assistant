---
description: "Architecture and data flow patterns for Cluely application - C4 Level 2 Container Diagram"
alwaysApply: true
---

# Architecture & Data Flow Rules

## C4 Level 2: Container Architecture

The system follows a container-based architecture with clear separation of concerns:

### Containers (Components)

1. **USER** (External Entity)
   - Human operator interacting with the application
   - Sends: Clicks, toggles, hotkeys (start session, stop, summary, mode change)

2. **SETTINGS & STORAGE**
   - Manages persistent application settings (preferred mode, hotkeys, UI preferences)
   - Receives: User changes from OVERLAY UI
   - Provides: Config to DESKTOP SHELL, OVERLAY UI, AI ORCHESTRATION SERVICE

3. **DESKTOP SHELL / HOST APP** (Main Process)
   - Electron Main Process - central orchestrator
   - Receives: UI commands from OVERLAY UI, config from SETTINGS & STORAGE
   - Sends: Start/stop capture commands to AUDIO CAPTURE SERVICE
   - Sends: Start/stop transcription commands to SPEECH-TO-TEXT SERVICE
   - Sends: Session lifecycle events (started, ended, mode) to OVERLAY UI

4. **OVERLAY UI** (Renderer Process)
   - Electron Renderer Process - user interface
   - Receives: User interactions, config, session events, transcript segments, AI suggestions
   - Sends: UI commands, user changes to settings, user-triggered AI requests

5. **AUDIO CAPTURE SERVICE**
   - Captures audio from specified devices (microphone, system audio)
   - Receives: Start/stop capture commands, config from DESKTOP SHELL
   - Sends: Continuous PCM audio frames to SPEECH-TO-TEXT SERVICE

6. **SPEECH-TO-TEXT SERVICE**
   - Processes audio frames to generate real-time transcriptions
   - Receives: Start/stop transcription commands, continuous PCM audio frames
   - Sends: Partial and final TranscriptSegment to OVERLAY UI (for live captions)
   - Sends: Final TranscriptSegment to CONTEXT SERVICE (for rolling context)

7. **CONTEXT SERVICE**
   - Maintains rolling context of transcript segments and optional key points/OCR
   - Receives: Final TranscriptSegment from SPEECH-TO-TEXT SERVICE
   - Sends: ContextSnapshot (recent transcript, optional key points/OCR) to AI ORCHESTRATION SERVICE

8. **AI ORCHESTRATION SERVICE**
   - Manages all AI-related logic, LLM selection, prompt building, response processing
   - Receives: Config from SETTINGS & STORAGE, user-triggered AI requests from OVERLAY UI, ContextSnapshot from CONTEXT SERVICE, LLM responses
   - Sends: LLMRequest to CLOUD LLM PROVIDER or LOCAL LLM, suggestions/summaries to OVERLAY UI

9. **CLOUD LLM PROVIDER** (External Entity)
   - External cloud-based LLM service (e.g., OpenAI, Anthropic)
   - Receives: LLMRequest when online/cloud mode is active
   - Sends: Generated text/token stream to AI ORCHESTRATION SERVICE

10. **LOCAL LLM** (External Entity)
    - Local LLM running on user's machine
    - Receives: LLMRequest when offline/local mode is active
    - Sends: Generated text/token stream to AI ORCHESTRATION SERVICE

## Data Flow Patterns

### 1. Session Start Flow
   - USER clicks "Start Session" → OVERLAY UI → DESKTOP SHELL / HOST APP
   - DESKTOP SHELL coordinates: Permissions → AUDIO CAPTURE SERVICE → SPEECH-TO-TEXT SERVICE
   - DESKTOP SHELL sends session lifecycle events to OVERLAY UI

### 2. Audio → Transcript Flow
   - AUDIO CAPTURE SERVICE: Captures mic + system audio → sends continuous PCM audio frames to SPEECH-TO-TEXT SERVICE
   - SPEECH-TO-TEXT SERVICE: Emits partial and final TranscriptSegment to OVERLAY UI (for live captions)
   - SPEECH-TO-TEXT SERVICE: Emits final TranscriptSegment to CONTEXT SERVICE (appended to rolling context)

### 3. Context → AI Flow
   - CONTEXT SERVICE: Updates rolling context on each final transcript segment
   - CONTEXT SERVICE: Provides ContextSnapshot (recent transcript, optional key points/OCR) to AI ORCHESTRATION SERVICE
   - AI ORCHESTRATION SERVICE: Uses ContextSnapshot to build prompts for LLM requests

### 4. AI Generation Flow
   - OVERLAY UI: Sends user-triggered AI requests to AI ORCHESTRATION SERVICE
   - AI ORCHESTRATION SERVICE: Loads config from SETTINGS & STORAGE (determines online/offline mode)
   - AI ORCHESTRATION SERVICE: Builds LLMRequest (prompt + parameters) using ContextSnapshot
   - AI ORCHESTRATION SERVICE: Routes LLMRequest to CLOUD LLM PROVIDER (online) or LOCAL LLM (offline)
   - LLM Provider: Returns generated text/token stream to AI ORCHESTRATION SERVICE
   - AI ORCHESTRATION SERVICE: Processes response and sends suggestions/summaries to OVERLAY UI

### 5. Configuration Flow
   - OVERLAY UI: Sends user changes (preferred mode, hotkeys, UI settings) to SETTINGS & STORAGE
   - SETTINGS & STORAGE: Saves changes and provides "load config" to DESKTOP SHELL, OVERLAY UI, AI ORCHESTRATION SERVICE

## Container Responsibilities

### Implemented Containers
- **DESKTOP SHELL / HOST APP** (`src/main/main.js`)
  - Window management, IPC handlers, service coordination
  - Coordinates: Permissions → Audio Capture → STT → Session lifecycle

- **OVERLAY UI** (`src/renderer/App.jsx` and components)
  - React-based user interface
  - Handles user interactions, displays transcript, AI responses
  - Manages UI state and panel positions

- **AUDIO CAPTURE SERVICE** (`src/main/services/AudioCaptureService.js`)
  - Captures mic + system audio frames
  - Sends frames to SPEECH-TO-TEXT SERVICE
  - Emits: `started`, `stopped`, `paused`, `resumed`, `audioChunk`, `audioLevels`, `error`

- **SPEECH-TO-TEXT SERVICE** (`src/main/services/DeepgramService.js`)
  - Handles STT via Deepgram API
  - Emits: `connected`, `disconnected`, `transcript`, `error`, `closed`
  - Note: Currently named DeepgramService, but serves as SPEECH-TO-TEXT SERVICE

- **PermissionService** (`src/main/services/PermissionService.js`)
  - Manages macOS permissions
  - Does not extend EventEmitter (synchronous permission checks)

### Containers to Implement
- **SETTINGS & STORAGE** - Centralized settings management (currently using localStorage in renderer)
- **CONTEXT SERVICE** - Maintains rolling conversational context (currently transcript in React state)
- **AI ORCHESTRATION SERVICE** - Manages AI logic, LLM selection, prompt building (currently placeholder)
- **CLOUD LLM PROVIDER Integration** - Cloud LLM client (not yet implemented)
- **LOCAL LLM Integration** - Local LLM client (not yet implemented)

## Implementation Priority
1. **CONTEXT SERVICE** - Needed for context management (currently transcript in React state)
2. **AI ORCHESTRATION SERVICE** - Needed for AI logic and LLM coordination
3. **SETTINGS & STORAGE Service** - Centralize settings management (currently localStorage in renderer)
4. **LLM Provider Integrations** - Cloud and Local LLM clients
5. **Prompt Building & Response Formatting** - Convert context to prompts, format LLM responses

## Current Implementation Status

### ✅ Implemented
- DESKTOP SHELL / HOST APP (main.js) - Window management, IPC, service coordination
- OVERLAY UI (renderer) - React UI, user interactions, panel management
- AUDIO CAPTURE SERVICE - Audio capture and processing
- SPEECH-TO-TEXT SERVICE - Deepgram integration for transcription
- Basic session lifecycle (start/stop/pause)

### ⚠️ Partially Implemented
- AI features: UI exists, but `ai:trigger-action` is placeholder (returns `{ success: true }`)
- Settings: Stored in localStorage in renderer, not centralized service
- Transcript: Stored in React state, not in CONTEXT SERVICE

### ❌ Not Yet Implemented
- CONTEXT SERVICE - No rolling context management
- AI ORCHESTRATION SERVICE - No AI logic, LLM selection, or prompt building
- SETTINGS & STORAGE Service - No centralized settings management
- CLOUD LLM PROVIDER Integration - No cloud LLM client
- LOCAL LLM Integration - No local LLM client

## Architecture Principles

### Container Communication
- **Services communicate via events**, not direct method calls
- **IPC is handled in main.js** (DESKTOP SHELL), services don't know about IPC
- **Renderer (OVERLAY UI) is UI-only**, business logic in main process services
- **Use EventEmitter pattern** for all services that need to emit events

### Data Flow Rules
- **User interactions** flow: USER → OVERLAY UI → DESKTOP SHELL → Services
- **Audio data** flows: AUDIO CAPTURE SERVICE → SPEECH-TO-TEXT SERVICE
- **Transcript data** flows: SPEECH-TO-TEXT SERVICE → OVERLAY UI (live) + CONTEXT SERVICE (final)
- **AI requests** flow: OVERLAY UI → AI ORCHESTRATION SERVICE → LLM Provider → AI ORCHESTRATION SERVICE → OVERLAY UI
- **Configuration** flows: OVERLAY UI → SETTINGS & STORAGE → All containers (on load)

### Separation of Concerns
- **DESKTOP SHELL / HOST APP**: System integration, service coordination, IPC
- **OVERLAY UI**: User interface, state display, user input
- **Services**: Business logic, data processing, external API communication
- **SETTINGS & STORAGE**: Configuration persistence and distribution
- **External Entities**: USER, CLOUD LLM PROVIDER, LOCAL LLM (outside application boundary)

