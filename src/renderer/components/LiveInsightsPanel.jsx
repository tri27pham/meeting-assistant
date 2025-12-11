import React from 'react';
import { SparkleIcon, CopyIcon, BookIcon, GlobeIcon, ChatIcon } from './Icons';

function LiveInsightsPanel({ 
  insights, 
  actions, 
  selectedAction, 
  onActionSelect,
  onCopyInsights
}) {
  const getActionIcon = (iconType) => {
    switch (iconType) {
      case 'book': return <BookIcon />;
      case 'globe': return <GlobeIcon />;
      case 'chat': return <ChatIcon />;
      case 'sparkle': return <SparkleIcon />;
      default: return <SparkleIcon />;
    }
  };

  const handleCopy = () => {
    const text = `${insights.title}\n\n${insights.summary}${insights.context ? '\n\n' + insights.context : ''}`;
    navigator.clipboard.writeText(text);
    onCopyInsights?.();
  };

  return (
    <div className="live-insights-panel glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <SparkleIcon className="title-icon" />
          <span>Live insights</span>
        </div>
        <div className="panel-actions">
          <button 
            className="header-btn icon-only" 
            onClick={handleCopy}
            aria-label="Copy insights"
          >
            <CopyIcon />
          </button>
        </div>
      </div>

      <div className="insights-content">
        <h3 className="insights-title">{insights.title}</h3>
        <p className="insights-summary">{insights.summary}</p>
        {insights.context && (
          <p className="insights-context">{insights.context}</p>
        )}
      </div>

      <div className="actions-section">
        <h4 className="actions-title">Actions</h4>
        <div className="actions-list">
          {actions.map((action) => (
            <button
              key={action.id}
              className={`action-item ${selectedAction === action.id ? 'selected' : ''}`}
              onClick={() => onActionSelect(action.id)}
              aria-pressed={selectedAction === action.id}
            >
              <span className={`action-icon ${action.icon}`}>
                {getActionIcon(action.icon)}
              </span>
              <span className="action-label">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LiveInsightsPanel;
