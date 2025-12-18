const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
} = require("electron");
const path = require("path");
const fs = require("fs");

// Load environment variables from .env file (before importing other modules)
try {
  const dotenv = require("dotenv");
  // __dirname is src/main, so go up two levels to project root
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

// Import services
const AudioCaptureService = require("./services/AudioCaptureService");
const DeepgramService = require("./services/DeepgramService");
const PermissionService = require("./services/PermissionService");

// Keep a global reference to prevent garbage collection
let overlayWindow = null;

// Initialize services
const audioCaptureService = new AudioCaptureService();
const deepgramService = new DeepgramService();
const permissionService = new PermissionService();

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
    // Critical: Makes window invisible to screen capture/recording
    type: "panel",
    visibleOnAllWorkspaces: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Exclude from screen capture (macOS 10.14+)
  overlayWindow.setContentProtection(true);

  // Set window level to float above most windows
  overlayWindow.setAlwaysOnTop(true, "floating");

  // Enable click-through on transparent areas by default
  // The renderer will tell us when mouse enters/leaves panels
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (isDev) {
    overlayWindow.loadURL("http://localhost:3000");
    // Uncomment to open DevTools
    // overlayWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    overlayWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

// Register global hotkeys
function registerHotkeys() {
  // Toggle overlay visibility: Cmd+/ (primary)
  globalShortcut.register("CommandOrControl+/", () => {
    if (overlayWindow) {
      if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      } else {
        overlayWindow.show();
      }
    }
  });

  // Manual AI suggestion trigger: Cmd+Enter
  globalShortcut.register("CommandOrControl+Return", () => {
    if (overlayWindow) {
      overlayWindow.webContents.send("trigger-ai-suggestion");
    }
  });

  // Reset layout: Cmd+\
  globalShortcut.register("CommandOrControl+\\", () => {
    if (overlayWindow) {
      overlayWindow.webContents.send("reset-layout");
    }
  });

  // Toggle transcript: Cmd+;
  globalShortcut.register("CommandOrControl+;", () => {
    if (overlayWindow) {
      overlayWindow.webContents.send("toggle-transcript");
    }
  });
}

// Connect audio capture to Deepgram
function setupAudioPipeline() {
  // When audio chunks are ready, send to Deepgram
  audioCaptureService.on("audioChunk", (chunk) => {
    if (deepgramService.isConnected) {
      deepgramService.streamAudio(chunk);
    }
  });

  // When transcripts are received from Deepgram, send to renderer
  deepgramService.on("transcript", (transcriptData) => {
    if (overlayWindow) {
      overlayWindow.webContents.send("transcript:update", {
        text: transcriptData.text,
        isFinal: transcriptData.isFinal,
        confidence: transcriptData.confidence,
        timestamp: transcriptData.timestamp,
      });
    }
  });

  // Handle Deepgram connection close - attempt to reconnect
  deepgramService.on("closed", () => {
    // Only reconnect if audio capture is still running
    if (audioCaptureService.isCapturing) {
      setTimeout(async () => {
        try {
          await deepgramService.connect();
        } catch (error) {
          console.error("[Main] Failed to reconnect to Deepgram:", error);
        }
      }, 2000);
    }
  });

  // Handle audio capture events
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

  // Handle errors
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
  });

  // Forward audio levels to renderer
  audioCaptureService.on("audioLevels", (levels) => {
    if (overlayWindow) {
      overlayWindow.webContents.send("audio:levels-update", levels);
    }
  });
}

// IPC Handlers
function setupIPC() {
  // Session control
  ipcMain.handle("session:start", async () => {
    try {
      // Check permissions first
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

      // Connect to Deepgram
      if (!deepgramService.isReady()) {
        return {
          success: false,
          error: "Deepgram API key not configured",
        };
      }

      await deepgramService.connect();

      // Start audio capture
      await audioCaptureService.start({
        systemAudio: true,
        microphone: true,
      });

      return { success: true };
    } catch (error) {
      console.error("[Main] Error starting session:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("session:stop", async () => {
    try {
      // Stop audio capture
      await audioCaptureService.stop();

      // Disconnect from Deepgram
      await deepgramService.disconnect();

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

  // AI actions
  ipcMain.handle("ai:trigger-action", async (event, actionType, metadata) => {
    // TODO: Integrate with AI Orchestration service
    return { success: true };
  });

  // Window control
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
