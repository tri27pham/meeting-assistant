---
description: "Rules for main process (Node.js/Electron) code in src/main/"
globs: ["src/main/**/*.js"]
alwaysApply: false
---

# Main Process Rules

## Code Style
- CommonJS: Use `require()` and `module.exports`
- Use `EventEmitter` for services
- Use `async/await` for async operations
- Console logs: Prefix with `[ServiceName]` or `[Main]`

## File Organization
- Services: `src/main/services/`
- Config: `src/main/config/`
- IPC handlers: In `main.js` or separate handler files
- Preload: `src/main/preload.js`

## Electron APIs
- Use `ipcMain.handle()` for request-response patterns
- Use `webContents.send()` for events
- Use `globalShortcut` for hotkeys
- Use `screen` API for display info

## Error Handling
- Wrap async operations in try-catch
- Emit 'error' events from services
- Log errors with context (which service, what operation)

## Window Management
- Overlay window should be transparent, always on top
- Use `setIgnoreMouseEvents(true, { forward: true })` for click-through
- Toggle mouse events when panels are hovered

## Service Lifecycle
- Instantiate services at app startup in `main.js`
- Services should be reusable (start/stop multiple times)
- Clean up services on app quit

## Examples

### Service Pattern
```javascript
const EventEmitter = require('events');

class MyService extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
  }
  
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.emit('started');
  }
  
  async stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.emit('stopped');
  }
}

module.exports = MyService;
```

### IPC Handler Pattern
```javascript
ipcMain.handle('session:start', async () => {
  try {
    await service.start();
    return { success: true };
  } catch (error) {
    console.error('[Main] Error:', error);
    return { success: false, error: error.message };
  }
});
```

