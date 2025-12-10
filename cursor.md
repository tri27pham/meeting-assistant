🎯 PROJECT PURPOSE
This project is a macOS real-time AI meeting assistant (Cluely-style). It:
Listens to microphone + system audio in real time
Transcribes speech into text
Maintains a rolling context buffer of the conversation (and optional OCR screen text)
Detects when the user might need help (e.g. being asked a question)
Calls an LLM (local or cloud) to generate suggestions
Displays suggestions + transcript in an invisible, always-on-top overlay that does not appear in screen recording or screen-share
All code generation must respect this architecture.
🧱 HIGH-LEVEL ARCHITECTURE RULES
1. Process Separation
The app follows an Electron-style model:
Backend / Main side (Node-like environment):
Owns all system integrations and “brain” logic
Manages audio capture, STT, context, AI orchestration, inference routing, permissions, and session lifecycle
Frontend / Renderer side (browser/React-like environment):
Owns only UI: overlay rendering of transcript + suggestions
Receives data via IPC / real-time bridge
Sends simple user commands back (hotkeys, manual triggers)
No business logic here
All heavy logic must stay on the backend.
2. Core Backend Components (Conceptual, Not Files)
Implement these as distinct services/modules (names are conceptual, not required filenames):
Audio Capture Service
Captures microphone audio and system/output audio (two channels where possible)
Uses macOS APIs (CoreAudio, taps, or virtual device like BlackHole) for system audio
Emits timestamped PCM frames labeled by source ("mic" vs "system")
Speech-to-Text (STT) Service
Consumes audio frames and produces streaming transcripts
Supports local Whisper / Whisper.cpp for offline mode; can be swapped for cloud STT in online mode
Emits interim and final transcript segments with:
text
speaker ("user" | "other")
isFinal flag
timestamp
Context Service
Maintains a rolling buffer of recent transcript and other context (e.g. OCR-derived screen text)
Prunes older content to respect LLM context limits
Can generate a ContextSnapshot (e.g. last N turns + relevant screen text) for prompt building
AI Orchestration / Suggestion Engine
Monitors incoming transcripts + context
Detects triggers:
Question asked to user
Manual hotkey request
Optional periodic summary, keyword triggers, etc.
Builds AI suggestion requests with:
type (answer, summary, follow-up question, etc.)
trigger metadata
reference to relevant context
Prompt Builder (sub-component of AI Orchestration)
Converts context + trigger into a well-structured LLM prompt
Uses templates for different tasks (answer / summary / follow-up question, etc.)
Ensures prompt stays within token limits
Inference Router
Central switch for offline vs online inference
If offline mode → route to local LLM client
If online mode → route to cloud LLM client
May later support hybrid policies, but logic stays encapsulated here
Local LLM Client
Talks to a local model runtime (e.g. Ollama on localhost)
Supports streaming responses for partial suggestions
Returns a structured LLM response object
Cloud LLM Client
Talks to remote AI providers (e.g. OpenAI, Claude, Gemini) using config-driven provider + model selection
Handles auth, errors, timeouts, and optional streaming
Suggestion Formatter
Takes raw LLM responses and:
Trims overly long answers
Removes filler (“Sure,” etc.)
Splits multiple options if needed
Produces a UI-friendly suggestion object
Permission Manager
Checks / requests macOS permissions:
Microphone
Screen recording (for OCR/system audio)
Accessibility (if required for global shortcuts)
Exposes simple “are we ready?” status used before starting a session
Session Manager
Orchestrates the lifecycle of a meeting session:
On start:
Check permissions
Reset context
Start audio capture + STT
Start AI orchestration
Open/show overlay
Register global hotkeys
On stop:
Stop services
Optionally generate final summary
Clear or persist transcript/summary
Hide overlay
3. Frontend Overlay UI (Conceptual)
The UI layer implements:
A single transparent, always-on-top overlay window which:
Shows live transcript (scrolling)
Shows the latest AI suggestion in a bubble/bar
Is excluded from screen capture (invisible in screen share / recording)
UI rules:
It must be minimal, glanceable, and non-blocking
It must be able to:
Receive transcript segments from backend in real time
Receive suggestion objects in real time
Send user commands (e.g. manual trigger, hide/show, mode toggle) back to backend
UI must not know:
How audio is captured
How STT or LLM works
Any API keys or model details
📡 COMMUNICATION RULES (IPC / REAL-TIME BRIDGE)
Use a real-time, bidirectional channel between backend and UI (IPC, WebSocket, or equivalent):
Backend → UI must send:
Transcript updates
Payload with transcript segment structure:
text
speaker
isFinal
timestamp
Suggestions
Payload with:
text
type (answer, summary, follow-up, etc.)
optional origin (local vs cloud)
timestamp
Status / mode indicators
e.g. “offline mode”, “waiting for permissions”, “session running”
UI → Backend must send:
Manual suggestion trigger (“give me help now”)
Show/hide overlay toggles
Mode toggles (offline ↔︎ online)
Session start/stop (if initiated from UI)
🔐 PRIVACY & MODES
Offline mode is default and first-class:
STT and LLM run locally
No transcripts or audio leave the machine
Any meeting content is kept only in-memory or local storage at user’s explicit choice
Online mode:
Explicitly sends prompt/context to configured cloud APIs
Must be clearly distinguishable in configuration and (optionally) UI indicators
No component may silently send user data to external services outside of the configured cloud LLM/STT endpoints.
🎹 HOTKEYS & SESSION CONTROL
Register global hotkeys (macOS) for at least:
Start/stop session
Manual suggestion trigger
Show/hide overlay
Backend must own hotkey registration and map these to:
Session Manager (start/stop)
AI Orchestration (manual trigger)
Overlay control (visibility)
📏 DATA STRUCTURE EXPECTATIONS (ABSTRACT)
Even if names differ, the following conceptual models must exist and stay consistent:
Transcript Segment
text: string
speaker: "user" | "other" (or equivalent)
isFinal: boolean
timestamp: number
Context Snapshot
subset of recent transcript
optional on-screen/OCR text
enough to build an LLM prompt
AI Suggestion Request
type (answer, summary, follow-up, …)
trigger metadata (question text, hotkey, etc.)
reference to context snapshot
LLM Request
prompt text
model identifier / backend selection data
generation parameters (max tokens, temperature, etc.)
LLM Response
produced text
finish reason / truncation info
optional token usage / debug metadata
UI Suggestion
user-facing suggestion text
type (for styling)
optional origin (local/cloud)
timestamp
🧪 IMPLEMENTATION PRINCIPLES
When generating or modifying code, the AI should:
Preserve architecture boundaries
System integration + logic in backend, display in frontend.
Keep components modular and swappable
STT provider, LLM backend, OCR engine must be replaceable behind stable interfaces.
Prefer composition over inheritance for services.
Avoid blocking the backend event loop
Heavy STT/LLM work must run in worker threads, child processes, or external binaries.
Document key decisions & TODOs inline, referencing the architecture docs when relevant.
🚫 DO NOT
❌ Put business logic or STT/LLM calls in the UI
❌ Mix audio capture, STT, and AI orchestration into one monolithic module
❌ Hard-code API keys or secret values
❌ Break the offline-first guarantee by silently calling cloud APIs
❌ Create non-transparent, non-overlay windows for the main assistant UI