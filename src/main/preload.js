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
  // AUDIO CAPTURE API
  // For capturing microphone and system audio
  // ============================================
  audio: {
    /**
     * Send captured audio chunk to main process
     * Called by useAudioCapture hook when it captures audio
     * @param {Object} chunk - { source: 'mic'|'system', data: number[], sampleRate, timestamp }
     */
    sendAudioChunk: (chunk) => ipcRenderer.send('audio:chunk', chunk),

    /**
     * Request to start/stop capture from main process
     * Main process can coordinate capture across the app
     */
    startMicCapture: () => ipcRenderer.invoke('audio:start-mic'),
    stopMicCapture: () => ipcRenderer.invoke('audio:stop-mic'),
    startSystemCapture: () => ipcRenderer.invoke('audio:start-system'),
    stopSystemCapture: () => ipcRenderer.invoke('audio:stop-system'),
    startAllCapture: () => ipcRenderer.invoke('audio:start-all'),
    stopAllCapture: () => ipcRenderer.invoke('audio:stop-all'),

    /**
     * Get current audio capture state
     * Returns: { isMicCapturing, isSystemCapturing, micLevel, systemLevel }
     */
    getState: () => ipcRenderer.invoke('audio:get-state'),
  },

  // ============================================
  // SPEECH-TO-TEXT (STT)
  // ============================================
  stt: {
    /**
     * Set STT mode ('local' or 'api')
     */
    setMode: (mode) => ipcRenderer.invoke('stt:set-mode', mode),

    /**
     * Set OpenAI API key for Whisper (API mode)
     */
    setApiKey: (apiKey) => ipcRenderer.invoke('stt:set-api-key', apiKey),

    /**
     * Set local model to use
     * Options: 'Xenova/whisper-tiny.en', 'Xenova/whisper-base.en', 'Xenova/whisper-small.en'
     */
    setLocalModel: (model) => ipcRenderer.invoke('stt:set-local-model', model),

    /**
     * Enable/disable STT transcription
     */
    setEnabled: (enabled) => ipcRenderer.invoke('stt:set-enabled', enabled),

    /**
     * Get current STT state
     */
    getState: () => ipcRenderer.invoke('stt:get-state'),

    /**
     * Get all transcriptions
     */
    getTranscriptions: () => ipcRenderer.invoke('stt:get-transcriptions'),

    /**
     * Get full transcript as string
     */
    getTranscript: () => ipcRenderer.invoke('stt:get-transcript'),

    /**
     * Clear all transcriptions
     */
    clear: () => ipcRenderer.invoke('stt:clear'),

    /**
     * Flush buffer (transcribe now)
     */
    flush: () => ipcRenderer.invoke('stt:flush'),
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
    // Receive transcript updates from backend (legacy)
    transcriptUpdate: (callback) => {
      ipcRenderer.on('transcript:update', (event, segment) => callback(segment));
      return () => ipcRenderer.removeAllListeners('transcript:update');
    },

    // Receive STT transcription results
    sttTranscription: (callback) => {
      ipcRenderer.on('stt:transcription', (event, result) => callback(result));
      return () => ipcRenderer.removeAllListeners('stt:transcription');
    },

    // Receive STT errors
    sttError: (callback) => {
      ipcRenderer.on('stt:error', (event, error) => callback(error));
      return () => ipcRenderer.removeAllListeners('stt:error');
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

    // ============================================
    // AUDIO CAPTURE EVENTS
    // Main process can command renderer to start/stop capture
    // ============================================
    
    // Start microphone capture
    startMicCapture: (callback) => {
      ipcRenderer.on('audio:start-mic', () => callback());
      return () => ipcRenderer.removeAllListeners('audio:start-mic');
    },

    // Stop microphone capture
    stopMicCapture: (callback) => {
      ipcRenderer.on('audio:stop-mic', () => callback());
      return () => ipcRenderer.removeAllListeners('audio:stop-mic');
    },

    // Start system audio capture
    startSystemCapture: (callback) => {
      ipcRenderer.on('audio:start-system', () => callback());
      return () => ipcRenderer.removeAllListeners('audio:start-system');
    },

    // Stop system audio capture
    stopSystemCapture: (callback) => {
      ipcRenderer.on('audio:stop-system', () => callback());
      return () => ipcRenderer.removeAllListeners('audio:stop-system');
    },

    // Receive audio level updates for visualization
    audioLevel: (callback) => {
      ipcRenderer.on('audio:level', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('audio:level');
    },
  },
});
