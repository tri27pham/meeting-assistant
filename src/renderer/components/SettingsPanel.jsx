import React from "react";
import { CloseIcon } from "./Icons";

function SettingsPanel({ onClose }) {
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
        <p
          style={{
            color: "var(--text-secondary)",
            padding: "20px",
            textAlign: "center",
          }}
        >
          Settings will appear here
        </p>
      </div>
    </div>
  );
}

export default SettingsPanel;
