import React, { useState, useEffect, useCallback } from 'react';
import { CloseIcon } from './Icons';

/**
 * SettingsPanel Component
 * 
 * A settings panel that shows:
 * - Permission status
 * - (Future: other settings like audio source, AI model, etc.)
 */

// Status icons
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="7" fill="rgba(52, 199, 89, 0.2)" stroke="#34C759" strokeWidth="1.5"/>
    <path d="M5 8L7 10L11 6" stroke="#34C759" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const WarningIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="7" fill="rgba(255, 159, 10, 0.2)" stroke="#FF9F0A" strokeWidth="1.5"/>
    <path d="M8 5V8.5" stroke="#FF9F0A" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="8" cy="11" r="0.75" fill="#FF9F0A"/>
  </svg>
);

const DeniedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="7" fill="rgba(255, 69, 58, 0.2)" stroke="#FF453A" strokeWidth="1.5"/>
    <path d="M6 6L10 10M10 6L6 10" stroke="#FF453A" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

function getStatusIcon(status) {
  if (status === 'granted' || status === true) return <CheckIcon />;
  if (status === 'denied' || status === false) return <DeniedIcon />;
  return <WarningIcon />;
}

function getStatusLabel(status) {
  if (status === 'granted' || status === true) return 'Granted';
  if (status === 'denied' || status === false) return 'Denied';
  if (status === 'not-determined') return 'Not Set';
  if (status === 'restricted') return 'Restricted';
  return 'Unknown';
}

function SettingsPanel({ onClose }) {
  const [permissions, setPermissions] = useState({
    microphone: 'not-determined',
    screenRecording: 'not-determined',
    accessibility: false,
    allGranted: false,
  });
  
  // API key state
  const [apiKey, setApiKey] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState('not-set'); // 'not-set', 'saving', 'saved'
  const [sttState, setSTTState] = useState({ isReady: false });

  // Fetch permissions on mount and poll for changes
  useEffect(() => {
    const fetchPermissions = async () => {
      if (!window.cluely?.permissions) return;
      try {
        const state = await window.cluely.permissions.getState();
        setPermissions(state);
      } catch (err) {
        console.error('[Settings] Failed to fetch permissions:', err);
      }
    };

    fetchPermissions();
    const interval = setInterval(fetchPermissions, 2000);
    return () => clearInterval(interval);
  }, []);

  // Check STT state and poll while loading model
  useEffect(() => {
    const checkSTT = async () => {
      if (!window.cluely?.stt) return;
      try {
        const state = await window.cluely.stt.getState();
        setSTTState(state);
        if (state.hasApiKey) {
          setApiKeyStatus('saved');
        }
      } catch (err) {
        console.error('[Settings] Failed to check STT state:', err);
      }
    };
    
    checkSTT();
    
    // Poll while model is loading
    const interval = setInterval(checkSTT, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenPreferences = useCallback(async (type) => {
    if (!window.cluely?.permissions) return;
    await window.cluely.permissions.openPreferences(type);
  }, []);

  const handleRequestPermissions = useCallback(async () => {
    if (!window.cluely?.permissions) return;
    await window.cluely.permissions.request();
  }, []);

  const handleSaveApiKey = useCallback(async () => {
    if (!window.cluely?.stt || !apiKey.trim()) return;
    
    setApiKeyStatus('saving');
    try {
      await window.cluely.stt.setApiKey(apiKey.trim());
      setApiKeyStatus('saved');
      setApiKey(''); // Clear input after saving
      // Refresh state
      const state = await window.cluely.stt.getState();
      setSTTState(state);
    } catch (err) {
      console.error('[Settings] Failed to save API key:', err);
      setApiKeyStatus('not-set');
    }
  }, [apiKey]);

  const handleSetMode = useCallback(async (mode) => {
    if (!window.cluely?.stt) return;
    
    try {
      await window.cluely.stt.setMode(mode);
      // Refresh state
      const state = await window.cluely.stt.getState();
      setSTTState(state);
    } catch (err) {
      console.error('[Settings] Failed to set mode:', err);
    }
  }, []);

  return (
    <div className="settings-panel glass-panel">
      <div className="settings-header">
        <h2>Settings</h2>
        <button className="settings-close-btn" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      {/* Permissions Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">Permissions</h3>
        <p className="settings-section-desc">
          These permissions are required for full functionality.
        </p>

        <div className="settings-permission-list">
          {/* Microphone */}
          <div className={`settings-permission-row ${permissions.microphone === 'granted' ? 'granted' : ''}`}>
            <div className="settings-permission-icon">
              {getStatusIcon(permissions.microphone)}
            </div>
            <div className="settings-permission-info">
              <span className="settings-permission-name">Microphone</span>
              <span className="settings-permission-status">
                {getStatusLabel(permissions.microphone)}
              </span>
            </div>
            {permissions.microphone !== 'granted' && (
              <button 
                className="settings-permission-btn"
                onClick={() => handleOpenPreferences('microphone')}
              >
                Open Settings
              </button>
            )}
          </div>

          {/* Screen Recording */}
          <div className={`settings-permission-row ${permissions.screenRecording === 'granted' ? 'granted' : ''}`}>
            <div className="settings-permission-icon">
              {getStatusIcon(permissions.screenRecording)}
            </div>
            <div className="settings-permission-info">
              <span className="settings-permission-name">Screen Recording</span>
              <span className="settings-permission-status">
                {getStatusLabel(permissions.screenRecording)}
              </span>
            </div>
            {permissions.screenRecording !== 'granted' && (
              <button 
                className="settings-permission-btn"
                onClick={() => handleOpenPreferences('screen-recording')}
              >
                Open Settings
              </button>
            )}
          </div>

          {/* Accessibility */}
          <div className={`settings-permission-row ${permissions.accessibility ? 'granted' : ''}`}>
            <div className="settings-permission-icon">
              {getStatusIcon(permissions.accessibility)}
            </div>
            <div className="settings-permission-info">
              <span className="settings-permission-name">Accessibility</span>
              <span className="settings-permission-status">
                {getStatusLabel(permissions.accessibility)}
              </span>
            </div>
            {!permissions.accessibility && (
              <button 
                className="settings-permission-btn"
                onClick={() => handleOpenPreferences('accessibility')}
              >
                Open Settings
              </button>
            )}
          </div>
        </div>

        {!permissions.allGranted && (
          <button 
            className="settings-grant-all-btn"
            onClick={handleRequestPermissions}
          >
            Request All Permissions
          </button>
        )}
      </div>

      {/* Speech-to-Text Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">Speech-to-Text</h3>
        <p className="settings-section-desc">
          Choose how to transcribe your speech.
        </p>

        {/* Mode Toggle */}
        <div className="settings-mode-toggle">
          <button
            className={`settings-mode-btn ${sttState.mode === 'local' ? 'active' : ''}`}
            onClick={() => handleSetMode('local')}
          >
            🖥️ Local (Free)
          </button>
          <button
            className={`settings-mode-btn ${sttState.mode === 'api' ? 'active' : ''}`}
            onClick={() => handleSetMode('api')}
          >
            ☁️ OpenAI API
          </button>
        </div>

        {/* Local Mode Info */}
        {sttState.mode === 'local' && (
          <div className="settings-mode-info">
            {sttState.isLoadingModel ? (
              <div className="settings-loading">
                <span className="settings-spinner" />
                <span>Loading Whisper model...</span>
              </div>
            ) : sttState.isModelLoaded ? (
              <div className="settings-api-key-status">
                <CheckIcon />
                <span>Model loaded & ready</span>
              </div>
            ) : (
              <p className="settings-section-hint">
                Model will load when you start recording. First load may take a moment.
              </p>
            )}
          </div>
        )}

        {/* API Mode - API Key Input */}
        {sttState.mode === 'api' && (
          <div className="settings-api-key">
            {sttState.hasApiKey || apiKeyStatus === 'saved' ? (
              <div className="settings-api-key-status">
                <CheckIcon />
                <span>API key configured</span>
              </div>
            ) : (
              <>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="settings-api-key-input"
                />
                <button
                  className="settings-api-key-btn"
                  onClick={handleSaveApiKey}
                  disabled={!apiKey.trim() || apiKeyStatus === 'saving'}
                >
                  {apiKeyStatus === 'saving' ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
            <p className="settings-section-hint">
              Get your API key from{' '}
              <a 
                href="#" 
                onClick={(e) => {
                  e.preventDefault();
                  window.open('https://platform.openai.com/api-keys', '_blank');
                }}
              >
                platform.openai.com
              </a>
            </p>
          </div>
        )}
      </div>

    </div>
  );
}

export default SettingsPanel;
