const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script - Exposes a safe API to the renderer process
 * 
 * SECURITY MODEL:
 * - contextBridge.exposeInMainWorld creates a safe bridge between
 *   the renderer (UI) and main (backend) processes
 * - The UI can only call the methods we explicitly expose here
 * - This prevents the UI from accessing Node.js APIs directly
 * 
 * ARCHITECTURE:
 * - Following cursor.md: UI must not know how audio/STT/LLM works
 * - All heavy logic stays in the main process
 * - UI just sends commands and receives data
 */
contextBridge.exposeInMainWorld('cluely', {
  // ============================================
  // PERMISSIONS API
  // Allows UI to check and request macOS permissions
  // ============================================
  permissions: {
    /**
     * Get current permission state
     * Returns: { microphone, screenRecording, accessibility, allGranted }
     * 
     * Status values for microphone/screenRecording:
     * - 'granted': Permission allowed
     * - 'denied': User explicitly denied
     * - 'not-determined': User hasn't been asked yet
     * - 'restricted': System policy prevents access
     * 
     * accessibility is just true/false
     */
    getState: () => ipcRenderer.invoke('permissions:get-state'),

    /**
     * Request all requestable permissions
     * Shows system dialogs for microphone and accessibility
     * Screen recording cannot be requested programmatically
     */
    request: () => ipcRenderer.invoke('permissions:request'),

    /**
     * Open System Preferences to a specific section
     * Use when user needs to manually grant permissions
     * @param {'microphone' | 'screen-recording' | 'accessibility'} type
     */
    openPreferences: (type) => ipcRenderer.invoke('permissions:open-preferences', type),

    /**
     * Quick check if all permissions are granted
     * Returns: { ready: boolean, missing: string[] }
     */
    isReady: () => ipcRenderer.invoke('permissions:is-ready'),
  },

  // ============================================
  // SESSION CONTROL
  // ============================================
  session: {
    start: () => ipcRenderer.invoke('session:start'),
    stop: () => ipcRenderer.invoke('session:stop'),
    togglePause: () => ipcRenderer.invoke('session:toggle-pause'),
  },

  // AI actions (triggered from UI)
  ai: {
    triggerAction: (actionType, metadata) => 
      ipcRenderer.invoke('ai:trigger-action', actionType, metadata),
  },

  // Window control
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    close: () => ipcRenderer.send('window:close'),
    // Mouse enter/leave for click-through functionality
    mouseEnterPanel: () => ipcRenderer.send('mouse:enter-panel'),
    mouseLeavePanel: () => ipcRenderer.send('mouse:leave-panel'),
  },

  // Event listeners for backend → UI communication
  on: {
    // Receive transcript updates from backend
    transcriptUpdate: (callback) => {
      ipcRenderer.on('transcript:update', (event, segment) => callback(segment));
      return () => ipcRenderer.removeAllListeners('transcript:update');
    },

    // Receive AI suggestions from backend
    suggestion: (callback) => {
      ipcRenderer.on('ai:suggestion', (event, suggestion) => callback(suggestion));
      return () => ipcRenderer.removeAllListeners('ai:suggestion');
    },

    // Receive status/mode updates
    statusUpdate: (callback) => {
      ipcRenderer.on('status:update', (event, status) => callback(status));
      return () => ipcRenderer.removeAllListeners('status:update');
    },

    // Receive live insights from backend
    insightsUpdate: (callback) => {
      ipcRenderer.on('insights:update', (event, insights) => callback(insights));
      return () => ipcRenderer.removeAllListeners('insights:update');
    },

    // Manual trigger from hotkey
    triggerAISuggestion: (callback) => {
      ipcRenderer.on('trigger-ai-suggestion', () => callback());
      return () => ipcRenderer.removeAllListeners('trigger-ai-suggestion');
    },

    // Reset layout trigger from hotkey
    resetLayout: (callback) => {
      ipcRenderer.on('reset-layout', () => callback());
      return () => ipcRenderer.removeAllListeners('reset-layout');
    },
  },
});
