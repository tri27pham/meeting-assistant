import React, { useState, useEffect, useCallback } from 'react';

/**
 * PermissionSetup Component
 * 
 * PURPOSE:
 * Displays the current permission state and guides users through
 * granting necessary permissions for the app to function.
 * 
 * PERMISSIONS NEEDED:
 * 1. Microphone - To capture user's voice
 * 2. Screen Recording - To capture system audio (others in meetings)
 * 3. Accessibility - For global hotkeys
 * 
 * UX FLOW:
 * - Shows a checklist of permissions
 * - Green checkmark for granted permissions
 * - Action button for missing permissions
 * - "Continue" button enabled only when all permissions granted
 */

// Status icons as simple SVG components
const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="9" fill="rgba(52, 199, 89, 0.2)" stroke="#34C759" strokeWidth="1.5"/>
    <path d="M6 10L9 13L14 7" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const WarningIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="9" fill="rgba(255, 159, 10, 0.2)" stroke="#FF9F0A" strokeWidth="1.5"/>
    <path d="M10 6V11" stroke="#FF9F0A" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="10" cy="14" r="1" fill="#FF9F0A"/>
  </svg>
);

const DeniedIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="9" fill="rgba(255, 69, 58, 0.2)" stroke="#FF453A" strokeWidth="1.5"/>
    <path d="M7 7L13 13M13 7L7 13" stroke="#FF453A" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/**
 * Get the appropriate icon based on permission status
 */
function getStatusIcon(status) {
  if (status === 'granted' || status === true) {
    return <CheckIcon />;
  }
  if (status === 'denied' || status === false) {
    return <DeniedIcon />;
  }
  // 'not-determined', 'restricted', or unknown
  return <WarningIcon />;
}

/**
 * Get human-readable status text
 */
function getStatusText(status) {
  switch (status) {
    case 'granted':
    case true:
      return 'Granted';
    case 'denied':
    case false:
      return 'Denied';
    case 'not-determined':
      return 'Not Set';
    case 'restricted':
      return 'Restricted';
    default:
      return 'Unknown';
  }
}

/**
 * Individual permission row component
 */
function PermissionRow({ 
  title, 
  description, 
  status, 
  onAction, 
  actionLabel,
  canRequest = true,
}) {
  const isGranted = status === 'granted' || status === true;
  const isDenied = status === 'denied' || status === false;
  
  return (
    <div className={`permission-row ${isGranted ? 'granted' : ''}`}>
      <div className="permission-icon">
        {getStatusIcon(status)}
      </div>
      <div className="permission-info">
        <div className="permission-title">{title}</div>
        <div className="permission-description">{description}</div>
        {isDenied && !canRequest && (
          <div className="permission-hint">
            Previously denied. Please enable in System Preferences.
          </div>
        )}
      </div>
      <div className="permission-action">
        {!isGranted && (
          <button 
            className="permission-btn"
            onClick={onAction}
          >
            {actionLabel}
            <ArrowIcon />
          </button>
        )}
        {isGranted && (
          <span className="permission-status-text">
            {getStatusText(status)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Main PermissionSetup component
 */
function PermissionSetup({ onComplete, onSkip }) {
  // Permission state from backend
  const [permissions, setPermissions] = useState({
    microphone: 'not-determined',
    screenRecording: 'not-determined',
    accessibility: false,
    allGranted: false,
  });
  
  // Loading state while checking/requesting
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);

  /**
   * Handle mouse enter/leave for click-through functionality
   * This tells Electron to enable mouse events when hovering over the panel
   */
  const handleMouseEnter = useCallback(() => {
    if (window.cluely?.window?.mouseEnterPanel) {
      window.cluely.window.mouseEnterPanel();
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (window.cluely?.window?.mouseLeavePanel) {
      window.cluely.window.mouseLeavePanel();
    }
  }, []);

  // Enable mouse events when component mounts (permission setup should always be interactive)
  useEffect(() => {
    handleMouseEnter();
    return () => handleMouseLeave();
  }, [handleMouseEnter, handleMouseLeave]);

  /**
   * Fetch current permission state from backend
   */
  const refreshPermissions = useCallback(async () => {
    if (!window.cluely?.permissions) {
      console.warn('[PermissionSetup] Permissions API not available');
      setIsLoading(false);
      return;
    }

    try {
      const state = await window.cluely.permissions.getState();
      console.log('[PermissionSetup] Permission state:', state);
      setPermissions(state);
    } catch (error) {
      console.error('[PermissionSetup] Failed to get permissions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check permissions on mount and set up polling
  useEffect(() => {
    refreshPermissions();

    // Poll for permission changes every 2 seconds
    // This catches when user grants permission in System Preferences
    const interval = setInterval(refreshPermissions, 2000);

    return () => clearInterval(interval);
  }, [refreshPermissions]);

  /**
   * Request microphone permission
   * This shows the macOS permission dialog
   */
  const handleRequestMicrophone = async () => {
    if (!window.cluely?.permissions) return;

    setIsRequesting(true);
    try {
      // If already denied, open System Preferences instead
      if (permissions.microphone === 'denied') {
        await window.cluely.permissions.openPreferences('microphone');
      } else {
        await window.cluely.permissions.request();
      }
      await refreshPermissions();
    } finally {
      setIsRequesting(false);
    }
  };

  /**
   * Handle screen recording permission
   * Cannot request programmatically - must open System Preferences
   */
  const handleRequestScreenRecording = async () => {
    if (!window.cluely?.permissions) return;
    
    await window.cluely.permissions.openPreferences('screen-recording');
  };

  /**
   * Request accessibility permission
   * This shows the macOS permission dialog
   */
  const handleRequestAccessibility = async () => {
    if (!window.cluely?.permissions) return;

    setIsRequesting(true);
    try {
      // If already denied, open System Preferences instead
      if (permissions.accessibility === false) {
        await window.cluely.permissions.openPreferences('accessibility');
      } else {
        await window.cluely.permissions.request();
      }
      await refreshPermissions();
    } finally {
      setIsRequesting(false);
    }
  };

  /**
   * Request all permissions at once
   */
  const handleRequestAll = async () => {
    if (!window.cluely?.permissions) return;

    setIsRequesting(true);
    try {
      await window.cluely.permissions.request();
      await refreshPermissions();
      
      // If screen recording is still not granted, open its preferences
      if (permissions.screenRecording !== 'granted') {
        await window.cluely.permissions.openPreferences('screen-recording');
      }
    } finally {
      setIsRequesting(false);
    }
  };

  /**
   * Continue to main app (only when all permissions granted)
   */
  const handleContinue = () => {
    if (permissions.allGranted && onComplete) {
      onComplete();
    }
  };

  // Count granted permissions for progress indicator
  const grantedCount = [
    permissions.microphone === 'granted',
    permissions.screenRecording === 'granted',
    permissions.accessibility === true,
  ].filter(Boolean).length;

  return (
    <div 
      className="permission-setup glass-panel"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="permission-header">
        <h2>Setup Required</h2>
        <p>
          Cluely needs a few permissions to work properly. 
          These enable audio capture and global hotkeys.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="permission-progress">
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${(grantedCount / 3) * 100}%` }}
          />
        </div>
        <span className="progress-text">{grantedCount} of 3 permissions</span>
      </div>

      {/* Permission list */}
      <div className="permission-list">
        <PermissionRow
          title="Microphone"
          description="Capture your voice during meetings"
          status={permissions.microphone}
          onAction={handleRequestMicrophone}
          actionLabel={permissions.microphone === 'denied' ? 'Open Settings' : 'Grant'}
          canRequest={permissions.microphone !== 'denied'}
        />

        <PermissionRow
          title="Screen Recording"
          description="Capture system audio (what others say)"
          status={permissions.screenRecording}
          onAction={handleRequestScreenRecording}
          actionLabel="Open Settings"
          canRequest={false} // Cannot request programmatically
        />

        <PermissionRow
          title="Accessibility"
          description="Enable global keyboard shortcuts"
          status={permissions.accessibility}
          onAction={handleRequestAccessibility}
          actionLabel={permissions.accessibility === false ? 'Open Settings' : 'Grant'}
          canRequest={permissions.accessibility !== false}
        />
      </div>

      {/* Help text for screen recording */}
      {permissions.screenRecording !== 'granted' && (
        <div className="permission-help">
          <strong>Screen Recording Note:</strong> macOS requires you to manually 
          enable this in System Preferences. Click "Open Settings" above, then 
          check the box next to "Cluely" in the list.
        </div>
      )}

      {/* Action buttons */}
      <div className="permission-actions">
        {!permissions.allGranted && (
          <button 
            className="btn-secondary"
            onClick={handleRequestAll}
            disabled={isRequesting}
          >
            {isRequesting ? 'Requesting...' : 'Grant All Permissions'}
          </button>
        )}

        <button 
          className={`btn-primary ${permissions.allGranted ? '' : 'disabled'}`}
          onClick={handleContinue}
          disabled={!permissions.allGranted}
        >
          {permissions.allGranted ? 'Continue to App' : 'Waiting for Permissions...'}
        </button>

        {onSkip && (
          <button 
            className="btn-link"
            onClick={onSkip}
          >
            Skip for now (limited functionality)
          </button>
        )}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="permission-loading">
          Checking permissions...
        </div>
      )}
    </div>
  );
}

export default PermissionSetup;
