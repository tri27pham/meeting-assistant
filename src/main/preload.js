const { contextBridge, ipcRenderer } = require("electron");

/**
 * Preload script - Exposes a safe API to the renderer process
 * Following architecture: UI must not know how audio/STT/LLM works
 */
contextBridge.exposeInMainWorld("cluely", {
  // Session control
  session: {
    start: () => ipcRenderer.invoke("session:start"),
    stop: () => ipcRenderer.invoke("session:stop"),
    togglePause: () => ipcRenderer.invoke("session:toggle-pause"),
  },

  // AI actions (triggered from UI)
  ai: {
    triggerAction: (actionType, metadata) =>
      ipcRenderer.invoke("ai:trigger-action", actionType, metadata),
  },

  // Window control
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    close: () => ipcRenderer.send("window:close"),
    // Mouse enter/leave for click-through functionality
    mouseEnterPanel: () => ipcRenderer.send("mouse:enter-panel"),
    mouseLeavePanel: () => ipcRenderer.send("mouse:leave-panel"),
  },

  // Audio capture (from renderer to main)
  audio: {
    sendMicrophoneChunk: (audioData) => {
      ipcRenderer.send("audio:microphone-chunk", audioData);
    },
  },

  // Event listeners for backend → UI communication
  on: {
    // Receive transcript updates from backend
    transcriptUpdate: (callback) => {
      ipcRenderer.on("transcript:update", (event, segment) =>
        callback(segment),
      );
      return () => ipcRenderer.removeAllListeners("transcript:update");
    },

    // Receive AI suggestions from backend
    suggestion: (callback) => {
      ipcRenderer.on("ai:suggestion", (event, suggestion) =>
        callback(suggestion),
      );
      return () => ipcRenderer.removeAllListeners("ai:suggestion");
    },

    // Receive status/mode updates
    statusUpdate: (callback) => {
      ipcRenderer.on("status:update", (event, status) => callback(status));
      return () => ipcRenderer.removeAllListeners("status:update");
    },

    // Receive live insights from backend
    insightsUpdate: (callback) => {
      ipcRenderer.on("insights:update", (event, insights) =>
        callback(insights),
      );
      return () => ipcRenderer.removeAllListeners("insights:update");
    },

    // Manual trigger from hotkey
    triggerAISuggestion: (callback) => {
      ipcRenderer.on("trigger-ai-suggestion", () => callback());
      return () => ipcRenderer.removeAllListeners("trigger-ai-suggestion");
    },

    // Reset layout trigger from hotkey
    resetLayout: (callback) => {
      ipcRenderer.on("reset-layout", () => callback());
      return () => ipcRenderer.removeAllListeners("reset-layout");
    },

    // Toggle transcript trigger from hotkey
    toggleTranscript: (callback) => {
      ipcRenderer.on("toggle-transcript", () => callback());
      return () => ipcRenderer.removeAllListeners("toggle-transcript");
    },

    // Audio capture status updates (optional, for UI status display)
    audioStatusUpdate: (callback) => {
      ipcRenderer.on("audio:status-update", (event, status) => callback(status));
      return () => ipcRenderer.removeAllListeners("audio:status-update");
    },
  },
});
