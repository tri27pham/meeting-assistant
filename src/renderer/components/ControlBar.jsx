import React from "react";
import { PauseIcon, PlayIcon, WaveformIcon, SettingsIcon, LoadingIcon } from "./Icons";

function ControlBar({
  isRunning,
  isPaused,
  isStarting,
  sessionTime,
  onTogglePause,
  onToggleVisibility,
  onResetLayout,
  onOpenSettings,
}) {
  const showPlayIcon = !isRunning || isPaused;
  
  return (
    <div className="control-bar glass-panel">
      <div className="control-group">
        <button
          className="control-btn pause-btn"
          onClick={onTogglePause}
          aria-label={isStarting ? "Starting..." : showPlayIcon ? "Start/Resume" : "Pause"}
          disabled={isStarting}
        >
          {isStarting ? <LoadingIcon /> : showPlayIcon ? <PlayIcon /> : <PauseIcon />}
        </button>

        <div className={`waveform-indicator ${!isRunning || isPaused || isStarting ? "paused" : ""}`}>
          <WaveformIcon />
        </div>

        <div className="session-time">{sessionTime}</div>
      </div>

      <div className="control-divider" />

      <button
        className="control-btn visibility-btn"
        onClick={onToggleVisibility}
      >
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
