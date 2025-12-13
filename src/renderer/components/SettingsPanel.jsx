import React, { useState } from "react";
import { CloseIcon } from "./Icons";

const hotkeys = [
  {
    keys: ["⌘", "/"],
    description: "Show/Hide overlay",
  },
  {
    keys: ["⌘", "↵"],
    description: "Ask AI (toggle AI response panel)",
  },
  {
    keys: ["⌘", "\\"],
    description: "Reset panel positions and sizes",
  },
  {
    keys: ["⌘", ";"],
    description: "Toggle transcript panel",
  },
];

function ChevronIcon({ isExpanded }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
      }}
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsPanel({ onClose }) {
  const [isHotkeysExpanded, setIsHotkeysExpanded] = useState(true);

  return (
    <div className="settings-panel glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>Settings</span>
        </div>
        <div className="panel-actions">
          <button
            className="header-btn icon-only close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="panel-content" style={{ flex: 1, overflow: "auto" }}>
        <div className="settings-section">
          <button
            className="settings-section-header"
            onClick={() => setIsHotkeysExpanded(!isHotkeysExpanded)}
            aria-expanded={isHotkeysExpanded}
          >
            <h3 className="settings-section-title">Keyboard Shortcuts</h3>
            <ChevronIcon isExpanded={isHotkeysExpanded} />
          </button>
          <div
            className={`hotkeys-list ${isHotkeysExpanded ? "expanded" : "collapsed"}`}
          >
            {hotkeys.map((hotkey, index) => (
              <div key={index} className="hotkey-item">
                <div className="hotkey-description">{hotkey.description}</div>
                <div className="hotkey-keys">
                  {hotkey.keys.map((key, keyIndex) => (
                    <React.Fragment key={keyIndex}>
                      <kbd className="hotkey-key">{key}</kbd>
                      {keyIndex < hotkey.keys.length - 1 && (
                        <span className="hotkey-separator">+</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
