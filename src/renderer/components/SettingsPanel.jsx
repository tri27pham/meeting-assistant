import React, { useState, useEffect, useCallback } from 'react';
import { CloseIcon } from './Icons';

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

const ChevronIcon = ({ expanded }) => (
  <svg 
    width="12" 
    height="12" 
    viewBox="0 0 12 12" 
    fill="none"
    style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
  >
    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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

function SettingsPanel({ onClose, showAudioMeter, onToggleAudioMeter, autoSuggestEnabled, onToggleAutoSuggest }) {
  const [permissions, setPermissions] = useState({
    microphone: 'not-determined',
    screenRecording: 'not-determined',
    accessibility: false,
    allGranted: false,
  });
  
  const [expandedSections, setExpandedSections] = useState({
    permissions: false,
    shortcuts: false,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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

  const handleOpenPreferences = useCallback(async (type) => {
    if (!window.cluely?.permissions) return;
    await window.cluely.permissions.openPreferences(type);
  }, []);

  const handleRequestPermissions = useCallback(async () => {
    if (!window.cluely?.permissions) return;
    await window.cluely.permissions.request();
  }, []);

  return (
    <div className="settings-panel glass-panel">
      <div className="settings-header">
        <h2>Settings</h2>
        <button className="settings-close-btn" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title" style={{ marginBottom: '12px' }}>AI Assistant</h3>
        <div className="settings-toggle-row">
          <div className="settings-toggle-info">
            <span className="settings-toggle-label">Auto Suggestions</span>
            <span className="settings-toggle-desc">Automatically suggest talking points during conversations</span>
          </div>
          <button 
            className={`settings-toggle ${autoSuggestEnabled ? 'active' : ''}`}
            onClick={onToggleAutoSuggest}
            role="switch"
            aria-checked={autoSuggestEnabled}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title" style={{ marginBottom: '12px' }}>Display</h3>
        <div className="settings-toggle-row">
          <span className="settings-toggle-label">Show Audio Meter</span>
          <button 
            className={`settings-toggle ${showAudioMeter ? 'active' : ''}`}
            onClick={onToggleAudioMeter}
            role="switch"
            aria-checked={showAudioMeter}
          >
            <span className="settings-toggle-knob" />
          </button>
        </div>
      </div>

      <div className={`settings-section collapsible ${expandedSections.permissions ? 'expanded' : ''}`}>
        <button className="settings-section-header" onClick={() => toggleSection('permissions')}>
          <h3 className="settings-section-title">Permissions</h3>
          <ChevronIcon expanded={expandedSections.permissions} />
        </button>
        
        {expandedSections.permissions && (
          <div className="settings-section-content">
            <p className="settings-section-desc">
              These permissions are required for full functionality.
            </p>

            <div className="settings-permission-list">
              <div className={`settings-permission-row ${permissions.microphone === 'granted' ? 'granted' : ''}`}>
                <div className="settings-permission-icon">{getStatusIcon(permissions.microphone)}</div>
                <div className="settings-permission-info">
                  <span className="settings-permission-name">Microphone</span>
                  <span className="settings-permission-status">{getStatusLabel(permissions.microphone)}</span>
                </div>
                {permissions.microphone !== 'granted' && (
                  <button className="settings-permission-btn" onClick={() => handleOpenPreferences('microphone')}>
                    Open Settings
                  </button>
                )}
              </div>

              <div className={`settings-permission-row ${permissions.screenRecording === 'granted' ? 'granted' : ''}`}>
                <div className="settings-permission-icon">{getStatusIcon(permissions.screenRecording)}</div>
                <div className="settings-permission-info">
                  <span className="settings-permission-name">Screen Recording</span>
                  <span className="settings-permission-status">{getStatusLabel(permissions.screenRecording)}</span>
                </div>
                {permissions.screenRecording !== 'granted' && (
                  <button className="settings-permission-btn" onClick={() => handleOpenPreferences('screen-recording')}>
                    Open Settings
                  </button>
                )}
              </div>

              <div className={`settings-permission-row ${permissions.accessibility ? 'granted' : ''}`}>
                <div className="settings-permission-icon">{getStatusIcon(permissions.accessibility)}</div>
                <div className="settings-permission-info">
                  <span className="settings-permission-name">Accessibility</span>
                  <span className="settings-permission-status">{getStatusLabel(permissions.accessibility)}</span>
                </div>
                {!permissions.accessibility && (
                  <button className="settings-permission-btn" onClick={() => handleOpenPreferences('accessibility')}>
                    Open Settings
                  </button>
                )}
              </div>
            </div>

            {!permissions.allGranted && (
              <button className="settings-grant-all-btn" onClick={handleRequestPermissions}>
                Request All Permissions
              </button>
            )}
          </div>
        )}
      </div>

      <div className={`settings-section collapsible ${expandedSections.shortcuts ? 'expanded' : ''}`}>
        <button className="settings-section-header" onClick={() => toggleSection('shortcuts')}>
          <h3 className="settings-section-title">Keyboard Shortcuts</h3>
          <ChevronIcon expanded={expandedSections.shortcuts} />
        </button>
        
        {expandedSections.shortcuts && (
          <div className="settings-section-content">
            <div className="settings-hotkeys-list">
              <div className="settings-hotkey-row">
                <span className="settings-hotkey-label">Show/Hide Overlay</span>
                <div className="settings-hotkey-keys"><kbd>⌘</kbd><kbd>/</kbd></div>
              </div>
              <div className="settings-hotkey-row">
                <span className="settings-hotkey-label">Toggle Transcript</span>
                <div className="settings-hotkey-keys"><kbd>⌘</kbd><kbd>;</kbd></div>
              </div>
              <div className="settings-hotkey-row">
                <span className="settings-hotkey-label">Reset Layout</span>
                <div className="settings-hotkey-keys"><kbd>⌘</kbd><kbd>\</kbd></div>
              </div>
              <div className="settings-hotkey-row">
                <span className="settings-hotkey-label">Ask AI</span>
                <div className="settings-hotkey-keys"><kbd>⌘</kbd><kbd>↵</kbd></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsPanel;
