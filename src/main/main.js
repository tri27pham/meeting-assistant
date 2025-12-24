const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { performance } = require("perf_hooks");

try {
  const dotenv = require("dotenv");
  const envPath = path.join(__dirname, "../../.env");
  const resolvedPath = path.resolve(envPath);
  if (fs.existsSync(resolvedPath)) {
    const result = dotenv.config({ path: resolvedPath });
    if (result.error) {
      console.warn("[Main] Error loading .env file:", result.error);
    } else {
      console.log("[Main] Loaded .env file from:", resolvedPath);
      console.log("[Main] DEEPGRAM_API_KEY loaded:", process.env.DEEPGRAM_API_KEY ? "Yes" : "No");
    }
  } else {
    console.warn("[Main] .env file not found at:", resolvedPath);
  }
} catch (e) {
  console.warn("[Main] dotenv not available, using environment variables only:", e.message);
}

const AudioCaptureService = require("./services/AudioCaptureService");
const DeepgramService = require("./services/DeepgramService");
const PermissionService = require("./services/PermissionService");
const ContextService = require("./services/ContextService");
const AIOrchestrationService = require("./services/AIOrchestrationService");

let overlayWindow = null;

const audioCaptureService = new AudioCaptureService();
const deepgramService = new DeepgramService();
const permissionService = new PermissionService();
const contextService = new ContextService();
console.log('[Main] ContextService initialized');
const aiOrchestrationService = new AIOrchestrationService(contextService);
console.log('[Main] AIOrchestrationService initialized');

const isDev = process.env.NODE_ENV !== "production" || !app.isPackaged;

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
    type: "panel", // Makes window invisible to screen capture

    visibleOnAllWorkspaces: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setContentProtection(true);
  overlayWindow.setAlwaysOnTop(true, "floating");
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (isDev) {
    overlayWindow.loadURL("http://localhost:3000");
  } else {
    overlayWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

function registerHotkeys() {
  globalShortcut.register("CommandOrControl+/", () => {
    if (overlayWindow) {
      if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.show();
      }
    }
  });

  globalShortcut.register("CommandOrControl+\\", () => {
    if (overlayWindow) {
      overlayWindow.webContents.send("layout:reset");
    }
  });

  globalShortcut.register("CommandOrControl+;", () => {
    if (overlayWindow) {
      overlayWindow.webContents.send("transcript:toggle");
    }
  });
}

function setupAudioPipeline() {
  let firstChunkSent = false;
  let chunkCount = 0;
  audioCaptureService.on("audioChunk", (chunk) => {
    chunkCount++;
    
    // Only send audio to Deepgram when actively recording (not stopped or paused)
    if (!audioCaptureService.isCapturing || audioCaptureService.isPaused) {
      // Silently ignore chunks when not recording or paused
      return;
    }
    
    if (deepgramService.isConnected) {
      if (!firstChunkSent) {
        console.log("[Main] First audio chunk being sent to Deepgram");
        firstChunkSent = true;
      }
      // Log every 100 chunks to track if audio is still flowing
      if (chunkCount % 100 === 0) {
        console.log(`[Main] Sent ${chunkCount} audio chunks to Deepgram, connection state:`, {
          isConnected: deepgramService.isConnected,
          isStreaming: deepgramService.isStreaming,
          isCapturing: audioCaptureService.isCapturing,
          isPaused: audioCaptureService.isPaused
        });
      }
      deepgramService.streamAudio(chunk);
    } else {
      console.warn("[Main] Audio chunk received but Deepgram is not connected", {
        chunkCount,
        isConnected: deepgramService.isConnected,
        isCapturing: audioCaptureService.isCapturing,
        isPaused: audioCaptureService.isPaused
      });
    }
  });

  // Listen for both partial and final transcript events
  deepgramService.on("transcript:partial", (transcriptData) => {
    if (overlayWindow) {
      overlayWindow.webContents.send("transcript:update", {
        text: transcriptData.text,
        isFinal: false,
        confidence: transcriptData.confidence,
        timestamp: transcriptData.timestamp,
      });
    }
  });

  deepgramService.on("transcript:final", (transcriptData) => {
    console.log('[Main] Received transcript:final', { 
      text: transcriptData.text?.substring(0, 50),
      hasText: !!transcriptData.text,
      timestamp: transcriptData.timestamp 
    });
    
    // Forward to ContextService for context management
    contextService.addSegment(transcriptData);

    // Keep existing transcript forwarding to renderer (for UI display)
    if (overlayWindow) {
      overlayWindow.webContents.send("transcript:update", {
        text: transcriptData.text,
        isFinal: true,
        confidence: transcriptData.confidence,
        timestamp: transcriptData.timestamp,
      });
    }
  });

  let isReconnecting = false;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  
  const attemptReconnect = async () => {
    if (!audioCaptureService.isCapturing) {
      console.log("[Main] Audio capture not active - not reconnecting");
      return;
    }
    
    if (isReconnecting) {
      console.log("[Main] Reconnection already in progress");
      return;
    }
    
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error("[Main] Max reconnection attempts reached, giving up");
      reconnectAttempts = 0;
      return;
    }
    
      isReconnecting = true;
    reconnectAttempts++;
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 16000);
    console.log(`[Main] Attempting to reconnect to Deepgram (attempt ${reconnectAttempts}/${maxReconnectAttempts}) in ${delay}ms...`);
    
      setTimeout(async () => {
        try {
        // Ensure we disconnect any stale connection first
        if (deepgramService.isConnected) {
          await deepgramService.disconnect();
        }
        
          await deepgramService.connect();
        console.log("[Main] Successfully reconnected to Deepgram");
        reconnectAttempts = 0; // Reset on success
          isReconnecting = false;
        } catch (error) {
        console.error(`[Main] Failed to reconnect to Deepgram (attempt ${reconnectAttempts}):`, error);
          isReconnecting = false;
        // Will retry on next error/close event
      }
    }, delay);
  };
  
  deepgramService.on("closed", () => {
    attemptReconnect();
  });

  audioCaptureService.on("started", () => {
    if (overlayWindow) {
      overlayWindow.webContents.send("audio:status-update", {
        status: "capturing",
        isCapturing: true,
        isPaused: false,
      });
    }
  });

  audioCaptureService.on("stopped", () => {
    if (overlayWindow) {
      overlayWindow.webContents.send("audio:status-update", {
        status: "stopped",
        isCapturing: false,
        isPaused: false,
      });
    }
  });

  audioCaptureService.on("paused", () => {
    if (overlayWindow) {
      overlayWindow.webContents.send("audio:status-update", {
        status: "paused",
        isCapturing: true,
        isPaused: true,
      });
    }
  });

  audioCaptureService.on("resumed", () => {
    if (overlayWindow) {
      overlayWindow.webContents.send("audio:status-update", {
        status: "capturing",
        isCapturing: true,
        isPaused: false,
      });
    }
  });

  audioCaptureService.on("error", (error) => {
    console.error("[Main] Audio capture error:", error);
    if (overlayWindow) {
      overlayWindow.webContents.send("audio:status-update", {
        status: "error",
        error: error.message,
      });
    }
  });

  deepgramService.on("error", (error) => {
    console.error("[Main] Deepgram error:", error);
    // Attempt to reconnect on error (connection might be broken)
    if (audioCaptureService.isCapturing) {
      attemptReconnect();
    }
  });

  audioCaptureService.on("audioLevels", (levels) => {
    if (overlayWindow) {
      overlayWindow.webContents.send("audio:levels-update", levels);
    }
  });
}

function setupIPC() {
  ipcMain.handle("session:start", async () => {
    let startTime;
    try {
      startTime = performance.now();
      console.log("[Main] session:start called");
    } catch (e) {
      console.error("[Main] Error accessing performance:", e);
      startTime = Date.now();
    }
    
    try {
      let permStartTime, permEndTime;
      try {
        permStartTime = performance.now();
      } catch (e) {
        permStartTime = Date.now();
      }
      const hasPermissions = await permissionService.hasAllPermissions();
      if (!hasPermissions) {
        const permissions = await permissionService.requestAllPermissions();
        if (!permissions.allGranted) {
          return {
            success: false,
            error: "Permissions not granted",
            permissions,
          };
        }
      }
      try {
        permEndTime = performance.now();
        console.log(`[Main] Permission check took ${(permEndTime - permStartTime).toFixed(2)}ms`);
      } catch (e) {
        permEndTime = Date.now();
        console.log(`[Main] Permission check took ${(permEndTime - permStartTime)}ms`);
      }

      if (!deepgramService.isReady()) {
        return {
          success: false,
          error: "Deepgram API key not configured",
        };
      }

      let deepgramStartTime, deepgramEndTime;
      try {
        deepgramStartTime = performance.now();
      } catch (e) {
        deepgramStartTime = Date.now();
      }
      await deepgramService.connect();
      try {
        deepgramEndTime = performance.now();
        console.log(`[Main] Deepgram connection took ${(deepgramEndTime - deepgramStartTime).toFixed(2)}ms`);
      } catch (e) {
        deepgramEndTime = Date.now();
        console.log(`[Main] Deepgram connection took ${(deepgramEndTime - deepgramStartTime)}ms`);
      }

      let audioStartTime, audioEndTime;
      try {
        audioStartTime = performance.now();
      } catch (e) {
        audioStartTime = Date.now();
      }
      await audioCaptureService.start({
        systemAudio: true,
        microphone: true,
      });
      try {
        audioEndTime = performance.now();
        console.log(`[Main] Audio capture start took ${(audioEndTime - audioStartTime).toFixed(2)}ms`);
      } catch (e) {
        audioEndTime = Date.now();
        console.log(`[Main] Audio capture start took ${(audioEndTime - audioStartTime)}ms`);
      }

      let totalTime;
      try {
        totalTime = performance.now() - startTime;
        console.log(`[Main] Total session:start took ${totalTime.toFixed(2)}ms`);
      } catch (e) {
        totalTime = Date.now() - startTime;
        console.log(`[Main] Total session:start took ${totalTime}ms`);
      }
      return { success: true };
    } catch (error) {
      console.error("[Main] Error starting session:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("session:stop", async () => {
    try {
      await audioCaptureService.stop();
      await deepgramService.disconnect();
      contextService.clear(); // Clear context on session stop

      return { success: true };
    } catch (error) {
      console.error("[Main] Error stopping session:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("session:toggle-pause", async () => {
    try {
      if (audioCaptureService.isPaused) {
        audioCaptureService.resume();
        return { success: true, paused: false };
      } else {
        audioCaptureService.pause();
        return { success: true, paused: true };
      }
    } catch (error) {
      console.error("[Main] Error toggling pause:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("ai:trigger-action", async (event, actionType, metadata) => {
    try {
      // Validate inputs
      if (!actionType || typeof actionType !== 'string') {
        return {
          success: false,
          error: 'Invalid actionType: must be a non-empty string',
        };
      }

      // Validate metadata if provided
      if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))) {
        return {
          success: false,
          error: 'Invalid metadata: must be an object',
        };
      }

      // Trigger AI action via AIOrchestrationService
      await aiOrchestrationService.triggerAction(actionType, metadata);
      return { success: true };
    } catch (error) {
      console.error('[Main] Error triggering AI action:', error);
      return { success: false, error: error.message };
    }
  });

  // Listen to AI response events and forward to renderer
  aiOrchestrationService.on("ai:response", (data) => {
    console.log('\n========== AI RESPONSE ==========');
    console.log('[Main] Received ai:response event');
    console.log('  Action Type:', data.actionType);
    console.log('  Is Partial:', data.isPartial);
    console.log('  Suggestion Count:', data.suggestions?.length || 0);
    console.log('  Timestamp:', new Date(data.timestamp).toISOString());
    
    if (data.suggestions && data.suggestions.length > 0) {
      console.log('\n  Suggestions:');
      data.suggestions.forEach((suggestion, index) => {
        console.log(`    ${index + 1}. [${suggestion.id}] ${suggestion.label || suggestion.text || 'NO LABEL'}`);
        console.log(`       Type: ${suggestion.type || 'N/A'}, Icon: ${suggestion.icon || 'N/A'}`);
      });
    } else {
      console.log('  No suggestions in response!');
    }
    console.log('==================================\n');
    
    if (overlayWindow) {
      overlayWindow.webContents.send("ai:response", data);
      console.log('[Main] Forwarded ai:response to renderer');
    } else {
      console.warn('[Main] Cannot forward ai:response - overlayWindow is null');
    }
  });

  // Listen to AI error events and forward to renderer
  aiOrchestrationService.on("ai:error", (error) => {
    console.error("[Main] AI error:", error);
    if (overlayWindow) {
      overlayWindow.webContents.send("ai:error", {
        message: error.message,
        stack: error.stack,
      });
    }
  });

  ipcMain.on("window:minimize", () => {
    if (overlayWindow) overlayWindow.hide();
  });

  ipcMain.on("window:close", () => {
    if (overlayWindow) overlayWindow.hide();
  });

  // Mouse enter/leave panel - toggle click-through
  ipcMain.on("mouse:enter-panel", () => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.on("mouse:leave-panel", () => {
    if (overlayWindow) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });

  // Audio capture - receive microphone chunks from renderer
  ipcMain.on("audio:microphone-chunk", (event, chunkData) => {
    audioCaptureService.onMicrophoneData(chunkData);
  });
}

app.whenReady().then(() => {
  createOverlayWindow();
  registerHotkeys();
  setupAudioPipeline();
  setupIPC();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", async () => {
  globalShortcut.unregisterAll();
  
  // Cleanup services
  try {
    await audioCaptureService.stop();
    await deepgramService.disconnect();
  } catch (error) {
    console.error("[Main] Error during cleanup:", error);
  }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (overlayWindow) {
      overlayWindow.show();
      overlayWindow.focus();
    }
  });
}
