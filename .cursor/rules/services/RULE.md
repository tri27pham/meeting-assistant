---
description: "Rules for service layer patterns in src/main/services/"
globs: ["src/main/services/**/*.js"]
alwaysApply: false
---

# Service Layer Rules

## Service Pattern
All services should:
- Extend `EventEmitter` for event-driven communication
- Be instantiated in `main.js`
- Use class-based structure (PascalCase)
- Handle errors gracefully and emit 'error' events
- Be testable in isolation

## Service Communication
- Services communicate via events, not direct method calls
- Use descriptive event names: `transcript:partial`, `transcript:final`, `suggestion:ready`
- Services should not know about IPC - that's handled in main.js IPC handlers

## Service Dependencies
- Services can depend on other services (inject via constructor)
- Keep dependencies minimal - prefer event-based communication
- Example: `TriggerEngine` listens to `ContextBuffer` events, not direct calls

## Examples

### Basic Service Pattern
```javascript
const EventEmitter = require('events');

class MyService extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
  }
  
  async start() {
    if (this.isRunning) {
      console.warn('[MyService] Already running');
      return;
    }
    
    try {
      this.isRunning = true;
      // Start logic here
      this.emit('started');
      console.log('[MyService] Started');
    } catch (error) {
      this.isRunning = false;
      this.emit('error', error);
      throw error;
    }
  }
  
  async stop() {
    if (!this.isRunning) return;
    
    try {
      // Cleanup logic
      this.isRunning = false;
      this.emit('stopped');
      console.log('[MyService] Stopped');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
}

module.exports = MyService;
```

### Service with Dependencies
```javascript
const EventEmitter = require('events');

class DependentService extends EventEmitter {
  constructor(otherService) {
    super();
    this.otherService = otherService;
    this.setupListeners();
  }
  
  setupListeners() {
    this.otherService.on('event', (data) => {
      this.handleEvent(data);
    });
  }
  
  handleEvent(data) {
    // Process data and emit own events
    this.emit('processed', data);
  }
}

module.exports = DependentService;
```

## Current Services Reference
- `AudioCaptureService` - Captures and processes audio, emits `audioChunk`, `audioLevels`
- `DeepgramService` - Handles STT via Deepgram API, emits `transcript`, `connected`, `disconnected`
- `PermissionService` - Manages macOS permissions (doesn't extend EventEmitter)

