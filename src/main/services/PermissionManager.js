/**
 * PermissionManager.js
 * 
 * PURPOSE:
 * This service handles all macOS permission checks and requests for the app.
 * Before we can capture audio or use global hotkeys, macOS requires explicit
 * user permission. This manager centralizes all permission logic.
 * 
 * PERMISSIONS WE NEED:
 * 
 * 1. MICROPHONE
 *    - Why: To capture the user's voice during meetings
 *    - How: Electron can check AND request this permission programmatically
 *    - Status values: 'granted', 'denied', 'restricted', 'not-determined'
 * 
 * 2. SCREEN RECORDING
 *    - Why: Required for capturing system audio (what others say in video calls)
 *           Also needed if we want to do OCR on screen content later
 *    - How: Electron can only CHECK this permission, not request it
 *           User must manually enable in System Preferences > Privacy > Screen Recording
 *    - Status values: 'granted', 'denied', 'restricted', 'not-determined'
 * 
 * 3. ACCESSIBILITY
 *    - Why: Required for global hotkeys to work when app isn't focused
 *    - How: We can prompt the user with a system dialog
 *    - Returns: true/false (simpler than other permissions)
 * 
 * ARCHITECTURE NOTES:
 * - This is a backend service (runs in Electron's main process)
 * - The UI will call these methods via IPC (Inter-Process Communication)
 * - We follow the cursor.md rule: backend owns system integrations
 */

const { systemPreferences, shell } = require('electron');

/**
 * Permission status type for consistency
 * @typedef {'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'} PermissionStatus
 */

/**
 * Full permission state object sent to the UI
 * @typedef {Object} PermissionState
 * @property {PermissionStatus} microphone - Microphone access status
 * @property {PermissionStatus} screenRecording - Screen recording access status  
 * @property {boolean} accessibility - Accessibility access status
 * @property {boolean} allGranted - True if ALL required permissions are granted
 */

class PermissionManager {
  constructor() {
    // Cache the last known state to avoid excessive system calls
    this._cachedState = null;
    this._cacheTimestamp = 0;
    this._cacheDuration = 1000; // Cache for 1 second
  }

  /**
   * Check microphone permission status
   * 
   * On macOS, this returns one of:
   * - 'not-determined': User hasn't been asked yet
   * - 'granted': User allowed access
   * - 'denied': User explicitly denied access
   * - 'restricted': System policy prevents access (e.g., parental controls)
   * 
   * @returns {PermissionStatus}
   */
  getMicrophoneStatus() {
    // systemPreferences.getMediaAccessStatus() is macOS 10.14+ only
    // It checks the permission without prompting the user
    if (process.platform === 'darwin') {
      return systemPreferences.getMediaAccessStatus('microphone');
    }
    // On non-macOS platforms, assume granted (they handle permissions differently)
    return 'granted';
  }

  /**
   * Request microphone permission from the user
   * 
   * This will show the macOS permission dialog if status is 'not-determined'.
   * If already denied, this won't show a dialog - user must go to System Preferences.
   * 
   * @returns {Promise<boolean>} - true if permission was granted
   */
  async requestMicrophoneAccess() {
    if (process.platform === 'darwin') {
      // askForMediaAccess shows the system permission dialog
      // Returns true if granted, false if denied
      const granted = await systemPreferences.askForMediaAccess('microphone');
      console.log('[PermissionManager] Microphone access request result:', granted);
      return granted;
    }
    return true;
  }

  /**
   * Check screen recording permission status
   * 
   * IMPORTANT: Unlike microphone, we CANNOT programmatically request this permission.
   * We can only check if it's granted. If not granted, we must guide the user
   * to System Preferences > Security & Privacy > Privacy > Screen Recording.
   * 
   * Screen recording permission is required for:
   * - Capturing system/desktop audio (what others say in meetings)
   * - Taking screenshots for OCR (if we implement that feature)
   * 
   * @returns {PermissionStatus}
   */
  getScreenRecordingStatus() {
    if (process.platform === 'darwin') {
      return systemPreferences.getMediaAccessStatus('screen');
    }
    return 'granted';
  }

  /**
   * Check accessibility permission status
   * 
   * Accessibility permission is needed for:
   * - Global keyboard shortcuts that work even when app isn't focused
   * - Potentially for reading text from other applications
   * 
   * @param {boolean} prompt - If true, shows system dialog to request permission
   * @returns {boolean} - true if accessibility access is granted
   */
  getAccessibilityStatus(prompt = false) {
    if (process.platform === 'darwin') {
      // isTrustedAccessibilityClient checks if we have accessibility permissions
      // If prompt=true and not trusted, it shows the system dialog
      return systemPreferences.isTrustedAccessibilityClient(prompt);
    }
    return true;
  }

  /**
   * Get the complete permission state
   * 
   * This is the main method the UI will call to understand what permissions
   * are missing and guide the user accordingly.
   * 
   * @returns {PermissionState}
   */
  getPermissionState() {
    // Use cached state if recent enough (avoids hammering system APIs)
    const now = Date.now();
    if (this._cachedState && (now - this._cacheTimestamp) < this._cacheDuration) {
      return this._cachedState;
    }

    const microphone = this.getMicrophoneStatus();
    const screenRecording = this.getScreenRecordingStatus();
    const accessibility = this.getAccessibilityStatus(false); // Don't prompt, just check

    // Determine if all required permissions are granted
    const allGranted = 
      microphone === 'granted' && 
      screenRecording === 'granted' && 
      accessibility === true;

    const state = {
      microphone,
      screenRecording,
      accessibility,
      allGranted,
    };

    // Cache the result
    this._cachedState = state;
    this._cacheTimestamp = now;

    console.log('[PermissionManager] Permission state:', state);
    return state;
  }

  /**
   * Request all permissions that can be requested programmatically
   * 
   * This will:
   * 1. Request microphone access (shows system dialog if not determined)
   * 2. Prompt for accessibility access (shows system dialog if not trusted)
   * 
   * Screen recording CANNOT be requested programmatically - if missing,
   * we must direct the user to System Preferences.
   * 
   * @returns {Promise<PermissionState>} - Updated permission state after requests
   */
  async requestPermissions() {
    console.log('[PermissionManager] Requesting permissions...');

    // Request microphone (this can be done programmatically)
    await this.requestMicrophoneAccess();

    // Prompt for accessibility (this shows a system dialog)
    this.getAccessibilityStatus(true); // prompt=true

    // Clear cache to get fresh state
    this._cachedState = null;

    // Return the updated state
    return this.getPermissionState();
  }

  /**
   * Open System Preferences to the Screen Recording section
   * 
   * Since we can't request screen recording permission programmatically,
   * this helper opens the correct System Preferences pane so the user
   * can grant it manually.
   * 
   * The URL scheme 'x-apple.systempreferences:' is a macOS feature that
   * opens specific preference panes.
   */
  openScreenRecordingPreferences() {
    if (process.platform === 'darwin') {
      // This URL opens System Preferences > Security & Privacy > Privacy > Screen Recording
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      console.log('[PermissionManager] Opened Screen Recording preferences');
    }
  }

  /**
   * Open System Preferences to the Microphone section
   */
  openMicrophonePreferences() {
    if (process.platform === 'darwin') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
      console.log('[PermissionManager] Opened Microphone preferences');
    }
  }

  /**
   * Open System Preferences to the Accessibility section
   */
  openAccessibilityPreferences() {
    if (process.platform === 'darwin') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      console.log('[PermissionManager] Opened Accessibility preferences');
    }
  }

  /**
   * Check if all required permissions are granted
   * 
   * This is a convenience method for the Session Manager to quickly
   * determine if we're ready to start a session.
   * 
   * @returns {boolean}
   */
  isReady() {
    const state = this.getPermissionState();
    return state.allGranted;
  }

  /**
   * Get a human-readable list of missing permissions
   * 
   * Useful for showing the user what they need to enable.
   * 
   * @returns {string[]} - Array of missing permission names
   */
  getMissingPermissions() {
    const state = this.getPermissionState();
    const missing = [];

    if (state.microphone !== 'granted') {
      missing.push('Microphone');
    }
    if (state.screenRecording !== 'granted') {
      missing.push('Screen Recording');
    }
    if (!state.accessibility) {
      missing.push('Accessibility');
    }

    return missing;
  }
}

// Export a singleton instance
// Using a singleton ensures consistent state across the app
// and avoids creating multiple instances that might conflict
module.exports = new PermissionManager();
