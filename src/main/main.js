const { app, BrowserWindow, ipcMain, globalShortcut, screen, session } = require('electron');
const path = require('path');

// Import our services
// PermissionManager handles all macOS permission checks and requests
const permissionManager = require('./services/PermissionManager');
// AudioCaptureService coordinates audio capture from mic and system
const audioCaptureService = require('./services/AudioCaptureService');
// STTService handles speech-to-text transcription
const sttService = require('./services/STTService');

// Keep a global reference to prevent garbage collection
let overlayWindow = null;

const isDev = process.env.NODE_ENV !== 'production' || !app.isPackaged;

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection:', reason);
});

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.size;
  const { x: workX, y: workY } = primaryDisplay.workArea;

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
    // Critical: Makes window invisible to screen capture/recording
    type: 'panel',
    visibleOnAllWorkspaces: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Exclude from screen capture (macOS 10.14+)
  overlayWindow.setContentProtection(true);

  // Set window level to float above most windows
  overlayWindow.setAlwaysOnTop(true, 'floating');

  // Enable click-through on transparent areas by default
  // The renderer will tell us when mouse enters/leaves panels
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (isDev) {
    overlayWindow.loadURL('http://localhost:3000');
    // Uncomment to open DevTools
    // overlayWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// Register global hotkeys
function registerHotkeys() {
  // Toggle overlay visibility: Cmd+/ (primary)
  globalShortcut.register('CommandOrControl+/', () => {
    if (overlayWindow) {
      if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.show();
      }
    }
  });

  // Toggle overlay visibility: Cmd+Shift+\ (alternative)
  globalShortcut.register('CommandOrControl+Shift+\\', () => {
    if (overlayWindow) {
      if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.show();
      }
    }
  });

  // Manual AI suggestion trigger: Cmd+Enter
  globalShortcut.register('CommandOrControl+Return', () => {
    if (overlayWindow) {
      overlayWindow.webContents.send('trigger-ai-suggestion');
    }
  });

  // Reset layout: Cmd+\
  globalShortcut.register('CommandOrControl+\\', () => {
    if (overlayWindow) {
      overlayWindow.webContents.send('reset-layout');
    }
  });
}

// IPC Handlers
function setupIPC() {
  // ============================================
  // PERMISSION HANDLERS
  // These allow the UI to check and request permissions
  // ============================================

  /**
   * Get current permission state
   * UI calls this to show which permissions are missing
   */
  ipcMain.handle('permissions:get-state', async () => {
    return permissionManager.getPermissionState();
  });

  /**
   * Request all requestable permissions
   * This will trigger system dialogs for microphone and accessibility
   * Screen recording must be done manually via System Preferences
   */
  ipcMain.handle('permissions:request', async () => {
    return permissionManager.requestPermissions();
  });

  /**
   * Open System Preferences to a specific permission section
   * Used when user needs to manually grant permissions
   */
  ipcMain.handle('permissions:open-preferences', async (event, type) => {
    switch (type) {
      case 'microphone':
        permissionManager.openMicrophonePreferences();
        break;
      case 'screen-recording':
        permissionManager.openScreenRecordingPreferences();
        break;
      case 'accessibility':
        permissionManager.openAccessibilityPreferences();
        break;
      default:
        console.warn('[Main] Unknown preference type:', type);
    }
    return { success: true };
  });

  /**
   * Check if all permissions are granted and we're ready to start
   */
  ipcMain.handle('permissions:is-ready', async () => {
    return {
      ready: permissionManager.isReady(),
      missing: permissionManager.getMissingPermissions(),
    };
  });

  // ============================================
  // SESSION CONTROL HANDLERS
  // ============================================

  ipcMain.handle('session:start', async () => {
    // First check if we have all permissions
    if (!permissionManager.isReady()) {
      const missing = permissionManager.getMissingPermissions();
      console.log('[Main] Cannot start session - missing permissions:', missing);
      return { 
        success: false, 
        error: 'Missing permissions',
        missingPermissions: missing,
      };
    }

    // TODO: Integrate with Session Manager service
    console.log('[Main] Session start requested');
    return { success: true };
  });

  ipcMain.handle('session:stop', async () => {
    // TODO: Integrate with Session Manager service
    console.log('[Main] Session stop requested');
    return { success: true };
  });

  ipcMain.handle('session:toggle-pause', async () => {
    // TODO: Integrate with Session Manager service
    console.log('[Main] Session pause toggle requested');
    return { success: true, paused: false };
  });

  // ============================================
  // AI ACTION HANDLERS
  // ============================================

  ipcMain.handle('ai:trigger-action', async (event, actionType, metadata) => {
    // TODO: Integrate with AI Orchestration service
    console.log('[Main] AI action triggered:', actionType, metadata);
    return { success: true };
  });

  // ============================================
  // AUDIO CAPTURE HANDLERS
  // ============================================

  /**
   * Receive audio chunks from renderer
   * The renderer captures audio and sends it here for processing
   */
  ipcMain.on('audio:chunk', (event, chunk) => {
    // Forward to audio capture service (for PCM processing)
    // AudioCaptureService converts Float32 to PCM and buffers it
    // Then emits 'audio:buffer-ready' which triggers STT
    audioCaptureService.processAudioChunk(chunk);
  });

  /**
   * Start microphone capture
   * This tells the renderer to start capturing from the mic
   */
  ipcMain.handle('audio:start-mic', async () => {
    return audioCaptureService.startMicCapture();
  });

  /**
   * Stop microphone capture
   */
  ipcMain.handle('audio:stop-mic', async () => {
    return audioCaptureService.stopMicCapture();
  });

  /**
   * Start system audio capture
   * This tells the renderer to start capturing system audio via desktopCapturer
   */
  ipcMain.handle('audio:start-system', async () => {
    return audioCaptureService.startSystemCapture();
  });

  /**
   * Stop system audio capture
   */
  ipcMain.handle('audio:stop-system', async () => {
    return audioCaptureService.stopSystemCapture();
  });

  /**
   * Start all audio capture (mic + system)
   */
  ipcMain.handle('audio:start-all', async () => {
    return audioCaptureService.startAllCapture();
  });

  /**
   * Stop all audio capture
   */
  ipcMain.handle('audio:stop-all', async () => {
    return audioCaptureService.stopAllCapture();
  });

  /**
   * Get current audio capture state
   */
  ipcMain.handle('audio:get-state', async () => {
    return audioCaptureService.getState();
  });

  // ============================================
  // STT (SPEECH-TO-TEXT) HANDLERS
  // ============================================

  /**
   * Set STT mode ('local' or 'api')
   */
  ipcMain.handle('stt:set-mode', async (event, mode) => {
    await sttService.setMode(mode);
    return { success: true, mode };
  });

  /**
   * Set OpenAI API key for Whisper (API mode)
   */
  ipcMain.handle('stt:set-api-key', async (event, apiKey) => {
    sttService.setApiKey(apiKey);
    return { success: true };
  });

  /**
   * Set local model to use
   */
  ipcMain.handle('stt:set-local-model', async (event, model) => {
    sttService.setLocalModel(model);
    return { success: true, model };
  });

  /**
   * Enable/disable STT
   */
  ipcMain.handle('stt:set-enabled', async (event, enabled) => {
    await sttService.setEnabled(enabled);
    return { success: true };
  });

  /**
   * Get STT state
   */
  ipcMain.handle('stt:get-state', async () => {
    return sttService.getState();
  });

  /**
   * Get transcriptions
   */
  ipcMain.handle('stt:get-transcriptions', async () => {
    return sttService.getTranscriptions();
  });

  /**
   * Get full transcript
   */
  ipcMain.handle('stt:get-transcript', async () => {
    return sttService.getFullTranscript();
  });

  /**
   * Clear transcriptions
   */
  ipcMain.handle('stt:clear', async () => {
    sttService.clearTranscriptions();
    return { success: true };
  });

  /**
   * Flush current buffer (transcribe now)
   */
  ipcMain.handle('stt:flush', async () => {
    await sttService.flushBuffer();
    return { success: true };
  });

  // Window control
  ipcMain.on('window:minimize', () => {
    if (overlayWindow) overlayWindow.hide();
  });

  ipcMain.on('window:close', () => {
    if (overlayWindow) overlayWindow.hide();
  });

  // Mouse enter/leave panel - toggle click-through
  ipcMain.on('mouse:enter-panel', () => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.on('mouse:leave-panel', () => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });
}

app.whenReady().then(() => {
  // Set up permission handlers for media access (getUserMedia)
  // This is required for microphone access in Electron
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'audioCapture', 'desktopCapture'];
    if (allowedPermissions.includes(permission)) {
      console.log(`[Main] Allowing permission: ${permission}`);
      callback(true);
    } else {
      console.log(`[Main] Denying permission: ${permission}`);
      callback(false);
    }
  });

  // Also handle permission checks
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'audioCapture', 'desktopCapture'];
    return allowedPermissions.includes(permission);
  });

  // Handle device permission requests (for specific microphone/camera access)
  session.defaultSession.setDevicePermissionHandler((details) => {
    // Allow all audio input devices
    if (details.deviceType === 'hid' || details.deviceType === 'serial') {
      return false;
    }
    console.log(`[Main] Allowing device access: ${details.deviceType}`);
    return true;
  });

  createOverlayWindow();
  registerHotkeys();
  setupIPC();

  // Set window reference for audio capture service
  // This allows it to send IPC messages to the renderer
  audioCaptureService.setOverlayWindow(overlayWindow);

  // Connect audio capture to STT service
  // When audio buffers are ready, send them to STT for transcription
  // TEMPORARILY DISABLED - focusing on audio capture quality first
  // audioCaptureService.on('audio:buffer-ready', (chunk) => {
  //   sttService.processAudioChunk(chunk);
  // });

  // Forward audio levels (including dB) to renderer for monitoring
  audioCaptureService.on('audio:level', (data) => {
    if (overlayWindow) {
      overlayWindow.webContents.send('audio:level', data);
    }
  });

  // Forward STT transcriptions to renderer
  sttService.on('transcription', (result) => {
    console.log('[Main] Forwarding transcription to renderer:', result.text);
    if (overlayWindow) {
      overlayWindow.webContents.send('stt:transcription', result);
    }
  });

  sttService.on('error', (error) => {
    if (overlayWindow) {
      overlayWindow.webContents.send('stt:error', { message: error.message });
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
      // Update the window reference
      audioCaptureService.setOverlayWindow(overlayWindow);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Prevent multiple instances
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
