const { systemPreferences } = require('electron');

/**
 * Permission Service
 * 
 * Handles macOS permissions for audio capture:
 * - Microphone permission (required for mic capture)
 * - Screen recording permission (required for system audio capture via electron-audio-loopback)
 */
class PermissionService {
  constructor() {
    this.microphoneStatus = null;
    this.screenRecordingStatus = null;
  }

  /**
   * Check microphone permission status
   * @returns {Promise<string>} Status: 'granted', 'denied', 'not-determined', 'restricted', or 'unknown'
   */
  async checkMicrophonePermission() {
    try {
      this.microphoneStatus = systemPreferences.getMediaAccessStatus('microphone');
      return this.microphoneStatus;
    } catch (error) {
      console.error('[PermissionService] Error checking microphone permission:', error);
      return 'unknown';
    }
  }

  /**
   * Request microphone permission
   * @returns {Promise<boolean>} True if granted, false if denied
   */
  async requestMicrophonePermission() {
    try {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      this.microphoneStatus = granted ? 'granted' : 'denied';
      return granted;
    } catch (error) {
      console.error('[PermissionService] Error requesting microphone permission:', error);
      this.microphoneStatus = 'denied';
      return false;
    }
  }

  /**
   * Check screen recording permission status
   * @returns {Promise<string>} Status: 'granted', 'denied', 'not-determined', 'restricted', or 'unknown'
   */
  async checkScreenRecordingPermission() {
    try {
      this.screenRecordingStatus = systemPreferences.getMediaAccessStatus('screen');
      return this.screenRecordingStatus;
    } catch (error) {
      console.error('[PermissionService] Error checking screen recording permission:', error);
      return 'unknown';
    }
  }

  /**
   * Request screen recording permission
   * Note: macOS doesn't allow programmatic request for screen recording.
   * This method opens System Preferences to the appropriate section.
   * @returns {Promise<boolean>} True if already granted, false if needs manual setup
   */
  async requestScreenRecordingPermission() {
    try {
      const status = await this.checkScreenRecordingPermission();
      
      if (status === 'granted') {
        return true;
      }

      // macOS doesn't allow programmatic request for screen recording
      // We need to guide the user to System Preferences
      console.log('[PermissionService] Screen recording permission must be granted manually in System Preferences');
      
      // Open System Preferences to Screen Recording section
      // Note: This requires the app to be running with appropriate entitlements
      const { shell } = require('electron');
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      
      return false;
    } catch (error) {
      console.error('[PermissionService] Error requesting screen recording permission:', error);
      return false;
    }
  }

  /**
   * Check all required permissions for audio capture
   * @returns {Promise<Object>} Object with permission statuses
   */
  async checkAllPermissions() {
    const [micStatus, screenStatus] = await Promise.all([
      this.checkMicrophonePermission(),
      this.checkScreenRecordingPermission(),
    ]);

    return {
      microphone: micStatus,
      screenRecording: screenStatus,
      allGranted: micStatus === 'granted' && screenStatus === 'granted',
    };
  }

  /**
   * Request all required permissions
   * @returns {Promise<Object>} Object with permission results
   */
  async requestAllPermissions() {
    const [micGranted, screenGranted] = await Promise.all([
      this.requestMicrophonePermission(),
      this.requestScreenRecordingPermission(),
    ]);

    return {
      microphone: micGranted,
      screenRecording: screenGranted,
      allGranted: micGranted && screenGranted,
    };
  }

  /**
   * Get current permission statuses (cached)
   * @returns {Object} Current statuses
   */
  getStatus() {
    return {
      microphone: this.microphoneStatus,
      screenRecording: this.screenRecordingStatus,
    };
  }

  /**
   * Check if microphone permission is granted
   * @returns {Promise<boolean>}
   */
  async hasMicrophonePermission() {
    const status = await this.checkMicrophonePermission();
    return status === 'granted';
  }

  /**
   * Check if screen recording permission is granted
   * @returns {Promise<boolean>}
   */
  async hasScreenRecordingPermission() {
    const status = await this.checkScreenRecordingPermission();
    return status === 'granted';
  }

  /**
   * Check if all required permissions are granted
   * @returns {Promise<boolean>}
   */
  async hasAllPermissions() {
    const [mic, screen] = await Promise.all([
      this.hasMicrophonePermission(),
      this.hasScreenRecordingPermission(),
    ]);
    return mic && screen;
  }
}

module.exports = PermissionService;