const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cluely', {
  permissions: {
    getState: () => ipcRenderer.invoke('permissions:get-state'),
    request: () => ipcRenderer.invoke('permissions:request'),
    openPreferences: (type) => ipcRenderer.invoke('permissions:open-preferences', type),
    isReady: () => ipcRenderer.invoke('permissions:is-ready'),
  },

  audio: {
    sendAudioChunk: (chunk) => ipcRenderer.send('audio:chunk', chunk),
    sendRawBlob: (data) => ipcRenderer.send('audio:raw-blob', data),
    sendAudioBlob: (blob) => ipcRenderer.send('audio:blob', blob),
    startMicCapture: () => ipcRenderer.invoke('audio:start-mic'),
    stopMicCapture: () => ipcRenderer.invoke('audio:stop-mic'),
    startSystemCapture: () => ipcRenderer.invoke('audio:start-system'),
    stopSystemCapture: () => ipcRenderer.invoke('audio:stop-system'),
    startAllCapture: () => ipcRenderer.invoke('audio:start-all'),
    stopAllCapture: () => ipcRenderer.invoke('audio:stop-all'),
    getState: () => ipcRenderer.invoke('audio:get-state'),
  },

  stt: {
    setApiKey: (apiKey) => ipcRenderer.invoke('stt:set-api-key', apiKey),
    setEnabled: (enabled) => ipcRenderer.invoke('stt:set-enabled', enabled),
    getState: () => ipcRenderer.invoke('stt:get-state'),
    getTranscriptions: () => ipcRenderer.invoke('stt:get-transcriptions'),
    getTranscript: () => ipcRenderer.invoke('stt:get-transcript'),
    clear: () => ipcRenderer.invoke('stt:clear'),
  },

  session: {
    start: () => ipcRenderer.invoke('session:start'),
    stop: () => ipcRenderer.invoke('session:stop'),
    togglePause: () => ipcRenderer.invoke('session:toggle-pause'),
  },

  ai: {
    triggerAction: (actionType, metadata) => ipcRenderer.invoke('ai:trigger-action', actionType, metadata),
  },

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    close: () => ipcRenderer.send('window:close'),
    mouseEnterPanel: () => ipcRenderer.send('mouse:enter-panel'),
    mouseLeavePanel: () => ipcRenderer.send('mouse:leave-panel'),
  },

  on: {
    transcriptUpdate: (callback) => {
      ipcRenderer.on('transcript:update', (event, segment) => callback(segment));
      return () => ipcRenderer.removeAllListeners('transcript:update');
    },
    sttTranscription: (callback) => {
      ipcRenderer.on('stt:transcription', (event, result) => callback(result));
      return () => ipcRenderer.removeAllListeners('stt:transcription');
    },
    sttInterim: (callback) => {
      ipcRenderer.on('stt:interim', (event, result) => callback(result));
      return () => ipcRenderer.removeAllListeners('stt:interim');
    },
    sttConnected: (callback) => {
      ipcRenderer.on('stt:connected', () => callback());
      return () => ipcRenderer.removeAllListeners('stt:connected');
    },
    sttDisconnected: (callback) => {
      ipcRenderer.on('stt:disconnected', (event, info) => callback(info));
      return () => ipcRenderer.removeAllListeners('stt:disconnected');
    },
    sttError: (callback) => {
      ipcRenderer.on('stt:error', (event, error) => callback(error));
      return () => ipcRenderer.removeAllListeners('stt:error');
    },
    suggestion: (callback) => {
      ipcRenderer.on('ai:suggestion', (event, suggestion) => callback(suggestion));
      return () => ipcRenderer.removeAllListeners('ai:suggestion');
    },
    statusUpdate: (callback) => {
      ipcRenderer.on('status:update', (event, status) => callback(status));
      return () => ipcRenderer.removeAllListeners('status:update');
    },
    insightsUpdate: (callback) => {
      ipcRenderer.on('insights:update', (event, insights) => callback(insights));
      return () => ipcRenderer.removeAllListeners('insights:update');
    },
    triggerAISuggestion: (callback) => {
      ipcRenderer.on('trigger-ai-suggestion', () => callback());
      return () => ipcRenderer.removeAllListeners('trigger-ai-suggestion');
    },
    resetLayout: (callback) => {
      ipcRenderer.on('reset-layout', () => callback());
      return () => ipcRenderer.removeAllListeners('reset-layout');
    },
    toggleTranscript: (callback) => {
      ipcRenderer.on('toggle-transcript', () => callback());
      return () => ipcRenderer.removeAllListeners('toggle-transcript');
    },
    startMicCapture: (callback) => {
      ipcRenderer.on('audio:start-mic', () => callback());
      return () => ipcRenderer.removeAllListeners('audio:start-mic');
    },
    stopMicCapture: (callback) => {
      ipcRenderer.on('audio:stop-mic', () => callback());
      return () => ipcRenderer.removeAllListeners('audio:stop-mic');
    },
    startSystemCapture: (callback) => {
      ipcRenderer.on('audio:start-system', () => callback());
      return () => ipcRenderer.removeAllListeners('audio:start-system');
    },
    stopSystemCapture: (callback) => {
      ipcRenderer.on('audio:stop-system', () => callback());
      return () => ipcRenderer.removeAllListeners('audio:stop-system');
    },
    audioLevel: (callback) => {
      ipcRenderer.on('audio:level', (event, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('audio:level');
    },
  },
});
