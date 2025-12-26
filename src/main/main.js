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
const TranscriptMergeService = require("./services/TranscriptMergeService");
const PermissionService = require("./services/PermissionService");
const ContextService = require("./services/ContextService");
const AIOrchestrationService = require("./services/AIOrchestrationService");

// Initialize electron-audio-loopback in main process (must be before app.whenReady)
let electronAudioLoopback = null;
try {
  electronAudioLoopback = require('electron-audio-loopback');
  if (typeof electronAudioLoopback.initMain === 'function') {
    electronAudioLoopback.initMain();
    console.log('[Main] electron-audio-loopback initialized');
    console.log('[Main] IPC handlers for enable-loopback-audio and disable-loopback-audio should be set up by initMain()');
  } else {
    console.warn('[Main] electron-audio-loopback.initMain not found');
  }
} catch (error) {
  console.warn('[Main] electron-audio-loopback not available:', error.message);
}

let overlayWindow = null;

const audioCaptureService = new AudioCaptureService();
const deepgramMicService = new DeepgramService('microphone');
const deepgramSystemService = new DeepgramService('system');
const transcriptMergeService = new TranscriptMergeService();
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

  // Forward renderer console logs to main process terminal
  overlayWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levelPrefix = level === 0 ? 'LOG' : level === 1 ? 'INFO' : level === 2 ? 'WARN' : 'ERROR';
    console.log(`[Renderer:${levelPrefix}] ${message}${sourceId ? ` (${sourceId}:${line})` : ''}`);
  });

  // Inject console forwarding script after page loads
  overlayWindow.webContents.once('did-finish-load', () => {
    overlayWindow.webContents.executeJavaScript(`
      (function() {
        if (window.cluely && window.cluely.log) {
          const originalLog = console.log;
          const originalError = console.error;
          const originalWarn = console.warn;
          const originalInfo = console.info;
          
          const forwardLog = (level, args) => {
            try {
              const message = args.map(a => {
                if (typeof a === 'object') {
                  try {
                    return JSON.stringify(a);
                  } catch (e) {
                    return String(a);
                  }
                }
                return String(a);
              }).join(' ');
              window.cluely.log(level, message);
            } catch (e) {
              // Silently fail if IPC not available
            }
          };
          
          console.log = function(...args) {
            originalLog.apply(console, args);
            forwardLog('log', args);
          };
          
          console.error = function(...args) {
            originalError.apply(console, args);
            forwardLog('error', args);
          };
          
          console.warn = function(...args) {
            originalWarn.apply(console, args);
            forwardLog('warn', args);
          };
          
          console.info = function(...args) {
            originalInfo.apply(console, args);
            forwardLog('log', args);
          };
        }
      })();
    `).catch(err => console.warn('[Main] Failed to inject console forwarding:', err));
  });

  if (isDev) {
    overlayWindow.loadURL("http://localhost:3000");
    // DevTools can be opened manually with Cmd+Option+I or via menu if needed
    // overlayWindow.webContents.openDevTools();
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
  // Start transcript merge service flush timer
  transcriptMergeService.startFlushTimer();

  // Track first chunks for each stream
  let firstMicChunkSent = false;
  let firstSystemChunkSent = false;
  let micChunkCount = 0;
  let systemChunkCount = 0;

  // Handle microphone audio chunks
  audioCaptureService.on("microphoneAudioChunk", (chunk) => {
    micChunkCount++;
    
    // Only send audio to Deepgram when actively recording (not stopped or paused)
    if (!audioCaptureService.isCapturing || audioCaptureService.isPaused) {
      return;
    }
    
    if (deepgramMicService.isConnected) {
      if (!firstMicChunkSent) {
        console.log("[Main] First microphone audio chunk being sent to Deepgram");
        firstMicChunkSent = true;
      }
      // Log every 100 chunks to track if audio is still flowing
      if (micChunkCount % 100 === 0) {
        console.log(`[Main] Sent ${micChunkCount} microphone chunks to Deepgram, connection state:`, {
          isConnected: deepgramMicService.isConnected,
          isStreaming: deepgramMicService.isStreaming,
          isCapturing: audioCaptureService.isCapturing,
          isPaused: audioCaptureService.isPaused
        });
      }
      deepgramMicService.streamAudio(chunk);
    } else {
      console.warn("[Main] Microphone chunk received but Deepgram mic service is not connected", {
        chunkCount: micChunkCount,
        isConnected: deepgramMicService.isConnected,
        isCapturing: audioCaptureService.isCapturing,
        isPaused: audioCaptureService.isPaused
      });
    }
  });

  // Handle system audio chunks
  audioCaptureService.on("systemAudioChunk", (chunk) => {
    systemChunkCount++;
    
    // Only send audio to Deepgram when actively recording (not stopped or paused)
    if (!audioCaptureService.isCapturing || audioCaptureService.isPaused) {
      return;
    }
    
    if (deepgramSystemService.isConnected) {
      if (!firstSystemChunkSent) {
        console.log("[Main] First system audio chunk being sent to Deepgram");
        firstSystemChunkSent = true;
      }
      // Log every 100 chunks to track if audio is still flowing
      if (systemChunkCount % 100 === 0) {
        console.log(`[Main] Sent ${systemChunkCount} system audio chunks to Deepgram, connection state:`, {
          isConnected: deepgramSystemService.isConnected,
          isStreaming: deepgramSystemService.isStreaming,
          isCapturing: audioCaptureService.isCapturing,
          isPaused: audioCaptureService.isPaused
        });
      }
      deepgramSystemService.streamAudio(chunk);
    } else {
      console.warn("[Main] System audio chunk received but Deepgram system service is not connected", {
        chunkCount: systemChunkCount,
        isConnected: deepgramSystemService.isConnected,
        isCapturing: audioCaptureService.isCapturing,
        isPaused: audioCaptureService.isPaused
      });
    }
  });

  // Track stream start times for timestamp calculation
  deepgramMicService.on("connected", ({ streamStartTime }) => {
    transcriptMergeService.setStreamStartTime('microphone', streamStartTime);
  });

  deepgramSystemService.on("connected", ({ streamStartTime }) => {
    transcriptMergeService.setStreamStartTime('system', streamStartTime);
  });

  // Route transcripts from microphone Deepgram service to merge service
  deepgramMicService.on("transcript:final", (transcriptData) => {
    console.log('[Main] Received microphone transcript:final', { 
      text: transcriptData.text?.substring(0, 50),
      hasText: !!transcriptData.text,
      timestamp: transcriptData.timestamp,
      source: transcriptData.source
    });
    
    transcriptMergeService.addTranscript('microphone', transcriptData, transcriptData.streamStartTime);
  });

  // Route transcripts from system Deepgram service to merge service
  deepgramSystemService.on("transcript:final", (transcriptData) => {
    console.log('[Main] Received system transcript:final', { 
      text: transcriptData.text?.substring(0, 50),
      hasText: !!transcriptData.text,
      timestamp: transcriptData.timestamp,
      source: transcriptData.source
    });
    
    transcriptMergeService.addTranscript('system', transcriptData, transcriptData.streamStartTime);
  });

  // Handle merged, chronologically ordered transcripts
  transcriptMergeService.on("transcript:merged", (mergedData) => {
    console.log('[Main] Received merged transcript (chronologically ordered)', {
      source: mergedData.source,
      text: mergedData.text?.substring(0, 50),
      absoluteTimestamp: new Date(mergedData.absoluteTimestamp).toISOString(),
      hasText: !!mergedData.text
    });
    
    // Forward to ContextService for context management
    contextService.addSegment(mergedData);

    // Forward to renderer for UI display
    if (overlayWindow) {
      overlayWindow.webContents.send("transcript:update", {
        text: mergedData.text,
        isFinal: mergedData.isFinal !== false, // Default to true if not specified
        confidence: mergedData.confidence,
        timestamp: mergedData.absoluteTimestamp, // Use absolute timestamp
        source: mergedData.source, // Include source for UI
      });
    }
  });

  // Reconnection handling for both Deepgram services
  let isReconnectingMic = false;
  let isReconnectingSystem = false;
  let reconnectAttemptsMic = 0;
  let reconnectAttemptsSystem = 0;
  const maxReconnectAttempts = 5;
  
  const attemptReconnectMic = async () => {
    if (!audioCaptureService.isCapturing) {
      console.log("[Main] Audio capture not active - not reconnecting mic");
      return;
    }
    
    if (isReconnectingMic) {
      console.log("[Main] Mic reconnection already in progress");
      return;
    }
    
    if (reconnectAttemptsMic >= maxReconnectAttempts) {
      console.error("[Main] Max mic reconnection attempts reached, giving up");
      reconnectAttemptsMic = 0;
      return;
    }
    
    isReconnectingMic = true;
    reconnectAttemptsMic++;
    
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsMic - 1), 16000);
    console.log(`[Main] Attempting to reconnect mic Deepgram (attempt ${reconnectAttemptsMic}/${maxReconnectAttempts}) in ${delay}ms...`);
    
    setTimeout(async () => {
      try {
        if (deepgramMicService.isConnected) {
          await deepgramMicService.disconnect();
        }
        await deepgramMicService.connect();
        console.log("[Main] Successfully reconnected mic Deepgram");
        reconnectAttemptsMic = 0;
        isReconnectingMic = false;
      } catch (error) {
        console.error(`[Main] Failed to reconnect mic Deepgram (attempt ${reconnectAttemptsMic}):`, error);
        isReconnectingMic = false;
      }
    }, delay);
  };

  const attemptReconnectSystem = async () => {
    if (!audioCaptureService.isCapturing) {
      console.log("[Main] Audio capture not active - not reconnecting system");
      return;
    }
    
    if (isReconnectingSystem) {
      console.log("[Main] System reconnection already in progress");
      return;
    }
    
    if (reconnectAttemptsSystem >= maxReconnectAttempts) {
      console.error("[Main] Max system reconnection attempts reached, giving up");
      reconnectAttemptsSystem = 0;
      return;
    }
    
    isReconnectingSystem = true;
    reconnectAttemptsSystem++;
    
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsSystem - 1), 16000);
    console.log(`[Main] Attempting to reconnect system Deepgram (attempt ${reconnectAttemptsSystem}/${maxReconnectAttempts}) in ${delay}ms...`);
    
    setTimeout(async () => {
      try {
        if (deepgramSystemService.isConnected) {
          await deepgramSystemService.disconnect();
        }
        await deepgramSystemService.connect();
        console.log("[Main] Successfully reconnected system Deepgram");
        reconnectAttemptsSystem = 0;
        isReconnectingSystem = false;
      } catch (error) {
        console.error(`[Main] Failed to reconnect system Deepgram (attempt ${reconnectAttemptsSystem}):`, error);
        isReconnectingSystem = false;
      }
    }, delay);
  };
  
  deepgramMicService.on("closed", () => {
    attemptReconnectMic();
  });

  deepgramSystemService.on("closed", () => {
    attemptReconnectSystem();
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

  deepgramMicService.on("error", (error) => {
    console.error("[Main] Deepgram mic service error:", error);
    if (audioCaptureService.isCapturing) {
      attemptReconnectMic();
    }
  });

  deepgramSystemService.on("error", (error) => {
    console.error("[Main] Deepgram system service error:", error);
    if (audioCaptureService.isCapturing) {
      attemptReconnectSystem();
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
    
      // Reset microphone chunk tracking
      firstMicChunkTime = null;
      micChunkCount = 0;
      sessionStartTime = Date.now();
      console.log(`[Main] Session start time recorded: ${new Date(sessionStartTime).toISOString()}`);
      
      // Set timeout warnings if no microphone chunks arrive
      setTimeout(() => {
        if (!firstMicChunkTime) {
          console.warn(`[Main] ⚠️ WARNING: No microphone chunks received after 5 seconds!`);
          console.warn(`[Main] This suggests the renderer process microphone capture may not be working.`);
          console.warn(`[Main] Check browser console (DevTools) for renderer process logs.`);
        }
      }, 5000);
      
      setTimeout(() => {
        if (!firstMicChunkTime) {
          console.error(`[Main] ⚠️ CRITICAL: No microphone chunks received after 15 seconds!`);
          console.error(`[Main] The microphone capture is likely not working.`);
          console.error(`[Main] Check browser console (DevTools) for renderer process debugging logs.`);
        }
      }, 15000);
    
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

      if (!deepgramMicService.isReady() || !deepgramSystemService.isReady()) {
        return {
          success: false,
          error: "Deepgram API key not configured",
        };
      }

      // Connect both Deepgram services
      let deepgramStartTime, deepgramEndTime;
      try {
        deepgramStartTime = performance.now();
      } catch (e) {
        deepgramStartTime = Date.now();
      }
      
      // Connect microphone Deepgram service
      await deepgramMicService.connect();
      
      // Connect system Deepgram service
      await deepgramSystemService.connect();
      
      try {
        deepgramEndTime = performance.now();
        console.log(`[Main] Both Deepgram connections took ${(deepgramEndTime - deepgramStartTime).toFixed(2)}ms`);
      } catch (e) {
        deepgramEndTime = Date.now();
        console.log(`[Main] Both Deepgram connections took ${(deepgramEndTime - deepgramStartTime)}ms`);
      }

      // Clear transcript merge service state for new session
      transcriptMergeService.clear();

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
      await deepgramMicService.disconnect();
      await deepgramSystemService.disconnect();
      transcriptMergeService.clear();
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
  let firstMicChunkTime = null;
  let micChunkCount = 0;
  let sessionStartTime = null;
  
  // Forward renderer console logs to terminal
  ipcMain.on("renderer:console-log", (event, level, message) => {
    const prefix = level === 'error' ? '[Renderer:ERROR]' : level === 'warn' ? '[Renderer:WARN]' : '[Renderer:LOG]';
    if (level === 'error') {
      console.error(`${prefix} ${message}`);
    } else if (level === 'warn') {
      console.warn(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
  });

  ipcMain.on("audio:microphone-chunk", (event, chunkData) => {
    micChunkCount++;
    
    // Track first chunk timing
    if (!firstMicChunkTime) {
      firstMicChunkTime = Date.now();
      const timeSinceSessionStart = sessionStartTime ? firstMicChunkTime - sessionStartTime : 'unknown';
      console.log(`[Main] 🎤 FIRST MICROPHONE CHUNK RECEIVED!`, {
        timeSinceSessionStart: sessionStartTime ? `${timeSinceSessionStart}ms` : 'unknown',
        timestamp: chunkData.timestamp,
        sampleRate: chunkData.sampleRate,
        dataLength: chunkData.data?.length,
        chunkTimestamp: new Date(chunkData.timestamp).toISOString()
      });
    }
    
    // Log every 100 chunks to track flow
    if (micChunkCount % 100 === 0) {
      const timeSinceFirst = Date.now() - (firstMicChunkTime || Date.now());
      console.log(`[Main] Microphone chunks received: ${micChunkCount} (${timeSinceFirst}ms since first)`);
    }
    
    audioCaptureService.onMicrophoneData(chunkData);
  });

  // Track system audio chunks
  let firstSystemChunkTime = null;
  let systemChunkCount = 0;
  
  ipcMain.on("audio:system-chunk", (event, chunkData) => {
    systemChunkCount++;
    
    // Track first chunk timing
    if (!firstSystemChunkTime) {
      firstSystemChunkTime = Date.now();
      const timeSinceSessionStart = sessionStartTime ? firstSystemChunkTime - sessionStartTime : 'unknown';
      console.log(`[Main] 🔊 FIRST SYSTEM AUDIO CHUNK RECEIVED!`, {
        timeSinceSessionStart: sessionStartTime ? `${timeSinceSessionStart}ms` : 'unknown',
        timestamp: chunkData.timestamp,
        sampleRate: chunkData.sampleRate,
        dataLength: chunkData.data?.length,
        chunkTimestamp: new Date(chunkData.timestamp).toISOString()
      });
    }
    
    // Log every 100 chunks to track flow
    if (systemChunkCount % 100 === 0) {
      const timeSinceFirst = Date.now() - (firstSystemChunkTime || Date.now());
      console.log(`[Main] System audio chunks received: ${systemChunkCount} (${timeSinceFirst}ms since first)`);
    }
    
    audioCaptureService.onSystemAudioData(chunkData);
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
