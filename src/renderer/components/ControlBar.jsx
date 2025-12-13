import React from 'react';
import { PauseIcon, PlayIcon, WaveformIcon, SettingsIcon } from './Icons';

function ControlBar({ 
  isPaused, 
  sessionTime, 
  onTogglePause, 
  onAskAI, 
  onToggleVisibility,
  onResetLayout,
  onOpenSettings
}) {
  return (
    <div className="control-bar glass-panel">
      <div className="control-group">
        <button 
          className="control-btn pause-btn"
          onClick={onTogglePause}
          aria-label={isPaused ? 'Resume' : 'Pause'}
        >
          {isPaused ? <PlayIcon /> : <PauseIcon />}
        </button>

        <div className={`waveform-indicator ${isPaused ? 'paused' : ''}`}>
          <WaveformIcon />
        </div>

        <div className="session-time">
          {sessionTime}
        </div>
      </div>

      <div className="control-divider" />

      <button className="control-btn ask-ai-btn" onClick={onAskAI}>
        <span>Ask AI</span>
        <kbd className="shortcut">⌘</kbd>
        <kbd className="shortcut">↵</kbd>
      </button>

      <div className="control-divider" />

      <button className="control-btn visibility-btn" onClick={onToggleVisibility}>
        <span>Show/Hide</span>
        <kbd className="shortcut">⌘</kbd>
        <kbd className="shortcut">/</kbd>
      </button>

      <div className="control-divider" />

      <button 
        className="control-btn reset-btn" 
        onClick={onResetLayout}
        title="Reset panel positions and sizes"
      >
        <span>Reset</span>
        <kbd className="shortcut">⌘</kbd>
        <kbd className="shortcut">\</kbd>
      </button>

      <div className="control-divider" />

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
