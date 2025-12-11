require('dotenv').config();

const { app, BrowserWindow, ipcMain, globalShortcut, screen, session } = require('electron');
const path = require('path');

const permissionManager = require('./services/PermissionManager');
const audioCaptureService = require('./services/AudioCaptureService');
const sttService = require('./services/STTService');

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

  globalShortcut.register("CommandOrControl+'", () => {
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
    return { success: true };
  });

  // Audio handlers
  ipcMain.on('audio:chunk', (event, chunk) => {
    audioCaptureService.processAudioChunk(chunk);
  });

  ipcMain.on('audio:raw-blob', (event, data) => {
    if (data && data.length > 0) {
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

  // Forward STT events to renderer
  sttService.on('transcription', (result) => {
    console.log('[Main] Transcription:', result.text);
    overlayWindow?.webContents.send('stt:transcription', result);
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
