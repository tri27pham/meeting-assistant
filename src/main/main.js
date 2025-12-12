require('dotenv').config();

const { app, BrowserWindow, ipcMain, globalShortcut, screen, session } = require('electron');
const path = require('path');

const permissionManager = require('./services/PermissionManager');
const audioCaptureService = require('./services/AudioCaptureService');
const sttService = require('./services/STTService');
const aiService = require('./services/AIService');
const contextService = require('./services/ContextService');

let overlayWindow = null;
const isDev = process.env.NODE_ENV !== 'production' || !app.isPackaged;

process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection:', reason);
});

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.size;

  overlayWindow = new BrowserWindow({
    width: screenWidth,
    height: screenHeight,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    type: 'panel',
    visibleOnAllWorkspaces: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setContentProtection(true);
  overlayWindow.setAlwaysOnTop(true, 'floating');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (isDev) {
    overlayWindow.loadURL('http://localhost:3000');
    // Open DevTools to see renderer console logs (for debugging)
    overlayWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function registerHotkeys() {
  globalShortcut.register('CommandOrControl+/', () => {
    if (overlayWindow) {
      overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
    }
  });

  globalShortcut.register('CommandOrControl+Shift+\\', () => {
    if (overlayWindow) {
      overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
    }
  });

  globalShortcut.register('CommandOrControl+Return', () => {
    if (overlayWindow) {
      overlayWindow.webContents.send('trigger-ai-suggestion');
    }
  });

  globalShortcut.register('CommandOrControl+\\', () => {
    if (overlayWindow) {
      overlayWindow.webContents.send('reset-layout');
    }
  });

  globalShortcut.register("CommandOrControl+;", () => {
    if (overlayWindow) {
      overlayWindow.webContents.send('toggle-transcript');
    }
  });
}

function setupIPC() {
  // Permission handlers
  ipcMain.handle('permissions:get-state', async () => permissionManager.getPermissionState());
  ipcMain.handle('permissions:request', async () => permissionManager.requestPermissions());
  
  ipcMain.handle('permissions:open-preferences', async (event, type) => {
    switch (type) {
      case 'microphone': permissionManager.openMicrophonePreferences(); break;
      case 'screen-recording': permissionManager.openScreenRecordingPreferences(); break;
      case 'accessibility': permissionManager.openAccessibilityPreferences(); break;
    }
    return { success: true };
  });

  ipcMain.handle('permissions:is-ready', async () => ({
    ready: permissionManager.isReady(),
    missing: permissionManager.getMissingPermissions(),
  }));

  // Session handlers
  ipcMain.handle('session:start', async () => {
    if (!permissionManager.isReady()) {
      return { success: false, error: 'Missing permissions', missingPermissions: permissionManager.getMissingPermissions() };
    }
    console.log('[Main] Session start requested');
    return { success: true };
  });

  ipcMain.handle('session:stop', async () => {
    console.log('[Main] Session stop requested');
    return { success: true };
  });

  ipcMain.handle('session:toggle-pause', async () => {
    console.log('[Main] Session pause toggle requested');
    return { success: true, paused: false };
  });

  // AI handlers
  ipcMain.handle('ai:trigger-action', async (event, actionType, metadata) => {
    console.log('[Main] AI action triggered:', actionType, metadata);
    
    if (!aiService.isReady()) {
      overlayWindow?.webContents.send('ai:error', { message: 'AI service not configured - missing GROQ_API_KEY' });
      return { success: false, error: 'AI service not configured' };
    }

    try {
      const contextSnapshot = contextService.getContextSnapshot();
      console.log(`[Main] Context snapshot: ${contextSnapshot.segmentCount} segments, ~${contextSnapshot.tokenEstimate} tokens`);
      
      overlayWindow?.webContents.send('ai:stream-start', { actionType });
      
      for await (const data of aiService.streamResponse(actionType, contextSnapshot, { ...metadata, transcript: contextSnapshot.transcript })) {
        overlayWindow?.webContents.send('ai:stream-chunk', { chunk: data.chunk, fullContent: data.fullContent });
      }
      
      overlayWindow?.webContents.send('ai:stream-end', { actionType });
      return { success: true };
    } catch (error) {
      console.error('[Main] AI error:', error.message);
      overlayWindow?.webContents.send('ai:error', { message: error.message });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:get-state', async () => aiService.getState());
  
  ipcMain.handle('ai:set-api-key', async (event, apiKey) => {
    aiService.setApiKey(apiKey);
    return { success: true };
  });

  ipcMain.handle('ai:trigger-action-test', async (event, actionType, mockContext, metadata) => {
    console.log('[Main] AI test action triggered:', actionType, metadata);
    
    if (!aiService.isReady()) {
      overlayWindow?.webContents.send('ai:error', { message: 'AI service not configured - missing GROQ_API_KEY' });
      return { success: false, error: 'AI service not configured' };
    }

    try {
      console.log(`[Main] Test context snapshot: ${mockContext.segmentCount} segments, ~${mockContext.tokenEstimate} tokens`);
      
      overlayWindow?.webContents.send('ai:stream-start', { actionType, isTest: true });
      
      for await (const data of aiService.streamResponse(actionType, mockContext, { ...metadata, transcript: mockContext.transcript, isTest: true })) {
        overlayWindow?.webContents.send('ai:stream-chunk', { chunk: data.chunk, fullContent: data.fullContent });
      }
      
      overlayWindow?.webContents.send('ai:stream-end', { actionType, isTest: true });
      return { success: true };
    } catch (error) {
      console.error('[Main] AI test error:', error.message);
      overlayWindow?.webContents.send('ai:error', { message: error.message });
      return { success: false, error: error.message };
    }
  });

  // Context handlers
  ipcMain.handle('context:get-snapshot', async (event, options) => contextService.getContextSnapshot(options));
  ipcMain.handle('context:get-state', async () => contextService.getState());
  ipcMain.handle('context:get-segments', async (event, options) => contextService.getSegments(options));
  ipcMain.handle('context:get-key-points', async () => contextService.getKeyPoints());
  ipcMain.handle('context:add-key-point', async (event, text, metadata) => contextService.addKeyPoint(text, metadata));
  ipcMain.handle('context:clear', async () => contextService.clearContext());
  ipcMain.handle('context:start-session', async () => {
    contextService.startSession();
    return { success: true };
  });
  ipcMain.handle('context:end-session', async () => {
    const summary = contextService.endSession();
    return { success: true, summary };
  });

  // Auto-suggest handlers
  ipcMain.handle('context:set-auto-suggest', async (event, enabled) => {
    contextService.setAutoSuggestEnabled(enabled);
    return { success: true, enabled };
  });
  
  ipcMain.handle('context:set-auto-suggest-config', async (event, config) => {
    contextService.setAutoSuggestConfig(config);
    return { success: true };
  });
  
  ipcMain.handle('context:get-auto-suggest-state', async () => {
    return contextService.getAutoSuggestState();
  });

  // Audio handlers
  ipcMain.on('audio:chunk', (event, chunk) => {
    audioCaptureService.processAudioChunk(chunk);
  });

  ipcMain.on('audio:raw-blob', (event, data) => {
    if (data && data.length > 0) {
      console.log(`[Main] Audio blob received: ${data.length} bytes`);
      sttService.sendAudio(Buffer.from(data));
    }
  });

  ipcMain.on('audio:blob', (event, blob) => {
    if (blob.data && blob.data.length > 0) {
      sttService.sendAudio(Buffer.from(blob.data));
    }
  });

  ipcMain.handle('audio:start-mic', async () => audioCaptureService.startMicCapture());
  ipcMain.handle('audio:stop-mic', async () => audioCaptureService.stopMicCapture());
  ipcMain.handle('audio:start-system', async () => audioCaptureService.startSystemCapture());
  ipcMain.handle('audio:stop-system', async () => audioCaptureService.stopSystemCapture());
  ipcMain.handle('audio:start-all', async () => audioCaptureService.startAllCapture());
  ipcMain.handle('audio:stop-all', async () => audioCaptureService.stopAllCapture());
  ipcMain.handle('audio:get-state', async () => audioCaptureService.getState());

  // STT handlers
  ipcMain.handle('stt:set-enabled', async (event, enabled) => {
    enabled ? await sttService.enable() : sttService.disable();
    return { success: true };
  });

  ipcMain.handle('stt:set-api-key', async (event, apiKey) => {
    sttService.setApiKey(apiKey);
    return { success: true };
  });

  ipcMain.handle('stt:get-state', async () => sttService.getState());
  ipcMain.handle('stt:get-transcriptions', async () => sttService.getTranscriptions());
  ipcMain.handle('stt:get-transcript', async () => sttService.getFullTranscript());
  
  ipcMain.handle('stt:clear', async () => {
    sttService.clearTranscriptions();
    return { success: true };
  });

  // Window handlers
  ipcMain.on('window:minimize', () => overlayWindow?.hide());
  ipcMain.on('window:close', () => overlayWindow?.hide());

  ipcMain.on('mouse:enter-panel', () => {
    overlayWindow?.setIgnoreMouseEvents(false);
  });

  ipcMain.on('mouse:leave-panel', () => {
    overlayWindow?.setIgnoreMouseEvents(true, { forward: true });
  });
}

app.whenReady().then(() => {
  // Set up permission handlers for media access
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'audioCapture', 'desktopCapture'];
    console.log(`[Main] ${allowed.includes(permission) ? 'Allowing' : 'Denying'} permission: ${permission}`);
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return ['media', 'mediaKeySystem', 'audioCapture', 'desktopCapture'].includes(permission);
  });

  session.defaultSession.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'hid' || details.deviceType === 'serial') return false;
    return true;
  });

  createOverlayWindow();
  registerHotkeys();
  setupIPC();
  audioCaptureService.setOverlayWindow(overlayWindow);

  // Forward audio levels to renderer
  audioCaptureService.on('audio:level', (data) => {
    overlayWindow?.webContents.send('audio:level', data);
  });

  // Forward STT events to renderer and Context Service
  sttService.on('transcription', (result) => {
    console.log('[Main] Transcription:', result.text);
    
    // Feed final transcriptions into Context Service
    const segment = contextService.addTranscriptSegment({
      text: result.text,
      confidence: result.confidence,
      timestamp: result.timestamp,
      isFinal: true,
    });
    
    overlayWindow?.webContents.send('stt:transcription', result);
    overlayWindow?.webContents.send('context:segment-added', segment);
  });

  sttService.on('interim', (result) => {
    overlayWindow?.webContents.send('stt:interim', result);
  });

  sttService.on('connected', () => {
    console.log('[Main] STT connected to Deepgram');
    overlayWindow?.webContents.send('stt:connected');
  });

  sttService.on('disconnected', (info) => {
    console.log('[Main] STT disconnected');
    overlayWindow?.webContents.send('stt:disconnected', info);
  });

  sttService.on('error', (error) => {
    console.error('[Main] STT error:', error.message);
    overlayWindow?.webContents.send('stt:error', { message: error.message });
  });

  // Forward utterance-end to Context Service for pause detection
  sttService.on('utterance-end', () => {
    contextService.onUtteranceEnd();
  });

  // Forward Context Service events to renderer
  contextService.on('session-started', (data) => {
    overlayWindow?.webContents.send('context:session-started', data);
  });

  contextService.on('session-ended', (data) => {
    overlayWindow?.webContents.send('context:session-ended', data);
  });

  contextService.on('key-point-extracted', (keyPoint) => {
    console.log('[Main] Key point extracted:', keyPoint.preview.substring(0, 50));
    overlayWindow?.webContents.send('context:key-point', keyPoint);
  });

  contextService.on('context-cleared', (data) => {
    overlayWindow?.webContents.send('context:cleared', data);
  });

  // Handle auto-suggestions from Context Service
  contextService.on('auto-suggest', async (request) => {
    if (!aiService.isReady()) {
      console.log('[Main] Auto-suggest skipped - AI service not ready');
      contextService.markSuggestionFailed();
      return;
    }

    try {
      console.log(`[Main] 🤖 Auto-suggestion: ${request.type} (${request.triggerType})`);
      overlayWindow?.webContents.send('ai:auto-suggest-start', { 
        type: request.type, 
        triggerType: request.triggerType,
        reason: request.reason 
      });
      
      overlayWindow?.webContents.send('ai:stream-start', { actionType: request.type, isAutoSuggest: true });
      
      for await (const data of aiService.streamResponse(request.type, request.context, { isAutoSuggest: true })) {
        overlayWindow?.webContents.send('ai:stream-chunk', { chunk: data.chunk, fullContent: data.fullContent });
      }
      
      overlayWindow?.webContents.send('ai:stream-end', { actionType: request.type, isAutoSuggest: true });
      contextService.markSuggestionComplete();
    } catch (error) {
      console.error('[Main] Auto-suggest error:', error.message);
      overlayWindow?.webContents.send('ai:error', { message: error.message });
      contextService.markSuggestionFailed();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
      audioCaptureService.setOverlayWindow(overlayWindow);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (app.isReady()) globalShortcut.unregisterAll();
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (overlayWindow) {
      overlayWindow.show();
      overlayWindow.focus();
    }
  });
}
