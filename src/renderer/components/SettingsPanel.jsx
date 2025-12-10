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

    </div>
  );
}

export default SettingsPanel;
