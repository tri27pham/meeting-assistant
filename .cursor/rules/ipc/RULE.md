---
description: "Rules for IPC communication between main and renderer processes"
globs: ["src/main/preload.js", "src/main/main.js"]
alwaysApply: false
---

# IPC Communication Rules

## IPC Flow Pattern
1. Renderer calls `window.cluely.apiName(params)` (exposed via preload)
2. Preload forwards to `ipcRenderer.invoke('channel', params)`
3. Main process `ipcMain.handle('channel', handler)` processes
4. Handler calls service methods
5. Service emits events
6. Main process listens to service events and sends to renderer via `webContents.send()`
7. Renderer listens via `window.cluely.on('event', callback)`

## Channel Naming
- Use namespaced channels: `session:start`, `session:stop`, `audio:chunk`
- Use kebab-case for channel names
- Use camelCase for method names in preload API

## Security Rules
- **Never** expose Node.js APIs directly to renderer
- **Never** use `remote` module (deprecated)
- **Never** bypass preload script
- **Always** use `contextBridge.exposeInMainWorld()` in preload
- **Always** validate inputs in IPC handlers
- **Always** handle errors and send error events back to renderer

## Examples

### Preload Pattern
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cluely', {
  session: {
    start: () => ipcRenderer.invoke('session:start'),
    stop: () => ipcRenderer.invoke('session:stop'),
  },
  on: {
    transcriptUpdate: (callback) => {
      ipcRenderer.on('transcript:update', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('transcript:update');
    },
  },
});
```

### Main Process IPC Handler
```javascript
ipcMain.handle('session:start', async () => {
  try {
    await service.start();
    return { success: true };
  } catch (error) {
    console.error('[Main] Error starting session:', error);
    return { success: false, error: error.message };
  }
});

// Event forwarding from service to renderer
service.on('transcript', (data) => {
  if (window) {
    window.webContents.send('transcript:update', data);
  }
});
```

### Renderer Usage
```javascript
// Request-response
const result = await window.cluely.session.start();

// Event listener
useEffect(() => {
  if (!window.cluely) return;
  
  const unsubscribe = window.cluely.on.transcriptUpdate((data) => {
    setTranscript(data);
  });
  
  return () => unsubscribe();
}, []);
```

## Current IPC Channels

### Request-Response (ipcMain.handle)
- `session:start` - Start audio capture and transcription
- `session:stop` - Stop audio capture and transcription
- `session:toggle-pause` - Pause/resume audio capture
- `ai:trigger-action` - Trigger AI action

### Events (ipcMain.on)
- `window:minimize`, `window:close` - Window control
- `mouse:enter-panel`, `mouse:leave-panel` - Mouse interaction
- `audio:microphone-chunk` - Receive audio from renderer

### Renderer Events (webContents.send)
- `transcript:update` - Send transcript segments
- `audio:status-update` - Send audio capture status
- `audio:levels-update` - Send audio level data

