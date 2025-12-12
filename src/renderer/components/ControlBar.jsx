import React from 'react';
import { PauseIcon, PlayIcon, WaveformIcon, SettingsIcon } from './Icons';

function ControlBar({ 
  isPaused, 
  sessionTime, 
  audioLevel = 0,
  isCapturing = false,
  onTogglePause, 
  onAskAI, 
  onToggleVisibility,
  onOpenSettings,
  onTestAI,
}) {
  // Scale audio level for visualization (0-1 range, boost low values)
  const scaledLevel = Math.min(1, audioLevel * 3);
  
  return (
    <div className="control-bar glass-panel">
      {/* Left group: Play/Pause + Waveform + Timer */}
      <div className="control-group">
        <button 
          className="control-btn pause-btn"
          onClick={onTogglePause}
          aria-label={isPaused ? 'Start Recording' : 'Pause Recording'}
          title={isPaused ? 'Start Recording' : 'Pause Recording'}
        >
          {isPaused ? <PlayIcon /> : <PauseIcon />}
        </button>

        <div 
          className={`waveform-indicator ${isPaused ? 'paused' : ''} ${isCapturing ? 'active' : ''}`}
          style={{
            // Dynamic glow based on audio level
            '--audio-level': scaledLevel,
          }}
          title={`Audio level: ${(audioLevel * 100).toFixed(0)}%`}
        >
          <WaveformIcon />
        </div>
        
        {/* Debug: Show audio level when capturing */}
        {isCapturing && (
          <div className="audio-level-debug" style={{
            fontSize: '10px',
            opacity: 0.7,
            minWidth: '35px',
            textAlign: 'center',
          }}>
            {(audioLevel * 100).toFixed(0)}%
          </div>
        )}

        <div className="session-time">
          {sessionTime}
        </div>
      </div>

      <div className="control-divider" />

      {/* Center: Ask AI */}
      <button className="control-btn ask-ai-btn" onClick={onAskAI}>
        <span>Ask AI</span>
        <kbd className="shortcut">⌘</kbd>
        <kbd className="shortcut">↵</kbd>
      </button>

      {/* Test AI Button */}
      <button className="control-btn test-ai-btn" onClick={onTestAI} title="Test AI with sample transcript">
        <span>Test</span>
      </button>

      <div className="control-divider" />

      {/* Show/Hide */}
      <button className="control-btn visibility-btn" onClick={onToggleVisibility}>
        <span>Show/Hide</span>
        <kbd className="shortcut">⌘</kbd>
        <kbd className="shortcut">/</kbd>
      </button>

      <div className="control-divider" />

      {/* Settings */}
      <button 
        className="control-btn settings-btn" 
        onClick={onOpenSettings}
        title="Settings"
      >
        <SettingsIcon />
        <span>Settings</span>
      </button>
    </div>
  );
}

export default ControlBar;
