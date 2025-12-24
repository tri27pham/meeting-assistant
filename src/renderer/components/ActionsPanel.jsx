import React from "react";
import {
  BookIcon,
  GlobeIcon,
  ChatIcon,
  LightbulbIcon,
  HelpCircleIcon,
  CloseIcon,
  SparkleIcon,
} from "./Icons";

const MAX_ACTIONS_DISPLAYED = 3;

function ActionsPanel({
  actions,
  selectedAction,
  onActionSelect,
  onClose,
}) {
  const getActionIcon = (iconType) => {
    switch (iconType) {
      case "book":
        return <BookIcon />;
      case "globe":
        return <GlobeIcon />;
      case "chat":
        return <ChatIcon />;
      case "sparkle":
        return <SparkleIcon />;
      case "lightbulb":
        return <LightbulbIcon />;
      case "help-circle":
        return <HelpCircleIcon />;
      default:
        return <SparkleIcon />;
    }
  };

  return (
    <div className="actions-panel glass-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <LightbulbIcon className="title-icon" />
          <span>FOLLOW-UP ACTIONS</span>
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

      {/* Actions section */}
      <div className="panel-content">
        {actions && actions.length > 0 ? (
          <div className="actions-section">
            <div className="actions-list">
              {actions.slice(0, MAX_ACTIONS_DISPLAYED).map((action) => (
                <button
                  key={action.id}
                  className={`action-item ${selectedAction === action.id ? "selected" : ""}`}
                  onClick={() => onActionSelect(action.id)}
                  aria-pressed={selectedAction === action.id}
                >
                  <span className={`action-icon ${action.icon || 'lightbulb'}`}>
                    {getActionIcon(action.icon || 'lightbulb')}
                  </span>
                  <span className="action-label">{action.label || 'Untitled'}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="actions-section">
            <div className="actions-list">
              <div className="actions-empty">No follow-up actions yet. Keep talking to generate suggestions.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ActionsPanel;

